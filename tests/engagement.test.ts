import { describe, expect, it } from 'vitest';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { analyseEngagement } from '@/lib/analytics/engagement';
import type { VideoRecord } from '@/lib/types';

function makeVideo(overrides: Partial<VideoRecord> & { id: string }): VideoRecord {
  return {
    platformVideoId: overrides.id,
    platform: 'TIKTOK',
    title: 'Video ' + overrides.id,
    caption: null,
    description: null,
    hashtags: [],
    categorySlug: 'other',
    categoryName: 'Other',
    categoryAuto: true,
    hookText: null,
    hookType: 'UNKNOWN',
    hookAuto: true,
    durationSeconds: 30,
    publishedAt: new Date('2026-05-01T12:00:00Z').toISOString(),
    thumbnailUrl: null,
    source: 'DEMO',
    metrics: {
      views: 1000,
      likes: 100,
      comments: 10,
      shares: 5,
      saves: 8,
      followersGained: 3,
      watchTimeMinutes: null,
      averageViewDurationSeconds: null,
      averagePercentageViewed: null,
      impressions: null,
      clickThroughRate: null,
    },
    snapshots: [],
    ...overrides,
  };
}

describe('deriveMetrics engagement rate', () => {
  it('computes engagement rate as (likes+comments+shares+saves)/views', () => {
    const video = makeVideo({ id: 'a' });
    const derived = deriveMetrics(video, new Date('2026-06-01T00:00:00Z'));
    // (100+10+5+8)/1000 = 0.123 -> 12.3%
    expect(derived.engagementRate).toBeCloseTo(12.3, 5);
  });

  it('returns null engagement rate when views is 0, never divides by zero into a number', () => {
    const video = makeVideo({ id: 'b', metrics: { ...makeVideo({ id: 'b' }).metrics, views: 0 } });
    const derived = deriveMetrics(video, new Date('2026-06-01T00:00:00Z'));
    expect(derived.engagementRate).toBeNull();
  });

  it('treats missing saves as excluded from the numerator, not zero-with-a-value', () => {
    const video = makeVideo({ id: 'c', metrics: { ...makeVideo({ id: 'c' }).metrics, saves: null } });
    const derived = deriveMetrics(video, new Date('2026-06-01T00:00:00Z'));
    // (100+10+5+0)/1000 = 0.115 -> 11.5%
    expect(derived.engagementRate).toBeCloseTo(11.5, 5);
  });

  it('follower conversion is null when followersGained is unavailable', () => {
    const video = makeVideo({
      id: 'd',
      metrics: { ...makeVideo({ id: 'd' }).metrics, followersGained: null },
    });
    const derived = deriveMetrics(video, new Date('2026-06-01T00:00:00Z'));
    expect(derived.followerConversion).toBeNull();
  });
});

describe('analyseEngagement', () => {
  it('sums raw interaction counts across videos', () => {
    const videos = [makeVideo({ id: 'a' }), makeVideo({ id: 'b' })];
    const result = analyseEngagement(videos, new Date('2026-06-01T00:00:00Z'));
    expect(result.totalLikes).toBe(200);
    expect(result.totalComments).toBe(20);
    expect(result.totalShares).toBe(10);
    expect(result.totalSaves).toBe(16);
  });

  it('reports totalSaves as null when no video reports saves', () => {
    const videos = [
      makeVideo({ id: 'a', metrics: { ...makeVideo({ id: 'a' }).metrics, saves: null } }),
    ];
    const result = analyseEngagement(videos, new Date('2026-06-01T00:00:00Z'));
    expect(result.totalSaves).toBeNull();
  });

  it('computes a mix that sums to 100% share (within rounding)', () => {
    const videos = [makeVideo({ id: 'a' }), makeVideo({ id: 'b' })];
    const result = analyseEngagement(videos, new Date('2026-06-01T00:00:00Z'));
    const totalShare = result.mix.reduce((acc, m) => acc + m.share, 0);
    expect(totalShare).toBeCloseTo(100, 0);
  });
});
