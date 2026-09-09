import { HOOK_LABELS, type HookType, type VideoRecord } from '@/lib/types';
import { analyseCategories, analyseHashtags, categoryVerdict } from '@/lib/analytics/content';
import { analyseHooks, bestHook } from '@/lib/analytics/hooks';
import { computePerformanceScore } from '@/lib/analytics/score';
import { computeViralPotential } from '@/lib/analytics/viral';
import { analyseTiming, describeBestWindow } from '@/lib/analytics/timing';
import { findContinuedGrowthCandidates } from '@/lib/analytics/velocity';
import { mean, round } from '@/lib/util/math';

/**
 * CONTENT RECOMMENDATION ENGINE
 * ---------------------------------------------------------------------------
 * Generates ideas from the creator's own best-performing videos. Every
 * suggestion carries `generated: true` and an `evidence` string naming the real
 * stored metrics it was derived from.
 *
 * These are drafts for a human to choose from. Nothing here is ever posted
 * automatically - the app has no publishing capability at all.
 */

export type IdeaKind =
  | 'FOLLOW_UP'
  | 'PART_TWO'
  | 'VARIATION'
  | 'SIMILAR_CONCEPT'
  | 'NEW_CONCEPT'
  | 'FORMAT_SHIFT';

export const IDEA_KIND_LABELS: Record<IdeaKind, string> = {
  FOLLOW_UP: 'Follow-up',
  PART_TWO: 'Part 2',
  VARIATION: 'Variation',
  SIMILAR_CONCEPT: 'Similar concept',
  NEW_CONCEPT: 'New concept',
  FORMAT_SHIFT: 'Format shift',
};

