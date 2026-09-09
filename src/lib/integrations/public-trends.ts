import { fetchJson } from '@/lib/integrations/http';
import {
  PUBLIC_TRENDS_NOT_CONFIGURED,
  type PublicTrendItem,
  type PublicTrendResult,
} from '@/lib/analytics/trends';
import { extractHashtags } from '@/lib/integrations/types';
import { logger } from '@/lib/util/logger';

/**
 * PUBLIC TREND PROVIDER
 * ---------------------------------------------------------------------------
 * Optional. Uses the official YouTube Data API "most popular" chart, which is
 * public, documented, and requires only a server API key.
 *
 * What this deliberately does NOT do:
 *   * scrape TikTok's or YouTube's web pages,
 *   * use undocumented/private endpoints,
 *   * bypass any access control or rate limit.
 *
 * TikTok has no comparable public trends endpoint outside its Research API
 * (which requires a separate approved application), so no TikTok trend source
 * ships here. When nothing is configured the UI shows an explicit
 * "not connected" state rather than inventing data.
 */

const DATA_API = 'https://www.googleapis.com/youtube/v3/videos';

/** Cache trends briefly so page navigation does not burn API quota. */
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { at: number; result: PublicTrendResult } | null = null;

interface MostPopularResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      tags?: string[];
      categoryId?: string;
      channelTitle?: string;
    };
    statistics?: { viewCount?: string };
  }>;
}

export function isPublicTrendsConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export async function getPublicTrends(regionCode?: string): Promise<PublicTrendResult> {
  if (!isPublicTrendsConfigured()) return PUBLIC_TRENDS_NOT_CONFIGURED;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;

  const region = regionCode ?? process.env.TRENDS_REGION_CODE ?? 'US';
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    regionCode: region,
    maxResults: '25',
    key: process.env.YOUTUBE_API_KEY ?? '',
  });

  try {
    const data = await fetchJson<MostPopularResponse>(DATA_API + '?' + params.toString(), {
      label: 'YouTube most-popular chart',
      maxAttempts: 2,
    });

    const keywordCounts = new Map<string, number>();
    const hashtagCounts = new Map<string, number>();
    const topics: PublicTrendItem[] = [];

    for (const item of data.items ?? []) {
      const title = item.snippet?.title ?? '';
      const views = Number(item.statistics?.viewCount ?? '0');
      if (title) {
        topics.push({
          term: title,
          kind: 'TOPIC',
          metric: Number.isFinite(views) ? views : null,
          metricLabel: 'views',
          changeRatio: null,
          sourceUrl: null,
        });
      }
      for (const tag of item.snippet?.tags ?? []) {
        const key = tag.toLowerCase().trim();
        if (key.length > 2) keywordCounts.set(key, (keywordCounts.get(key) ?? 0) + 1);
      }
      for (const tag of extractHashtags(item.snippet?.description)) {
        hashtagCounts.set(tag, (hashtagCounts.get(tag) ?? 0) + 1);
      }
    }

    const toItems = (counts: Map<string, number>, kind: PublicTrendItem['kind']) =>
      Array.from(counts.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([term, count]) => ({
          term,
          kind,
          metric: count,
          metricLabel: 'trending videos',
          changeRatio: null,
          sourceUrl: null,
        }));

    const result: PublicTrendResult = {
      configured: true,
      providerName: 'YouTube Data API — most popular (' + region + ')',
      fetchedAt: new Date().toISOString(),
      items: [
        ...toItems(keywordCounts, 'KEYWORD'),
        ...toItems(hashtagCounts, 'HASHTAG'),
        ...topics.slice(0, 10),
      ],
      note:
        'Public data about what is trending on YouTube in ' +
        region +
        ' right now. It describes the platform at large, not your account, and it does not reveal how the recommendation system ranks content.',
    };

    cache = { at: Date.now(), result };
    return result;
  } catch (error) {
    logger.warn('public_trends.fetch_failed', { error });
    return {
      ...PUBLIC_TRENDS_NOT_CONFIGURED,
      configured: false,
      note:
        'A public trend provider is configured, but the request failed: ' +
        (error instanceof Error ? error.message : 'unknown error') +
        '. No placeholder data has been substituted.',
    };
  }
}
