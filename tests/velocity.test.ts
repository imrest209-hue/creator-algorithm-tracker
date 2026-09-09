import { describe, expect, it } from 'vitest';
import { analyseVelocity, findContinuedGrowthCandidates } from '@/lib/analytics/velocity';
import { earlyVelocity, viewsAtMinute } from '@/lib/analytics/metrics';
import type { VideoRecord } from '@/lib/types';

const NOW = new Date('2026-06-10T00:00:00Z');

function makeVideo(overrides: Partial<VideoRecord> & { id: string }): VideoRecord {
  return {
    platformVideoId: overrides.id,
    platform: 'YOUTUBE_SHORTS',
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
    publishedAt: new Date('2026-06-01T00:00:00Z').toISOString(),
    thumbnailUrl: null,
    source: 'DEMO',
    metrics: {
      views: 10000,
      likes: 500,
      comments: 50,
      shares: 30,
      saves: null,
      followersGained: null,
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

describe('viewsAtMinute / earlyVelocity', () => {
  it('returns null for an unmeasured milestone rather than interpolating', () => {
    const video = makeVideo({ id: 'a', snapshots: [{ minutesAfterPublish: 60, views: 1000, likes: null, comments: null, shares: null }] });
    expect(viewsAtMinute(video, 180)).toBeNull();
    expect(earlyVelocity(video, 180)).toBeNull();
  });

  it('computes views/hour correctly for a measured milestone', () => {
    const video = makeVideo({ id: 'a', snapshots: [{ minutesAfterPublish: 180, views: 900, likes: null, comments: null, shares: null }] });
    // 900 views / 3 hours = 300 views/hour
    expect(earlyVelocity(video, 180)).toBe(300);
  });
});

describe('analyseVelocity', () => {
  it('flags a video gaining views much faster than baseline with the hot alert', () => {
    const baselineVideos = Array.from({ length: 4 }, (_, i) =>
      makeVideo({
        id: 'baseline-' + i,
        snapshots: [
          { minutesAfterPublish: 60, views: 100, likes: null, comments: null, shares: null },
          { minutesAfterPublish: 180, views: 300, likes: null, comments: null, shares: null },
        ],
      }),
    );
    const hot = makeVideo({
      id: 'hot',
      snapshots: [
        { minutesAfterPublish: 60, views: 1000, likes: null, comments: null, shares: null },
        { minutesAfterPublish: 180, views: 3000, likes: null, comments: null, shares: null },
      ],
    });
    const all = [hot, ...baselineVideos];
    const result = analyseVelocity(hot, all, NOW);
    expect(result.alerts.some((a) => a.id === 'velocity-hot')).toBe(true);
  });

  it('marks milestones as pending, not missing, when the video has not reached them yet', () => {
    const recent = makeVideo({
      id: 'recent',
      publishedAt: new Date('2026-06-09T23:50:00Z').toISOString(), // 10 minutes old
      snapshots: [],
    });
    const result = analyseVelocity(recent, [recent], NOW);
    const oneDay = result.points.find((p) => p.minutes === 1440);
    expect(oneDay?.pending).toBe(true);
    expect(oneDay?.views).toBeNull();
  });

  it('reports no snapshot alert when a video has zero snapshots', () => {
    const video = makeVideo({ id: 'no-snap', snapshots: [] });
    const result = analyseVelocity(video, [video], NOW);
    expect(result.hasAnySnapshot).toBe(false);
    expect(result.alerts.some((a) => a.id === 'no-snapshots')).toBe(true);
  });
});

describe('findContinuedGrowthCandidates', () => {
  it('identifies a video accelerating after its first hours vs baseline', () => {
    const baseline = Array.from({ length: 4 }, (_, i) =>
      makeVideo({
        id: 'b' + i,
        snapshots: [
          { minutesAfterPublish: 180, views: 1000, likes: null, comments: null, shares: null },
          { minutesAfterPublish: 1440, views: 1500, likes: null, comments: null, shares: null },
        ],
      }),
    );
    const accelerating = makeVideo({
      id: 'accel',
      snapshots: [
        { minutesAfterPublish: 180, views: 800, likes: null, comments: null, shares: null }, // below baseline early
        { minutesAfterPublish: 1440, views: 4000, likes: null, comments: null, shares: null }, // far above baseline later
      ],
    });
    const all = [accelerating, ...baseline];
    const candidates = findContinuedGrowthCandidates(all, NOW);
    expect(candidates.some((c) => c.video.id === 'accel')).toBe(true);
  });
});
