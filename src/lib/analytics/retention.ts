import type { VideoRecord } from '@/lib/types';
import { deriveMetrics, isShortForm } from '@/lib/analytics/metrics';
import { mean, round, sum } from '@/lib/util/math';

/**
 * RETENTION ANALYSIS
 * ---------------------------------------------------------------------------
 * Built on average percentage viewed and average view duration. Per-second
 * audience-retention curves are only available through the YouTube Analytics
 * API for channels the user owns; when they are missing we say so rather than
 * drawing an invented curve.
 */

export interface RetentionSummary {
  avgRetention: number | null;
  avgViewDurationSeconds: number | null;
  totalWatchTimeMinutes: number | null;
  /** Videos that reported a retention figure, out of the total considered. */
  coverage: { withData: number; total: number };
  unavailableNote: string | null;
}

export function summariseRetention(videos: VideoRecord[], now = new Date()): RetentionSummary {
  const derived = videos.map((v) => deriveMetrics(v, now));
  const withData = derived.filter((d) => d.retention !== null).length;
  const watchTimeAvailable = videos.some((v) => v.metrics.watchTimeMinutes !== null);
  return {
    avgRetention: mean(derived.map((d) => d.retention)),
    avgViewDurationSeconds: mean(derived.map((d) => d.averageViewDurationSeconds)),
    totalWatchTimeMinutes: watchTimeAvailable
      ? sum(videos.map((v) => v.metrics.watchTimeMinutes))
      : null,
    coverage: { withData, total: videos.length },
    unavailableNote:
      withData === 0 && videos.length > 0
        ? 'No retention data available for these videos. Connect YouTube Analytics or import retention figures via CSV.'
        : null,
  };
}

export interface RetentionByDuration {
  label: string;
  videoCount: number;
  avgRetention: number | null;
  avgViewDurationSeconds: number | null;
  avgViews: number | null;
}

const SHORT_BANDS: Array<[string, number, number]> = [
  ['0-15s', 0, 15],
  ['15-30s', 15, 30],
  ['30-45s', 30, 45],
  ['45-60s', 45, 61],
  ['60s+', 61, Number.MAX_SAFE_INTEGER],
];

const LONG_BANDS: Array<[string, number, number]> = [
  ['Under 3 min', 0, 180],
  ['3-6 min', 180, 360],
  ['6-10 min', 360, 600],
  ['10-15 min', 600, 900],
  ['15 min+', 900, Number.MAX_SAFE_INTEGER],
];

/** Retention grouped by video length, split by short-form vs long-form. */
export function retentionByDuration(
  videos: VideoRecord[],
  form: 'short' | 'long',
  now = new Date(),
): RetentionByDuration[] {
  const pool = videos.filter((v) => (form === 'short' ? isShortForm(v) : !isShortForm(v)));
  const bands = form === 'short' ? SHORT_BANDS : LONG_BANDS;
  return bands.map(([label, min, max]) => {
    const group = pool.filter((v) => v.durationSeconds >= min && v.durationSeconds < max);
    const derived = group.map((v) => deriveMetrics(v, now));
    return {
      label,
      videoCount: group.length,
      avgRetention: mean(derived.map((d) => d.retention)),
      avgViewDurationSeconds: mean(derived.map((d) => d.averageViewDurationSeconds)),
      avgViews: mean(group.map((v) => v.metrics.views)),
    };
  });
}

export interface RetentionOutlier {
  video: VideoRecord;
  retention: number;
  deltaVsAverage: number;
}

/** Videos whose retention is furthest from the account average, both ways. */
export function retentionOutliers(
  videos: VideoRecord[],
  now = new Date(),
  limit = 5,
): { best: RetentionOutlier[]; worst: RetentionOutlier[]; average: number | null } {
  const rows = videos
    .map((video) => ({ video, retention: deriveMetrics(video, now).retention }))
    .filter((r): r is { video: VideoRecord; retention: number } => r.retention !== null);
  const average = mean(rows.map((r) => r.retention));
  if (average === null) return { best: [], worst: [], average: null };

  const withDelta: RetentionOutlier[] = rows.map((r) => ({
    video: r.video,
    retention: round(r.retention, 1),
    deltaVsAverage: round(r.retention - average, 1),
  }));

  return {
    best: [...withDelta].sort((a, b) => b.deltaVsAverage - a.deltaVsAverage).slice(0, limit),
    worst: [...withDelta].sort((a, b) => a.deltaVsAverage - b.deltaVsAverage).slice(0, limit),
    average: round(average, 1),
  };
}
