import type { VideoRecord } from '@/lib/types';
import {
  EARLY_VELOCITY_MINUTES,
  baselineForVideo,
  describeBasis,
  type Baseline,
} from '@/lib/analytics/baselines';
import { deriveMetrics, earlyVelocity } from '@/lib/analytics/metrics';
import { clamp, percentDelta, ratioToScore, round, safeDivide } from '@/lib/util/math';

/**
 * PERFORMANCE SCORE (0-100)
 * ---------------------------------------------------------------------------
 * A transparent, account-relative score. There is no hidden model and no claim
 * about how YouTube or TikTok actually rank content - every component is one of
 * your own measured metrics compared against your own historical average and
 * mapped through a single published curve.
 *
 * Curve (see ratioToScore): 0.25x -> 0, 0.5x -> 25, 1x -> 50, 2x -> 75, 4x -> 100.
 * A video that performs exactly at your account average scores 50.
 *
 * If a component's data is unavailable (e.g. TikTok does not expose CTR), the
 * component is dropped and its weight is redistributed proportionally across
 * the components that do have data. The UI always shows which ones were used.
 */

export type ScoreComponentKey =
  | 'views'
  | 'retention'
  | 'engagement'
  | 'velocity'
  | 'followerConversion'
  | 'clickThroughRate';

export interface ScoreComponentDefinition {
  key: ScoreComponentKey;
  label: string;
  /** Nominal weight before redistribution. */
  weight: number;
  description: string;
  unit: 'count' | 'percent' | 'perHour';
}

export const SCORE_COMPONENTS: ScoreComponentDefinition[] = [
  {
    key: 'views',
    label: 'Views vs account average',
    weight: 20,
    description: 'Total views compared with the median views of your comparison set.',
    unit: 'count',
  },
  {
    key: 'retention',
    label: 'Retention (avg % viewed)',
    weight: 20,
    description: 'Average percentage of the video watched, compared with your average.',
    unit: 'percent',
  },
  {
    key: 'engagement',
    label: 'Engagement rate',
    weight: 18,
    description: '(likes + comments + shares + saves) / views, compared with your average.',
    unit: 'percent',
  },
  {
    key: 'velocity',
    label: 'View velocity',
    weight: 18,
    description: 'Views per hour over the first 3 hours, compared with your average.',
    unit: 'perHour',
  },
  {
    key: 'followerConversion',
    label: 'Follower conversion',
    weight: 12,
    description: 'Followers/subscribers gained per view, compared with your average.',
    unit: 'percent',
  },
  {
    key: 'clickThroughRate',
    label: 'Click-through rate',
    weight: 12,
    description: 'Impression CTR vs your average. Not available on every platform.',
    unit: 'percent',
  },
];

export interface ScoreComponentResult extends ScoreComponentDefinition {
  available: boolean;
  /** Weight actually applied after redistribution. 0 when unavailable. */
  effectiveWeight: number;
  value: number | null;
  baseline: number | null;
  ratio: number | null;
  /** Percentage difference vs baseline, e.g. 0.32 for +32%. */
  delta: number | null;
  /** 0-100 subscore for this component. */
  subscore: number | null;
  /** Points this component contributed to the final score. */
  contribution: number;
  unavailableReason: string | null;
  /** Caveat about how this component was measured, when one applies. */
  note: string | null;
}

export interface PerformanceScore {
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  components: ScoreComponentResult[];
  /** Human-readable bullet points explaining the score. */
  reasons: string[];
  basisNote: string;
  baseline: Baseline;
}

interface RawComponent {
  value: number | null;
  baseline: number | null;
  unavailableReason: string | null;
  /** Caveat shown alongside an available component. */
  note?: string | null;
}

function gatherComponents(
  video: VideoRecord,
  baseline: Baseline,
  now: Date,
): Record<ScoreComponentKey, RawComponent> {
  const d = deriveMetrics(video, now);

  // Velocity comparison must be like-for-like. Prefer measured 3-hour velocity
  // against the 3-hour baseline; only when the video has no snapshots at all do
  // we fall back to LIFETIME views/hour against the LIFETIME baseline. Mixing
  // the two (early rate vs lifetime rate) would punish every older video.
  const measuredEarly = earlyVelocity(video, EARLY_VELOCITY_MINUTES);
  let velocityValue: number | null = null;
  let velocityBaseline: number | null = null;
  let velocityNote: string | null = null;

  if (measuredEarly !== null && baseline.meanEarlyVelocity !== null) {
    velocityValue = measuredEarly;
    velocityBaseline = baseline.meanEarlyVelocity;
  } else if (video.snapshots.length === 0 && baseline.meanViewsPerHour !== null) {
    velocityValue = d.viewsPerHour;
    velocityBaseline = baseline.meanViewsPerHour;
    velocityNote =
      'No velocity snapshots for this video, so lifetime views/hour is compared against your lifetime average instead of the 3-hour figure.';
  }

  return {
    views: {
      value: video.metrics.views,
      baseline: baseline.medianViews,
      unavailableReason: baseline.medianViews === null ? 'No account baseline yet.' : null,
    },
    retention: {
      value: d.retention,
      baseline: baseline.meanRetention,
      unavailableReason:
        d.retention === null
          ? 'Retention (average percentage viewed) is not available for this video.'
          : baseline.meanRetention === null
            ? 'No account retention baseline yet.'
            : null,
    },
    engagement: {
      value: d.engagementRate,
      baseline: baseline.meanEngagementRate,
      unavailableReason:
        d.engagementRate === null
          ? 'Engagement rate could not be computed (no views recorded).'
          : baseline.meanEngagementRate === null
            ? 'No account engagement baseline yet.'
            : null,
    },
    velocity: {
      value: velocityValue,
      baseline: velocityBaseline,
      unavailableReason:
        velocityValue === null || velocityBaseline === null
          ? 'No velocity snapshots for this video, and no comparable account velocity baseline.'
          : null,
      note: velocityNote,
    },
    followerConversion: {
      value: d.followerConversion,
      baseline: baseline.meanFollowerConversion,
      unavailableReason:
        d.followerConversion === null
          ? 'Followers/subscribers gained is not available for this video.'
          : baseline.meanFollowerConversion === null
            ? 'No account follower-conversion baseline yet.'
            : null,
    },
    clickThroughRate: {
      value: d.clickThroughRate,
      baseline: baseline.meanClickThroughRate,
      unavailableReason:
        d.clickThroughRate === null
          ? 'Click-through rate is not available through this platform/API.'
          : baseline.meanClickThroughRate === null
            ? 'No account CTR baseline yet.'
            : null,
    },
  };
}

