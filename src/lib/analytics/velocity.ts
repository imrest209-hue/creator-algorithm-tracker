import {
  VELOCITY_MILESTONES,
  VELOCITY_MILESTONE_LABELS,
  type VideoRecord,
} from '@/lib/types';
import { baselineForVideo } from '@/lib/analytics/baselines';
import { deriveMetrics, viewsAtMinute } from '@/lib/analytics/metrics';
import { hoursSince } from '@/lib/util/date';
import { mean, round, safeDivide } from '@/lib/util/math';

/**
 * VIDEO VELOCITY
 * ---------------------------------------------------------------------------
 * Tracks how quickly a video accumulates views at fixed milestones after
 * publish, and compares each milestone with the historical average for the
 * same milestone across the rest of the catalogue.
 *
 * A milestone with no recorded snapshot stays `null`. We never interpolate a
 * value and present it as measured data.
 */

export interface MilestonePoint {
  minutes: number;
  label: string;
  views: number | null;
  /** Average views at this milestone across the comparison set. */
  baselineViews: number | null;
  /** views / baselineViews. */
  multiplier: number | null;
  /** True when the video is not yet old enough to have reached the milestone. */
  pending: boolean;
}

export interface VelocityAlert {
  id: string;
  icon: string;
  severity: 'GOOD' | 'WARN' | 'INFO';
  message: string;
}

export interface VelocityAnalysis {
  points: MilestonePoint[];
  /** Multiplier at the most recent milestone that has both value and baseline. */
  headlineMultiplier: number | null;
  headlineLabel: string | null;
  alerts: VelocityAlert[];
  hasAnySnapshot: boolean;
}

/** Average views at each milestone across a comparison set. */
export function milestoneBaselines(videos: VideoRecord[]): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const minutes of VELOCITY_MILESTONES) {
    map.set(
      minutes,
      mean(videos.map((v) => viewsAtMinute(v, minutes))),
    );
  }
  return map;
}

export function analyseVelocity(
  video: VideoRecord,
  allVideos: VideoRecord[],
  now = new Date(),
): VelocityAnalysis {
  const others = allVideos.filter((v) => v.id !== video.id && v.platform === video.platform);
  const comparison = others.length >= 3 ? others : allVideos.filter((v) => v.id !== video.id);
  const baselines = milestoneBaselines(comparison);
  const ageMinutes = hoursSince(video.publishedAt, now) * 60;

  const points: MilestonePoint[] = VELOCITY_MILESTONES.map((minutes) => {
    const views = viewsAtMinute(video, minutes);
    const baselineViews = baselines.get(minutes) ?? null;
    return {
      minutes,
      label: VELOCITY_MILESTONE_LABELS[minutes],
      views,
      baselineViews,
      multiplier:
        views === null || baselineViews === null ? null : safeDivide(views, baselineViews),
      pending: views === null && ageMinutes < minutes,
    };
  });

  const comparable = points.filter((p) => p.multiplier !== null);
  const headline = comparable.length > 0 ? comparable[comparable.length - 1] : null;

  return {
    points,
    headlineMultiplier: headline?.multiplier ?? null,
    headlineLabel: headline?.label ?? null,
    alerts: buildAlerts(video, points, allVideos, now),
    hasAnySnapshot: video.snapshots.length > 0,
  };
}

/**
 * Rule-based alerts. Each rule is a plain comparison against the creator's own
 * history - these are observations about measured data, not predictions.
 */
