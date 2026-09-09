import { describe, expect, it } from 'vitest';
import { buildDashboardSummary } from '@/lib/analytics/summary';
import { resolveRange } from '@/lib/util/date';
import type { VideoRecord } from '@/lib/types';

const NOW = new Date('2026-09-09T00:00:00Z');

function makeVideo(id: string, daysAgo: number, views: number): VideoRecord {
  const publishedAt = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
  return {
    id,
    platformVideoId: id,
    platform: 'YOUTUBE',
    title: 'Video ' + id,
    caption: null,
    description: null,
    hashtags: [],
    categorySlug: 'other',
    categoryName: 'Other',
    categoryAuto: true,
    hookText: null,
    hookType: 'UNKNOWN',
    hookAuto: true,
    durationSeconds: 300,
    publishedAt,
    thumbnailUrl: null,
    source: 'DEMO',
    metrics: {
      views,
      likes: Math.round(views * 0.05),
      comments: Math.round(views * 0.005),
      shares: Math.round(views * 0.002),
      saves: null,
      followersGained: null,
      watchTimeMinutes: null,
      averageViewDurationSeconds: null,
      averagePercentageViewed: null,
      impressions: null,
      clickThroughRate: null,
    },
    snapshots: [],
  };
}

describe('buildDashboardSummary time series for the "all time" preset', () => {
  it('anchors the series to the earliest real video, not the Unix epoch sentinel', () => {
    const videos = [makeVideo('a', 100, 1000), makeVideo('b', 50, 2000), makeVideo('c', 10, 3000)];
    const range = resolveRange({ preset: 'all', platform: 'ALL' }, NOW);
    // resolveRange's "all" sentinel really is the epoch - confirm the test
    // setup matches the real bug scenario before asserting the fix.
    expect(new Date(range.from).getUTCFullYear()).toBe(1970);

    const summary = buildDashboardSummary(videos, videos, range, 'UTC', NOW);

    expect(summary.timeSeries.length).toBeGreaterThan(0);
    // None of the generated points should predate the earliest real video by
    // more than a day - i.e. the series must not start at 1970.
    const firstPointYear = Number(summary.timeSeries[0].date.slice(0, 4));
    expect(firstPointYear).toBeGreaterThanOrEqual(2026);

    // The total views across the series must equal the videos' total views -
    // none of them silently fell outside the enumerated day range.
    const totalSeriesViews = summary.timeSeries.reduce((acc, p) => acc + p.views, 0);
    expect(totalSeriesViews).toBe(1000 + 2000 + 3000);
  });

  it('still produces a sane series for a normal bounded range', () => {
    const videos = [makeVideo('a', 5, 500), makeVideo('b', 2, 700)];
    const range = resolveRange({ preset: '30d', platform: 'ALL' }, NOW);
    const summary = buildDashboardSummary(videos, videos, range, 'UTC', NOW);
    const totalSeriesViews = summary.timeSeries.reduce((acc, p) => acc + p.views, 0);
    expect(totalSeriesViews).toBe(1200);
  });
});
