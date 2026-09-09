import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { prisma } from '@/lib/db/prisma';
import { formatCompact, formatDate } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { PlatformBadge } from '@/components/ui/metrics';
import { AddCompetitorForm } from '@/components/competitors/AddCompetitorForm';

export const metadata: Metadata = { title: 'Reference creators' };

export default async function CompetitorsPage() {
  const viewer = await getViewer();

  const competitors = viewer.user
    ? await prisma.competitorAccount.findMany({
        where: { userId: viewer.user.id },
        include: { videos: { orderBy: { publishedAt: 'desc' }, take: 5 } },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Reference creators"
        description="Manually track public creators for context. This app never scrapes private data or bypasses platform restrictions - only what you enter, or what an official, authorized API returns for a public handle."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          <Link href="/register" className="link font-medium">
            Create an account
          </Link>{' '}
          to track reference creators.
        </Alert>
      ) : (
        <>
          <Card className="mb-4">
            <SectionHeading title="Add a creator" />
            <AddCompetitorForm />
          </Card>

          <Card>
            <SectionHeading title="Tracked creators" description={competitors.length + ' tracked'} />
            {competitors.length === 0 ? (
              <EmptyState title="No creators tracked yet" description="Add one above to get started." />
            ) : (
              <ul className="space-y-3">
                {competitors.map((c) => (
                  <li key={c.id} className="rounded-lg border border-base-800 bg-base-900/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={c.platform} />
                        <span className="font-medium">{c.displayName ?? '@' + c.handle}</span>
                        <span className="text-xs text-ink-muted">@{c.handle}</span>
                      </div>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-xs link">
                          View profile ↗
                        </a>
                      ) : null}
                    </div>
                    {c.notes ? <p className="mt-1 text-sm text-ink-muted">{c.notes}</p> : null}
                    {c.videos.length === 0 ? (
                      <p className="mt-2 text-xs text-ink-muted">
                        No videos recorded for this creator yet. API-based syncing for reference
                        creators requires a configured platform integration with public-data access.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                        {c.videos.map((v) => (
                          <li key={v.id} className="flex justify-between gap-2">
                            <span className="truncate">{v.title}</span>
                            <span className="whitespace-nowrap">
                              {formatDate(v.publishedAt.toISOString())} ·{' '}
                              {v.views === null ? '—' : formatCompact(Number(v.views))} views
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