export interface ContentIdea {
  id: string;
  kind: IdeaKind;
  /** Always true - these are machine-generated drafts, never platform data. */
  generated: true;
  title: string;
  hook: string;
  hookType: HookType;
  caption: string;
  hashtags: string[];
  categoryName: string;
  suggestedLengthSeconds: number | null;
  suggestedPostingWindow: string | null;
  /** The real, stored metrics this idea was derived from. */
  evidence: string;
  sourceVideoId: string | null;
  sourceVideoTitle: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

const HOOK_TEMPLATES: Record<HookType, (subject: string) => string> = {
  QUESTION: (s) => 'What actually happens if you ' + s + '?',
  CONTROVERSIAL: (s) => 'Everyone is wrong about ' + s + ', and here is the proof.',
  STORY: (s) => 'So last week I tried ' + s + ' and it did not go how I expected.',
  YOU_WONT_BELIEVE: (s) => 'You will not believe what happened when I tested ' + s + '.',
  IMMEDIATE_ACTION: (s) => 'Watch this before you touch ' + s + ' again.',
  PROBLEM_SOLUTION: (s) => 'If ' + s + ' keeps letting you down, this fixes it in one step.',
  CURIOSITY: (s) => 'Nobody talks about the real reason ' + s + ' works.',
  LISTICLE: (s) => 'Here are 3 things about ' + s + ' that changed how I do it.',
  DIRECT_ADDRESS: (s) => 'If you care about ' + s + ', this one is for you.',
  UNKNOWN: (s) => 'Here is what I learned about ' + s + '.',
};

const TITLE_TEMPLATES: Record<IdeaKind, (subject: string) => string> = {
  FOLLOW_UP: (s) => s + ' - What Happened Next',
  PART_TWO: (s) => s + ' (Part 2)',
  VARIATION: (s) => 'I Tried ' + s + ' Again, But Harder',
  SIMILAR_CONCEPT: (s) => 'The ' + s + ' Version Nobody Made Yet',
  NEW_CONCEPT: (s) => s + ': The Thing Everyone Gets Wrong',
  FORMAT_SHIFT: (s) => s + ' - But In 30 Seconds',
};

/** Strips series markers and filler so a title can seed a new one. */
function subjectFrom(title: string): string {
  return title
    .replace(/\s*\(?part\s*\d+\)?/i, '')
    .replace(/\s*[|\-–—]\s*.*$/, '')
    .replace(/^(how to|why|the)\s+/i, '')
    .trim();
}

function detectPartNumber(title: string): number | null {
  const match = title.match(/part\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export interface RecommendationContext {
  videos: VideoRecord[];
  timezone: string;
  now?: Date;
}

export function generateContentIdeas(ctx: RecommendationContext, limit = 12): ContentIdea[] {
  const now = ctx.now ?? new Date();
  const videos = ctx.videos;
  if (videos.length === 0) return [];

  const scored = videos
    .map((v) => ({ video: v, score: computePerformanceScore(v, videos, now).score }))
    .sort((a, b) => b.score - a.score);

  const accountAvg = mean(scored.map((s) => s.score)) ?? 50;
  const topPerformers = scored.filter((s) => s.score >= accountAvg).slice(0, 8);
  if (topPerformers.length === 0) return [];

  const hookStats = analyseHooks(videos, now);
  const { best: bestHookStats } = bestHook(hookStats);
  const preferredHook: HookType = bestHookStats?.type ?? topPerformers[0].video.hookType;

  const categoryStats = analyseCategories(videos, now);
  const topCategory = categoryStats[0];

  const timing = analyseTiming(videos, ctx.timezone, now);
  const window = timing.hasEnoughData && timing.bestWindows.length > 0 ? describeBestWindow(timing) : null;

  const hashtagStats = analyseHashtags(videos, now, 2);
  const topHashtags = hashtagStats.slice(0, 6).map((h) => '#' + h.tag);

  const lengths = mean(
    topPerformers.map((t) => t.video.durationSeconds),
  );

  const ideas: ContentIdea[] = [];
  let counter = 0;

  const add = (
    kind: IdeaKind,
    source: { video: VideoRecord; score: number } | null,
    subject: string,
    evidence: string,
    confidence: ContentIdea['confidence'],
    categoryName: string,
    titleOverride?: string,
  ) => {
    counter += 1;
    const hookType = preferredHook;
    const title = titleOverride ?? TITLE_TEMPLATES[kind](subject);
    ideas.push({
      id: 'idea-' + counter,
      kind,
      generated: true,
      title,
      hook: HOOK_TEMPLATES[hookType](subject.toLowerCase()),
      hookType,
      caption:
        title +
        ' - ' +
        (kind === 'PART_TWO'
          ? 'picking up exactly where the last one ended.'
          : 'the follow-through your audience already asked for.'),
      hashtags: topHashtags.length > 0 ? topHashtags.slice(0, 4) : ['#' + (topCategory?.slug ?? 'creator')],
      categoryName,
      suggestedLengthSeconds: lengths === null ? null : Math.round(lengths),
      suggestedPostingWindow: window,
      evidence,
      sourceVideoId: source?.video.id ?? null,
      sourceVideoTitle: source?.video.title ?? null,
      confidence,
    });
  };

  for (const performer of topPerformers.slice(0, 5)) {
    const v = performer.video;
    const subject = subjectFrom(v.title);
    const part = detectPartNumber(v.title);
    const evidence =
      '"' +
      v.title +
      '" scored ' +
      performer.score +
      '/100 (' +
      round(v.metrics.views, 0) +
      ' views, ' +
      (v.metrics.averagePercentageViewed === null
        ? 'retention unavailable'
        : round(v.metrics.averagePercentageViewed, 1) + '% retention') +
      ').';

    // A title that already says "Part 3" should produce "Part 4", not "Part 3 (Part 2)".
    if (part !== null) {
      add(
        'PART_TWO',
        performer,
        subject,
        evidence,
        'HIGH',
        v.categoryName,
        subject + ' (Part ' + (part + 1) + ')',
      );
    } else {
      add('PART_TWO', performer, subject, evidence, 'HIGH', v.categoryName);
    }
    add('FOLLOW_UP', performer, subject, evidence, 'HIGH', v.categoryName);
  }

  for (const performer of topPerformers.slice(0, 3)) {
    const v = performer.video;
    add(
      'VARIATION',
      performer,
      subjectFrom(v.title),
      'Variations of your strongest format. "' +
        v.title +
        '" is in your top ' +
        Math.max(1, Math.round((topPerformers.length / videos.length) * 100)) +
        '% by performance score.',
      'MEDIUM',
      v.categoryName,
    );
  }

  const verdict = categoryVerdict(categoryStats);
  for (const cat of verdict.makeMore.slice(0, 2)) {
    add(
      'SIMILAR_CONCEPT',
      null,
      cat.name,
      cat.name +
        ' averages ' +
        (cat.avgPerformanceScore ?? 0) +
        '/100 across ' +
        cat.videoCount +
        ' videos, ' +
        Math.abs(cat.scoreVsAccount ?? 0) +
        ' points above your account average.',
      cat.videoCount >= 5 ? 'HIGH' : 'MEDIUM',
      cat.name,
    );
  }

  const growth = findContinuedGrowthCandidates(videos, now).slice(0, 2);
  for (const candidate of growth) {
    add(
      'FOLLOW_UP',
      { video: candidate.video, score: 0 },
      subjectFrom(candidate.video.title),
      '"' +
        candidate.video.title +
        '" is still accelerating (' +
        round(candidate.lateMultiplier, 1) +
        'x baseline after 24h vs ' +
        round(candidate.earlyMultiplier, 1) +
        'x early) - a follow-up can catch that traffic.',
      'MEDIUM',
      candidate.video.categoryName,
    );
  }

  const longForm = videos.filter((v) => v.platform === 'YOUTUBE');
  if (longForm.length > 0 && topPerformers.length > 0) {
    add(
      'FORMAT_SHIFT',
      topPerformers[0],
      subjectFrom(topPerformers[0].video.title),
      'Your best long-form idea re-cut for short-form. Short-form videos in your library average ' +
        round(
          mean(
            videos
              .filter((v) => v.platform !== 'YOUTUBE')
              .map((v) => v.metrics.views),
          ) ?? 0,
          0,
        ) +
        ' views.',
      'LOW',
      topPerformers[0].video.categoryName,
    );
  }

  // De-duplicate by generated title, keeping the highest-confidence variant.
  const seen = new Map<string, ContentIdea>();
  for (const idea of ideas) {
    const key = idea.title.toLowerCase();
    const existing = seen.get(key);
    if (!existing) seen.set(key, idea);
  }
  return Array.from(seen.values()).slice(0, limit);
}

export interface SuggestedHook {
  hookType: HookType;
  label: string;
  example: string;
  evidence: string;
  generated: true;
}

export function suggestHooks(ctx: RecommendationContext, subject = 'this topic'): SuggestedHook[] {
  const now = ctx.now ?? new Date();
  const stats = analyseHooks(ctx.videos, now);
  const ranked = stats.filter((s) => s.videoCount >= 2);
  const pool = ranked.length > 0 ? ranked : stats;

  if (pool.length === 0) {
    return (['CURIOSITY', 'QUESTION', 'STORY'] as HookType[]).map((type) => ({
      hookType: type,
      label: HOOK_LABELS[type],
      example: HOOK_TEMPLATES[type](subject),
      evidence:
        'No hook data recorded yet - add hooks to your videos to rank hook styles against your own retention.',
      generated: true as const,
    }));
  }

  return pool.slice(0, 4).map((s) => ({
    hookType: s.type,
    label: s.label,
    example: HOOK_TEMPLATES[s.type](subject),
    evidence:
      s.label +
      ' averages ' +
      (s.avgPerformanceScore ?? 0) +
      '/100 across ' +
      s.videoCount +
      ' of your videos' +
      (s.avgRetention === null ? '' : ' with ' + round(s.avgRetention, 1) + '% average retention') +
      '.',
    generated: true as const,
  }));
}

export interface ViralWatchItem {
  video: VideoRecord;
  viralScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  reason: string;
}

/** Recent videos ranked by viral-potential score. */
export function viralWatchlist(
  videos: VideoRecord[],
  now = new Date(),
  limit = 5,
): ViralWatchItem[] {
  return videos
    .map((video) => {
      const viral = computeViralPotential(video, videos, now);
      return {
        video,
        viralScore: viral.score,
        confidence: viral.confidence,
        reason: viral.reason,
      };
    })
    .sort((a, b) => b.viralScore - a.viralScore)
    .slice(0, limit);
}
