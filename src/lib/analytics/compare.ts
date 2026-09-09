import { HOOK_LABELS, PLATFORM_LABELS, type VideoRecord } from '@/lib/types';
import { deriveMetrics, type DerivedMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore, type PerformanceScore } from '@/lib/analytics/score';
import { analyseVelocity, type VelocityAnalysis } from '@/lib/analytics/velocity';
import { formatHourLabel, zonedParts } from '@/lib/util/date';
import { DAY_NAMES } from '@/lib/util/date';
import { round } from '@/lib/util/math';

/**
 * VIDEO COMPARISON
 * ---------------------------------------------------------------------------
 * Side-by-side comparison of two or more videos, plus a set of *possible*
 * explanations for the performance gap. The explanations are correlations
 * observed in the creator's own data, and are labelled as such - they are not
 * claims of causation and not claims about platform ranking.
 */

export interface ComparisonEntry {
  video: VideoRecord;
  derived: DerivedMetrics;
  score: PerformanceScore;
  velocity: VelocityAnalysis;
  postingLabel: string;
}

export interface ComparisonDifference {
  metric: string;
  /** Formatted value per video, aligned with `entries`. */
  values: Array<string>;
  /** Index of the winning entry, or null when not comparable. */
  winnerIndex: number | null;
}

export interface ComparisonReason {
  text: string;
  /** Magnitude of the gap, used to order reasons. */
  weight: number;
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  leaderIndex: number | null;
  reasons: ComparisonReason[];
  caveat: string;
}

const CAVEAT =
  'These are correlations in your own stored metrics, not proven causes, and not a claim about how the platform ranked either video.';

export function buildComparison(
  videos: VideoRecord[],
  allVideos: VideoRecord[],
  timezone: string,
  now = new Date(),
): ComparisonResult {
  const entries: ComparisonEntry[] = videos.map((video) => {
    const { day, hour } = zonedParts(video.publishedAt, timezone);
    return {
      video,
      derived: deriveMetrics(video, now),
      score: computePerformanceScore(video, allVideos, now),
      velocity: analyseVelocity(video, allVideos, now),
      postingLabel: DAY_NAMES[day] + ' ' + formatHourLabel(hour),
    };
  });

  if (entries.length < 2) {
    return { entries, leaderIndex: entries.length === 1 ? 0 : null, reasons: [], caveat: CAVEAT };
  }

  let leaderIndex = 0;
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].score.score > entries[leaderIndex].score.score) leaderIndex = i;
  }

  const leader = entries[leaderIndex];
  const others = entries.filter((_, i) => i !== leaderIndex);
  const reasons: ComparisonReason[] = [];

  const push = (text: string, weight: number) => {
    if (Number.isFinite(weight) && Math.abs(weight) > 0) reasons.push({ text, weight: Math.abs(weight) });
  };

  for (const other of others) {
    const name = shortTitle(other.video.title);
    const leaderName = shortTitle(leader.video.title);

    compareNumber(
      leader.derived.retention,
      other.derived.retention,
      (delta) =>
        push(
          leaderName +
            ' held ' +
            fmtPct(delta) +
            ' more of the audience (retention ' +
            round(leader.derived.retention ?? 0, 1) +
            '% vs ' +
            round(other.derived.retention ?? 0, 1) +
            '%).',
          delta,
        ),
    );

    compareNumber(
      leader.derived.engagementRate,
      other.derived.engagementRate,
      (delta) =>
        push(
          leaderName + ' earned ' + fmtPct(delta) + ' more engagement per view than ' + name + '.',
          delta,
        ),
    );

    compareNumber(
      leader.velocity.headlineMultiplier,
      other.velocity.headlineMultiplier,
      (delta) =>
        push(
          leaderName +
            ' left the gate faster - ' +
            round(leader.velocity.headlineMultiplier ?? 0, 1) +
            'x your average early pace vs ' +
            round(other.velocity.headlineMultiplier ?? 0, 1) +
            'x.',
          delta,
        ),
    );

    compareNumber(
      leader.derived.clickThroughRate,
      other.derived.clickThroughRate,
      (delta) =>
        push(
          leaderName +
            ' had a ' +
            fmtPct(delta) +
            ' higher click-through rate, which points at the title/thumbnail rather than the content.',
          delta,
        ),
    );

    compareNumber(
      leader.derived.followerConversion,
      other.derived.followerConversion,
      (delta) =>
        push(
          leaderName + ' converted viewers into followers ' + fmtPct(delta) + ' more often.',
          delta,
        ),
    );

    if (leader.video.categorySlug !== other.video.categorySlug) {
      push(
        'Different topics: ' +
          leader.video.categoryName +
          ' vs ' +
          other.video.categoryName +
          '. Check the Content page for how each topic performs on average.',
        0.2,
      );
    }

    if (leader.video.hookType !== other.video.hookType) {
      push(
        'Different hook styles: ' +
          HOOK_LABELS[leader.video.hookType] +
          ' vs ' +
          HOOK_LABELS[other.video.hookType] +
          '.',
        0.2,
      );
    }

    const durationGap = Math.abs(leader.video.durationSeconds - other.video.durationSeconds);
    if (durationGap > Math.max(30, other.video.durationSeconds * 0.4)) {
      push(
        'Length differs meaningfully: ' +
          Math.round(leader.video.durationSeconds) +
          's vs ' +
          Math.round(other.video.durationSeconds) +
          's.',
        0.25,
      );
    }

    if (leader.postingLabel !== other.postingLabel) {
      push(
        'Posted at different times: ' + leader.postingLabel + ' vs ' + other.postingLabel + '.',
        0.15,
      );
    }

    if (leader.video.platform !== other.video.platform) {
      push(
        'Different platforms (' +
          PLATFORM_LABELS[leader.video.platform] +
          ' vs ' +
          PLATFORM_LABELS[other.video.platform] +
          '), so absolute numbers are not directly comparable.',
        0.3,
      );
    }
  }

  reasons.sort((a, b) => b.weight - a.weight);
  return { entries, leaderIndex, reasons: reasons.slice(0, 8), caveat: CAVEAT };
}

function compareNumber(
  leaderValue: number | null,
  otherValue: number | null,
  onDelta: (delta: number) => void,
): void {
  if (leaderValue === null || otherValue === null || otherValue === 0) return;
  const delta = (leaderValue - otherValue) / Math.abs(otherValue);
  if (delta <= 0.08) return;
  onDelta(delta);
}

function fmtPct(ratio: number): string {
  return Math.round(ratio * 100) + '%';
}

function shortTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 42 ? trimmed.slice(0, 39).trimEnd() + '...' : trimmed;
}
