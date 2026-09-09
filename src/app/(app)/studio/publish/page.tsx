import Link from 'next/link';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/data/viewer';
import { hasUploadScope } from '@/lib/integrations/youtube';
import { analyseTiming, describeBestWindow, MIN_TOTAL_SAMPLE } from '@/lib/analytics/timing';
import { prisma, isDatabaseConfigured } from '@/lib/db/prisma';
import { formatDateTime } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, SectionHeading, type Tone } from '@/components/ui/primitives';
import { PublishWizard } from '@/components/studio/PublishWizard';

export const metadata: Metadata = { title: 'Publish to YouTube' };

const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  UPLOADING_VIDEO: 'info',
  SETTING_THUMBNAIL: 'info',
  SAVING: 'info',
  DONE: 'good',
  FAILED: 'bad',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Queued',
  UPLOADING_VIDEO: 'Uploading',
  SETTING_THUMBNAIL: 'Setting thumbnail',
  SAVING: 'Saving',
  DONE: 'Published',
  FAILED: 'Failed',
};

export default async function PublishPage() {
  const viewer = await getViewer();

  const youtubeAccounts = viewer.dataset.connectedAccounts.filter(
    (account) => account.platform === 'YOUTUBE' && account.status === 'CONNECTED',
  );
  const publishableAccount = youtubeAccounts.find((account) => hasUploadScope(account.scopes));

  // Reuses the same account-only timing analysis as the Timing analytics page -
  // never generic "best time to post" advice, only this creator's own history,
  // and only shown once there's actually enough of it to say something real.
  const timing = analyseTiming(viewer.dataset.videos, viewer.dataset.timezone);
  const timingHint = viewer.dataset.videos.length >= MIN_TOTAL_SAMPLE ? describeBestWindow(timing) : null;

  const recentJobs =
    viewer.user && isDatabaseConfigured()
      ? await prisma.publishJob.findMany({
          where: { userId: viewer.user.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [];

  return (
    <>
      <PageHeader
        title="Publish to YouTube"
        description="Upload a finished video and thumbnail. It's saved to your YouTube channel and tracked here automatically."
        showFilter={false}
      />

      {viewer.isDemo ? (
        <Alert tone="warn" title="Demo mode is read-only">
          You&apos;re viewing demo data.{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>{' '}
          to publish your own videos.
        </Alert>
      ) : youtubeAccounts.length === 0 ? (
        <Alert tone="info" title="Connect YouTube first">
          You need a connected YouTube account before you can publish.{' '}
          <Link href="/settings" className="link">
            Go to Settings
          </Link>
          .
        </Alert>
      ) : !publishableAccount ? (
        <Alert tone="warn" title="One more permission needed">
          Publishing needs upload access, which your connected YouTube account doesn&apos;t have yet. Reconnect to
          grant it - your existing read-only access stays intact.{' '}
          <a href="/api/connect/youtube?scope=upload" className="link">
            Reconnect YouTube
          </a>
          .
        </Alert>
      ) : (
        <PublishWizard connectedAccountId={publishableAccount.id} timingHint={timingHint} />
      )}

      {recentJobs.length > 0 ? (
        <Card className="mt-4">
          <SectionHeading title="Recent publishes" description="Your last few upload attempts from Studio." />
          <ul className="space-y-2">
            {recentJobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{job.title}</p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(job.createdAt.toISOString())}
                    {job.errorMessage ? ' · ' + job.errorMessage : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={STATUS_TONE[job.status] ?? 'neutral'}>{STATUS_LABEL[job.status] ?? job.status}</Badge>
                  {job.status === 'DONE' && job.resultVideoId ? (
                    <a
                      href={'https://www.youtube.com/watch?v=' + job.resultVideoId}
                      target="_blank"
                      rel="noreferrer"
                      className="link text-xs"
                    >
                      View on YouTube
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
