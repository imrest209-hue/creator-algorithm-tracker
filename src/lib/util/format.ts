/** Display formatting helpers. Pure, so they are safe on client and server. */

const DASH = '—';

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

export function formatCompact(value: number | null | undefined, fallback = DASH): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return trim(value / 1_000_000_000) + 'B';
  if (abs >= 1_000_000) return trim(value / 1_000_000) + 'M';
  if (abs >= 1_000) return trim(value / 1_000) + 'K';
  return String(Math.round(value));
}

export function formatNumber(value: number | null | undefined, fallback = DASH): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
  fallback = DASH,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toFixed(decimals) + '%';
}

/** Formats a ratio delta (0.32) as "+32%". */
export function formatDelta(value: number | null | undefined, fallback = DASH): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const pct = value * 100;
  const sign = pct > 0 ? '+' : '';
  return sign + pct.toFixed(Math.abs(pct) >= 100 ? 0 : 1) + '%';
}

/** Formats a multiplier (3.2) as "3.2x". */
export function formatMultiplier(value: number | null | undefined, fallback = DASH): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value.toFixed(1) + 'x';
}

export function formatDuration(seconds: number | null | undefined, fallback = DASH): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return fallback;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return h + ':' + mm + ':' + ss;
  return m + ':' + ss;
}

export function formatMinutes(minutes: number | null | undefined, fallback = DASH): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return fallback;
  if (minutes >= 60) {
    const hours = minutes / 60;
    return (hours >= 100 ? String(Math.round(hours)) : hours.toFixed(1)) + ' hrs';
  }
  return minutes.toFixed(1) + ' min';
}

export function formatDate(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(d);
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(d);
}

export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.round(days / 30);
  if (months < 12) return months + 'mo ago';
  return Math.round(months / 12) + 'y ago';
}
