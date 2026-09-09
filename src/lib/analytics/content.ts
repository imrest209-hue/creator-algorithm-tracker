import type { ContentCategory, VideoRecord } from '@/lib/types';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { computePerformanceScore } from '@/lib/analytics/score';
import { mean, round, sum } from '@/lib/util/math';

/**
 * CONTENT CLASSIFICATION + CATEGORY ANALYSIS
 * ---------------------------------------------------------------------------
 * Videos are categorised from their title, caption, description and hashtags
 * using a keyword classifier. Classification is always overridable by the user,
 * and every record tracks whether its category was auto-assigned.
 */

export const DEFAULT_CATEGORIES: ContentCategory[] = [
  {
    slug: 'gaming',
    name: 'Gaming',
    keywords: [
      'gaming', 'gameplay', 'speedrun', 'fps', 'minecraft', 'fortnite', 'warzone', 'rpg',
      'playthrough', 'boss fight', 'controller', 'ranked', 'loadout', 'patch notes', 'esports',
      // Call of Duty specific - kept broad enough to also catch other shooters.
      'call of duty', 'cod', 'modern warfare', 'black ops', 'mw2', 'mw3', 'bo6', 'cold war',
      'verdansk', 'rebirth island', 'ashika island', 'gulag', 'killstreak', 'nuketown',
      'search and destroy', 'hardpoint', 'domination', 'multiplayer', 'zombies', 'gunfight',
      'nickmercs', 'sweat', 'sbmm', 'aim assist', 'gunsmith', 'kd ratio', 'nuke',
    ],
    isCustom: false,
  },
  {
    slug: 'funny',
    name: 'Funny',
    keywords: [
      'funny', 'comedy', 'prank', 'fail', 'meme', 'skit', 'lol', 'hilarious', 'bloopers',
      'try not to laugh', 'joke',
    ],
    isCustom: false,
  },
  {
    slug: 'tutorial',
    name: 'Tutorial',
    keywords: [
      'tutorial', 'how to', 'howto', 'guide', 'step by step', 'walkthrough', 'setup', 'install',
      'beginners', 'learn', 'tips', 'fix', 'diy',
    ],
    isCustom: false,
  },
  {
    slug: 'reaction',
    name: 'Reaction',
    keywords: ['reaction', 'reacting', 'reacts', 'first time watching', 'blind reaction', 'i watched'],
    isCustom: false,
  },
  {
    slug: 'story',
    name: 'Story',
    keywords: ['story', 'storytime', 'what happened', 'my experience', 'the time i', 'confession'],
    isCustom: false,
  },
  {
    slug: 'challenge',
    name: 'Challenge',
    keywords: ['challenge', '24 hours', 'i tried', 'last to', 'attempt', 'vs', 'survive', 'no buy'],
    isCustom: false,
  },
  {
    slug: 'news',
    name: 'News',
    keywords: ['news', 'breaking', 'update', 'announced', 'leak', 'rumor', 'report', 'this week'],
    isCustom: false,
  },
  {
    slug: 'car-content',
    name: 'Car content',
    keywords: [
      'car', 'cars', 'engine', 'turbo', 'jdm', 'bmw', 'supra', 'drift', 'exhaust', 'horsepower',
      'dyno', 'build', 'detailing', 'test drive', 'ev',
    ],
    isCustom: false,
  },
  {
    slug: 'commentary',
    name: 'Commentary',
    keywords: ['commentary', 'my thoughts', 'we need to talk', 'opinion', 'response', 'take', 'rant'],
    isCustom: false,
  },
  {
    slug: 'educational',
    name: 'Educational',
    keywords: [
      'explained', 'science', 'history', 'facts', 'why', 'the truth about', 'documentary',
      'breakdown', 'analysis', 'economics',
    ],
    isCustom: false,
  },
  { slug: 'other', name: 'Other', keywords: [], isCustom: false },
];

export function searchableText(
  video: Pick<VideoRecord, 'title' | 'caption' | 'description' | 'hashtags'>,
): string {
  return [video.title, video.caption ?? '', video.description ?? '', video.hashtags.join(' ')]
    .join(' ')
    .toLowerCase();
}

export interface ClassificationResult {
  slug: string;
  name: string;
  /** Number of keyword hits that produced the match. 0 means fallback. */
  confidence: number;
  matchedKeywords: string[];
}

/**
 * Keyword classifier. Multi-word keywords score higher than single words so
 * that "how to" beats an incidental "car" mention.
 */
