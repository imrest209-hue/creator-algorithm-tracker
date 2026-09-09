import type { VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { dayKey } from '@/lib/util/date';
import { mean, round, sum } from '@/lib/util/math';

/**
 * GROWTH ANALYSIS
 * ---------------------------------------------------------------------------
 * Follower/subscriber growth attributed to individual videos.
 *
 * Note on accuracy: platforms report followers *gained per video*, which is not
 * the same as total channel growth (it excludes profile-page follows and
 * unfollows). We only ever report what the API attributes to a video, and label
 * it as such.
 */

export interface GrowthPoint {
  date: string;
  followersGained: number;
  cumulative: number;
  videos: number;
  views: number;
}

export interface GrowthSummary {
  totalFollowersGained: number | null;
  avgFollowersPerVideo: number | null;
  avgFollowerConversion: number | null;
  bestConverter: { video: VideoRecord; followersGained: number; conversion: number | null } | null;
  series: GrowthPoint[];
  coverage: { withData: number; total: number };
  note: string;
}

export const GROWTH_ATTRIBUTION_NOTE =
  'Followers/subscribers shown are the counts each platform attributes to individual videos. They exclude profile-page follows and unfollows, so they will not exactly match your total channel growth.';

export function analyseGrowth(
  videos: VideoRecord[],
  timezone: string,
  now = new Date(),
): GrowthSummary {
  const withData = videos.filter((v) => v.metrics.followersGained !== null);
  const sorted = [...videos].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );

  const byDay = new Map<string, { followers: number; videos: number; views: number }>();
  for (const v of sorted) {
    const key = dayKey(v.publishedAt, timezone);
    const entry = byDay.get(key) ?? { followers: 0, videos: 0, views: 0 };
    entry.followers += v.metrics.followersGained ?? 0;
    entry.videos += 1;
    entry.views += v.metrics.views;
    byDay.set(key, entry);
  }

  let cumulative = 0;
  const series: GrowthPoint[] = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entry]) => {
      cumulative += entry.followers;
      return {
        date,
        followersGained: entry.followers,
        cumulative,
        videos: entry.videos,
        views: entry.views,
      };
    });

  let bestConverter: GrowthSummary['bestConverter'] = null;
  let bestValue = -1;
  for (const v of withData) {
    const gained = v.metrics.followersGained ?? 0;
    if (gained > bestValue) {
      bestValue = gained;
      bestConverter = {
        video: v,
        followersGained: gained,
        conversion: deriveMetrics(v, now).followerConversion,
      };
    }
  }

  const avgPerVideo = withData.length > 0 ? mean(withData.map((v) => v.metrics.followersGained)) : null;

  return {
    totalFollowersGained: withData.length > 0 ? sum(withData.map((v) => v.metrics.followersGained)) : null,
    avgFollowersPerVideo: avgPerVideo === null ? null : round(avgPerVideo, 1),
    avgFollowerConversion: mean(videos.map((v) => deriveMetrics(v, now).followerConversion)),
    bestConverter,
    series,
    coverage: { withData: withData.length, total: videos.length },
    note: GROWTH_ATTRIBUTION_NOTE,
  };
}
