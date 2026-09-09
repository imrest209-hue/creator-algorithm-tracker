import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { PageHeader } from '@/components/layout/Shell';
import { Alert } from '@/components/ui/primitives';
import { ThumbnailStudioClient } from '@/components/studio/ThumbnailStudioClient';

export const metadata: Metadata = { title: 'Thumbnail editor' };

export default async function ThumbnailEditorPage() {
  const viewer = await getViewer();

  return (
    <>
      <PageHeader
        title="Thumbnail editor"
        description="Upload a base image, add text or a highlight shape, and export at the exact size your platform expects."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to save thumbnails.
        </Alert>
      ) : (
        <ThumbnailStudioClient />
      )}
    </>
  );
}
