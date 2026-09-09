import { ApiError, fetchJson } from '@/lib/integrations/http';
import {
  extractHashtags,
  type FetchedVideo,
  type OAuthProfile,
  type OAuthTokens,
  type PlatformIntegration,
  type SyncResult,
} from '@/lib/integrations/types';

/**
 * TWITCH INTEGRATION
 * ---------------------------------------------------------------------------
 * Uses Twitch's official OAuth 2.0 flow and the Helix API.
 *
 * IMPORTANT - what "videos" means here and what Twitch does NOT return:
 * Twitch has no per-video upload model like YouTube/TikTok - the closest,
 * consistently available unit with real view counts is a **clip** (Helix
 * "Get Clips"). Full broadcast VODs are also available via "Get Videos" but
 * expire on non-partner/affiliate channels and carry the same metric gaps, so
 * clips are used as this integration's "video" unit throughout the app.
 *
 * Twitch's public API does not expose, for clips or VODs: likes, comments,
 * shares, retention/average-percentage-viewed, average view duration, watch
 * time, impressions, click-through rate, or per-clip follower attribution.
 * Those are stored as unavailable (likes/comments/shares as 0, matching the
 * convention already used for YouTube's missing share count; everything else
 * as `null`) rather than estimated. Import a CSV export for anything Twitch's
 * own creator dashboard reports that this API does not.
 */

const AUTH_ENDPOINT = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';
const HELIX_API = 'https://api.twitch.tv/helix';

export const TWITCH_SCOPES: string[] = []; // Public clip data needs no scopes beyond identifying the user.

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[];
  message?: string;
}

interface UsersResponse {
  data?: Array<{ id: string; login: string; display_name: string; profile_image_url?: string }>;
}

interface ClipsResponse {
  data?: Array<{
    id: string;
    url: string;
    title: string;
    view_count: number;
    duration: number;
    created_at: string;
    thumbnail_url: string;
  }>;
  pagination?: { cursor?: string };
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function clientId(): string {
  return env('TWITCH_CLIENT_ID') ?? '';
}

async function requestTokens(params: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetchJson<TokenResponse>(TOKEN_ENDPOINT, {
    method: 'POST',
    label: 'Twitch token exchange',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!response.access_token) {
    throw new ApiError(response.message ?? 'Twitch did not return an access token.', 400, 'AUTH');
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000) : null,
    scopes: response.scope ?? TWITCH_SCOPES,
  };
}

/** Every Helix call needs both a bearer token AND the app's Client-Id header. */
function helixHeaders(tokens: OAuthTokens): Record<string, string> {
  return {
    Authorization: 'Bearer ' + tokens.accessToken,
    'Client-Id': clientId(),
    Accept: 'application/json',
  };
}

export const twitchIntegration: PlatformIntegration = {
  platform: 'TWITCH',
  label: 'Twitch',
  requiredEnvVars: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],

  isConfigured() {
    return Boolean(env('TWITCH_CLIENT_ID') && env('TWITCH_CLIENT_SECRET'));
  },

  buildAuthorizationUrl(state, redirectUri) {
    const id = clientId();
    if (!id) throw new Error('TWITCH_CLIENT_ID is not configured.');
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: TWITCH_SCOPES.join(' '),
      state,
    });
    return AUTH_ENDPOINT + '?' + params.toString();
  },

  async exchangeCode(code, redirectUri) {
    return requestTokens(
      new URLSearchParams({
        client_id: clientId(),
        client_secret: env('TWITCH_CLIENT_SECRET') ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    );
  },

  async refresh(refreshToken) {
    const tokens = await requestTokens(
      new URLSearchParams({
        client_id: clientId(),
        client_secret: env('TWITCH_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  },

  async fetchProfile(tokens): Promise<OAuthProfile> {
    const data = await fetchJson<UsersResponse>(HELIX_API + '/users', {
      label: 'Twitch user lookup',
      headers: helixHeaders(tokens),
    });
    const user = data.data?.[0];
    if (!user) {
      throw new ApiError('Twitch did not return a user for this token.', 404, 'NOT_FOUND');
    }
    return { externalId: user.id, accountName: user.display_name || user.login };
  },

  async fetchVideos(tokens, options): Promise<SyncResult> {
    const limit = options.limit ?? 200;
    const profile = await this.fetchProfile(tokens);
    const clips: FetchedVideo[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({
        broadcaster_id: profile.externalId,
        first: String(Math.min(100, limit - clips.length)),
      });
      if (cursor) params.set('after', cursor);

      const page = await fetchJson<ClipsResponse>(HELIX_API + '/clips?' + params.toString(), {
        label: 'Twitch clips list',
        headers: helixHeaders(tokens),
      });

      for (const clip of page.data ?? []) {
        clips.push({
          platformVideoId: clip.id,
          platform: 'TWITCH',
          title: clip.title || 'Untitled clip',
          caption: null,
          description: null,
          hashtags: extractHashtags(clip.title),
          durationSeconds: Math.round(clip.duration),
          publishedAt: clip.created_at,
          thumbnailUrl: clip.thumbnail_url || null,
          metrics: {
            views: clip.view_count,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: null,
            followersGained: null,
            watchTimeMinutes: null,
            averageViewDurationSeconds: null,
            averagePercentageViewed: null,
            impressions: null,
            clickThroughRate: null,
          },
        });
      }

      cursor = page.pagination?.cursor;
    } while (cursor && clips.length < limit);

    return {
      platform: 'TWITCH',
      accountName: profile.accountName,
      externalId: profile.externalId,
      videos: clips.slice(0, limit),
      unavailableMetrics: [
        { metric: 'likes', reason: 'Twitch clips have no like mechanism; recorded as 0.' },
        { metric: 'comments', reason: 'Twitch clips have no per-clip comment count; recorded as 0.' },
        { metric: 'shares', reason: 'The Helix API does not expose a per-clip share count; recorded as 0.' },
        { metric: 'saves', reason: 'Twitch has no per-clip save/favorite concept.' },
        { metric: 'followersGained', reason: 'Follower gains cannot be attributed to an individual clip.' },
        { metric: 'watchTimeMinutes', reason: 'Not exposed by the Helix Clips API.' },
        { metric: 'averageViewDurationSeconds', reason: 'Not exposed by the Helix Clips API.' },
        { metric: 'averagePercentageViewed', reason: 'Twitch does not expose retention for clips.' },
        { metric: 'impressions', reason: 'Not exposed by the Helix Clips API.' },
        { metric: 'clickThroughRate', reason: 'Not exposed by the Helix Clips API.' },
      ],
      warnings: [
        'Twitch "videos" are clips (Get Clips). Full VOD-level analytics and everything beyond view count are not available through the public API.',
      ],
      fetchedAt: new Date().toISOString(),
    };
  },

  limitations: [
    'Tracks Twitch clips (the Helix Clips API), not full broadcast VODs - clips are the unit with a consistently available public view count.',
    'Likes, comments, shares, saves, retention, watch time, impressions, CTR and per-clip follower attribution are not exposed by Twitch\'s public API and are stored as unavailable.',
    'Clip view counts can take a short time to settle after a clip is created; very recent clips may under-report views.',
    'Requires a registered Twitch application (id.twitch.tv/oauth2) with the redirect URI configured for this deployment.',
  ],
};
