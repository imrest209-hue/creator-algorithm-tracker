import type { DateRange, FilterState, PlatformFilter, VideoRecord } from '@/lib/types';
import { isWithin, resolveRange } from '@/lib/util/date';

export function matchesPlatform(video: VideoRecord, filter: PlatformFilter): boolean {
  switch (filter) {
    case 'ALL':
      return true;
    case 'SHORTS':
      // "Shorts" means all short-form/clip surfaces: YouTube Shorts, TikTok,
      // and Twitch/Kick clips.
      return (
        video.platform === 'YOUTUBE_SHORTS' ||
        video.platform === 'TIKTOK' ||
        video.platform === 'TWITCH' ||
        video.platform === 'KICK'
      );
    default:
      return video.platform === filter;
  }
}

export interface FilteredSet {
  range: DateRange;
  /** Videos published inside the range and matching the platform filter. */
  videos: VideoRecord[];
  /** All videos matching the platform filter, ignoring the date range. */
  platformVideos: VideoRecord[];
}

/**
 * Applies a filter to a catalogue.
 *
 * `platformVideos` is kept alongside the date-filtered set because scoring
 * baselines should use the whole catalogue - a 7-day view should still compare
 * against the creator's full history, not just the last 7 days.
 */
export function applyFilter(
  videos: VideoRecord[],
  filter: FilterState,
  now = new Date(),
): FilteredSet {
  const range = resolveRange(filter, now);
  const platformVideos = videos.filter((v) => matchesPlatform(v, filter.platform));
  return {
    range,
    platformVideos,
    videos: platformVideos.filter((v) => isWithin(v.publishedAt, range)),
  };
}

export const PLATFORM_FILTER_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: 'ALL', label: 'All platforms' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'YOUTUBE_SHORTS', label: 'YouTube Shorts' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'TWITCH', label: 'Twitch' },
  { value: 'KICK', label: 'Kick' },
  { value: 'SHORTS', label: 'Short-form / clips only' },
];

/** Parses URL search params into a filter, falling back to sane defaults. */
export function parseFilter(params: Record<string, string | string[] | undefined>): FilterState {
  const get = (key: string): string | undefined => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const presetRaw = get('range');
  const preset =
    presetRaw === '7d' ||
    presetRaw === '30d' ||
    presetRaw === '90d' ||
    presetRaw === '365d' ||
    presetRaw === 'all' ||
    presetRaw === 'custom'
      ? presetRaw
      : '30d';
  const platformRaw = get('platform');
  const platform: PlatformFilter =
    platformRaw === 'YOUTUBE' ||
    platformRaw === 'YOUTUBE_SHORTS' ||
    platformRaw === 'TIKTOK' ||
    platformRaw === 'TWITCH' ||
    platformRaw === 'KICK' ||
    platformRaw === 'SHORTS'
      ? platformRaw
      : 'ALL';
  return { preset, platform, from: get('from'), to: get('to') };
}

export function filterToQuery(filter: FilterState): string {
  const params = new URLSearchParams();
  params.set('range', filter.preset);
  params.set('platform', filter.platform);
  if (filter.preset === 'custom') {
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
  }
  return params.toString();
}
