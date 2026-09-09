import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { prisma, isDatabaseConfigured } from '@/lib/db/prisma';
import { formatDateTime } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, SectionHeading, Badge } from '@/components/ui/primitives';
import { ResearchPanel } from '@/components/research/ResearchPanel';

export const metadata: Metadata = { title: 'Research' };

export default async function ResearchPage() {
  const viewer = await getViewer();

  const recent =
    viewer.user && isDatabaseConfigured()
      ? await prisma.researchQuery.findMany({
          where: { userId: viewer.user.id },
          orderBy: { createdAt: 'desc' },
          take: 6,
        })
      : [];

  return (
    <>
      <PageHeader
        title="Research"
        description="Ask anything and get an answer built from live web sources - separate from your analytics, which stay measured-only."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to use the research assistant.
        </Alert>
      ) : (
        <>
          <ResearchPanel />

          {recent.length > 0 ? (
            <Card className="mt-4">
              <SectionHeading title="Recent questions" description="Your last few searches and how they were answered." />
              <ul className="space-y-2">
                {recent.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{entry.question}</p>
                      <p className="text-xs text-ink-muted">{formatDateTime(entry.createdAt.toISOString())}</p>
                    </div>
                    <Badge tone={entry.answer ? 'brand' : 'neutral'}>
                      {entry.engine.startsWith('ollama:') ? entry.engine.replace('ollama:', 'Local · ') : 'Search only'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
