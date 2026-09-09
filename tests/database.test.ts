import { describe, expect, it } from 'vitest';
import { mapAccount, mapCategories, mapVideo, toNumber, type VideoRow } from '@/lib/data/provider';
import { DEFAULT_CATEGORIES } from '@/lib/analytics/content';

/**
 * These tests exercise the pure mapping layer between Prisma's row shape and
 * the app's domain types, without requiring a live PostgreSQL connection -
 * the shapes are constructed by hand to mirror exactly what Prisma returns
 * (bigint counters, Date objects, nested relations).
 */

function makeRow(overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id: 'row-1',
    platform: 'YOUTUBE',
    platformVideoId: 'yt-1',
    title: 'Test Video',
    caption: null,
    description: 'A description',
    categoryAuto: true,
    durationSeconds: 300,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    thumbnailUrl: null,
    source: 'YOUTUBE_API',
    category: { slug: 'gaming', name: 'Gaming' },
    hook: { text: 'So I tried this', type: 'STORY', isAuto: true },
    snapshots: [
      { minutesAfterPublish: 60, views: 100n, likes: 5n, comments: 1n, shares: 0n },
    ],
    hashtags: [{ hashtag: { tag: 'gaming' } }, { hashtag: { tag: 'fun' } }],
    metrics: [
      {
        views: 1000n,
        likes: 50n,
        comments: 5n,
        shares: 2n,
        saves: null,
        followersGained: 10,
        watchTimeMinutes: 200,
        averageViewDurationSeconds: 120,
        averagePercentageViewed: 40,
        impressions: 5000n,
        clickThroughRate: 4.5,
      },
    ],
    ...overrides,
  };
}

describe('toNumber', () => {
  it('converts a bigint to a number', () => {
    expect(toNumber(42n)).toBe(42);
  });
  it('passes through a plain number', () => {
    expect(toNumber(7)).toBe(7);
  });
  it('returns null for null/undefined instead of 0', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
});

describe('mapVideo', () => {
  it('maps a Prisma row into a VideoRecord with the latest metric snapshot', () => {
    const record = mapVideo(makeRow());
    expect(record.id).toBe('row-1');
    expect(record.metrics.views).toBe(1000);
    expect(record.metrics.likes).toBe(50);
    expect(record.categorySlug).toBe('gaming');
    expect(record.hookType).toBe('STORY');
    expect(record.hashtags).toEqual(['#gaming', '#fun']);
    expect(record.snapshots).toEqual([
      { minutesAfterPublish: 60, views: 100, likes: 5, comments: 1, shares: 0 },
    ]);
  });

  it('falls back to zeroed/null metrics gracefully when a video has no metric rows yet', () => {
    const record = mapVideo(makeRow({ metrics: [] }));
    expect(record.metrics.views).toBe(0);
    expect(record.metrics.saves).toBeNull();
    expect(record.metrics.averagePercentageViewed).toBeNull();
  });

  it('defaults an uncategorised video to the "other" category rather than erroring', () => {
    const record = mapVideo(makeRow({ category: null }));
    expect(record.categorySlug).toBe('other');
    expect(record.categoryName).toBe('Other');
  });

  it('leaves hookType as UNKNOWN when there is no hook row', () => {
    const record = mapVideo(makeRow({ hook: null }));
    expect(record.hookType).toBe('UNKNOWN');
    expect(record.hookText).toBeNull();
  });

  it('preserves null saves/impressions rather than coercing to 0', () => {
    const record = mapVideo(makeRow());
    expect(record.metrics.saves).toBeNull();
    expect(record.metrics.impressions).toBe(5000);
  });
});

describe('mapCategories', () => {
  it('returns the default category list when no user rows exist', () => {
    const categories = mapCategories([]);
    expect(categories.length).toBe(DEFAULT_CATEGORIES.length);
  });

  it('merges user-defined categories over the defaults by slug', () => {
    const categories = mapCategories([
      { slug: 'gaming', name: 'Gaming (custom)', keywords: ['xbox'], isCustom: true },
      { slug: 'my-niche', name: 'My Niche', keywords: [], isCustom: true },
    ]);
    const gaming = categories.find((c) => c.slug === 'gaming');
    const niche = categories.find((c) => c.slug === 'my-niche');
    expect(gaming?.name).toBe('Gaming (custom)');
    expect(niche).toBeDefined();
  });
});

describe('mapAccount', () => {
  it('maps a connected account row to ISO date strings', () => {
    const account = mapAccount({
      id: 'acc-1',
      platform: 'TIKTOK',
      accountName: '@creator',
      externalId: 'ext-1',
      connectedAt: new Date('2026-01-01T00:00:00Z'),
      lastSyncedAt: null,
      scopes: ['video.list'],
      status: 'CONNECTED',
      statusMessage: null,
    });
    expect(account.connectedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(account.lastSyncedAt).toBeNull();
    expect(account.status).toBe('CONNECTED');
  });
});
