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
 * TIKTOK INTEGRATION
 * ---------------------------------------------------------------------------
 * Built on TikTok's official Login Kit and Display API v2.
 *
 * IMPORTANT - what TikTok does NOT return:
 * The Display API exposes view/like/comment/share counts and video metadata,
 * but it does not expose retention, average watch time, impressions, CTR,
 * saves, or per-video follower gains. Those metrics are therefore stored as
 * `null` and rendered as "Unavailable through current TikTok API permissions."
 * They are never estimated. Use the CSV importer to add them from a TikTok
 * Analytics export if you need them.
 */

const AUTH_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
const USER_INFO_ENDPOINT = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST_ENDPOINT = 'https://open.tiktokapis.com/v2/video/list/';

export const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'video.list'];

export const TIKTOK_UNAVAILABLE_MESSAGE =
  'Unavailable through current TikTok API permissions.';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface UserInfoResponse {
  data?: { user?: { open_id?: string; display_name?: string; username?: string } };
  error?: { code?: string; message?: string };
}

interface VideoListResponse {
  data?: {
    videos?: Array<{
      id?: string;
      title?: string;
      video_description?: string;
      duration?: number;
      create_time?: number;
      cover_image_url?: string;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
      view_count?: number;
    }>;
    cursor?: number;
    has_more?: boolean;
  };
  error?: { code?: string; message?: string };
}

const VIDEO_FIELDS = [
  'id',
  'title',
  'video_description',
  'duration',
  'create_time',
  'cover_image_url',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
].join(',');

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

async function requestTokens(params: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetchJson<TokenResponse>(TOKEN_ENDPOINT, {
    method: 'POST',
    label: 'TikTok token exchange',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (response.error || !response.access_token) {
    throw new ApiError(
      response.error_description ?? 'TikTok did not return an access token.',
      400,
      'AUTH',
    );
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000) : null,
    scopes: response.scope ? response.scope.split(',') : TIKTOK_SCOPES,
  };
}

/** TikTok returns HTTP 200 with an error object; surface it as an ApiError. */
function assertNoApiError(error: { code?: string; message?: string } | undefined, label: string): void {
  if (!error) return;
  const code = error.code ?? '';
  if (code === 'ok' || code === '') return;
  const kind =
    code.includes('token') || code.includes('scope')
      ? 'AUTH'
      : code.includes('rate')
        ? 'RATE_LIMIT'
        : 'CLIENT';
  throw new ApiError(label + ': ' + (error.message ?? code), 400, kind);
}

export const tiktokIntegration: PlatformIntegration = {
  platform: 'TIKTOK',
  label: 'TikTok',
  requiredEnvVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],

  isConfigured() {
    return Boolean(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET'));
  },

  buildAuthorizationUrl(state, redirectUri) {
    const clientKey = env('TIKTOK_CLIENT_KEY');
    if (!clientKey) throw new Error('TIKTOK_CLIENT_KEY is not configured.');
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: TIKTOK_SCOPES.join(','),
      redirect_uri: redirectUri,
      state,
    });
    return AUTH_ENDPOINT + '?' + params.toString();
  },

  async exchangeCode(code, redirectUri) {
    return requestTokens(
      new URLSearchParams({
        client_key: env('TIKTOK_CLIENT_KEY') ?? '',
        client_secret: env('TIKTOK_CLIENT_SECRET') ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    );
  },

  async refresh(refreshToken) {
    const tokens = await requestTokens(
      new URLSearchParams({
        client_key: env('TIKTOK_CLIENT_KEY') ?? '',
        client_secret: env('TIKTOK_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    );
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  },

  async fetchProfile(tokens): Promise<OAuthProfile> {
    const data = await fetchJson<UserInfoResponse>(
      USER_INFO_ENDPOINT + '?fields=open_id,display_name,username',
      { label: 'TikTok user info', headers: { Authorization: 'Bearer ' + tokens.accessToken } },
    );
    assertNoApiError(data.error, 'TikTok user info');
    const user = data.data?.user;
    if (!user?.open_id) {
      throw new ApiError('TikTok did not return a user profile.', 404, 'NOT_FOUND');
    }
    return {
      externalId: user.open_id,
      accountName: user.username ? '@' + user.username : (user.display_name ?? user.open_id),
    };
  },

  async fetchVideos(tokens, options): Promise<SyncResult> {
    const limit = options.limit ?? 200;
    const profile = await this.fetchProfile(tokens);
    const videos: FetchedVideo[] = [];
    let cursor: number | undefined;
    let hasMore = true;

    while (hasMore && videos.length < limit) {
      const body: Record<string, unknown> = { max_count: 20 };
      if (cursor !== undefined) body.cursor = cursor;

      const page = await fetchJson<VideoListResponse>(
        VIDEO_LIST_ENDPOINT + '?fields=' + VIDEO_FIELDS,
        {
          method: 'POST',
          label: 'TikTok video list',
          headers: {
            Authorization: 'Bearer ' + tokens.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      assertNoApiError(page.error, 'TikTok video list');

      for (const item of page.data?.videos ?? []) {
        if (!item.id) continue;
        const description = item.video_description ?? null;
        videos.push({
          platformVideoId: item.id,
          platform: 'TIKTOK',
          title: item.title?.trim() || truncate(description) || 'Untitled TikTok',
          caption: description,
          description,
          hashtags: extractHashtags(description),
          durationSeconds: Math.round(item.duration ?? 0),
          publishedAt: item.create_time
            ? new Date(item.create_time * 1000).toISOString()
            : new Date().toISOString(),
          thumbnailUrl: item.cover_image_url ?? null,
          metrics: {
            views: item.view_count ?? 0,
            likes: item.like_count ?? 0,
            comments: item.comment_count ?? 0,
            shares: item.share_count ?? 0,
            // Everything below is genuinely not returned by the Display API.
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

      hasMore = Boolean(page.data?.has_more);
      cursor = page.data?.cursor;
      if (cursor === undefined) break;
    }

    const unavailable: SyncResult['unavailableMetrics'] = (
      [
        'saves',
        'followersGained',
        'watchTimeMinutes',
        'averageViewDurationSeconds',
        'averagePercentageViewed',
        'impressions',
        'clickThroughRate',
      ] as const
    ).map((metric) => ({ metric, reason: TIKTOK_UNAVAILABLE_MESSAGE }));

    return {
      platform: 'TIKTOK',
      accountName: profile.accountName,
      externalId: profile.externalId,
      videos: videos.slice(0, limit),
      unavailableMetrics: unavailable,
      warnings: [
        'TikTok does not expose retention, watch time, saves, impressions, CTR or per-video follower gains through the Display API. Import a TikTok Analytics CSV to add them.',
      ],
      fetchedAt: new Date().toISOString(),
    };
  },

  limitations: [
    'Requires an approved TikTok for Developers app with Login Kit and the video.list scope.',
    'Retention, average watch time, saves, impressions, CTR and per-video follower gains are not available through the Display API and are stored as unavailable.',
    'The Display API returns videos in pages of up to 20 and does not support arbitrary date filtering.',
    'Sandbox apps only return data for accounts explicitly added as testers.',
  ],
};

function truncate(value: string | null): string {
  if (!value) return '';
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + '...' : oneLine;
}
