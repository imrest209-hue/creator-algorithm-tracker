import type { VideoRecord } from '@/lib/types';
import { baselineForVideo, type Baseline } from '@/lib/analytics/baselines';
import { deriveMetrics, earlyVelocity, viewsAtMinute } from '@/lib/analytics/metrics';
import { clamp, mean, ratioToScore, round, safeDivide } from '@/lib/util/math';

/**
 * VIRAL POTENTIAL SCORE (0-100)
 * ---------------------------------------------------------------------------
 * Deliberately different from the performance score: it looks only at signals
 * that are measurable EARLY in a video's life and that historically preceded
 * your own biggest videos - early view velocity, retention, engagement, share
 * rate, comment rate and follower conversion.
 *
 * This is a description of measured early performance relative to your own
 * history. It is NOT a prediction and never guarantees that a video will go
 * viral. Confidence reflects how much data the score was able to use.
 */

/** Milestones considered "early" for viral scoring. */
const EARLY_MILESTONES = [15, 30, 60, 180] as const;

export interface ViralFactor {
  key: string;
  label: string;
  weight: number;
  value: number | null;
  baseline: number | null;
  multiplier: number | null;
  subscore: number | null;
  available: boolean;
  note: string | null;
}

export interface ViralPotential {
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** One-sentence explanation of the dominant driver. */
  reason: string;
  factors: ViralFactor[];
  /** The strongest early multiplier, used in the headline reason. */
  earlyMultiplier: number | null;
  disclaimer: string;
}

const DISCLAIMER =
  'Viral potential describes early measured performance relative to your own history. It is not a prediction and does not guarantee a video will go viral.';

interface FactorInput {
  key: string;
  label: string;
  weight: number;
  value: number | null;
  baseline: number | null;
  note: string | null;
}

function toFactor(input: FactorInput): ViralFactor {
  const multiplier =
    input.value === null || input.baseline === null
      ? null
      : safeDivide(input.value, input.baseline);
  const subscore = ratioToScore(multiplier);
  return {
    key: input.key,
    label: input.label,
    weight: input.weight,
    value: input.value,
    baseline: input.baseline,
    multiplier: multiplier === null ? null : round(multiplier, 2),
    subscore: subscore === null ? null : round(subscore, 1),
    available: subscore !== null,
    note: subscore === null ? (input.note ?? 'No comparable data yet.') : null,
  };
}

/** Average views/hour across early milestones for a comparison set. */
function baselineEarlyVelocity(videos: VideoRecord[]): number | null {
  const perVideo = videos.map((v) => {
    const rates = EARLY_MILESTONES.map((m) => earlyVelocity(v, m)).filter(
      (r): r is number => r !== null,
    );
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  });
  return mean(perVideo);
}

function videoEarlyVelocity(video: VideoRecord): number | null {
  const rates = EARLY_MILESTONES.map((m) => earlyVelocity(video, m)).filter(
    (r): r is number => r !== null,
  );
  return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

function confidenceFor(
  baseline: Baseline,
  availableFactors: number,
  earlySnapshots: number,
): ViralPotential['confidence'] {
  if (availableFactors === 0 || baseline.basis === 'NONE') return 'NONE';
  const sampleOk = baseline.sampleSize >= 20;
  const factorsOk = availableFactors >= 5;
  const snapshotsOk = earlySnapshots >= 3;
  const passes = [sampleOk, factorsOk, snapshotsOk].filter(Boolean).length;
  if (passes === 3) return 'HIGH';
  if (passes === 2) return 'MEDIUM';
  return 'LOW';
}

export function computeViralPotential(
  video: VideoRecord,
  allVideos: VideoRecord[],
  now = new Date(),
): ViralPotential {
  const baseline = baselineForVideo(video, allVideos, now);
  const others = allVideos.filter((v) => v.id !== video.id);
  const comparison =
    others.filter((v) => v.platform === video.platform).length >= 5
      ? others.filter((v) => v.platform === video.platform)
      : others;

  const d = deriveMetrics(video, now);
  const earlyValue = videoEarlyVelocity(video);
  const earlyBaseline = baselineEarlyVelocity(comparison);

  const factors: ViralFactor[] = [
    toFactor({
      key: 'earlyVelocity',
      label: 'Early view velocity',
      weight: 34,
      value: earlyValue,
      baseline: earlyBaseline,
      note: 'No early velocity snapshots recorded yet.',
    }),
    toFactor({
      key: 'retention',
      label: 'Retention',
      weight: 18,
      value: d.retention,
      baseline: baseline.meanRetention,
      note: 'Retention not available for this video.',
    }),
    toFactor({
      key: 'shareRate',
      label: 'Share rate',
      weight: 18,
      value: d.shareRate,
      baseline: baseline.meanShareRate,
      note: 'Share data not available.',
    }),
    toFactor({
      key: 'commentRate',
      label: 'Comment rate',
      weight: 12,
      value: d.commentRate,
      baseline: baseline.meanCommentRate,
      note: 'Comment data not available.',
    }),
    toFactor({
      key: 'engagement',
      label: 'Engagement rate',
      weight: 10,
      value: d.engagementRate,
      baseline: baseline.meanEngagementRate,
      note: 'Engagement rate not available.',
    }),
    toFactor({
      key: 'followerConversion',
      label: 'Follower conversion',
      weight: 8,
      value: d.followerConversion,
      baseline: baseline.meanFollowerConversion,
      note: 'Follower conversion not available.',
    }),
  ];

  const availableWeight = factors
    .filter((f) => f.available)
    .reduce((acc, f) => acc + f.weight, 0);

  const score =
    availableWeight === 0
      ? 0
      : Math.round(
          clamp(
            factors.reduce(
              (acc, f) =>
                f.available && f.subscore !== null
                  ? acc + (f.subscore * f.weight) / availableWeight
                  : acc,
              0,
            ),
            0,
            100,
          ),
        );

  const earlySnapshots = EARLY_MILESTONES.filter((m) => viewsAtMinute(video, m) !== null).length;
  const confidence = confidenceFor(
    baseline,
    factors.filter((f) => f.available).length,
    earlySnapshots,
  );

  const earlyFactor = factors.find((f) => f.key === 'earlyVelocity');
  const strongest = factors
    .filter((f) => f.available && f.multiplier !== null)
    .sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0))[0];

  let reason: string;
  if (availableWeight === 0) {
    reason = 'Not enough account-specific data yet to assess viral potential.';
  } else if (earlyFactor?.available && earlyFactor.multiplier !== null) {
    reason =
      'Early performance is ' +
      round(earlyFactor.multiplier, 1) +
      'x your normal 3-hour view velocity.';
  } else if (strongest && strongest.multiplier !== null) {
    reason =
      strongest.label +
      ' is ' +
      round(strongest.multiplier, 1) +
      'x your account average; no early velocity snapshots were available.';
  } else {
    reason = 'Scored from available metrics only; early velocity data is missing.';
  }

  return {
    score,
    confidence,
    reason,
    factors,
    earlyMultiplier: earlyFactor?.multiplier ?? null,
    disclaimer: DISCLAIMER,
  };
}

export function viralBand(score: number): { label: string; tone: 'good' | 'ok' | 'warn' | 'bad' } {
  if (score >= 80) return { label: 'Very strong early signals', tone: 'good' };
  if (score >= 60) return { label: 'Strong early signals', tone: 'ok' };
  if (score >= 40) return { label: 'Typical early signals', tone: 'warn' };
  return { label: 'Weak early signals', tone: 'bad' };
}
