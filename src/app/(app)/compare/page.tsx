import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildComparison } from '@/lib/analytics/compare';
import { getViewer } from '@/lib/data/viewer';
import { HOOK_LABELS, type VideoRecord } from '@/lib/types';
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatPercent,
} from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { PlatformBadge, ScorePill } from '@/components/ui/metrics';

export const metadata: Metadata = { title: 'Compare videos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const viewer = await getViewer();
  const idsRaw = params.ids;
  const ids = (Array.isArray(idsRaw) ? idsRaw[0] : idsRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const videos = ids
    .map((id) => viewer.dataset.videos.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Compare videos"
        description="Select two or more videos from the video tracker to see them side by side, with possible reasons for the performance gap."
        showFilter={false}
        actions={
          <Link href="/videos" className="btn-ghost">
            ← Choose videos
          </Link>
        }
      />

      {videos.length < 2 ? (
        <EmptyState
          icon="⇄"
          title="Select at least two videos"
          description="Go to the video tracker, check two or more videos, and click Compare."
          action={
            <Link href="/videos" className="btn-primary mt-2">
              Go to video tracker
            </Link>
          }
        />
      ) : (
        <ComparisonView videoIds={videos.map((v) => v.id)} timezone={viewer.dataset.timezone} allVideos={viewer.dataset.videos} now={now} />
      )}
    </>
  );
}

function ComparisonView({
  videoIds,
  allVideos,
  timezone,
  now,
}: {
  videoIds: string[];
  allVideos: VideoRecord[];
  timezone: string;
  now: Date;
}) {
  const videos = videoIds
    .map((id) => allVideos.find((v) => v.id === id))
    .filter((v): v is VideoRecord => Boolean(v));
  const comparison = buildComparison(videos, allVideos, timezone, now);

  const rows: Array<{
    label: string;
    render: (entry: (typeof comparison.entries)[number]) => ReactNode;
  }> = [
    { label: 'Platform', render: (e) => <PlatformBadge platform={e.video.platform} /> },
    { label: 'Topic', render: (e) => e.video.categoryName },
    { label: 'Hook style', render: (e) => HOOK_LABELS[e.video.hookType] },
    { label: 'Length', render: (e) => formatDuration(e.video.durationSeconds) },
    { label: 'Posted', render: (e) => formatDate(e.video.publishedAt, timezone) + ' · ' + e.postingLabel },
    { label: 'Views', render: (e) => formatCompact(e.video.metrics.views) },
    {
      label: 'Retention',
      render: (e) => (e.derived.retention === null ? <Unavailable short /> : formatPercent(e.derived.retention)),
    },
    {
      label: 'Engagement rate',
      render: (e) => (e.derived.engagementRate === null ? <Unavailable short /> : formatPercent(e.derived.engagementRate, 2)),
    },
    {
      label: 'View velocity',
      render: (e) =>
        e.velocity.headlineMultiplier === null ? (
          <Unavailable short reason="No velocity snapshots." />
        ) : (
          e.velocity.headlineMultiplier.toFixed(1) + 'x'
        ),
    },
    {
      label: 'Follower conversion',
      render: (e) =>
        e.derived.followerConversion === null ? (
          <Unavailable short />
        ) : (
          formatPercent(e.derived.followerConversion, 3)
        ),
    },
    { label: 'Performance score', render: (e) => <ScorePill score={e.score.score} confidence={e.score.confidence} /> },
  ];

  return (
    <>
      <Card>
        <SectionHeading
          title="Side by side"
          description={
            comparison.leaderIndex !== null
              ? comparison.entries[comparison.leaderIndex].video.title + ' has the highest performance score of this set.'
              : undefined
          }
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-base-700">
                <th className="th">Metric</th>
                {comparison.entries.map((entry, i) => (
                  <th key={entry.video.id} className="th max-w-[220px]">
                    <Link
                      href={'/videos/' + entry.video.id}
                      className="block truncate font-medium normal-case tracking-normal text-ink hover:text-brand-300"
                      title={entry.video.title}
                    >
                      {entry.video.title}
                    </Link>
                    {i === comparison.leaderIndex ? <Badge tone="good">Leader</Badge> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800">
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="td font-medium text-ink-muted">{row.label}</td>
                  {comparison.entries.map((entry) => (
                    <td key={entry.video.id} className="td">
                      {row.render(entry)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <SectionHeading
          title="Possible reasons for the gap"
          description="Correlations in your own stored metrics, ranked by size of the gap."
        />
        {comparison.reasons.length === 0 ? (
          <EmptyState title="No clear differentiators" description="These videos are close on every measured metric." />
        ) : (
          <ul className="space-y-1.5">
            {comparison.reasons.map((reason, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-muted">
                <span aria-hidden className="text-brand-400">
                  •
                </span>
                <span>{reason.text}</span>
              </li>
            ))}
          </ul>
        )}
        <Alert tone="info" className="mt-3">
          {comparison.caveat}
        </Alert>
      </Card>
    </>
  );
}
