import type { VideoRecord } from '@/lib/types';
import { deriveMetrics, earlyVelocity, isShortForm } from '@/lib/analytics/metrics';
import { mean, median } from '@/lib/util/math';

/**
 * The minimum number of comparison videos required before we are willing to
 * call something an "account average". Below this we report the baseline as
 * unavailable rather than comparing a video against one or two data points.
 */
export const MIN_BASELINE_SAMPLE = 5;

/** Milestone used as the canonical "early velocity" comparison point. */
export const EARLY_VELOCITY_MINUTES = 180;

export type BaselineBasis = 'PLATFORM' | 'ACCOUNT' | 'NONE';

export interface Baseline {
  /** How the baseline was built: same-platform videos, or all videos. */
  basis: BaselineBasis;
  sampleSize: number;
  medianViews: number | null;
  meanViews: number | null;
  meanRetention: number | null;
  meanEngagementRate: number | null;
  meanFollowerConversion: number | null;
  meanClickThroughRate: number | null;
  meanLikeRate: number | null;
  meanCommentRate: number | null;
  meanShareRate: number | null;
  meanViewsPerHour: number | null;
  /** Mean views/hour over the first EARLY_VELOCITY_MINUTES. */
  meanEarlyVelocity: number | null;
  meanDurationSeconds: number | null;
}

const EMPTY_BASELINE: Baseline = {
  basis: 'NONE',
  sampleSize: 0,
  medianViews: null,
  meanViews: null,
  meanRetention: null,
  meanEngagementRate: null,
  meanFollowerConversion: null,
  meanClickThroughRate: null,
  meanLikeRate: null,
  meanCommentRate: null,
  meanShareRate: null,
  meanViewsPerHour: null,
  meanEarlyVelocity: null,
  meanDurationSeconds: null,
};

function build(videos: VideoRecord[], basis: BaselineBasis, now: Date): Baseline {
  const derived = videos.map((v) => deriveMetrics(v, now));
  return {
    basis,
    sampleSize: videos.length,
    medianViews: median(videos.map((v) => v.metrics.views)),
    meanViews: mean(videos.map((v) => v.metrics.views)),
    meanRetention: mean(derived.map((d) => d.retention)),
    meanEngagementRate: mean(derived.map((d) => d.engagementRate)),
    meanFollowerConversion: mean(derived.map((d) => d.followerConversion)),
    meanClickThroughRate: mean(derived.map((d) => d.clickThroughRate)),
    meanLikeRate: mean(derived.map((d) => d.likeRate)),
    meanCommentRate: mean(derived.map((d) => d.commentRate)),
    meanShareRate: mean(derived.map((d) => d.shareRate)),
    meanViewsPerHour: mean(derived.map((d) => d.viewsPerHour)),
    meanEarlyVelocity: mean(videos.map((v) => earlyVelocity(v, EARLY_VELOCITY_MINUTES))),
    meanDurationSeconds: mean(videos.map((v) => v.durationSeconds)),
  };
}

/**
 * Builds the comparison baseline for one video.
 *
 * Preference order:
 *  1. Other videos on the same platform (fairest comparison).
 *  2. Other videos of the same form factor (short vs long) across platforms.
 *  3. All other videos.
 *
 * The video being scored is always excluded so that "32% above your average"
 * means "above the *rest* of your catalogue", not "above a set including itself".
 */
export function baselineForVideo(
  video: VideoRecord,
  allVideos: VideoRecord[],
  now = new Date(),
): Baseline {
  const others = allVideos.filter((v) => v.id !== video.id);
  const samePlatform = others.filter((v) => v.platform === video.platform);
  if (samePlatform.length >= MIN_BASELINE_SAMPLE) return build(samePlatform, 'PLATFORM', now);

  const sameForm = others.filter((v) => isShortForm(v) === isShortForm(video));
  if (sameForm.length >= MIN_BASELINE_SAMPLE) return build(sameForm, 'PLATFORM', now);

  if (others.length >= MIN_BASELINE_SAMPLE) return build(others, 'ACCOUNT', now);
  return { ...EMPTY_BASELINE, sampleSize: others.length };
}

/** Account-wide baseline across an arbitrary set (used by dashboards). */
export function baselineForSet(videos: VideoRecord[], now = new Date()): Baseline {
  if (videos.length === 0) return EMPTY_BASELINE;
  return build(videos, 'ACCOUNT', now);
}

export function describeBasis(baseline: Baseline): string {
  if (baseline.basis === 'NONE') {
    return `Not enough account-specific data yet (${baseline.sampleSize} comparison videos, ${MIN_BASELINE_SAMPLE} needed).`;
  }
  const scope = baseline.basis === 'PLATFORM' ? 'same-platform' : 'account-wide';
  return `Compared against ${baseline.sampleSize} ${scope} videos.`;
}
