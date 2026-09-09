import { logger } from '@/lib/util/logger';

/**
 * KEYLESS WEB SEARCH
 * ---------------------------------------------------------------------------
 * Powers the research assistant without any API key or paid account, matching
 * how the rest of this app avoids per-request billing: DuckDuckGo's HTML
 * endpoint plus Wikipedia's open REST API, both free and keyless.
 *
 * SECURITY NOTE - everything this module returns is UNTRUSTED CONTENT written
 * by strangers on the internet. It is only ever surfaced to the user as quoted
 * search results, or passed to the local model wrapped in an explicit
 * "this is data, not instructions" frame (see assistant.ts). Nothing here is
 * ever executed, followed as an instruction, or written into the analytics
 * tables.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo' | 'wikipedia' | 'searxng';
}

export interface SearchOutcome {
  results: SearchResult[];
  /** True when a backend refused us, so the caller can say so rather than
   *  passing off a thin result set as the whole of the web. */
  webSearchBlocked: boolean;
  fromCache: boolean;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const TIMEOUT_MS = 12_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** DuckDuckGo wraps outbound links as /l/?uddg=<encoded>; unwrap to the real URL. */
function unwrapDuckUrl(href: string): string {
  try {
    const match = /[?&]uddg=([^&]+)/.exec(href);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // Fall through and return whatever we were given.
  }
  return href.startsWith('//') ? 'https:' + href : href;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * DuckDuckGo answers a rate-limited scrape with an "anomaly" interstitial -
 * served as HTTP **202**, which passes a naive `response.ok` check and then
 * parses to zero results. That looked identical to "the web had nothing to say"
 * and silently degraded the assistant to Wikipedia-only, so it is detected
 * explicitly and reported.
 *
 * We never try to defeat the block - no CAPTCHA solving, no proxy rotation.
 * The honest options are to wait it out, or point SEARXNG_URL at a SearXNG
 * instance (see below).
 */
export function looksBlocked(status: number, html: string): boolean {
  if (status === 202 || status === 429) return true;
  return /anomaly\.js|unusual traffic|captcha-wrap|\bg-recaptcha\b/i.test(html.slice(0, 4000));
}

class SearchBlockedError extends Error {}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetchWithTimeout(
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
  );
  if (!response) return [];

  const html = await response.text();
  if (looksBlocked(response.status, html)) {
    logger.warn('research.search_blocked', { engine: 'duckduckgo', status: response.status });
    throw new SearchBlockedError('duckduckgo');
  }
  if (!response.ok) return [];

  const results: SearchResult[] = [];

  // Each result block pairs a result__a anchor with a result__snippet div.
  const blocks = html.split('result__body').slice(1);
  for (const block of blocks) {
    if (results.length >= limit) break;
    const linkMatch = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!linkMatch) continue;
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const title = stripTags(linkMatch[2]);
    const url = unwrapDuckUrl(linkMatch[1]);
    if (!title || !url.startsWith('http')) continue;
    results.push({
      title: title.slice(0, 200),
      url,
      snippet: (snippetMatch ? stripTags(snippetMatch[1]) : '').slice(0, 600),
      source: 'duckduckgo',
    });
  }
  return results;
}

/**
 * Optional SearXNG backend, used first when SEARXNG_URL is set.
 *
 * SearXNG is open source and self-hostable, exposes a proper JSON API, and
 * needs no key - so pointing this at a local instance (`docker run searxng`)
 * is the reliable long-term answer to scraping getting rate-limited. It is
 * strictly opt-in; nothing here depends on a third-party server by default.
 */
async function searchSearxng(query: string, limit: number): Promise<SearchResult[]> {
  const base = process.env.SEARXNG_URL;
  if (!base) return [];

  const url = base.replace(/\/+$/, '') + '/search?format=json&q=' + encodeURIComponent(query);
  const response = await fetchWithTimeout(url);
  if (!response || !response.ok) return [];
  try {
    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return (data.results ?? [])
      .filter((r) => r.title && r.url?.startsWith('http'))
      .slice(0, limit)
      .map((r) => ({
        title: String(r.title).slice(0, 200),
        url: String(r.url),
        snippet: String(r.content ?? '').slice(0, 600),
        source: 'searxng' as const,
      }));
  } catch {
    return [];
  }
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '2',
    format: 'json',
    origin: '*',
  });
  const response = await fetchWithTimeout('https://en.wikipedia.org/w/api.php?' + params.toString());
  if (!response || !response.ok) return [];
  try {
    const data = (await response.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    return (data.query?.search ?? []).map((item) => ({
      title: item.title,
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_')),
      snippet: stripTags(item.snippet).slice(0, 600),
      source: 'wikipedia' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Short-lived result cache.
 *
 * Two jobs: asking the same thing twice returns instantly instead of paying
 * ~1s of network, and - more importantly - it cuts the number of outbound
 * scrapes, which is what got this app rate-limited by DuckDuckGo in the first
 * place. Small and in-memory on purpose: this is a single-user local app, and
 * search results going stale after a few minutes is the correct trade.
 */
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_MAX_ENTRIES = 50;
const cache = new Map<string, { at: number; results: SearchResult[] }>();

function cacheKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

function readCache(query: string): SearchResult[] | null {
  const hit = cache.get(cacheKey(query));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(query));
    return null;
  }
  return hit.results;
}

function writeCache(query: string, results: SearchResult[]): void {
  if (results.length === 0) return;
  // Cheap LRU-ish bound: drop the oldest insertion when full.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(query), { at: Date.now(), results });
}

/**
 * Runs the available backends in parallel and merges, de-duplicated by URL.
 * Returning fewer results (or none) is fine and honest - the assistant says so
 * rather than inventing sources.
 */
export async function searchWeb(query: string, limit = 6): Promise<SearchOutcome> {
  const trimmed = query.trim().slice(0, 400);
  if (!trimmed) return { results: [], webSearchBlocked: false, fromCache: false };

  const cached = readCache(trimmed);
  if (cached) return { results: cached, webSearchBlocked: false, fromCache: true };

  let webSearchBlocked = false;

  const [searx, duck, wiki] = await Promise.all([
    searchSearxng(trimmed, limit).catch(() => [] as SearchResult[]),
    searchDuckDuckGo(trimmed, limit).catch((error) => {
      if (error instanceof SearchBlockedError) webSearchBlocked = true;
      return [] as SearchResult[];
    }),
    searchWikipedia(trimmed).catch(() => [] as SearchResult[]),
  ]);

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const result of [...searx, ...duck, ...wiki]) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    merged.push(result);
    if (merged.length >= limit) break;
  }

  // A blocked general-web search still leaves Wikipedia, but the caller must
  // know the result set is partial rather than representative.
  if (merged.length === 0) {
    logger.warn('research.search_empty', { queryLength: trimmed.length, webSearchBlocked });
  }
  if (!webSearchBlocked) writeCache(trimmed, merged);

  return { results: merged, webSearchBlocked, fromCache: false };
}
