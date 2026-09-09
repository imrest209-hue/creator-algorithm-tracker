import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { IMPORT_FIELDS } from '@/lib/csv/import';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, SectionHeading } from '@/components/ui/primitives';
import { ImportWizard } from '@/components/import/ImportWizard';

export const metadata: Metadata = { title: 'CSV import' };

export default async function ImportPage() {
  const viewer = await getViewer();

  return (
    <>
      <PageHeader
        title="CSV import"
        description="Upload analytics exports from YouTube Studio, TikTok, or your own spreadsheet. Columns are auto-mapped, previewed, and validated before anything is saved."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to import your own analytics.
        </Alert>
      ) : (
        <>
          <ImportWizard />
          <Card className="mt-4">
            <SectionHeading title="Recognised columns" description="Any of these header names are matched automatically." />
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-base-700">
                    <th className="th">Field</th>
                    <th className="th">Required</th>
                    <th className="th">Recognised headers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  {IMPORT_FIELDS.map((field) => (
                    <tr key={field.key}>
                      <td className="td font-medium">{field.label}</td>
                      <td className="td text-ink-muted">{field.required ? 'Yes' : 'No'}</td>
                      <td className="td text-xs text-ink-muted">{field.aliases.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