function buildAlerts(
  video: VideoRecord,
  points: MilestonePoint[],
  allVideos: VideoRecord[],
  now: Date,
): VelocityAlert[] {
  const alerts: VelocityAlert[] = [];
  const baseline = baselineForVideo(video, allVideos, now);
  const derived = deriveMetrics(video, now);

  const early = points.filter((p) => p.minutes <= 360 && p.multiplier !== null);
  const earlyMultiplier = mean(early.map((p) => p.multiplier));

  if (earlyMultiplier !== null && earlyMultiplier >= 3) {
    alerts.push({
      id: 'velocity-hot',
      icon: '\u{1F525}',
      severity: 'GOOD',
      message:
        'This video is gaining views ' +
        round(earlyMultiplier, 1) +
        'x faster than your average video.',
    });
  } else if (earlyMultiplier !== null && earlyMultiplier >= 1.5) {
    alerts.push({
      id: 'velocity-strong',
      icon: '\u{1F680}',
      severity: 'GOOD',
      message:
        'This video is showing unusually strong early performance (' +
        round(earlyMultiplier, 1) +
        'x your normal early pace).',
    });
  } else if (earlyMultiplier !== null && earlyMultiplier <= 0.5) {
    alerts.push({
      id: 'velocity-slow',
      icon: '\u{26A0}\u{FE0F}',
      severity: 'WARN',
      message:
        'Early views are running at ' +
        round(earlyMultiplier, 2) +
        'x your usual pace for this platform.',
    });
  }

  const retentionUp =
    derived.retention !== null &&
    baseline.meanRetention !== null &&
    derived.retention > baseline.meanRetention * 1.15;
  const ctrDown =
    derived.clickThroughRate !== null &&
    baseline.meanClickThroughRate !== null &&
    derived.clickThroughRate < baseline.meanClickThroughRate * 0.85;

  if (retentionUp && ctrDown) {
    alerts.push({
      id: 'retention-high-ctr-low',
      icon: '\u{26A0}\u{FE0F}',
      severity: 'WARN',
      message:
        'This video has strong retention but low click-through rate - the content is landing, the title/thumbnail is not.',
    });
  } else if (retentionUp) {
    alerts.push({
      id: 'retention-high',
      icon: '\u{1F3AF}',
      severity: 'GOOD',
      message:
        'Retention is ' +
        round(((derived.retention as number) / (baseline.meanRetention as number) - 1) * 100, 0) +
        '% above your account average.',
    });
  }

  const laterPoints = points.filter((p) => p.minutes >= 1440 && p.multiplier !== null);
  const laterMultiplier = mean(laterPoints.map((p) => p.multiplier));
  if (
    earlyMultiplier !== null &&
    laterMultiplier !== null &&
    laterMultiplier > earlyMultiplier * 1.3 &&
    laterMultiplier > 1
  ) {
    alerts.push({
      id: 'long-tail',
      icon: '\u{1F4C8}',
      severity: 'INFO',
      message:
        'This video accelerated after the first day - it is behaving like long-tail content rather than a spike.',
    });
  }

  if (video.snapshots.length === 0) {
    alerts.push({
      id: 'no-snapshots',
      icon: '\u{2139}\u{FE0F}',
      severity: 'INFO',
      message:
        'No velocity snapshots recorded for this video. Add them manually or via CSV import to unlock velocity analysis.',
    });
  }

  return alerts;
}

/**
 * Videos that look likely to keep accumulating views: their most recent
 * measured window is still growing faster, relative to baseline, than their
 * first hours were.
 */
export interface ContinuedGrowthCandidate {
  video: VideoRecord;
  earlyMultiplier: number;
  lateMultiplier: number;
  /** lateMultiplier / earlyMultiplier. */
  accelerationRatio: number;
}

export function findContinuedGrowthCandidates(
  videos: VideoRecord[],
  now = new Date(),
): ContinuedGrowthCandidate[] {
  const out: ContinuedGrowthCandidate[] = [];
  for (const video of videos) {
    const analysis = analyseVelocity(video, videos, now);
    const early = mean(
      analysis.points.filter((p) => p.minutes <= 360).map((p) => p.multiplier),
    );
    const late = mean(
      analysis.points.filter((p) => p.minutes >= 1440).map((p) => p.multiplier),
    );
    if (early === null || late === null || early <= 0) continue;
    const accelerationRatio = late / early;
    if (accelerationRatio > 1.15 && late > 0.9) {
      out.push({ video, earlyMultiplier: early, lateMultiplier: late, accelerationRatio });
    }
  }
  return out.sort((a, b) => b.accelerationRatio - a.accelerationRatio);
}
