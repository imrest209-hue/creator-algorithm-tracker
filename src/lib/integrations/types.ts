import type { Platform, VideoMetrics } from '@/lib/types';

/**
 * Common shape every platform integration returns.
 *
 * `unavailableMetrics` is the contract that keeps the app honest: an integration
 * lists exactly which metrics its API cannot supply, and the UI renders those as
 * "Unavailable through current API permissions" instead of substituting a value.
 */

export interface FetchedVideo {
  platformVideoId: string;
  platform: Platform;
  title: string;
  caption: string | null;
  description: string | null;
  hashtags: string[];
  durationSeconds: number;
  publishedAt: string;
  thumbnailUrl: string | null;
  metrics: VideoMetrics;
}

export interface SyncResult {
  platform: Platform;
  accountName: string;
  externalId: string;
  videos: FetchedVideo[];
  /** Metric keys this API could not provide, with the reason. */
  unavailableMetrics: Array<{ metric: keyof VideoMetrics; reason: string }>;
  /** Non-fatal problems worth showing the user. */
  warnings: string[];
  fetchedAt: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface OAuthProfile {
  externalId: string;
  accountName: string;
}

export interface PlatformIntegration {
  platform: Platform;
  label: string;
  /** True when the required client id/secret env vars are present. */
  isConfigured(): boolean;
  /** Env vars this integration needs, for the setup screen. */
  requiredEnvVars: string[];
  buildAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  fetchProfile(tokens: OAuthTokens): Promise<OAuthProfile>;
  fetchVideos(tokens: OAuthTokens, options: { limit?: number }): Promise<SyncResult>;
  /** Documented limitations shown in the UI and the README. */
  limitations: string[];
}

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/#[\p{L}\p{N}_]+/gu);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

/** ISO-8601 duration ("PT1M35S") to seconds. */
export function parseIsoDuration(value: string | null | undefined): number {
  if (!value) return 0;
  const match = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Math.round(Number(seconds ?? 0))
  );
}
