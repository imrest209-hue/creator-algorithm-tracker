import Link from 'next/link';
import type { Metadata } from 'next';
import type { Platform } from '@/lib/types';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import {
  retentionByDuration,
  retentionOutliers,
  summariseRetention,
} from '@/lib/analytics/retention';
import { formatCompact, formatDuration, formatMinutes, formatPercent } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { PlatformBadge, StatCard } from '@/components/ui/metrics';
import { CorrelationScatter, SimpleBarChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Retention' };

export default async function RetentionPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter, set, now } = await getPageContext(searchParams);
  const videos = set.videos;
  const summary = summariseRetention(videos, now);
  const shortBands = retentionByDuration(videos, 'short', now);
  const longBands = retentionByDuration(videos, 'long', now);
  const outliers = retentionOutliers(videos, now);

  if (videos.length === 0) {
    return (
      <>
        <PageHeader title="Retention" filter={filter} />
        <EmptyState title="No videos in this range" />
      </>
    );
  }

  const scatter = videos
    .filter((v) => v.metrics.averagePercentageViewed !== null)
    .map((v) => ({
      x: v.durationSeconds,
      y: v.metrics.averagePercentageViewed as number,
      z: v.metrics.views,
      name: v.title,
    }));

  return (
    <>
      <PageHeader
        title="Retention"
        description="How much of each video people actually watch. Built on average percentage viewed and average view duration."
        filter={filter}
      />

      {summary.unavailableNote ? (
        <Alert tone="warn" title="Retention data unavailable">
          {summary.unavailableNote}
        </Alert>
      ) : (
        <Alert tone="info">
          Retention is available for {summary.coverage.withData} of {summary.coverage.total} videos
          in this range. Videos without it are excluded from retention averages rather than counted
          as zero.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Avg retention"
          value={summary.avgRetention === null ? null : formatPercent(summary.avgRetention)}
          unavailableNote="No video in this range reports retention."
          hint="Average percentage of the video watched."
        />
        <StatCard
          label="Avg view duration"
          value={
            summary.avgViewDurationSeconds === null
              ? null
              : formatDuration(summary.avgViewDurationSeconds)
          }
          unavailableNote="No video in this range reports average view duration."
        />
        <StatCard
          label="Total watch time"
          value={
            summary.totalWatchTimeMinutes === null
              ? null
              : formatMinutes(summary.totalWatchTimeMinutes)
          }
          unavailableNote="Watch time is not reported for these videos."
        />
        <StatCard
          label="Coverage"
          value={summary.coverage.withData + ' / ' + summary.coverage.total}
          hint="Videos with retention data, out of all videos in range."
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Retention by length (short-form)"
            description="TikTok and Shorts, grouped by duration."
          />
          {shortBands.some((b) => b.avgRetention !== null) ? (
            <SimpleBarChart
              data={shortBands.map((b) => ({ label: b.label, retention: b.avgRetention ?? 0 }))}
              bars={[{ key: 'retention', label: 'Avg retention %' }]}
              xKey="label"
              format="percent"
              height={220}
            />
          ) : (
            <EmptyState title="No short-form retention data in range" />
          )}
          <BandLegend bands={shortBands} />
        </Card>

        <Card>
          <SectionHeading
            title="Retention by length (long-form)"
            description="YouTube uploads, grouped by duration."
          />
          {longBands.some((b) => b.avgRetention !== null) ? (
            <SimpleBarChart
              data={longBands.map((b) => ({ label: b.label, retention: b.avgRetention ?? 0 }))}
              bars={[{ key: 'retention', label: 'Avg retention %', color: '#a78bfa' }]}
              xKey="label"
              format="percent"
              height={220}
            />
          ) : (
            <EmptyState title="No long-form retention data in range" />
          )}
          <BandLegend bands={longBands} />
        </Card>
      </div>

      {scatter.length > 0 ? (
        <Card className="mt-4">
          <SectionHeading
            title="Length vs retention"
            description="Each dot is a video; bubble size is view count. Use it to find the length where your retention starts to fall off."
          />
          <CorrelationScatter data={scatter} xLabel="Duration (seconds)" yLabel="Retention (%)" />
        </Card>
      ) : null}

      {outliers.average !== null ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <OutlierCard
            title="Best retention"
            description={'Furthest above your ' + outliers.average + '% average.'}
            rows={outliers.best}
            tone="good"
          />
          <OutlierCard
            title="Weakest retention"
            description={'Furthest below your ' + outliers.average + '% average.'}
            rows={outliers.worst}
            tone="bad"
          />
        </div>
      ) : null}
    </>
  );
}

function BandLegend({
  bands,
}: {
  bands: Array<{ label: string; videoCount: number; avgViews: number | null; avgViewDurationSeconds: number | null }>;
}) {
  const withData = bands.filter((b) => b.videoCount > 0);
  if (withData.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs text-ink-muted">
      {withData.map((b) => (
        <li key={b.label} className="flex justify-between gap-3">
          <span>{b.label}</span>
          <span className="tabular-nums">
            {b.videoCount} videos · {formatCompact(b.avgViews)} avg views ·{' '}
            {b.avgViewDurationSeconds === null
              ? 'duration n/a'
              : formatDuration(b.avgViewDurationSeconds) + ' avg watched'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OutlierCard({
  title,
  description,
  rows,
  tone,
}: {
  title: string;
  description: string;
  rows: Array<{ video: { id: string; title: string; platform: Platform }; retention: number; deltaVsAverage: number }>;
  tone: 'good' | 'bad';
}) {
  return (
    <Card>
      <SectionHeading title={title} description={description} />
      {rows.length === 0 ? (
        <EmptyState title="No retention data" />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.video.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={'/videos/' + row.video.id}
                  className="block truncate text-sm hover:text-brand-300"
                  title={row.video.title}
                >
                  {row.video.title}
                </Link>
                <PlatformBadge platform={row.video.platform} />
              </div>
              <div className="whitespace-nowrap text-right text-sm tabular-nums">
                <span className="font-medium">{formatPercent(row.retention)}</span>
                <span className={tone === 'good' ? 'ml-2 text-good' : 'ml-2 text-bad'}>
                  {row.deltaVsAverage > 0 ? '+' : ''}
                  {row.deltaVsAverage}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
