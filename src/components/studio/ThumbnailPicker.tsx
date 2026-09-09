'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { IconCheck } from '@/components/studio/icons';

interface SavedThumbnail {
  id: string;
  url: string;
  width: number;
  height: number;
}

export function ThumbnailPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [thumbnails, setThumbnails] = useState<SavedThumbnail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/studio/thumbnails')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setThumbnails(data.thumbnails ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your saved thumbnails.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-xs text-bad">{error}</p>;
  if (!thumbnails) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-video animate-pulse rounded-lg bg-base-800" />
        ))}
      </div>
    );
  }
  if (thumbnails.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        No saved thumbnails yet.{' '}
        <Link href="/studio/thumbnails" className="link">
          Make one in the editor
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {thumbnails.map((thumb) => {
        const selected = selectedId === thumb.id;
        return (
          <button
            key={thumb.id}
            type="button"
            onClick={() => onSelect(selected ? null : thumb.id)}
            className={clsx(
              'group relative aspect-video overflow-hidden rounded-lg border-2 transition-all',
              selected
                ? 'border-brand-500 shadow-lg shadow-brand-500/10'
                : 'border-transparent hover:border-base-600',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated route, not an optimizable remote source */}
            <img src={thumb.url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            <div
              className={clsx(
                'absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity',
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {selected ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                  <IconCheck width={14} height={14} />
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
