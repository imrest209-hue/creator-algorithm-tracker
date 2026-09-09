import type { DateRange, FilterState, RangePreset } from '@/lib/types';

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const PRESET_DAYS: Record<Exclude<RangePreset, 'all' | 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last year',
  all: 'All time',
  custom: 'Custom range',
};

/** Resolves a filter into a concrete [from, to) range. */
export function resolveRange(filter: FilterState, now = new Date()): DateRange {
  const to = new Date(now.getTime());
  if (filter.preset === 'custom') {
    const from = filter.from ? new Date(filter.from) : new Date(0);
    const customTo = filter.to ? new Date(filter.to) : to;
    // Date-only "to" values are inclusive of the whole day the user picked.
    if (filter.to && filter.to.length <= 10) customTo.setUTCHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: customTo.toISOString() };
  }
  if (filter.preset === 'all') {
    return { from: new Date(0).toISOString(), to: to.toISOString() };
  }
  const days = PRESET_DAYS[filter.preset];
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The equal-length window immediately preceding a range, for trend deltas. */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const span = Math.max(to - from, 1);
  return {
    from: new Date(from - span).toISOString(),
    to: new Date(from).toISOString(),
  };
}

export function isWithin(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(range.from).getTime() && t < new Date(range.to).getTime();
}

/**
 * Day-of-week and hour of an instant in a target IANA timezone.
 * Uses Intl so it stays correct across DST without a date library.
 */
export function zonedParts(iso: string, timeZone: string): { day: number; hour: number } {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const dayIndex = DAY_SHORT.indexOf(weekday as (typeof DAY_SHORT)[number]);
  const hour = Number(hourRaw) % 24;
  return { day: dayIndex >= 0 ? dayIndex : 0, hour: Number.isFinite(hour) ? hour : 0 };
}

/** YYYY-MM-DD bucket key in the given timezone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function hoursSince(iso: string, now = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000;
}

export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? h + ' AM' : h - 12 + ' PM';
}

/** Inclusive list of YYYY-MM-DD keys spanning a range (capped for safety). */
/**
 * Human label for a resolved range, e.g. for display under a KPI or empty
 * state. "All time" uses the epoch as its `from` value internally (see
 * resolveRange) - that is a sentinel for "no lower bound", never meant to be
 * shown to the user as a literal date, so it is special-cased here.
 */
export function formatRangeLabel(filter: FilterState, range: DateRange, timeZone?: string): string {
  if (filter.preset === 'all') return 'All time';
  return formatRangeDates(range, timeZone);
}

function formatRangeDates(range: DateRange, timeZone?: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(
      new Date(iso),
    );
  return fmt(range.from) + ' – ' + fmt(range.to);
}

export function enumerateDays(range: DateRange, timeZone: string, cap = 400): string[] {
  const out: string[] = [];
  const start = new Date(range.from).getTime();
  const end = new Date(range.to).getTime();
  const step = 24 * 60 * 60 * 1000;
  for (let t = start; t <= end && out.length < cap; t += step) {
    out.push(dayKey(new Date(t).toISOString(), timeZone));
  }
  const lastKey = dayKey(new Date(end).toISOString(), timeZone);
  if (out.length > 0 && out[out.length - 1] !== lastKey && out.length < cap) out.push(lastKey);
  return Array.from(new Set(out));
}