function confidenceFor(baseline: Baseline): PerformanceScore['confidence'] {
  if (baseline.basis === 'NONE') return 'NONE';
  if (baseline.sampleSize >= 25) return 'HIGH';
  if (baseline.sampleSize >= 12) return 'MEDIUM';
  return 'LOW';
}

const PHRASES: Record<ScoreComponentKey, string> = {
  views: 'views than your account median',
  retention: 'retention than account average',
  engagement: 'engagement than account average',
  velocity: 'view velocity than account average',
  followerConversion: 'follower conversion than account average',
  clickThroughRate: 'click-through rate than account average',
};

function phraseFor(component: ScoreComponentResult): string | null {
  if (!component.available || component.delta === null) return null;
  const pct = component.delta * 100;
  if (Math.abs(pct) < 5) return null;
  const magnitude = Math.round(Math.abs(pct));
  const direction = pct > 0 ? 'higher' : 'lower';
  return magnitude + '% ' + direction + ' ' + PHRASES[component.key];
}

/**
 * Computes the transparent performance score for one video.
 *
 * @param allVideos catalogue the baseline is drawn from (one user's videos).
 */
export function computePerformanceScore(
  video: VideoRecord,
  allVideos: VideoRecord[],
  now = new Date(),
): PerformanceScore {
  const baseline = baselineForVideo(video, allVideos, now);
  const raw = gatherComponents(video, baseline, now);

  const partial = SCORE_COMPONENTS.map((def) => {
    const r = raw[def.key];
    const ratio =
      r.unavailableReason === null && r.value !== null && r.baseline !== null
        ? safeDivide(r.value, r.baseline)
        : null;
    const subscore = ratio === null ? null : ratioToScore(ratio);
    const available = subscore !== null;
    return {
      def,
      available,
      value: r.value,
      baseline: r.baseline,
      ratio,
      subscore,
      note: r.note ?? null,
      unavailableReason: available
        ? null
        : (r.unavailableReason ?? 'Not enough data to compare this component.'),
    };
  });

  const availableWeight = partial
    .filter((p) => p.available)
    .reduce((acc, p) => acc + p.def.weight, 0);

  const components: ScoreComponentResult[] = partial.map((p) => {
    const effectiveWeight =
      p.available && availableWeight > 0 ? (p.def.weight / availableWeight) * 100 : 0;
    const contribution =
      p.available && p.subscore !== null ? (p.subscore * effectiveWeight) / 100 : 0;
    return {
      ...p.def,
      available: p.available,
      effectiveWeight: round(effectiveWeight, 1),
      value: p.value,
      baseline: p.baseline,
      ratio: p.ratio === null ? null : round(p.ratio, 3),
      delta: percentDelta(p.value, p.baseline),
      subscore: p.subscore === null ? null : round(p.subscore, 1),
      contribution: round(contribution, 2),
      unavailableReason: p.unavailableReason,
      note: p.available ? p.note : null,
    };
  });

  const total = components.reduce((acc, c) => acc + c.contribution, 0);
  const score = availableWeight === 0 ? 0 : Math.round(clamp(total, 0, 100));

  const scored = components.filter((c) => c.available && c.delta !== null);
  const positives = scored
    .filter((c) => (c.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const negatives = scored
    .filter((c) => (c.delta ?? 0) < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const reasons: string[] = [];
  for (const c of positives.slice(0, 4)) {
    const phrase = phraseFor(c);
    if (phrase) reasons.push(phrase);
  }
  for (const c of negatives.slice(0, 2)) {
    const phrase = phraseFor(c);
    if (phrase) reasons.push(phrase);
  }
  if (reasons.length === 0) {
    reasons.push(
      availableWeight === 0
        ? 'Not enough account-specific data yet to score this video.'
        : 'This video performed close to your account average on every measured component.',
    );
  }

  const unavailable = components.filter((c) => !c.available);
  if (unavailable.length > 0) {
    const names = unavailable.map((c) => c.label).join(', ');
    reasons.push('Excluded (no data): ' + names + ' - weight redistributed across the rest.');
  }

  return {
    score,
    confidence: confidenceFor(baseline),
    components,
    reasons,
    basisNote: describeBasis(baseline),
    baseline,
  };
}

export function scoreBand(score: number): {
  label: string;
  tone: 'good' | 'ok' | 'warn' | 'bad';
} {
  if (score >= 80) return { label: 'Excellent', tone: 'good' };
  if (score >= 60) return { label: 'Above average', tone: 'ok' };
  if (score >= 40) return { label: 'Average', tone: 'warn' };
  return { label: 'Underperforming', tone: 'bad' };
}
