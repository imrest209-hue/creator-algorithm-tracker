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
  source: 'duckduckgo' | 'wikipedia';
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

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const response = await fetchWithTimeout(
    'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
  );
  if (!response || !response.ok) return [];

  const html = await response.text();
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
 * Runs both backends in parallel and merges, de-duplicated by URL. Returning
 * fewer results (or none) is fine and honest - the assistant says so rather
 * than inventing sources.
 */
export async function searchWeb(query: string, limit = 6): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, 400);
  if (!trimmed) return [];

  const [duck, wiki] = await Promise.all([
    searchDuckDuckGo(trimmed, limit).catch(() => [] as SearchResult[]),
    searchWikipedia(trimmed).catch(() => [] as SearchResult[]),
  ]);

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const result of [...duck, ...wiki]) {
    if (seen.has(result.url)) continue;
    seen.add(result.url);
    merged.push(result);
    if (merged.length >= limit) break;
  }

  if (merged.length === 0) {
    logger.warn('research.search_empty', { queryLength: trimmed.length });
  }
  return merged;
}
