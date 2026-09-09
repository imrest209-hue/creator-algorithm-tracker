import type { DateRange, VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { computeViralPotential } from '@/lib/analytics/viral';
import { analyseVelocity } from '@/lib/analytics/velocity';
import { dayKey, enumerateDays, isWithin, previousRange } from '@/lib/util/date';
import { linearSlope, mean, percentDelta, round, sum } from '@/lib/util/math';

/**
 * DASHBOARD SUMMARY
 * ---------------------------------------------------------------------------
 * Aggregates for the home dashboard. Every "unavailable" metric stays null so
 * the UI can render an explicit "Unavailable" state instead of a zero that
 * would read as a real measurement.
 */

export interface KpiValue {
  value: number | null;
  /** Change vs the equivalent preceding window, as a ratio (0.12 = +12%). */
  delta: number | null;
  /** Number of videos that actually contributed a value. */
  sampleSize: number;
  unavailableNote: string | null;
}

export interface VideoHighlight {
  video: VideoRecord;
  score: number;
  /** So the UI can render "N/A" instead of a misleading numeric 0 when there is no baseline yet. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  headline: string;
}

export interface DashboardSummary {
  range: DateRange;
  videosPosted: KpiValue;
  totalViews: KpiValue;
  totalLikes: KpiValue;
  totalComments: KpiValue;
  totalShares: KpiValue;
  avgWatchTimeMinutes: KpiValue;
  avgRetention: KpiValue;
  avgEngagementRate: KpiValue;
  followersGained: KpiValue;
  avgPerformanceScore: KpiValue;
  bestVideo: VideoHighlight | null;
  fastestGrowingVideo: VideoHighlight | null;
  highestViralPotential: VideoHighlight | null;
  trend: PerformanceTrend;
  timeSeries: TimeSeriesPoint[];
  platformBreakdown: PlatformBreakdown[];
}

export interface TimeSeriesPoint {
  date: string;
  views: number;
  engagements: number;
  videos: number;
  avgScore: number | null;
}

export interface PlatformBreakdown {
  platform: string;
  label: string;
  videos: number;
  views: number;
  avgScore: number | null;
  avgEngagementRate: number | null;
}

export interface PerformanceTrend {
  direction: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';
  /** Views change vs the preceding equal-length window. */
  viewsDelta: number | null;
  scoreDelta: number | null;
  label: string;
  detail: string;
}

function kpi(
  values: Array<number | null>,
  previousValues: Array<number | null>,
  mode: 'sum' | 'mean',
  unavailableNote = 'Not available for the selected videos.',
): KpiValue {
  const usable = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const prevUsable = previousValues.filter((v): v is number => v !== null && Number.isFinite(v));
  if (usable.length === 0) {
    return { value: null, delta: null, sampleSize: 0, unavailableNote };
  }
  const current = mode === 'sum' ? sum(usable) : (mean(usable) ?? null);
  const previous =
    prevUsable.length === 0 ? null : mode === 'sum' ? sum(prevUsable) : (mean(prevUsable) ?? null);
  return {
    value: current,
    delta: percentDelta(current, previous),
    sampleSize: usable.length,
    unavailableNote: null,
  };
}

const PLATFORM_LABEL: Record<string, string> = {
  YOUTUBE: 'YouTube',
  YOUTUBE_SHORTS: 'Shorts',
  TIKTOK: 'TikTok',
};

export function buildDashboardSummary(
  inRange: VideoRecord[],
  allPlatformVideos: VideoRecord[],
  range: DateRange,
  timezone: string,
  now = new Date(),
): DashboardSummary {
  const prevRange = previousRange(range);
  const previous = allPlatformVideos.filter((v) => isWithin(v.publishedAt, prevRange));

  const derived = inRange.map((v) => deriveMetrics(v, now));
  const prevDerived = previous.map((v) => deriveMetrics(v, now));

  // Scores are always computed against the full catalogue, never just the window.
  const scoreById = new Map<string, number>();
  for (const v of allPlatformVideos) {
    scoreById.set(v.id, computePerformanceScore(v, allPlatformVideos, now).score);
  }

  const summary: DashboardSummary = {
    range,
    videosPosted: {
      value: inRange.length,
      delta: percentDelta(inRange.length, previous.length || null),
      sampleSize: inRange.length,
      unavailableNote: null,
    },
    totalViews: kpi(
      inRange.map((v) => v.metrics.views),
      previous.map((v) => v.metrics.views),
      'sum',
    ),
    totalLikes: kpi(
      inRange.map((v) => v.metrics.likes),
      previous.map((v) => v.metrics.likes),
      'sum',
    ),
    totalComments: kpi(
      inRange.map((v) => v.metrics.comments),
      previous.map((v) => v.metrics.comments),
      'sum',
    ),
    totalShares: kpi(
      inRange.map((v) => v.metrics.shares),
      previous.map((v) => v.metrics.shares),
      'sum',
    ),
    avgWatchTimeMinutes: kpi(
      derived.map((d) => d.averageViewDurationSeconds),
      prevDerived.map((d) => d.averageViewDurationSeconds),
      'mean',
      'Average view duration is not available for the selected videos.',
    ),
    avgRetention: kpi(
      derived.map((d) => d.retention),
      prevDerived.map((d) => d.retention),
      'mean',
      'Retention (average percentage viewed) is not available for the selected videos.',
    ),
    avgEngagementRate: kpi(
      derived.map((d) => d.engagementRate),
      prevDerived.map((d) => d.engagementRate),
      'mean',
    ),
    followersGained: kpi(
      inRange.map((v) => v.metrics.followersGained),
      previous.map((v) => v.metrics.followersGained),
      'sum',
      'Followers/subscribers gained is not available for the selected videos.',
    ),
    avgPerformanceScore: kpi(
      inRange.map((v) => scoreById.get(v.id) ?? null),
      previous.map((v) => scoreById.get(v.id) ?? null),
      'mean',
    ),
    bestVideo: null,
    fastestGrowingVideo: null,
    highestViralPotential: null,
    trend: { direction: 'UNKNOWN', viewsDelta: null, scoreDelta: null, label: 'No data', detail: '' },
    timeSeries: buildTimeSeries(inRange, range, timezone, scoreById),
    platformBreakdown: buildPlatformBreakdown(inRange, scoreById, now),
  };

  // Best video in range, by performance score.
  const ranked = [...inRange].sort(
    (a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0),
  );
  if (ranked.length > 0) {
    const best = ranked[0];
    const detail = computePerformanceScore(best, allPlatformVideos, now);
    summary.bestVideo = {
      video: best,
      score: detail.score,
      confidence: detail.confidence,
      headline: detail.reasons[0] ?? 'Highest performance score in this range.',
    };
  }

  // Fastest growing: highest current views-per-hour multiplier vs baseline.
  let fastest: VideoHighlight | null = null;
  let fastestMultiplier = -Infinity;
  for (const v of inRange) {
    const velocity = analyseVelocity(v, allPlatformVideos, now);
    const multiplier = velocity.headlineMultiplier;
    if (multiplier !== null && multiplier > fastestMultiplier) {
      fastestMultiplier = multiplier;
      fastest = {
        video: v,
        score: scoreById.get(v.id) ?? 0,
        confidence: computePerformanceScore(v, allPlatformVideos, now).confidence,
        headline:
          'Gaining views ' +
          round(multiplier, 1) +
          'x faster than your average at the ' +
          (velocity.headlineLabel ?? 'latest') +
          ' mark.',
      };
    }
  }
  if (!fastest && ranked.length > 0) {
    const byRate = [...inRange].sort(
      (a, b) => (deriveMetrics(b, now).viewsPerHour ?? 0) - (deriveMetrics(a, now).viewsPerHour ?? 0),
    );
    const top = byRate[0];
    fastest = {
      video: top,
      score: scoreById.get(top.id) ?? 0,
      confidence: computePerformanceScore(top, allPlatformVideos, now).confidence,
      headline:
        round(deriveMetrics(top, now).viewsPerHour ?? 0, 1) +
        ' views/hour since publish (no velocity snapshots available for comparison).',
    };
  }
  summary.fastestGrowingVideo = fastest;

  // Highest viral potential among recent videos.
  const recent = inRange.filter((v) => deriveMetrics(v, now).hoursSincePublish <= 24 * 14);
  const viralPool = recent.length > 0 ? recent : inRange;
  let topViral: VideoHighlight | null = null;
  let topViralScore = -1;
  for (const v of viralPool) {
    const viral = computeViralPotential(v, allPlatformVideos, now);
    if (viral.score > topViralScore) {
      topViralScore = viral.score;
      topViral = { video: v, score: viral.score, confidence: viral.confidence, headline: viral.reason };
    }
  }
  summary.highestViralPotential = topViral;
  summary.trend = buildTrend(summary, inRange, previous, scoreById);
  return summary;
}

function buildTimeSeries(
  videos: VideoRecord[],
  range: DateRange,
  timezone: string,
  scoreById: Map<string, number>,
): TimeSeriesPoint[] {
  // The "all time" preset uses the Unix epoch as a sentinel "no lower bound"
  // value (see resolveRange) - enumerating from there would walk 50+ years of
  // empty days before hitting any real data and blow past enumerateDays' cap
  // long before reaching the actual videos. Clamp the series to start at the
  // earliest video actually being charted instead.
  const earliestVideo = videos.reduce<string | null>((earliest, v) => {
    if (earliest === null || v.publishedAt < earliest) return v.publishedAt;
    return earliest;
  }, null);
  const effectiveRange: DateRange =
    earliestVideo && earliestVideo > range.from ? { from: earliestVideo, to: range.to } : range;
  const days = enumerateDays(effectiveRange, timezone);
  const byDay = new Map<string, VideoRecord[]>();
  for (const v of videos) {
    const key = dayKey(v.publishedAt, timezone);
    const list = byDay.get(key) ?? [];
    list.push(v);
    byDay.set(key, list);
  }
  return days.map((date) => {
    const group = byDay.get(date) ?? [];
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    return {
      date,
      views: sum(group.map((v) => v.metrics.views)),
      engagements: sum(
        group.map((v) => v.metrics.likes + v.metrics.comments + v.metrics.shares),
      ),
      videos: group.length,
      avgScore: avgScore === null ? null : round(avgScore, 1),
    };
  });
}

function buildPlatformBreakdown(
  videos: VideoRecord[],
  scoreById: Map<string, number>,
  now: Date,
): PlatformBreakdown[] {
  const groups = new Map<string, VideoRecord[]>();
  for (const v of videos) {
    const list = groups.get(v.platform) ?? [];
    list.push(v);
    groups.set(v.platform, list);
  }
  return Array.from(groups.entries()).map(([platform, group]) => {
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    return {
      platform,
      label: PLATFORM_LABEL[platform] ?? platform,
      videos: group.length,
      views: sum(group.map((v) => v.metrics.views)),
      avgScore: avgScore === null ? null : round(avgScore, 1),
      avgEngagementRate: mean(group.map((v) => deriveMetrics(v, now).engagementRate)),
    };
  });
}

function buildTrend(
  summary: DashboardSummary,
  current: VideoRecord[],
  previous: VideoRecord[],
  scoreById: Map<string, number>,
): PerformanceTrend {
  if (current.length === 0) {
    return {
      direction: 'UNKNOWN',
      viewsDelta: null,
      scoreDelta: null,
      label: 'No videos in range',
      detail: 'Post or import videos in this date range to see a trend.',
    };
  }
  const viewsDelta = summary.totalViews.delta;
  const currentScore = mean(current.map((v) => scoreById.get(v.id) ?? null));
  const previousScore = mean(previous.map((v) => scoreById.get(v.id) ?? null));
  const scoreDelta =
    currentScore === null || previousScore === null ? null : currentScore - previousScore;

  // A short-window slope catches a decline that a period-over-period delta hides.
  const slope = linearSlope(summary.timeSeries.map((p) => p.views));

  if (viewsDelta === null && scoreDelta === null) {
    return {
      direction: 'UNKNOWN',
      viewsDelta: null,
      scoreDelta: null,
      label: 'No comparison period',
      detail: 'There is no previous window with data to compare against.',
    };
  }

  const combined = (viewsDelta ?? 0) * 0.7 + (scoreDelta !== null ? scoreDelta / 100 : 0) * 0.3;
  let direction: PerformanceTrend['direction'] = 'FLAT';
  if (combined > 0.05) direction = 'UP';
  else if (combined < -0.05) direction = 'DOWN';

  const parts: string[] = [];
  if (viewsDelta !== null) {
    parts.push(
      'Views ' +
        (viewsDelta >= 0 ? 'up ' : 'down ') +
        Math.abs(Math.round(viewsDelta * 100)) +
        '% vs the previous period',
    );
  }
  if (scoreDelta !== null) {
    parts.push(
      'average performance score ' +
        (scoreDelta >= 0 ? 'up ' : 'down ') +
        Math.abs(round(scoreDelta, 1)) +
        ' points',
    );
  }
  if (slope !== null && Math.abs(slope) > 0) {
    parts.push('daily views trending ' + (slope > 0 ? 'upward' : 'downward') + ' within the window');
  }

  const label = direction === 'UP' ? 'Improving' : direction === 'DOWN' ? 'Declining' : 'Stable';
  return { direction, viewsDelta, scoreDelta, label, detail: parts.join('; ') + '.' };
}
