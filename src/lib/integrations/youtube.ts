import type { VideoMetrics } from '@/lib/types';
import { ApiError, fetchJson } from '@/lib/integrations/http';
import {
  extractHashtags,
  parseIsoDuration,
  type FetchedVideo,
  type OAuthProfile,
  type OAuthTokens,
  type PlatformIntegration,
  type SyncResult,
} from '@/lib/integrations/types';
import { logger } from '@/lib/util/logger';

/**
 * YOUTUBE INTEGRATION
 * ---------------------------------------------------------------------------
 * Uses the official Google OAuth 2.0 flow plus two official APIs:
 *   * YouTube Data API v3       - video list, snippets, public statistics
 *   * YouTube Analytics API v2  - watch time, average view duration, retention,
 *                                 subscribers gained and shares
 *
 * Quota notes (Data API v3 has a default 10,000 units/day):
 *   channels.list      = 1 unit
 *   playlistItems.list = 1 unit per page (50 videos)
 *   videos.list        = 1 unit per page (50 videos)
 * So a 500-video sync costs roughly 25 units. Analytics API has a separate,
 * much larger quota. Requests are paged and capped by `limit` to stay well
 * inside both.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

/** YouTube counts anything <= 3 minutes with a vertical aspect as a Short. */
const SHORTS_MAX_SECONDS = 180;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface ChannelResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

interface VideoListResponse {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
      tags?: string[];
    };
    contentDetails?: { duration?: string };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
      favoriteCount?: string;
    };
  }>;
}

interface AnalyticsResponse {
  columnHeaders?: Array<{ name: string }>;
  rows?: Array<Array<string | number>>;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function toNumber(value: string | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? n : 0;
}

async function requestTokens(params: URLSearchParams): Promise<OAuthTokens> {
  const response = await fetchJson<TokenResponse>(TOKEN_ENDPOINT, {
    method: 'POST',
    label: 'YouTube token exchange',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!response.access_token) {
    throw new ApiError('YouTube did not return an access token.', 400, 'AUTH');
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: response.expires_in ? new Date(Date.now() + response.expires_in * 1000) : null,
    scopes: response.scope ? response.scope.split(' ') : YOUTUBE_SCOPES,
  };
}

function authHeaders(tokens: OAuthTokens): Record<string, string> {
  return { Authorization: 'Bearer ' + tokens.accessToken, Accept: 'application/json' };
}

/**
 * Pulls per-video analytics. Returns an empty map (and a warning) rather than
 * failing the whole sync when the Analytics API is unavailable - public stats
 * are still worth importing on their own.
 */
async function fetchAnalytics(
  tokens: OAuthTokens,
  videoIds: string[],
  warnings: string[],
): Promise<Map<string, Partial<VideoMetrics>>> {
  const out = new Map<string, Partial<VideoMetrics>>();
  if (videoIds.length === 0) return out;

  const metrics = [
    'views',
    'estimatedMinutesWatched',
    'averageViewDuration',
    'averageViewPercentage',
    'subscribersGained',
    'shares',
  ].join(',');

  // The Analytics API caps filters; page through in chunks of 200 video ids.
  for (let i = 0; i < videoIds.length; i += 200) {
    const chunk = videoIds.slice(i, i + 200);
    const params = new URLSearchParams({
      ids: 'channel==MINE',
      startDate: '2005-01-01',
      endDate: new Date().toISOString().slice(0, 10),
      metrics,
      dimensions: 'video',
      filters: 'video==' + chunk.join(','),
      maxResults: '200',
    });
    try {
      const data = await fetchJson<AnalyticsResponse>(ANALYTICS_API + '?' + params.toString(), {
        label: 'YouTube Analytics report',
        headers: authHeaders(tokens),
      });
      const headers = (data.columnHeaders ?? []).map((h) => h.name);
      for (const row of data.rows ?? []) {
        const record: Record<string, string | number> = {};
        headers.forEach((name, index) => {
          record[name] = row[index];
        });
        const videoId = String(record.video ?? '');
        if (!videoId) continue;
        out.set(videoId, {
          shares: numOrNull(record.shares) ?? 0,
          watchTimeMinutes: numOrNull(record.estimatedMinutesWatched),
          averageViewDurationSeconds: numOrNull(record.averageViewDuration),
          averagePercentageViewed: numOrNull(record.averageViewPercentage),
          followersGained: numOrNull(record.subscribersGained),
        });
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.userMessage : 'YouTube Analytics request failed.';
      warnings.push('Retention and watch-time data is unavailable: ' + message);
      logger.warn('youtube.analytics_failed', { error });
      return out;
    }
  }

  // Thumbnail impressions/CTR are not metrics in the Analytics v2 reports API.
  // Import them from YouTube Studio CSV instead of issuing an unsupported report.
  return out;
}

function numOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const youtubeIntegration: PlatformIntegration = {
  platform: 'YOUTUBE',
  label: 'YouTube',
  requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],

  isConfigured() {
    return Boolean(env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET'));
  },

  buildAuthorizationUrl(state, redirectUri) {
    const clientId = env('YOUTUBE_CLIENT_ID');
    if (!clientId) throw new Error('YOUTUBE_CLIENT_ID is not configured.');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      // "consent" guarantees a refresh token on re-authorisation.
      prompt: 'consent',
      state,
    });
    return AUTH_ENDPOINT + '?' + params.toString();
  },

  async exchangeCode(code, redirectUri) {
    return requestTokens(
      new URLSearchParams({
        code,
        client_id: env('YOUTUBE_CLIENT_ID') ?? '',
        client_secret: env('YOUTUBE_CLIENT_SECRET') ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    );
  },

  async refresh(refreshToken) {
    const tokens = await requestTokens(
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env('YOUTUBE_CLIENT_ID') ?? '',
        client_secret: env('YOUTUBE_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
      }),
    );
    // Google omits the refresh token on refresh; keep the existing one.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  },

  async fetchProfile(tokens): Promise<OAuthProfile> {
    const data = await fetchJson<ChannelResponse>(
      DATA_API + '/channels?part=id,snippet&mine=true',
      { label: 'YouTube channel lookup', headers: authHeaders(tokens) },
    );
    const channel = data.items?.[0];
    if (!channel) {
      throw new ApiError('No YouTube channel is associated with this Google account.', 404, 'NOT_FOUND');
    }
    return { externalId: channel.id, accountName: channel.snippet?.title ?? channel.id };
  },

  async fetchVideos(tokens, options): Promise<SyncResult> {
    const limit = options.limit ?? 200;
    const warnings: string[] = [];

    const channelData = await fetchJson<ChannelResponse>(
      DATA_API + '/channels?part=id,snippet,contentDetails&mine=true',
      { label: 'YouTube channel lookup', headers: authHeaders(tokens) },
    );
    const channel = channelData.items?.[0];
    const uploadsPlaylist = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!channel || !uploadsPlaylist) {
      throw new ApiError('Could not find the uploads playlist for this channel.', 404, 'NOT_FOUND');
    }

    // 1. Collect video ids from the uploads playlist.
    const videoIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        part: 'contentDetails',
        playlistId: uploadsPlaylist,
        maxResults: '50',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await fetchJson<PlaylistItemsResponse>(
        DATA_API + '/playlistItems?' + params.toString(),
        { label: 'YouTube uploads page', headers: authHeaders(tokens) },
      );
      for (const item of page.items ?? []) {
        const id = item.contentDetails?.videoId;
        if (id) videoIds.push(id);
      }
      pageToken = page.nextPageToken;
    } while (pageToken && videoIds.length < limit);

    const targetIds = videoIds.slice(0, limit);

    // 2. Hydrate with snippets, durations and public statistics.
    const hydrated: VideoListResponse['items'] = [];
    for (let i = 0; i < targetIds.length; i += 50) {
      const chunk = targetIds.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: chunk.join(','),
        maxResults: '50',
      });
      const page = await fetchJson<VideoListResponse>(DATA_API + '/videos?' + params.toString(), {
        label: 'YouTube video details',
        headers: authHeaders(tokens),
      });
      hydrated.push(...(page.items ?? []));
    }

