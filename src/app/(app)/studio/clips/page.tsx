import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { ffmpegPath } from '@/lib/video/ffmpeg';
import { PageHeader } from '@/components/layout/Shell';
import { Alert } from '@/components/ui/primitives';
import { ClipEditor } from '@/components/studio/ClipEditor';

export const metadata: Metadata = { title: 'Clip editor' };

export default async function ClipsPage() {
  const viewer = await getViewer();
  const ffmpeg = viewer.isDemo ? null : await ffmpegPath();

  return (
    <>
      <PageHeader
        title="Clip editor"
        description="Trim a gameplay clip, reframe it for Shorts, burn in a caption, and send it straight to publish."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to edit your own clips.
        </Alert>
      ) : !ffmpeg ? (
        <Alert tone="warn" title="FFmpeg is not installed">
          Clip rendering shells out to FFmpeg, which wasn&apos;t found on this machine. Install it with{' '}
          <code className="rounded bg-base-900 px-1 py-0.5 text-xs">winget install Gyan.FFmpeg</code>, then restart
          the app. Everything else in Studio works without it.
        </Alert>
      ) : (
        <ClipEditor />
      )}
    </>
  );
}
