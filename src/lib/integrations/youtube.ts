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
const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

/**
 * Publishing (Studio's "Publish to YouTube") needs this in addition to
 * YOUTUBE_SCOPES - deliberately NOT added to the default scope list, since
 * that would force every connection through a broader consent screen even
 * for read-only-sync-only users. `buildAuthorizationUrl` accepts an
 * `extraScopes` param so only the publish-connect flow requests it; Google's
 * `include_granted_scopes: true` (already set below) means reconnecting adds
 * this without dropping the existing read-only scopes.
 */
export const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export function hasUploadScope(scopes: string[]): boolean {
  return scopes.includes(YOUTUBE_UPLOAD_SCOPE);
}

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

function buildYoutubeAuthUrl(state: string, redirectUri: string, scopes: string[]): string {
  const clientId = env('YOUTUBE_CLIENT_ID');
  if (!clientId) throw new Error('YOUTUBE_CLIENT_ID is not configured.');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    // "consent" guarantees a refresh token on re-authorisation.
    prompt: 'consent',
    state,
  });
  return AUTH_ENDPOINT + '?' + params.toString();
}

/** Used by the connect route's `?scope=upload` variant (see registry.ts / [platform]/route.ts). */
export function buildYoutubeUploadAuthorizationUrl(state: string, redirectUri: string): string {
  return buildYoutubeAuthUrl(state, redirectUri, [...YOUTUBE_SCOPES, YOUTUBE_UPLOAD_SCOPE]);
}

export const youtubeIntegration: PlatformIntegration = {
  platform: 'YOUTUBE',
  label: 'YouTube',
  requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],

  isConfigured() {
    return Boolean(env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET'));
  },

  buildAuthorizationUrl(state, redirectUri) {
    return buildYoutubeAuthUrl(state, redirectUri, YOUTUBE_SCOPES);
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

/**
 * PUBLISHING (Studio "Publish to YouTube")
 * ---------------------------------------------------------------------------
 * Deliberately standalone, not part of `PlatformIntegration` - publishing is
 * a stateful, multi-step, platform-specific operation (resumable sessions,
 * chunked binary PUTs) that doesn't fit that interface's "one call in, one
 * SyncResult out" shape, and a future TikTok posting integration will have
 * entirely different mechanics. `fetchJson` isn't used here either: it
 * assumes JSON in/out, and these calls send/receive binary bodies and need
 * to read response headers (Location, Range) that fetchJson discards.
 */

export interface PublishMetadata {
  title: string;
  description?: string;
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
}

function classifyUploadError(status: number, bodyText: string): ApiError['kind'] {
  if (status === 401) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) return /quota|rateLimitExceeded|userRateLimitExceeded/i.test(bodyText) ? 'QUOTA' : 'AUTH';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER';
  return 'CLIENT';
}

async function throwForFailedUploadResponse(response: Response, label: string): Promise<never> {
  const text = await response.text().catch(() => '');
  const kind = classifyUploadError(response.status, text);
  logger.warn('integration.http_error', { label, status: response.status, kind });
  throw new ApiError(label + ' failed with HTTP ' + response.status, response.status, kind, null, text.slice(0, 500));
}

/**
 * Starts a resumable upload session and returns its session URI (from the
 * `Location` response header). The actual video bytes are sent afterward via
 * `uploadVideoChunk`.
 */
export async function initiateResumableUpload(
  tokens: OAuthTokens,
  metadata: PublishMetadata,
  fileSizeBytes: number,
  mimeType: string,
): Promise<string> {
  const response = await fetch(
    UPLOAD_API + '/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokens.accessToken,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(fileSizeBytes),
      },
      body: JSON.stringify({
        snippet: {
          title: metadata.title,
          description: metadata.description ?? '',
          categoryId: metadata.categoryId,
        },
        status: { privacyStatus: metadata.privacyStatus },
      }),
    },
  );
  if (!response.ok) await throwForFailedUploadResponse(response, 'YouTube resumable upload start');
  const location = response.headers.get('location');
  if (!location) {
    throw new ApiError('YouTube did not return a resumable upload session.', 502, 'SERVER');
  }
  return location;
}

/** Parses YouTube's "Range: bytes=0-8388607" response header into the next byte offset to send. */
export function parseNextByteFromRangeHeader(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  const match = /bytes=0-(\d+)/.exec(rangeHeader);
  return match ? Number(match[1]) + 1 : 0;
}

/** Builds a `Content-Range: bytes start-end/total` header value for one chunk PUT. */
export function buildContentRangeHeader(rangeStart: number, chunkLength: number, totalBytes: number): string {
  const rangeEnd = rangeStart + chunkLength - 1;
  return 'bytes ' + rangeStart + '-' + rangeEnd + '/' + totalBytes;
}

export interface UploadChunkResult {
  done: boolean;
  nextByte: number;
  /** Set once `done` is true - the new video's id. */
  videoId?: string;
}

/**
 * PUTs one chunk of the video file. YouTube replies `308 Resume Incomplete`
 * (not an error - no Location header, so fetch's default redirect-follow
 * behaviour has nothing to follow) for every chunk except the last, which
 * gets a normal 200/201 with the created video's id in the JSON body.
 */
export async function uploadVideoChunk(
  sessionUri: string,
  chunk: Buffer,
  rangeStart: number,
  totalBytes: number,
): Promise<UploadChunkResult> {
  const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Length': String(chunk.length),
      'Content-Range': buildContentRangeHeader(rangeStart, chunk.length, totalBytes),
    },
    body: new Uint8Array(chunk),
  });

  if (response.status === 308) {
    return { done: false, nextByte: parseNextByteFromRangeHeader(response.headers.get('range')) };
  }
  if (!response.ok) await throwForFailedUploadResponse(response, 'YouTube video chunk upload');

  const data = (await response.json().catch(() => ({}))) as { id?: string };
  if (!data.id) {
    throw new ApiError('YouTube finished the upload but did not return a video id.', 502, 'SERVER');
  }
  return { done: true, nextByte: totalBytes, videoId: data.id };
}

/**
 * Queries how many bytes YouTube has actually received for a session, so an
 * interrupted upload (e.g. a dev-server restart mid-upload) can resume from
 * the right offset instead of restarting from zero.
 */
export async function queryResumableUploadStatus(
  sessionUri: string,
  totalBytes: number,
): Promise<{ bytesReceived: number; done: boolean }> {
  const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Length': '0', 'Content-Range': 'bytes */' + totalBytes },
  });
  if (response.status === 308) {
    return { bytesReceived: parseNextByteFromRangeHeader(response.headers.get('range')), done: false };
  }
  if (response.ok) return { bytesReceived: totalBytes, done: true };
  await throwForFailedUploadResponse(response, 'YouTube resumable upload status check');
  throw new ApiError('Unreachable', 500, 'SERVER');
}

/**
 * Sets a video's custom thumbnail. Per Google's docs the `youtube.upload`
 * scope covers this for videos the uploading channel owns - verified
 * empirically against this app's own real upload during implementation.
 */
export async function setThumbnail(tokens: OAuthTokens, videoId: string, thumbnailPng: Buffer): Promise<void> {
  const response = await fetch(UPLOAD_API + '/thumbnails/set?videoId=' + encodeURIComponent(videoId), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tokens.accessToken,
      'Content-Type': 'image/png',
      'Content-Length': String(thumbnailPng.length),
    },
    body: new Uint8Array(thumbnailPng),
  });
  if (!response.ok) await throwForFailedUploadResponse(response, 'YouTube set thumbnail');
}
