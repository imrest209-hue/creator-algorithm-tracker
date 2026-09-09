import { HOOK_LABELS, type HookType, type VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { mean, round } from '@/lib/util/math';

/**
 * HOOK ANALYSIS
 * ---------------------------------------------------------------------------
 * The creator types in the first few seconds of a video (the hook). We classify
 * it into a hook style and then compare retention and performance across styles
 * using only that creator's own videos.
 */

interface HookRule {
  type: HookType;
  /** Higher priority wins when several patterns match. */
  priority: number;
  test: (text: string) => boolean;
}

const RULES: HookRule[] = [
  {
    type: 'YOU_WONT_BELIEVE',
    priority: 100,
    test: (t) =>
      /(you won'?t believe|you'?ll never guess|nobody expected|this will shock|wait until you see)/.test(
        t,
      ),
  },
  {
    type: 'LISTICLE',
    priority: 90,
    test: (t) => /^(here are |top \d|\d+ (things|ways|reasons|tips|mistakes)|the \d+ )/.test(t),
  },
  {
    type: 'CONTROVERSIAL',
    priority: 85,
    test: (t) =>
      /(unpopular opinion|hot take|everyone is wrong|i'?m going to get hate|nobody wants to admit|stop (doing|using)|is a scam|is overrated|actually terrible)/.test(
        t,
      ),
  },
  {
    type: 'PROBLEM_SOLUTION',
    priority: 80,
    test: (t) =>
      /(if you(r)? [a-z ]{0,20}(struggle|keep|keeps|can'?t|won'?t|wont|breaks?|fails?)|the problem with|here'?s (how to fix|the fix)|tired of|this fix(es)?|fixes it|stop (wasting|using|spending|doing)|before you (spend|buy|touch))/.test(
        t,
      ),
  },
  {
    type: 'STORY',
    priority: 75,
    test: (t) =>
      /(^so |so (i|we|there)|last (week|night|year|month)|a few (days|weeks|years) ago|when i was|it started|this happened|storytime|there i was)/.test(
        t,
      ),
  },
  {
    type: 'IMMEDIATE_ACTION',
    priority: 70,
    test: (t) =>
      /^(watch this|look at|okay so we'?re|we'?re going|right now i'?m|check this|here we go|i'?m about to|let'?s go|i have \d)/.test(
        t,
      ),
  },
  {
    type: 'CURIOSITY',
    priority: 65,
    test: (t) =>
      /(the real reason|what nobody tells you|the secret|here'?s why|nobody talks about|there'?s a reason|most people don'?t know|explained properly|is not what you think|cannot stop thinking)/.test(
        t,
      ),
  },
  {
    type: 'QUESTION',
    priority: 60,
    test: (t) => /\?/.test(t) || /^(what|why|how|did you|have you|do you|can you|ever wonder)/.test(t),
  },
  {
    type: 'DIRECT_ADDRESS',
    priority: 40,
    test: (t) =>
      /^(you |if you'?re |listen |hey |guys |everyone |my |i tried|i am about to)/.test(t) ||
      /this one is for you/.test(t),
  },
];

/**
 * Normalises a hook line before matching: curly quotes become straight ones and
 * "here is" collapses to "here's", so one pattern covers both spellings.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\bhere is\b/g, "here's")
    .replace(/\bthere is\b/g, "there's")
    .replace(/\bit is\b/g, "it's")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classifies a hook line into a hook style. Returns UNKNOWN when nothing matches. */
export function classifyHook(hookText: string | null | undefined): HookType {
  if (!hookText) return 'UNKNOWN';
  const text = normalise(hookText);
  if (text.length === 0) return 'UNKNOWN';
  const matches = RULES.filter((r) => r.test(text)).sort((a, b) => b.priority - a.priority);
  return matches.length > 0 ? matches[0].type : 'UNKNOWN';
}

export interface HookStats {
  type: HookType;
  label: string;
  videoCount: number;
  avgRetention: number | null;
  avgViews: number | null;
  avgEngagementRate: number | null;
  avgPerformanceScore: number | null;
  /** avgPerformanceScore minus the account-wide average. */
  scoreVsAccount: number | null;
  examples: Array<{ id: string; title: string; hookText: string | null; score: number }>;
}

/** Minimum videos per hook style before it is ranked rather than listed. */
export const MIN_HOOK_SAMPLE = 3;

export function analyseHooks(videos: VideoRecord[], now = new Date()): HookStats[] {
  const withHooks = videos.filter((v) => v.hookText && v.hookText.trim().length > 0);
  if (withHooks.length === 0) return [];

  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);
  const accountAvg = mean(Array.from(scoreById.values()));

  const groups = new Map<HookType, VideoRecord[]>();
  for (const v of withHooks) {
    const list = groups.get(v.hookType) ?? [];
    list.push(v);
    groups.set(v.hookType, list);
  }

  const out: HookStats[] = [];
  for (const [type, group] of groups) {
    const derived = group.map((v) => deriveMetrics(v, now));
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    out.push({
      type,
      label: HOOK_LABELS[type],
      videoCount: group.length,
      avgRetention: mean(derived.map((d) => d.retention)),
      avgViews: mean(group.map((v) => v.metrics.views)),
      avgEngagementRate: mean(derived.map((d) => d.engagementRate)),
      avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
      scoreVsAccount:
        avgScore === null || accountAvg === null ? null : round(avgScore - accountAvg, 1),
      examples: group
        .map((v) => ({
          id: v.id,
          title: v.title,
          hookText: v.hookText,
          score: scoreById.get(v.id) ?? 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    });
  }

  return out.sort((a, b) => (b.avgPerformanceScore ?? 0) - (a.avgPerformanceScore ?? 0));
}

/**
 * The best hook style with a large enough sample, or null with a reason.
 * UNKNOWN is excluded - "unclassified" is not a style anyone can deliberately
 * reproduce, so recommending it would be useless advice.
 */
export function bestHook(stats: HookStats[]): { best: HookStats | null; note: string } {
  const eligible = stats.filter((s) => s.videoCount >= MIN_HOOK_SAMPLE && s.type !== 'UNKNOWN');
  if (eligible.length === 0) {
    return {
      best: null,
      note:
        'Not enough account-specific data yet - at least ' +
        MIN_HOOK_SAMPLE +
        ' videos per hook style are needed before ranking them.',
    };
  }
  const best = eligible[0];
  return {
    best,
    note:
      best.label +
      ' scores highest across ' +
      best.videoCount +
      ' of your videos (avg score ' +
      (best.avgPerformanceScore ?? 0) +
      ').',
  };
}
