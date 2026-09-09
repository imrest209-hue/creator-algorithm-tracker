import { describe, expect, it } from 'vitest';
import { generateContentIdeas, suggestHooks } from '@/lib/analytics/recommendations';
import { analyseHooks, bestHook, classifyHook } from '@/lib/analytics/hooks';
import { analyseCategories, categoryVerdict, classifyCategory } from '@/lib/analytics/content';
import { generateDemoVideos } from '@/lib/demo/generator';

const NOW = new Date('2026-09-09T00:00:00Z');

describe('classifyCategory', () => {
  it('assigns a category from title keywords', () => {
    const result = classifyCategory({
      title: 'How To Fix Your Engine (Tutorial)',
      caption: null,
      description: null,
      hashtags: [],
    });
    expect(result.slug).toBe('tutorial');
  });

  it('falls back to "other" when nothing matches', () => {
    const result = classifyCategory({
      title: 'asdkjaslkdj',
      caption: null,
      description: null,
      hashtags: [],
    });
    expect(result.slug).toBe('other');
    expect(result.confidence).toBe(0);
  });
});

describe('classifyHook', () => {
  it('recognises a question hook', () => {
    expect(classifyHook('What actually happens if you skip an oil change?')).toBe('QUESTION');
  });

  it('recognises a "you wont believe" hook', () => {
    expect(classifyHook("You won't believe what happened next.")).toBe('YOU_WONT_BELIEVE');
  });

  it('returns UNKNOWN for empty or missing text', () => {
    expect(classifyHook(null)).toBe('UNKNOWN');
    expect(classifyHook('   ')).toBe('UNKNOWN');
  });
});

describe('generateContentIdeas', () => {
  it('generates ideas only from real demo videos, all labelled as generated', () => {
    const videos = generateDemoVideos({ count: 50, now: NOW });
    const ideas = generateContentIdeas({ videos, timezone: 'America/New_York', now: NOW }, 10);
    expect(ideas.length).toBeGreaterThan(0);
    for (const idea of ideas) {
      expect(idea.generated).toBe(true);
      expect(idea.evidence.length).toBeGreaterThan(0);
    }
  });

  it('returns no ideas when there is no video history', () => {
    const ideas = generateContentIdeas({ videos: [], timezone: 'UTC', now: NOW });
    expect(ideas).toEqual([]);
  });

  it('every idea evidence string references a real stored number or video', () => {
    const videos = generateDemoVideos({ count: 50, now: NOW });
    const ideas = generateContentIdeas({ videos, timezone: 'America/New_York', now: NOW }, 10);
    for (const idea of ideas) {
      // evidence must not be a placeholder - it should mention a number or a
      // quoted source title.
      expect(/\d/.test(idea.evidence) || idea.evidence.includes('"')).toBe(true);
    }
  });
});

describe('suggestHooks', () => {
  it('falls back to a generic hook suggestion when no hook data exists', () => {
    const suggestions = suggestHooks({ videos: [], timezone: 'UTC', now: NOW });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].generated).toBe(true);
  });

  it('ranks suggestions by real hook performance when data exists', () => {
    const videos = generateDemoVideos({ count: 50, now: NOW });
    const stats = analyseHooks(videos, NOW);
    const suggestions = suggestHooks({ videos, timezone: 'America/New_York', now: NOW });
    expect(suggestions.length).toBeGreaterThan(0);
    if (stats.length > 0) {
      expect(suggestions[0].evidence).toMatch(/\d+ of your videos/);
    }
  });
});

describe('categoryVerdict', () => {
  it('requires a minimum sample before recommending "make more" or "make less"', () => {
    const videos = generateDemoVideos({ count: 50, now: NOW });
    const stats = analyseCategories(videos, NOW);
    const verdict = categoryVerdict(stats);
    for (const cat of [...verdict.makeMore, ...verdict.makeLess]) {
      expect(cat.videoCount).toBeGreaterThanOrEqual(verdict.minSampleSize);
    }
  });
});

describe('bestHook', () => {
  it('never recommends UNKNOWN as the best hook style', () => {
    const videos = generateDemoVideos({ count: 50, now: NOW });
    const stats = analyseHooks(videos, NOW);
    const { best } = bestHook(stats);
    if (best) expect(best.type).not.toBe('UNKNOWN');
  });
});
