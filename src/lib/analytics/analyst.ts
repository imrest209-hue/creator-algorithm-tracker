import type { VideoRecord } from '@/lib/types';
import { analyseCategories, categoryVerdict } from '@/lib/analytics/content';
import { analyseHooks, bestHook } from '@/lib/analytics/hooks';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { analyseTiming, describeBestWindow, NOT_ENOUGH_DATA } from '@/lib/analytics/timing';
import { findContinuedGrowthCandidates } from '@/lib/analytics/velocity';
import { computeViralPotential } from '@/lib/analytics/viral';
import { generateContentIdeas, viralWatchlist } from '@/lib/analytics/recommendations';
import { linearSlope, mean, round } from '@/lib/util/math';
import { formatCompact } from '@/lib/util/format';

/**
 * ANALYST LAYER
 * ---------------------------------------------------------------------------
 * Answers natural-language questions about the account. Every answer is built
 * from stored metrics and cites the numbers it used, so nothing is fabricated.
 *
 * This runs entirely locally - no external model and no API key are required.
 * If a question does not match a known intent the engine says so instead of
 * guessing.
 */

export type AnalystIntent =
  | 'WHY_LAST_VIDEO'
  | 'WHAT_NEXT'
  | 'BEST_TOPICS'
  | 'WHEN_TO_POST'
  | 'BEST_HOOK'
  | 'FOLLOW_UPS'
  | 'WHY_DECLINING'
  | 'VIRAL_POTENTIAL'
  | 'WORST_CONTENT'
  | 'BEST_LENGTH'
  | 'UNKNOWN';

export interface AnalystQuestion {
  id: AnalystIntent;
  label: string;
}

export const SUGGESTED_QUESTIONS: AnalystQuestion[] = [
  { id: 'WHY_LAST_VIDEO', label: 'Why did my last video perform well?' },
  { id: 'WHAT_NEXT', label: 'What should I post next?' },
  { id: 'BEST_TOPICS', label: 'What are my three best-performing topics?' },
  { id: 'WHEN_TO_POST', label: 'When should I post?' },
  { id: 'BEST_HOOK', label: 'Which hook style works best for me?' },
  { id: 'FOLLOW_UPS', label: 'Which videos should I make a follow-up to?' },
  { id: 'WHY_DECLINING', label: 'Why are my views declining?' },
  { id: 'VIRAL_POTENTIAL', label: 'Which videos have the strongest viral potential?' },
  { id: 'WORST_CONTENT', label: 'What content should I stop making?' },
  { id: 'BEST_LENGTH', label: 'What video length works best for me?' },
];

export interface AnalystAnswer {
  intent: AnalystIntent;
  question: string;
  headline: string;
  /** Bullet points, each citing real stored metrics. */
  points: string[];
  /** Videos referenced by the answer, for linking in the UI. */
  referencedVideoIds: string[];
  /** True when the engine had to decline for lack of data. */
  insufficientData: boolean;
  generated: true;
}

const INTENT_PATTERNS: Array<{ intent: AnalystIntent; patterns: RegExp[] }> = [
  { intent: 'WHY_LAST_VIDEO', patterns: [/last video/i, /latest video/i, /most recent video/i, /why did.*(perform|do)/i] },
  { intent: 'WHAT_NEXT', patterns: [/what should i (post|make|film|do)/i, /next video/i, /content idea/i] },
  { intent: 'BEST_TOPICS', patterns: [/best.*(topic|categor)/i, /which (topic|categor)/i, /top (topic|categor)/i] },
  { intent: 'WHEN_TO_POST', patterns: [/when should i post/i, /best time/i, /best day/i, /posting time/i] },
  { intent: 'BEST_HOOK', patterns: [/hook/i] },
  { intent: 'FOLLOW_UPS', patterns: [/follow.?up/i, /part 2/i, /sequel/i] },
  { intent: 'WHY_DECLINING', patterns: [/declin/i, /dropping/i, /going down/i, /falling/i, /why.*(fewer|less) views/i] },
  { intent: 'VIRAL_POTENTIAL', patterns: [/viral/i, /blow up/i, /take off/i] },
  { intent: 'WORST_CONTENT', patterns: [/stop making/i, /worst/i, /should i (stop|quit)/i, /not working/i] },
  { intent: 'BEST_LENGTH', patterns: [/length/i, /how long/i, /duration/i] },
];

