import type { VideoRecord } from '@/lib/types';
import { analyseCategories, analyseHashtags, normaliseHashtag } from '@/lib/analytics/content';
import { computePerformanceScore } from '@/lib/analytics/score';
import { linearSlope, mean, round } from '@/lib/util/math';

/**
 * TREND DETECTION
 * ---------------------------------------------------------------------------
 * Strictly separated into two sources:
 *
 *  1. ACCOUNT trends  - derived from the creator's own stored videos. Always
 *     available, always honest about sample size.
 *  2. PUBLIC trends   - would come from an external trends API. We do not ship
 *     a scraper and we do not invent numbers, so when no provider is configured
 *     the UI shows an explicit "not connected" state.
 *
 * Neither source is a window into a platform's recommendation algorithm, and
 * the UI says so.
 */

export const TREND_DISCLAIMER =
  'Trend data describes what is measurable in your own account or in public APIs. It does not reveal how YouTube or TikTok rank content.';

export interface AccountTrend {
  key: string;
  label: string;
  kind: 'CATEGORY' | 'HASHTAG' | 'TITLE_TERM';
  /** Videos in the recent window using this topic. */
  recentCount: number;
  /** Videos in the earlier window using this topic. */
  priorCount: number;
  recentAvgScore: number | null;
  priorAvgScore: number | null;
  /** Change in average performance score between windows. */
  scoreDelta: number | null;
  /** Change in average views between windows, as a ratio. */
  viewsDelta: number | null;
  direction: 'RISING' | 'FALLING' | 'STEADY' | 'NEW';
}

/** Splits the catalogue in half by time and compares topic performance. */
export function detectAccountTrends(
  videos: VideoRecord[],
  now = new Date(),
  minVideos = 2,
): AccountTrend[] {
  if (videos.length < 6) return [];
  const sorted = [...videos].sort(
    (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
  );
  const midpoint = Math.floor(sorted.length / 2);
  const prior = sorted.slice(0, midpoint);
  const recent = sorted.slice(midpoint);

  const scoreById = new Map<string, number>();
  for (const v of videos) scoreById.set(v.id, computePerformanceScore(v, videos, now).score);

  const trends: AccountTrend[] = [];

  const compare = (
    key: string,
    label: string,
    kind: AccountTrend['kind'],
    recentGroup: VideoRecord[],
    priorGroup: VideoRecord[],
  ) => {
    if (recentGroup.length < minVideos && priorGroup.length < minVideos) return;
    const recentAvgScore = mean(recentGroup.map((v) => scoreById.get(v.id) ?? null));
    const priorAvgScore = mean(priorGroup.map((v) => scoreById.get(v.id) ?? null));
    const recentViews = mean(recentGroup.map((v) => v.metrics.views));
    const priorViews = mean(priorGroup.map((v) => v.metrics.views));
    const scoreDelta =
      recentAvgScore === null || priorAvgScore === null
        ? null
        : round(recentAvgScore - priorAvgScore, 1);
    const viewsDelta =
      recentViews === null || priorViews === null || priorViews === 0
        ? null
        : round((recentViews - priorViews) / priorViews, 3);

    let direction: AccountTrend['direction'] = 'STEADY';
    if (priorGroup.length === 0) direction = 'NEW';
    else if ((scoreDelta ?? 0) > 4 || (viewsDelta ?? 0) > 0.25) direction = 'RISING';
    else if ((scoreDelta ?? 0) < -4 || (viewsDelta ?? 0) < -0.25) direction = 'FALLING';

    trends.push({
      key,
      label,
      kind,
      recentCount: recentGroup.length,
      priorCount: priorGroup.length,
      recentAvgScore: recentAvgScore === null ? null : round(recentAvgScore, 1),
      priorAvgScore: priorAvgScore === null ? null : round(priorAvgScore, 1),
      scoreDelta,
      viewsDelta,
      direction,
    });
  };

  const categories = new Set(videos.map((v) => v.categorySlug));
  for (const slug of categories) {
    const label = videos.find((v) => v.categorySlug === slug)?.categoryName ?? slug;
    compare(
      'category:' + slug,
      label,
      'CATEGORY',
      recent.filter((v) => v.categorySlug === slug),
      prior.filter((v) => v.categorySlug === slug),
    );
  }

  const tags = new Set(videos.flatMap((v) => v.hashtags.map(normaliseHashtag)).filter(Boolean));
  for (const tag of tags) {
    const has = (v: VideoRecord) => v.hashtags.map(normaliseHashtag).includes(tag);
    compare('tag:' + tag, '#' + tag, 'HASHTAG', recent.filter(has), prior.filter(has));
  }

  return trends.sort((a, b) => (b.scoreDelta ?? -99) - (a.scoreDelta ?? -99));
}

export interface MomentumPoint {
  label: string;
  slope: number;
  recentAvgViews: number | null;
}

/** Categories whose per-video views are trending up over the whole catalogue. */
export function categoryMomentum(videos: VideoRecord[], now = new Date()): MomentumPoint[] {
  const stats = analyseCategories(videos, now);
  const out: MomentumPoint[] = [];
  for (const stat of stats) {
    const group = videos
      .filter((v) => v.categorySlug === stat.slug)
      .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
    if (group.length < 3) continue;
    const slope = linearSlope(group.map((v) => v.metrics.views));
    if (slope === null) continue;
    out.push({
      label: stat.name,
      slope: round(slope, 1),
      recentAvgViews: mean(group.slice(-3).map((v) => v.metrics.views)),
    });
  }
  return out.sort((a, b) => b.slope - a.slope);
}

/** Hashtags used often enough to rank, ordered by average performance score. */
export function trendingOwnHashtags(videos: VideoRecord[], now = new Date()) {
  return analyseHashtags(videos, now, 2).slice(0, 15);
}

/* -------------------------------------------------------------------------- */
/* PUBLIC / EXTERNAL TREND DATA                                               */
/* -------------------------------------------------------------------------- */

export interface PublicTrendItem {
  term: string;
  kind: 'TOPIC' | 'KEYWORD' | 'HASHTAG';
  /** Provider-supplied popularity metric. Units are provider-specific. */
  metric: number | null;
  metricLabel: string | null;
  changeRatio: number | null;
  sourceUrl: string | null;
}

export interface PublicTrendResult {
  configured: boolean;
  providerName: string | null;
  fetchedAt: string | null;
  items: PublicTrendItem[];
  /** Explains exactly why there is no data, when there is none. */
  note: string;
}

export const PUBLIC_TRENDS_NOT_CONFIGURED: PublicTrendResult = {
  configured: false,
  providerName: null,
  fetchedAt: null,
  items: [],
  note:
    'No public trend provider is connected. This app does not scrape platforms or bypass access controls, so public trend data only appears when you configure an official API (for example the YouTube Data API for regional most-popular videos). Your own account trends above are unaffected.',
};
