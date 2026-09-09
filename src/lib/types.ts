/**
 * Core domain types.
 *
 * Everything in `src/lib/analytics` operates on these plain shapes so the
 * analytics engine can be unit-tested without a database and can be fed by
 * either the demo dataset provider or the Prisma-backed provider.
 */

export const PLATFORMS = ['YOUTUBE', 'YOUTUBE_SHORTS', 'TIKTOK', 'TWITCH', 'KICK'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  YOUTUBE_SHORTS: 'YouTube Shorts',
  TIKTOK: 'TikTok',
  TWITCH: 'Twitch',
  KICK: 'Kick',
};

/**
 * Platform filter used by the UI. `SHORTS` means "short-form only" which spans
 * YouTube Shorts, TikTok, and Twitch/Kick clips - all vertical/short, clip-style
 * surfaces as opposed to long-form YouTube uploads.
 */
export type PlatformFilter = 'ALL' | Platform | 'SHORTS';

export const HOOK_TYPES = [
  'QUESTION',
  'CONTROVERSIAL',
  'STORY',
  'YOU_WONT_BELIEVE',
  'IMMEDIATE_ACTION',
  'PROBLEM_SOLUTION',
  'CURIOSITY',
  'LISTICLE',
  'DIRECT_ADDRESS',
  'UNKNOWN',
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const HOOK_LABELS: Record<HookType, string> = {
  QUESTION: 'Question hook',
  CONTROVERSIAL: 'Controversial statement',
  STORY: 'Story hook',
  YOU_WONT_BELIEVE: '"You won’t believe…"',
  IMMEDIATE_ACTION: 'Immediate action',
  PROBLEM_SOLUTION: 'Problem / solution',
  CURIOSITY: 'Curiosity hook',
  LISTICLE: 'Listicle / countdown',
  DIRECT_ADDRESS: 'Direct address',
  UNKNOWN: 'Unclassified',
};

/** Milestones (in minutes after publish) tracked by the velocity system. */
export const VELOCITY_MILESTONES = [15, 30, 60, 180, 360, 720, 1440, 2880, 10080] as const;
export type VelocityMilestone = (typeof VELOCITY_MILESTONES)[number];

export const VELOCITY_MILESTONE_LABELS: Record<number, string> = {
  15: '15 min',
  30: '30 min',
  60: '1 hr',
  180: '3 hr',
  360: '6 hr',
  720: '12 hr',
  1440: '24 hr',
  2880: '48 hr',
  10080: '7 days',
};

export interface VelocitySnapshot {
  /** Minutes after publish. */
  minutesAfterPublish: number;
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/**
 * A metric that a platform may simply not expose. `null` always means
 * "not available" and must never be replaced with an invented number.
 */
export type MaybeMetric = number | null;

export interface VideoMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** TikTok favourites / YouTube "saves to playlist". */
  saves: MaybeMetric;
  followersGained: MaybeMetric;
  /** Total watch time in minutes. */
  watchTimeMinutes: MaybeMetric;
  averageViewDurationSeconds: MaybeMetric;
  /** 0-100. This is the retention metric used across the app. */
  averagePercentageViewed: MaybeMetric;
  impressions: MaybeMetric;
  /** 0-100. */
  clickThroughRate: MaybeMetric;
}

export interface VideoRecord {
  id: string;
  /** Platform-native id (YouTube video id, TikTok item id, or a manual id). */
  platformVideoId: string;
  platform: Platform;
  title: string;
  caption: string | null;
  description: string | null;
  hashtags: string[];
  /** Slug of the resolved content category. */
  categorySlug: string;
  categoryName: string;
  /** True when the category came from the auto-classifier rather than the user. */
  categoryAuto: boolean;
  hookText: string | null;
  hookType: HookType;
  hookAuto: boolean;
  durationSeconds: number;
  /** ISO-8601 UTC timestamp. */
  publishedAt: string;
  thumbnailUrl: string | null;
  source: DataSource;
  metrics: VideoMetrics;
  snapshots: VelocitySnapshot[];
}

// KICK_API is intentionally absent: Kick has no public analytics API for clip
// performance yet, so Kick data only ever arrives via CSV or manual entry -
// see src/lib/integrations/kick.ts for the honest status this reports in Settings.
export const DATA_SOURCES = [
  'DEMO',
  'MANUAL',
  'CSV',
  'YOUTUBE_API',
  'TIKTOK_API',
  'TWITCH_API',
  'YOUTUBE_UPLOAD',
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  DEMO: 'Demo',
  MANUAL: 'Manual entry',
  CSV: 'CSV import',
  YOUTUBE_API: 'YouTube API',
  TIKTOK_API: 'TikTok API',
  TWITCH_API: 'Twitch API',
  YOUTUBE_UPLOAD: 'Published from Studio',
};

export interface ContentCategory {
  slug: string;
  name: string;
  /** Lower-cased keywords used by the auto-classifier. */
  keywords: string[];
  isCustom: boolean;
}

export interface ConnectedAccountSummary {
  id: string;
  platform: Platform;
  accountName: string;
  externalId: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  scopes: string[];
  status: 'CONNECTED' | 'EXPIRED' | 'ERROR';
  statusMessage: string | null;
}

export interface CompetitorAccount {
  id: string;
  platform: Platform;
  handle: string;
  url: string | null;
  displayName: string | null;
  notes: string | null;
  createdAt: string;
  /** How the competitor's videos were obtained. */
  dataSource: 'MANUAL' | 'YOUTUBE_API';
  videos: CompetitorVideo[];
}

export interface CompetitorVideo {
  id: string;
  platformVideoId: string;
  title: string;
  publishedAt: string;
  durationSeconds: number | null;
  views: MaybeMetric;
  likes: MaybeMetric;
  comments: MaybeMetric;
  hashtags: string[];
  url: string | null;
}

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  severity: 'INFO' | 'GOOD' | 'WARN';
  title: string;
  body: string;
  videoId: string | null;
  createdAt: string;
  read: boolean;
}

export const NOTIFICATION_TYPES = [
  'VIRAL_GROWTH',
  'HIGH_RETENTION',
  'LOW_PERFORMANCE',
  'MILESTONE',
  'STRONG_TOPIC',
  'POSTING_OPPORTUNITY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  VIRAL_GROWTH: 'Viral / rapid growth',
  HIGH_RETENTION: 'Unusually high retention',
  LOW_PERFORMANCE: 'Unusually low performance',
  MILESTONE: 'Milestones',
  STRONG_TOPIC: 'Strong-performing topics',
  POSTING_OPPORTUNITY: 'Recommended posting opportunities',
};

export type NotificationSettings = Record<NotificationType, boolean>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  VIRAL_GROWTH: true,
  HIGH_RETENTION: true,
  LOW_PERFORMANCE: true,
  MILESTONE: true,
  STRONG_TOPIC: true,
  POSTING_OPPORTUNITY: false,
};

/** The complete working set the analytics engine reasons over. */
export interface Dataset {
  /** `true` when this is generated demo data and not real account data. */
  isDemo: boolean;
  ownerLabel: string;
  timezone: string;
  videos: VideoRecord[];
  categories: ContentCategory[];
  connectedAccounts: ConnectedAccountSummary[];
}

export interface DateRange {
  /** Inclusive ISO timestamp. */
  from: string;
  /** Exclusive ISO timestamp. */
  to: string;
}

export type RangePreset = '7d' | '30d' | '90d' | '365d' | 'all' | 'custom';

export interface FilterState {
  preset: RangePreset;
  from?: string;
  to?: string;
  platform: PlatformFilter;
}