export function detectIntent(question: string): AnalystIntent {
  for (const entry of INTENT_PATTERNS) {
    if (entry.patterns.some((p) => p.test(question))) return entry.intent;
  }
  return 'UNKNOWN';
}

export interface AnalystContext {
  videos: VideoRecord[];
  timezone: string;
  now?: Date;
}

export function answerQuestion(question: string, ctx: AnalystContext): AnalystAnswer {
  const intent = detectIntent(question);
  return answerIntent(intent, question, ctx);
}

export function answerIntent(
  intent: AnalystIntent,
  question: string,
  ctx: AnalystContext,
): AnalystAnswer {
  const now = ctx.now ?? new Date();
  const videos = ctx.videos;

  const base = (
    headline: string,
    points: string[],
    referencedVideoIds: string[] = [],
    insufficientData = false,
  ): AnalystAnswer => ({
    intent,
    question,
    headline,
    points,
    referencedVideoIds,
    insufficientData,
    generated: true,
  });

  if (videos.length === 0) {
    return base(
      'There is no video data to analyse yet.',
      [
        'Connect an account, import a CSV, or add videos manually and this answer will be rebuilt from your real metrics.',
      ],
      [],
      true,
    );
  }

  switch (intent) {
    case 'WHY_LAST_VIDEO': {
      const latest = [...videos].sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      )[0];
      const score = computePerformanceScore(latest, videos, now);
      const d = deriveMetrics(latest, now);
      const verdict =
        score.score >= 60 ? 'outperformed' : score.score >= 40 ? 'performed close to' : 'underperformed against';
      return base(
        '"' + latest.title + '" scored ' + score.score + '/100 and ' + verdict + ' your account average.',
        [
          ...score.reasons,
          'Raw numbers: ' +
            formatCompact(latest.metrics.views) +
            ' views, ' +
            formatCompact(latest.metrics.likes) +
            ' likes, ' +
            formatCompact(latest.metrics.comments) +
            ' comments' +
            (d.retention === null ? ', retention unavailable' : ', ' + round(d.retention, 1) + '% retention') +
            '.',
          score.basisNote,
        ],
        [latest.id],
        score.confidence === 'NONE',
      );
    }

    case 'WHAT_NEXT': {
      const ideas = generateContentIdeas({ videos, timezone: ctx.timezone, now }, 4);
      if (ideas.length === 0) {
        return base('Not enough data to recommend a next video yet.', [NOT_ENOUGH_DATA], [], true);
      }
      return base(
        'Based on your top performers, these four ideas fit your strongest patterns.',
        ideas.map((i) => i.title + ' - ' + i.evidence),
        ideas.map((i) => i.sourceVideoId).filter((id): id is string => Boolean(id)),
      );
    }

    case 'BEST_TOPICS': {
      const stats = analyseCategories(videos, now).filter((s) => s.videoCount >= 2);
      if (stats.length === 0) {
        return base(
          'Not enough videos per topic to rank them yet.',
          ['At least 2 videos in a category are needed before it is ranked.'],
          [],
          true,
        );
      }
      const top = stats.slice(0, 3);
      return base(
        'Your three best-performing topics are ' + top.map((t) => t.name).join(', ') + '.',
        top.map(
          (t) =>
            t.name +
            ': average score ' +
            (t.avgPerformanceScore ?? 0) +
            '/100 across ' +
            t.videoCount +
            ' videos, ' +
            formatCompact(t.avgViews) +
            ' average views' +
            (t.avgRetention === null ? '' : ', ' + round(t.avgRetention, 1) + '% average retention') +
            '.',
        ),
      );
    }

    case 'WHEN_TO_POST': {
      const timing = analyseTiming(videos, ctx.timezone, now);
      if (!timing.hasEnoughData || timing.message) {
        return base(timing.message ?? NOT_ENOUGH_DATA, [
          'Posting-time recommendations are calculated only from your own history, so they stay blank until there is enough of it.',
        ], [], true);
      }
      const points = timing.bestWindows.slice(0, 3).map(
        (w) =>
          w.dayName +
          ' between ' +
          w.hourLabel +
          ' (' +
          timing.timezone +
          '): average score ' +
          w.avgPerformanceScore +
          ' across ' +
          w.videoCount +
          ' videos.',
      );
      points.push(
        'Best days overall: ' +
          timing.bestDays.map((d) => d.dayName + ' (' + d.avgPerformanceScore + ')').join(', ') +
          '.',
      );
      return base(describeBestWindow(timing), points);
    }

    case 'BEST_HOOK': {
      const stats = analyseHooks(videos, now);
      const { best, note } = bestHook(stats);
      if (!best) return base(note, [NOT_ENOUGH_DATA], [], true);
      return base(note, [
        ...stats
          .filter((s) => s.videoCount >= 2)
          .slice(0, 4)
          .map(
            (s) =>
              s.label +
              ': ' +
              s.videoCount +
              ' videos, average score ' +
              (s.avgPerformanceScore ?? 0) +
              (s.avgRetention === null ? '' : ', ' + round(s.avgRetention, 1) + '% retention'),
          ),
        'Hook styles are classified from the hook text you enter on each video.',
      ], best.examples.map((e) => e.id));
    }

    case 'FOLLOW_UPS': {
      const candidates = findContinuedGrowthCandidates(videos, now).slice(0, 3);
      const scored = [...videos]
        .map((v) => ({ v, score: computePerformanceScore(v, videos, now).score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const points: string[] = [];
      for (const c of candidates) {
        points.push(
          '"' +
            c.video.title +
            '" is still accelerating: ' +
            round(c.lateMultiplier, 1) +
            'x baseline after 24h vs ' +
            round(c.earlyMultiplier, 1) +
            'x in the first hours.',
        );
      }
      for (const s of scored) {
        points.push(
          '"' + s.v.title + '" scored ' + s.score + '/100 - your audience already validated this concept.',
        );
      }
      return base(
        'These videos are the strongest follow-up candidates in your library.',
        points,
        [...candidates.map((c) => c.video.id), ...scored.map((s) => s.v.id)],
      );
    }

    case 'WHY_DECLINING': {
      const sorted = [...videos].sort(
        (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
      );
      const recent = sorted.slice(-Math.max(5, Math.floor(sorted.length / 3)));
      const earlier = sorted.slice(0, Math.max(5, Math.floor(sorted.length / 3)));
      const recentViews = mean(recent.map((v) => v.metrics.views));
      const earlierViews = mean(earlier.map((v) => v.metrics.views));
      const slope = linearSlope(sorted.map((v) => v.metrics.views));

      if (recentViews === null || earlierViews === null) {
        return base('Not enough data to assess a decline.', [NOT_ENOUGH_DATA], [], true);
      }

      const changed = (recentViews - earlierViews) / earlierViews;
      const points: string[] = [
        'Recent videos average ' +
          formatCompact(recentViews) +
          ' views vs ' +
          formatCompact(earlierViews) +
          ' earlier - a ' +
          Math.abs(Math.round(changed * 100)) +
          '% ' +
          (changed < 0 ? 'decrease' : 'increase') +
          '.',
      ];

      const recentRetention = mean(recent.map((v) => deriveMetrics(v, now).retention));
      const earlierRetention = mean(earlier.map((v) => deriveMetrics(v, now).retention));
      if (recentRetention !== null && earlierRetention !== null) {
        points.push(
          'Retention moved from ' +
            round(earlierRetention, 1) +
            '% to ' +
            round(recentRetention, 1) +
            '%.',
        );
      }
      const recentEng = mean(recent.map((v) => deriveMetrics(v, now).engagementRate));
      const earlierEng = mean(earlier.map((v) => deriveMetrics(v, now).engagementRate));
      if (recentEng !== null && earlierEng !== null) {
        points.push(
          'Engagement rate moved from ' + round(earlierEng, 2) + '% to ' + round(recentEng, 2) + '%.',
        );
      }

      const verdict = categoryVerdict(analyseCategories(videos, now));
      if (verdict.makeLess.length > 0) {
        points.push(
          'Your weakest topics right now: ' +
            verdict.makeLess
              .slice(0, 2)
              .map((c) => c.name + ' (' + (c.scoreVsAccount ?? 0) + ' pts vs account average)')
              .join(', ') +
            '.',
        );
      }
      if (slope !== null) {
        points.push(
          'Across your whole catalogue, per-video views are trending ' +
            (slope > 0 ? 'up' : 'down') +
            ' by about ' +
            formatCompact(Math.abs(slope)) +
            ' views per video published.',
        );
      }
      points.push(
        'This describes what changed in your measured data. It does not explain platform-side ranking changes, which no third-party tool can observe.',
      );

      return base(
        changed < -0.05
          ? 'Your recent videos are averaging ' + Math.abs(Math.round(changed * 100)) + '% fewer views than earlier ones.'
          : 'Your views are not actually declining over the period measured.',
        points,
        recent.slice(-3).map((v) => v.id),
      );
    }

    case 'VIRAL_POTENTIAL': {
      const list = viralWatchlist(videos, now, 3);
      if (list.length === 0) return base('No videos to assess.', [NOT_ENOUGH_DATA], [], true);
      const top = list[0];
      const viral = computeViralPotential(top.video, videos, now);
      return base(
        '"' + top.video.title + '" has the strongest early signals: ' + top.viralScore + '/100 (confidence ' + top.confidence + ').',
        [
          ...list.map(
            (i) => '"' + i.video.title + '" - viral potential ' + i.viralScore + '/100. ' + i.reason,
          ),
          viral.disclaimer,
        ],
        list.map((i) => i.video.id),
      );
    }

    case 'WORST_CONTENT': {
      const verdict = categoryVerdict(analyseCategories(videos, now));
      if (verdict.makeLess.length === 0) {
        return base(
          'No topic is clearly underperforming by enough to recommend dropping it.',
          [
            'A category needs at least ' +
              verdict.minSampleSize +
              ' videos and a score at least 5 points below your account average before it is flagged.',
          ],
        );
      }
      return base(
        'Consider making less ' + verdict.makeLess.map((c) => c.name).join(' and ') + '.',
        verdict.makeLess.map(
          (c) =>
            c.name +
            ': average score ' +
            (c.avgPerformanceScore ?? 0) +
            '/100 across ' +
            c.videoCount +
            ' videos, ' +
            Math.abs(c.scoreVsAccount ?? 0) +
            ' points below your account average.',
        ),
      );
    }

    case 'BEST_LENGTH': {
      const shortForm = videos.filter((v) => v.platform !== 'YOUTUBE');
      const longForm = videos.filter((v) => v.platform === 'YOUTUBE');
      const points: string[] = [];
      for (const [label, group] of [
        ['Short-form', shortForm],
        ['Long-form', longForm],
      ] as const) {
        if (group.length < 4) continue;
        const sorted = [...group].sort(
          (a, b) =>
            computePerformanceScore(b, videos, now).score - computePerformanceScore(a, videos, now).score,
        );
        const topLen = mean(sorted.slice(0, Math.ceil(sorted.length / 3)).map((v) => v.durationSeconds));
        const bottomLen = mean(sorted.slice(-Math.ceil(sorted.length / 3)).map((v) => v.durationSeconds));
        if (topLen === null || bottomLen === null) continue;
        points.push(
          label +
            ': your top third averages ' +
            Math.round(topLen) +
            's, your bottom third averages ' +
            Math.round(bottomLen) +
            's.',
        );
      }
      if (points.length === 0) {
        return base('Not enough videos per format to compare lengths.', [NOT_ENOUGH_DATA], [], true);
      }
      return base('Length patterns from your own catalogue:', points);
    }

    default:
      return base(
        'I can only answer from metrics this app actually stores.',
        [
          'Try one of the suggested questions, which map onto the stored data: performance scores, retention, engagement, velocity, topics, hooks and posting times.',
          'I will not answer questions about how YouTube or TikTok rank content - that is not observable from your analytics.',
        ],
        [],
        true,
      );
  }
}
