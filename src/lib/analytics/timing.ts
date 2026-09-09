import type { Platform, VideoRecord } from '@/lib/types';
import { computePerformanceScore } from '@/lib/analytics/score';
import { DAY_NAMES, formatHourLabel, zonedParts } from '@/lib/util/date';
import { mean, round } from '@/lib/util/math';

/**
 * POSTING TIME ANALYSIS
 * ---------------------------------------------------------------------------
 * Recommendations here are derived ONLY from the creator's own historical
 * performance. There is no generic "best time to post" advice baked in - if a
 * bucket does not have enough of the creator's own videos in it, we say so
 * rather than filling the gap with internet folklore.
 */

/** Minimum videos in a day/hour bucket before it can be recommended. */
export const MIN_BUCKET_SAMPLE = 3;
/** Minimum videos overall before any timing recommendation is offered. */
export const MIN_TOTAL_SAMPLE = 8;

export const NOT_ENOUGH_DATA = 'Not enough account-specific data yet.';

export interface TimingBucket {
  key: string;
  /** 0 = Sunday. */
  day: number;
  dayName: string;
  /** 0-23 in the account timezone. Null for day-level buckets. */
  hour: number | null;
  hourLabel: string | null;
  videoCount: number;
  avgViews: number | null;
  avgPerformanceScore: number | null;
  avgEngagementRate: number | null;
  /** True when videoCount >= MIN_BUCKET_SAMPLE. */
  sufficient: boolean;
}

export interface TimingAnalysis {
  timezone: string;
  totalVideos: number;
  /** False when the whole analysis is under-powered. */
  hasEnoughData: boolean;
  message: string | null;
  byDay: TimingBucket[];
  byHour: TimingBucket[];
  /** Full day x hour grid (168 cells) for the heatmap. */
  heatmap: TimingBucket[];
  /** Day x 3-hour block (56 cells). Coarser, so buckets reach a usable sample. */
  byWindow: TimingBucket[];
  bestDays: TimingBucket[];
  bestHours: TimingBucket[];
  bestWindows: TimingBucket[];
}

/**
 * Posting "windows" are 3-hour blocks rather than single hours. With a normal
 * posting cadence a single day+hour cell almost never reaches a usable sample,
 * so recommending one would be reading noise.
 */
export const WINDOW_BLOCK_HOURS = 3;

export function windowLabel(startHour: number): string {
  return formatHourLabel(startHour) + ' - ' + formatHourLabel(startHour + WINDOW_BLOCK_HOURS);
}

interface BucketAccumulator {
  videos: VideoRecord[];
  scores: number[];
  engagement: Array<number | null>;
}

function emptyBucket(day: number, hour: number | null): TimingBucket {
  return {
    key: hour === null ? 'd' + day : 'd' + day + 'h' + hour,
    day,
    dayName: DAY_NAMES[day],
    hour,
    hourLabel: hour === null ? null : formatHourLabel(hour),
    videoCount: 0,
    avgViews: null,
    avgPerformanceScore: null,
    avgEngagementRate: null,
    sufficient: false,
  };
}

function summarise(bucket: TimingBucket, acc: BucketAccumulator): TimingBucket {
  const avgScore = mean(acc.scores);
  return {
    ...bucket,
    videoCount: acc.videos.length,
    avgViews: mean(acc.videos.map((v) => v.metrics.views)),
    avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
    avgEngagementRate: mean(acc.engagement),
    sufficient: acc.videos.length >= MIN_BUCKET_SAMPLE,
  };
}

