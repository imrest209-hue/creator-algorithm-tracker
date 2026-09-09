import type { Metadata } from 'next';
import Link from 'next/link';
import { getViewer } from '@/lib/data/viewer';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card } from '@/components/ui/primitives';
import { VideoForm } from '@/components/videos/VideoForm';

export const metadata: Metadata = { title: 'Add video' };

export default async function NewVideoPage() {
  const viewer = await getViewer();

  return (
    <>
      <PageHeader
        title="Add a video manually"
        description="Use this when API data is not available. Leave any metric field blank if you do not have it - it will show as unavailable rather than zero."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to add and track your own videos.
        </Alert>
      ) : (
        <Card>
          <VideoForm />
        </Card>
      )}
    </>
  );
}
