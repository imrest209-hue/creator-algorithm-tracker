'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import type { PlatformFilter, RangePreset } from '@/lib/types';
import { PLATFORM_FILTER_OPTIONS } from '@/lib/analytics/filter';
import { RANGE_PRESET_LABELS } from '@/lib/util/date';

/**
 * Date-range and platform filter. State lives in the URL so every server
 * component on the page reads the same filter and the view is shareable.
 */

const PRESETS: RangePreset[] = ['7d', '30d', '90d', '365d', 'all'];

export function FilterBar({
  preset,
  platform,
  from,
  to,
}: {
  preset: RangePreset;
  platform: PlatformFilter;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(preset === 'custom');
  const [customFrom, setCustomFrom] = useState(from?.slice(0, 10) ?? '');
  const [customTo, setCustomTo] = useState(to?.slice(0, 10) ?? '');

  const update = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => {
      router.push(pathname + '?' + params.toString(), { scroll: false });
    });
  };

  return (
    <div className={clsx('flex flex-wrap items-center gap-2', pending && 'opacity-70')}>
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-base-700 bg-base-850 p-1"
        role="group"
        aria-label="Date range"
      >
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setCustomOpen(false);
              update({ range: value, from: undefined, to: undefined });
            }}
            aria-pressed={preset === value}
            className={clsx(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              preset === value ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-base-800 hover:text-ink',
            )}
          >
            {RANGE_PRESET_LABELS[value]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          aria-pressed={preset === 'custom'}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            preset === 'custom' ? 'bg-brand-500 text-white' : 'text-ink-muted hover:bg-base-800 hover:text-ink',
          )}
        >
          Custom
        </button>
      </div>

      <select
        aria-label="Platform"
        value={platform}
        onChange={(e) => update({ platform: e.target.value })}
        className="input h-[34px] w-auto py-1 text-xs"
      >
        {PLATFORM_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {customOpen ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-base-700 bg-base-850 px-2 py-1">
          <label className="sr-only" htmlFor="range-from">
            From
          </label>
          <input
            id="range-from"
            type="date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="input h-[26px] w-auto px-2 py-0 text-xs"
          />
          <span className="text-xs text-ink-muted">to</span>
          <label className="sr-only" htmlFor="range-to">
            To
          </label>
          <input
            id="range-to"
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className="input h-[26px] w-auto px-2 py-0 text-xs"
          />
          <button
            type="button"
            disabled={!customFrom || !customTo}
            onClick={() => update({ range: 'custom', from: customFrom, to: customTo })}
            className="btn-primary h-[26px] px-2 py-0 text-xs"
          >
            Apply
          </button>
        </div>
      ) : null}
    </div>
  );
}
