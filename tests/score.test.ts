import { describe, expect, it } from 'vitest';
import { computePerformanceScore, scoreBand } from '@/lib/analytics/score';
import type { VideoRecord } from '@/lib/types';

const BASE_NOW = new Date('2026-06-01T00:00:00Z');

function makeVideo(overrides: Partial<VideoRecord> & { id: string }): VideoRecord {
  return {
    platformVideoId: overrides.id,
    platform: 'YOUTUBE',
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
    durationSeconds: 600,
    publishedAt: new Date('2026-05-01T12:00:00Z').toISOString(),
    thumbnailUrl: null,
    source: 'DEMO',
    metrics: {
      views: 10_000,
      likes: 500,
      comments: 50,
      shares: 20,
      saves: null,
      followersGained: 100,
      watchTimeMinutes: 1000,
      averageViewDurationSeconds: 300,
      averagePercentageViewed: 50,
      impressions: null,
      clickThroughRate: null,
    },
    snapshots: [],
    ...overrides,
  };
}

function buildBaselineSet(n: number, viewsEach: number): VideoRecord[] {
  return Array.from({ length: n }, (_, i) =>
    makeVideo({
      id: 'baseline-' + i,
      metrics: {
        views: viewsEach,
        likes: viewsEach * 0.05,
        comments: viewsEach * 0.005,
        shares: viewsEach * 0.002,
        saves: null,
        followersGained: viewsEach * 0.003,
        watchTimeMinutes: viewsEach * 0.5,
        averageViewDurationSeconds: 300,
        averagePercentageViewed: 50,
        impressions: null,
        clickThroughRate: null,
      },
    }),
  );
}

describe('computePerformanceScore', () => {
  it('scores a video at account average around 50', () => {
    const baseline = buildBaselineSet(10, 10_000);
    const target = makeVideo({ id: 'target', metrics: baseline[0].metrics });
    const all = [target, ...baseline];
    const result = computePerformanceScore(target, all, BASE_NOW);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThanOrEqual(60);
  });

  it('scores a video with double the baseline views higher than average', () => {
    const baseline = buildBaselineSet(10, 10_000);
    const target = makeVideo({
      id: 'target',
      metrics: { ...baseline[0].metrics, views: 40_000 },
    });
    const all = [target, ...baseline];
    const result = computePerformanceScore(target, all, BASE_NOW);
    expect(result.score).toBeGreaterThan(50);
  });

  it('never fabricates a value for an unavailable metric - CTR is excluded, not zeroed', () => {
    const baseline = buildBaselineSet(10, 10_000);
    const target = makeVideo({ id: 'target', metrics: baseline[0].metrics });
    const all = [target, ...baseline];
    const result = computePerformanceScore(target, all, BASE_NOW);
    const ctr = result.components.find((c) => c.key === 'clickThroughRate');
    expect(ctr?.available).toBe(false);
    expect(ctr?.value).toBeNull();
  });

  it('redistributes weight so the score always sums to <=100 when a component is missing', () => {
    const baseline = buildBaselineSet(10, 10_000);
    const target = makeVideo({ id: 'target', metrics: baseline[0].metrics });
    const all = [target, ...baseline];
    const result = computePerformanceScore(target, all, BASE_NOW);
    const totalWeight = result.components.reduce((acc, c) => acc + c.effectiveWeight, 0);
    expect(totalWeight).toBeCloseTo(100, 0);
  });

  it('reports NONE confidence and score 0 when there is no baseline at all', () => {
    const target = makeVideo({ id: 'solo' });
    const result = computePerformanceScore(target, [target], BASE_NOW);
    expect(result.confidence).toBe('NONE');
    expect(result.score).toBe(0);
  });

  it('produces human-readable reasons that cite the actual metric deltas', () => {
    const baseline = buildBaselineSet(10, 10_000);
    const target = makeVideo({
      id: 'target',
      metrics: { ...baseline[0].metrics, views: 20_000 },
    });
    const all = [target, ...baseline];
    const result = computePerformanceScore(target, all, BASE_NOW);
    expect(result.reasons.some((r) => /views/i.test(r))).toBe(true);
  });
});

describe('scoreBand', () => {
  it('classifies bands correctly at the boundaries', () => {
    expect(scoreBand(85).label).toBe('Excellent');
    expect(scoreBand(65).label).toBe('Above average');
    expect(scoreBand(45).label).toBe('Average');
    expect(scoreBand(10).label).toBe('Underperforming');
  });
});