export function classifyCategory(
  video: Pick<VideoRecord, 'title' | 'caption' | 'description' | 'hashtags'>,
  categories: ContentCategory[] = DEFAULT_CATEGORIES,
): ClassificationResult {
  const text = searchableText(video);
  const titleText = video.title.toLowerCase();
  let best: ClassificationResult = { slug: 'other', name: 'Other', confidence: 0, matchedKeywords: [] };

  for (const category of categories) {
    if (category.keywords.length === 0) continue;
    let score = 0;
    const matched: string[] = [];
    for (const keyword of category.keywords) {
      const k = keyword.toLowerCase();
      if (!text.includes(k)) continue;
      matched.push(keyword);
      score += k.includes(' ') ? 3 : 1;
      // Keywords in the title are a stronger signal than in a long description.
      if (titleText.includes(k)) score += 1;
    }
    if (score > best.confidence) {
      best = { slug: category.slug, name: category.name, confidence: score, matchedKeywords: matched };
    }
  }

  if (best.confidence === 0) {
    const fallback = categories.find((c) => c.slug === 'other') ?? categories[categories.length - 1];
    return { slug: fallback.slug, name: fallback.name, confidence: 0, matchedKeywords: [] };
  }
  return best;
}

export interface CategoryStats {
  slug: string;
  name: string;
  videoCount: number;
  totalViews: number;
  avgViews: number | null;
  avgRetention: number | null;
  avgEngagementRate: number | null;
  totalFollowersGained: number | null;
  avgPerformanceScore: number | null;
  /** avgPerformanceScore minus the account-wide average score. */
  scoreVsAccount: number | null;
  shareOfLibrary: number;
}

/**
 * Per-category aggregates. Scores are computed once per video against the full
 * catalogue so category comparisons all use the same baseline.
 */
export function analyseCategories(videos: VideoRecord[], now = new Date()): CategoryStats[] {
  if (videos.length === 0) return [];
  const scoreById = new Map<string, number>();
  for (const v of videos) {
    scoreById.set(v.id, computePerformanceScore(v, videos, now).score);
  }
  const accountAvgScore = mean(Array.from(scoreById.values()));

  const groups = new Map<string, VideoRecord[]>();
  for (const v of videos) {
    const list = groups.get(v.categorySlug) ?? [];
    list.push(v);
    groups.set(v.categorySlug, list);
  }

  const stats: CategoryStats[] = [];
  for (const [slug, group] of groups) {
    const derived = group.map((v) => deriveMetrics(v, now));
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    const followers = group.map((v) => v.metrics.followersGained);
    const hasFollowers = followers.some((f) => f !== null);
    stats.push({
      slug,
      name: group[0].categoryName,
      videoCount: group.length,
      totalViews: sum(group.map((v) => v.metrics.views)),
      avgViews: mean(group.map((v) => v.metrics.views)),
      avgRetention: mean(derived.map((d) => d.retention)),
      avgEngagementRate: mean(derived.map((d) => d.engagementRate)),
      totalFollowersGained: hasFollowers ? sum(followers) : null,
      avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
      scoreVsAccount:
        avgScore === null || accountAvgScore === null ? null : round(avgScore - accountAvgScore, 1),
      shareOfLibrary: round((group.length / videos.length) * 100, 1),
    });
  }

  return stats.sort((a, b) => (b.avgPerformanceScore ?? 0) - (a.avgPerformanceScore ?? 0));
}

export interface ContentVerdict {
  makeMore: CategoryStats[];
  makeLess: CategoryStats[];
  /** Categories with too few videos to judge. */
  needsMoreData: CategoryStats[];
  minSampleSize: number;
}

/** Minimum videos in a category before we are willing to give a verdict. */
export const MIN_CATEGORY_SAMPLE = 3;

/**
 * Splits categories into "make more of this" and "stop making this", requiring
 * a minimum sample so a single lucky video does not drive the advice.
 */
export function categoryVerdict(stats: CategoryStats[]): ContentVerdict {
  const judged = stats.filter((s) => s.videoCount >= MIN_CATEGORY_SAMPLE);
  const needsMoreData = stats.filter((s) => s.videoCount < MIN_CATEGORY_SAMPLE);
  return {
    makeMore: judged
      .filter((s) => (s.scoreVsAccount ?? 0) >= 5)
      .sort((a, b) => (b.scoreVsAccount ?? 0) - (a.scoreVsAccount ?? 0)),
    makeLess: judged
      .filter((s) => (s.scoreVsAccount ?? 0) <= -5)
      .sort((a, b) => (a.scoreVsAccount ?? 0) - (b.scoreVsAccount ?? 0)),
    needsMoreData,
    minSampleSize: MIN_CATEGORY_SAMPLE,
  };
}

