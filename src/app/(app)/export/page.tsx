import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, SectionHeading } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Export' };

export default async function ExportPage() {
  const viewer = await getViewer();

  return (
    <>
      <PageHeader
        title="Export"
        description="Download every tracked video with its raw metrics and computed analytics (performance score, viral potential, velocity, engagement rate)."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" className="mb-4">
          You&apos;re exporting demo data — every row will be clearly synthetic.
        </Alert>
      ) : null}

      <Card>
        <SectionHeading title={viewer.dataset.videos.length + ' videos available to export'} />
        <div className="flex flex-wrap gap-3">
          <a href="/api/export?format=csv" className="btn-primary">
            Download CSV
          </a>
          <a href="/api/export?format=json" className="btn-ghost">
            Download JSON
          </a>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          CSV includes one row per video with raw metrics plus derived fields (engagement rate,
          velocity multiplier, performance score, viral potential score). JSON includes the same
          fields as structured objects.
        </p>
      </Card>
    </>
  );
}
