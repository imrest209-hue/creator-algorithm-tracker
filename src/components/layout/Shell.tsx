import Link from 'next/link';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { FilterState } from '@/lib/types';
import type { Viewer } from '@/lib/data/viewer';
import { Sidebar } from '@/components/layout/Sidebar';
import { FilterBar } from '@/components/layout/FilterBar';
import { Alert, Skeleton } from '@/components/ui/primitives';

/** Page chrome: sidebar, demo banner, page heading and the shared filter bar. */

export function DemoBanner({ demoPreview }: { demoPreview: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">
      <p>
        <span className="font-semibold">DEMO DATA</span> — every number on screen is synthetic and
        generated locally. It is not from YouTube or TikTok, and it is stored separately from real
        account data.
      </p>
      <div className="flex items-center gap-3">
        {demoPreview ? (
          <form action="/api/demo/exit" method="post">
            <button type="submit" className="font-semibold underline underline-offset-2">
              Switch back to my data
            </button>
          </form>
        ) : (
          <Link href="/register" className="font-semibold underline underline-offset-2">
            Create an account to track your own videos
          </Link>
        )}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  filter,
  actions,
  showFilter = true,
}: {
  title: string;
  description?: string;
  filter?: FilterState;
  actions?: ReactNode;
  showFilter?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {showFilter && filter ? (
        <Suspense fallback={<Skeleton className="h-9 w-96" />}>
          <FilterBar
            preset={filter.preset}
            platform={filter.platform}
            from={filter.from}
            to={filter.to}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<div className="fixed inset-y-0 left-0 w-60 border-r border-base-700 bg-base-900" />}>
        <Sidebar ownerLabel={viewer.dataset.ownerLabel} isDemo={viewer.isDemo} />
      </Suspense>

      <div className="lg:pl-60">
        {viewer.isDemo ? <DemoBanner demoPreview={viewer.demoPreview} /> : null}
        {viewer.loadError ? (
          <div className="px-4 pt-4 sm:px-6">
            <Alert tone="bad" title="Could not load your account data">
              {viewer.loadError} Your real data has not been replaced with demo data — fix the
              database connection and reload.
            </Alert>
          </div>
        ) : null}
        <main className="px-4 py-5 pt-14 sm:px-6 lg:pt-5">{children}</main>
      </div>
    </div>
  );
}
