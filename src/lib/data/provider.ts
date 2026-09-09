import type {
  ConnectedAccountSummary,
  ContentCategory,
  Dataset,
  HookType,
  Platform,
  VideoRecord,
} from '@/lib/types';
import { DEFAULT_CATEGORIES } from '@/lib/analytics/content';
import { buildDemoDataset } from '@/lib/demo/generator';
import { isDatabaseConfigured, prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/util/logger';

/**
 * DATA PROVIDER
 * ---------------------------------------------------------------------------
 * The single place that decides where a dataset comes from.
 *
 * Demo data is generated in-process and is NEVER written to, or read from, the
 * tables that hold real account data. A signed-in user always gets their own
 * rows; demo mode always gets synthetic rows. The two never mix inside one
 * Dataset, and `Dataset.isDemo` tells the UI which it is holding.
 */

export type DatasetScope = { kind: 'demo' } | { kind: 'user'; userId: string; timezone?: string };

export async function loadDataset(scope: DatasetScope): Promise<Dataset> {
  if (scope.kind === 'demo') return buildDemoDataset();
  return loadUserDataset(scope.userId, scope.timezone ?? 'UTC');
}

/** Number of metric captures to keep per video when loading (newest wins). */
const METRIC_HISTORY_LIMIT = 1;

async function loadUserDataset(userId: string, fallbackTimezone: string): Promise<Dataset> {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured, so real account data cannot be loaded.');
  }

  const [user, videos, categories, accounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.video.findMany({
      where: { userId },
      orderBy: { publishedAt: 'desc' },
      include: {
        category: true,
        hook: true,
        snapshots: { orderBy: { minutesAfterPublish: 'asc' } },
        hashtags: { include: { hashtag: true } },
        metrics: { orderBy: { capturedAt: 'desc' }, take: METRIC_HISTORY_LIMIT },
      },
    }),
    prisma.contentCategory.findMany({ where: { OR: [{ userId }, { userId: null }] } }),
    prisma.connectedAccount.findMany({ where: { userId } }),
  ]);

  return {
    isDemo: false,
    ownerLabel: user?.displayName ?? 'Your account',
    timezone: user?.timezone ?? fallbackTimezone,
    videos: videos.map(mapVideo),
    categories: mapCategories(categories),
    connectedAccounts: accounts.map(mapAccount),
  };
}

/* -------------------------------------------------------------------------- */
/* Mappers: Prisma rows -> plain domain records                               */
/* -------------------------------------------------------------------------- */

/**
 * The shape `mapVideo` needs. Declared structurally rather than pulled from a
 * Prisma payload type so the mapper can also be called from the CSV importer
 * and unit tests without constructing a full Prisma result.
 */
export interface VideoRow {
  id: string;
  platform: Platform;
  platformVideoId: string;
  title: string;
  caption: string | null;
  description: string | null;
  categoryAuto: boolean;
  durationSeconds: number;
  publishedAt: Date;
  thumbnailUrl: string | null;
  source: string;
  category: { slug: string; name: string } | null;
  hook: { text: string; type: string; isAuto: boolean } | null;
  snapshots: Array<{
    minutesAfterPublish: number;
    views: bigint;
    likes: bigint | null;
    comments: bigint | null;
    shares: bigint | null;
  }>;
  hashtags: Array<{ hashtag: { tag: string } }>;
  metrics: Array<{
    views: bigint;
    likes: bigint;
    comments: bigint;
    shares: bigint;
    saves: bigint | null;
    followersGained: number | null;
    watchTimeMinutes: number | null;
    averageViewDurationSeconds: number | null;
    averagePercentageViewed: number | null;
    impressions: bigint | null;
    clickThroughRate: number | null;
  }>;
}

/** Postgres BIGINT arrives as a JS bigint; JSON and charts need Number. */
export function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? Number(value) : value;
}

export function mapVideo(row: VideoRow): VideoRecord {
  const latest = row.metrics[0];
  if (!latest) {
    logger.warn('video.missing_metrics', { videoId: row.id });
  }
  return {
    id: row.id,
    platformVideoId: row.platformVideoId,
    platform: row.platform,
    title: row.title,
    caption: row.caption,
    description: row.description,
    hashtags: row.hashtags.map((h) => '#' + h.hashtag.tag),
    categorySlug: row.category?.slug ?? 'other',
    categoryName: row.category?.name ?? 'Other',
    categoryAuto: row.categoryAuto,
    hookText: row.hook?.text ?? null,
    hookType: (row.hook?.type as HookType) ?? 'UNKNOWN',
    hookAuto: row.hook?.isAuto ?? true,
    durationSeconds: row.durationSeconds,
    publishedAt: row.publishedAt.toISOString(),
    thumbnailUrl: row.thumbnailUrl,
    source: row.source as VideoRecord['source'],
    metrics: {
      views: toNumber(latest?.views) ?? 0,
      likes: toNumber(latest?.likes) ?? 0,
      comments: toNumber(latest?.comments) ?? 0,
      shares: toNumber(latest?.shares) ?? 0,
      saves: toNumber(latest?.saves ?? null),
      followersGained: latest?.followersGained ?? null,
      watchTimeMinutes: latest?.watchTimeMinutes ?? null,
      averageViewDurationSeconds: latest?.averageViewDurationSeconds ?? null,
      averagePercentageViewed: latest?.averagePercentageViewed ?? null,
      impressions: toNumber(latest?.impressions ?? null),
      clickThroughRate: latest?.clickThroughRate ?? null,
    },
    snapshots: row.snapshots.map((s) => ({
      minutesAfterPublish: s.minutesAfterPublish,
      views: toNumber(s.views) ?? 0,
      likes: toNumber(s.likes),
      comments: toNumber(s.comments),
      shares: toNumber(s.shares),
    })),
  };
}

export function mapCategories(
  rows: Array<{ slug: string; name: string; keywords: string[]; isCustom: boolean }>,
): ContentCategory[] {
  if (rows.length === 0) return DEFAULT_CATEGORIES;
  const bySlug = new Map<string, ContentCategory>();
  for (const base of DEFAULT_CATEGORIES) bySlug.set(base.slug, base);
  for (const row of rows) {
    bySlug.set(row.slug, {
      slug: row.slug,
      name: row.name,
      keywords: row.keywords,
      isCustom: row.isCustom,
    });
  }
  return Array.from(bySlug.values());
}

export function mapAccount(row: {
  id: string;
  platform: Platform;
  accountName: string;
  externalId: string;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  scopes: string[];
  status: string;
  statusMessage: string | null;
}): ConnectedAccountSummary {
  return {
    id: row.id,
    platform: row.platform,
    accountName: row.accountName,
    externalId: row.externalId,
    connectedAt: row.connectedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    scopes: row.scopes,
    status: row.status as ConnectedAccountSummary['status'],
    statusMessage: row.statusMessage,
  };
}