export function analyseTiming(
  videos: VideoRecord[],
  timezone: string,
  now = new Date(),
): TimingAnalysis {
  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);

  const dayAcc = new Map<string, BucketAccumulator>();
  const hourAcc = new Map<string, BucketAccumulator>();
  const cellAcc = new Map<string, BucketAccumulator>();
  const blockAcc = new Map<string, BucketAccumulator>();

  const push = (map: Map<string, BucketAccumulator>, key: string, v: VideoRecord) => {
    const acc = map.get(key) ?? { videos: [], scores: [], engagement: [] };
    acc.videos.push(v);
    acc.scores.push(scoreById.get(v.id) ?? 0);
    const m = v.metrics;
    const interactions = m.likes + m.comments + m.shares + (m.saves ?? 0);
    acc.engagement.push(m.views > 0 ? (interactions / m.views) * 100 : null);
    map.set(key, acc);
  };

  for (const v of videos) {
    const { day, hour } = zonedParts(v.publishedAt, timezone);
    push(dayAcc, String(day), v);
    push(hourAcc, String(hour), v);
    push(cellAcc, day + ':' + hour, v);
    push(blockAcc, day + ':' + Math.floor(hour / WINDOW_BLOCK_HOURS) * WINDOW_BLOCK_HOURS, v);
  }

  const byDay: TimingBucket[] = [];
  for (let d = 0; d < 7; d += 1) {
    const acc = dayAcc.get(String(d));
    byDay.push(acc ? summarise(emptyBucket(d, null), acc) : emptyBucket(d, null));
  }

  const byHour: TimingBucket[] = [];
  for (let h = 0; h < 24; h += 1) {
    const acc = hourAcc.get(String(h));
    const base: TimingBucket = { ...emptyBucket(0, h), key: 'h' + h, dayName: '' };
    byHour.push(acc ? summarise(base, acc) : base);
  }

  const heatmap: TimingBucket[] = [];
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      const acc = cellAcc.get(d + ':' + h);
      const base = emptyBucket(d, h);
      heatmap.push(acc ? summarise(base, acc) : base);
    }
  }

  const byWindow: TimingBucket[] = [];
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += WINDOW_BLOCK_HOURS) {
      const acc = blockAcc.get(d + ':' + h);
      const base: TimingBucket = {
        ...emptyBucket(d, h),
        key: 'w' + d + '-' + h,
        hourLabel: windowLabel(h),
      };
      byWindow.push(acc ? { ...summarise(base, acc), hourLabel: windowLabel(h) } : base);
    }
  }

  const hasEnoughData = videos.length >= MIN_TOTAL_SAMPLE;
  const rank = (buckets: TimingBucket[]) =>
    buckets
      .filter((b) => b.sufficient && b.avgPerformanceScore !== null)
      .sort((a, b) => (b.avgPerformanceScore ?? 0) - (a.avgPerformanceScore ?? 0));

  const bestDays = hasEnoughData ? rank(byDay).slice(0, 3) : [];
  const bestHours = hasEnoughData ? rank(byHour).slice(0, 3) : [];
  const bestWindows = hasEnoughData ? rank(byWindow).slice(0, 5) : [];

  let message: string | null = null;
  if (!hasEnoughData) {
    message =
      NOT_ENOUGH_DATA +
      ' At least ' +
      MIN_TOTAL_SAMPLE +
      ' posted videos are needed before posting-time recommendations are meaningful (you have ' +
      videos.length +
      ').';
  } else if (bestDays.length === 0 && bestHours.length === 0) {
    message =
      NOT_ENOUGH_DATA +
      ' Your posts are spread too thinly across the week - no day or hour has ' +
      MIN_BUCKET_SAMPLE +
      ' or more videos yet.';
  }

  return {
    timezone,
    totalVideos: videos.length,
    hasEnoughData,
    message,
    byDay,
    byHour,
    heatmap,
    byWindow,
    bestDays,
    bestHours,
    bestWindows,
  };
}

export interface PlatformTiming {
  platform: Platform;
  analysis: TimingAnalysis;
}

/** Timing analysis split per platform, since audiences differ by surface. */
export function analyseTimingByPlatform(
  videos: VideoRecord[],
  timezone: string,
  now = new Date(),
): PlatformTiming[] {
  const platforms = Array.from(new Set(videos.map((v) => v.platform)));
  return platforms.map((platform) => ({
    platform,
    analysis: analyseTiming(
      videos.filter((v) => v.platform === platform),
      timezone,
      now,
    ),
  }));
}

/** Human summary of the best window, or the honest "not enough data" line. */
export function describeBestWindow(analysis: TimingAnalysis): string {
  if (analysis.message) return analysis.message;
  const best = analysis.bestWindows[0];
  if (!best || best.hour === null) {
    const day = analysis.bestDays[0];
    if (!day) return NOT_ENOUGH_DATA;
    return (
      day.dayName +
      ' is your strongest posting day (avg score ' +
      day.avgPerformanceScore +
      ' across ' +
      day.videoCount +
      ' videos).'
    );
  }
  return (
    best.dayName +
    ' between ' +
    best.hourLabel +
    ' ' +
    analysis.timezone +
    ' (avg score ' +
    best.avgPerformanceScore +
    ' across ' +
    best.videoCount +
    ' videos).'
  );
}