    // 3. Layer on owner-only analytics.
    const analytics = await fetchAnalytics(tokens, targetIds, warnings);

    const videos: FetchedVideo[] = hydrated.map((item) => {
      const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
      const analyticsRow = analytics.get(item.id) ?? {};
      const description = item.snippet?.description ?? null;
      const hashtags = Array.from(
        new Set([
          ...extractHashtags(item.snippet?.title),
          ...extractHashtags(description),
          ...(item.snippet?.tags ?? []).map((t) => '#' + t.toLowerCase().replace(/\s+/g, '')),
        ]),
      );
      return {
        platformVideoId: item.id,
        // The Data API does not expose a Shorts flag; duration is the documented
        // proxy. Users can change the platform on any video afterwards.
        platform: durationSeconds > 0 && durationSeconds <= SHORTS_MAX_SECONDS ? 'YOUTUBE_SHORTS' : 'YOUTUBE',
        title: item.snippet?.title ?? 'Untitled',
        caption: null,
        description,
        hashtags,
        durationSeconds,
        publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
        metrics: {
          views: toNumber(item.statistics?.viewCount),
          likes: toNumber(item.statistics?.likeCount),
          comments: toNumber(item.statistics?.commentCount),
          // The Data API has never exposed a share count for videos.
          shares: 0,
          saves: null,
          followersGained: analyticsRow.followersGained ?? null,
          watchTimeMinutes: analyticsRow.watchTimeMinutes ?? null,
          averageViewDurationSeconds: analyticsRow.averageViewDurationSeconds ?? null,
          averagePercentageViewed: analyticsRow.averagePercentageViewed ?? null,
          impressions: analyticsRow.impressions ?? null,
          clickThroughRate: analyticsRow.clickThroughRate ?? null,
        },
      };
    });

    return {
      platform: 'YOUTUBE',
      accountName: channel.snippet?.title ?? channel.id,
      externalId: channel.id,
      videos,
      unavailableMetrics: [
        {
          metric: 'impressions',
          reason:
            'Thumbnail impressions and CTR are not provided by this integration. Import them from YouTube Studio CSV.',
        },
        {
          metric: 'clickThroughRate',
          reason:
            'Thumbnail impressions and CTR are not provided by this integration. Import them from YouTube Studio CSV.',
        },
        {
          metric: 'saves',
          reason: 'YouTube does not expose a per-video save/add-to-playlist count through the public API.',
        },
      ],
      warnings,
      fetchedAt: new Date().toISOString(),
    };
  },

  limitations: [
    'Requires a Google Cloud project with the YouTube Data API v3 and YouTube Analytics API enabled.',
    'Retention, watch time, subscribers gained and shares come from the YouTube Analytics API and are only available for channels you own.',
    'Import thumbnail impressions and CTR from YouTube Studio CSV; they are not available through this integration.',
    'The Data API has a default quota of 10,000 units per day; a full sync of 500 videos costs about 25 units.',
    'Shorts are detected by duration (3 minutes or less) because the API has no explicit Shorts flag.',
  ],
};