export interface HashtagStats {
  tag: string;
  videoCount: number;
  avgViews: number | null;
  avgEngagementRate: number | null;
  avgPerformanceScore: number | null;
  totalViews: number;
}

export function analyseHashtags(
  videos: VideoRecord[],
  now = new Date(),
  minCount = 2,
): HashtagStats[] {
  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);

  const groups = new Map<string, VideoRecord[]>();
  for (const v of videos) {
    for (const raw of v.hashtags) {
      const tag = normaliseHashtag(raw);
      if (!tag) continue;
      const list = groups.get(tag) ?? [];
      list.push(v);
      groups.set(tag, list);
    }
  }

  const out: HashtagStats[] = [];
  for (const [tag, group] of groups) {
    if (group.length < minCount) continue;
    const derived = group.map((v) => deriveMetrics(v, now));
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    out.push({
      tag,
      videoCount: group.length,
      avgViews: mean(group.map((v) => v.metrics.views)),
      avgEngagementRate: mean(derived.map((d) => d.engagementRate)),
      avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
      totalViews: sum(group.map((v) => v.metrics.views)),
    });
  }
  return out.sort((a, b) => (b.avgPerformanceScore ?? 0) - (a.avgPerformanceScore ?? 0));
}

export function normaliseHashtag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase();
}

export interface LengthBucketStats {
  label: string;
  minSeconds: number;
  maxSeconds: number;
  videoCount: number;
  avgViews: number | null;
  avgRetention: number | null;
  avgPerformanceScore: number | null;
}

const SHORT_BUCKETS: Array<[string, number, number]> = [
  ['0-15s', 0, 15],
  ['15-30s', 15, 30],
  ['30-45s', 30, 45],
  ['45-60s', 45, 61],
  ['60s+', 61, Number.MAX_SAFE_INTEGER],
];

const LONG_BUCKETS: Array<[string, number, number]> = [
  ['Under 3 min', 0, 180],
  ['3-6 min', 180, 360],
  ['6-10 min', 360, 600],
  ['10-15 min', 600, 900],
  ['15-25 min', 900, 1500],
  ['25 min+', 1500, Number.MAX_SAFE_INTEGER],
];

/** Groups videos into duration buckets to answer "what length works best". */
export function analyseLengths(
  videos: VideoRecord[],
  form: 'short' | 'long',
  now = new Date(),
): LengthBucketStats[] {
  const buckets = form === 'short' ? SHORT_BUCKETS : LONG_BUCKETS;
  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);

  return buckets.map(([label, minSeconds, maxSeconds]) => {
    const group = videos.filter(
      (v) => v.durationSeconds >= minSeconds && v.durationSeconds < maxSeconds,
    );
    const derived = group.map((v) => deriveMetrics(v, now));
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    return {
      label,
      minSeconds,
      maxSeconds,
      videoCount: group.length,
      avgViews: mean(group.map((v) => v.metrics.views)),
      avgRetention: mean(derived.map((d) => d.retention)),
      avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
    };
  });
}

/** Words that carry no signal when mining titles for patterns. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with', 'is', 'it', 'my',
  'i', 'you', 'this', 'that', 'at', 'from', 'by', 'as', 'was', 'are', 'be', 'we', 'me', 'so',
  'how', 'what', 'why', 'when', 'if', 'do', 'did', 'not', 'your', 'its', 'has', 'have',
]);

export interface TitlePatternStats {
  term: string;
  videoCount: number;
  avgPerformanceScore: number | null;
  avgViews: number | null;
}

/** Frequent title words ranked by the average score of the videos using them. */
export function analyseTitleTerms(
  videos: VideoRecord[],
  now = new Date(),
  minCount = 3,
): TitlePatternStats[] {
  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);

  const groups = new Map<string, VideoRecord[]>();
  for (const v of videos) {
    const words = new Set(
      v.title
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    );
    for (const w of words) {
      const list = groups.get(w) ?? [];
      list.push(v);
      groups.set(w, list);
    }
  }

  const out: TitlePatternStats[] = [];
  for (const [term, group] of groups) {
    if (group.length < minCount) continue;
    const avgScore = mean(group.map((v) => scoreById.get(v.id) ?? null));
    out.push({
      term,
      videoCount: group.length,
      avgPerformanceScore: avgScore === null ? null : round(avgScore, 1),
      avgViews: mean(group.map((v) => v.metrics.views)),
    });
  }
  return out.sort((a, b) => (b.avgPerformanceScore ?? 0) - (a.avgPerformanceScore ?? 0));
}
