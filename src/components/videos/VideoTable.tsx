'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { VideoRow } from '@/lib/analytics/rows';
import { HOOK_LABELS } from '@/lib/types';
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatPercent,
} from '@/lib/util/format';
import { EmptyState, Unavailable } from '@/components/ui/primitives';
import { PlatformBadge, ScorePill, SourceBadge } from '@/components/ui/metrics';

/** Sortable, searchable video table with client-side paging. */

type SortKey =
  | 'publishedAt'
  | 'views'
  | 'retention'
  | 'engagementRate'
  | 'velocityMultiplier'
  | 'score'
  | 'viralScore'
  | 'durationSeconds'
  | 'followersGained';

const COLUMNS: Array<{ key: SortKey | 'title' | 'platform' | 'category'; label: string; numeric?: boolean; sortable?: boolean; hint?: string }> = [
  { key: 'title', label: 'Video' },
  { key: 'platform', label: 'Platform' },
  { key: 'category', label: 'Topic' },
  { key: 'publishedAt', label: 'Published', sortable: true },
  { key: 'durationSeconds', label: 'Length', numeric: true, sortable: true },
  { key: 'views', label: 'Views', numeric: true, sortable: true },
  { key: 'retention', label: 'Retention', numeric: true, sortable: true, hint: 'Average percentage viewed' },
  { key: 'engagementRate', label: 'Engagement', numeric: true, sortable: true },
  { key: 'velocityMultiplier', label: 'Velocity', numeric: true, sortable: true, hint: 'Views vs your average at the latest measured milestone' },
  { key: 'followersGained', label: 'Followers', numeric: true, sortable: true },
  { key: 'viralScore', label: 'Viral', numeric: true, sortable: true, hint: 'Early-signal score, 0-100' },
  { key: 'score', label: 'Score', numeric: true, sortable: true, hint: 'Performance score, 0-100' },
];

const PAGE_SIZE = 25;

export function VideoTable({
  rows,
  timezone,
  selectable = false,
  compareQuery,
}: {
  rows: VideoRow[];
  timezone: string;
  selectable?: boolean;
  compareQuery?: string;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('publishedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.categoryName.toLowerCase().includes(q) ||
            r.hashtags.some((h) => h.toLowerCase().includes(q)) ||
            (r.hookText ?? '').toLowerCase().includes(q),
        )
      : rows;

    const sorted = [...matched].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      // Rows with no value for the sort column always sink to the bottom.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return direction === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [rows, query, sortKey, direction]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDirection('desc');
    }
    setPage(0);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-4),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search titles, topics, hashtags, hooks…"
          aria-label="Search videos"
          className="input max-w-xs"
        />
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span>
            {filtered.length} of {rows.length} videos
          </span>
          {selectable && selected.length >= 2 ? (
            <Link
              href={
                '/compare?ids=' + selected.join(',') + (compareQuery ? '&' + compareQuery : '')
              }
              className="btn-primary px-2 py-1 text-xs"
            >
              Compare {selected.length} videos →
            </Link>
          ) : null}
          {selectable && selected.length === 1 ? (
            <span className="text-ink-muted">Select at least 2 to compare</span>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No videos match"
          description={query ? 'Try a different search term.' : 'Add or import videos to populate this table.'}
        />
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="border-b border-base-700">
                  {selectable ? <th className="th w-8" aria-label="Select" /> : null}
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={clsx('th', col.numeric && 'text-right')}
                      title={col.hint}
                      aria-sort={
                        col.sortable && sortKey === col.key
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key as SortKey)}
                          className="inline-flex items-center gap-1 hover:text-ink"
                        >
                          {col.label}
                          {sortKey === col.key ? (
                            <span aria-hidden>{direction === 'asc' ? '↑' : '↓'}</span>
                          ) : null}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {visible.map((row) => (
                  <tr key={row.id} className="hover:bg-base-850/60">
                    {selectable ? (
                      <td className="td">
                        <input
                          type="checkbox"
                          checked={selected.includes(row.id)}
                          onChange={() => toggleSelected(row.id)}
                          aria-label={'Select ' + row.title}
                          className="h-4 w-4 rounded border-base-600 bg-base-900 accent-brand-500"
                        />
                      </td>
                    ) : null}
                    <td className="td max-w-[300px]">
                      <Link
                        href={'/videos/' + row.id}
                        className="block truncate font-medium hover:text-brand-300"
                        title={row.title}
                      >
                        {row.title}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <SourceBadge source={row.source} />
                        <span className="truncate text-[11px] text-ink-muted" title={HOOK_LABELS[row.hookType]}>
                          {HOOK_LABELS[row.hookType]}
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <PlatformBadge platform={row.platform} />
                    </td>
                    <td className="td text-ink-muted">{row.categoryName}</td>
                    <td className="td text-ink-muted">{formatDate(row.publishedAt, timezone)}</td>
                    <td className="td text-right tabular-nums">{formatDuration(row.durationSeconds)}</td>
                    <td className="td text-right tabular-nums">{formatCompact(row.views)}</td>
                    <td className="td text-right tabular-nums">
                      {row.retention === null ? <Unavailable short reason="Retention not available." /> : formatPercent(row.retention)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.engagementRate === null ? <Unavailable short /> : formatPercent(row.engagementRate, 2)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.velocityMultiplier === null ? (
                        <Unavailable short reason="No velocity snapshots recorded." />
                      ) : (
                        <span
                          className={clsx(
                            row.velocityMultiplier >= 1.5 && 'text-good',
                            row.velocityMultiplier <= 0.6 && 'text-bad',
                          )}
                          title={'Measured at the ' + (row.velocityLabel ?? 'latest') + ' mark'}
                        >
                          {row.velocityMultiplier.toFixed(1)}x
                        </span>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {row.followersGained === null ? (
                        <Unavailable short reason="Follower attribution not available." />
                      ) : (
                        formatCompact(row.followersGained)
                      )}
                    </td>
                    <td className="td text-right">
                      <ScorePill score={row.viralScore} kind="viral" confidence={row.viralConfidence} />
                    </td>
                    <td className="td text-right">
                      <ScorePill score={row.score} confidence={row.scoreConfidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function sortValue(row: VideoRow, key: SortKey): number | null {
  switch (key) {
    case 'publishedAt':
      return new Date(row.publishedAt).getTime();
    case 'views':
      return row.views;
    case 'retention':
      return row.retention;
    case 'engagementRate':
      return row.engagementRate;
    case 'velocityMultiplier':
      return row.velocityMultiplier;
    case 'score':
      return row.score;
    case 'viralScore':
      return row.viralScore;
    case 'durationSeconds':
      return row.durationSeconds;
    case 'followersGained':
      return row.followersGained;
    default:
      return null;
  }
}
