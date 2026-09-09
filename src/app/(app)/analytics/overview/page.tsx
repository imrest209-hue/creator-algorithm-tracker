import Link from 'next/link';
import type { Metadata } from 'next';
import { PLATFORM_LABELS, type Platform } from '@/lib/types';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { buildDashboardSummary } from '@/lib/analytics/summary';
import { baselineForSet } from '@/lib/analytics/baselines';
import { analyseCategories } from '@/lib/analytics/content';
import { summariseRetention } from '@/lib/analytics/retention';
import { analyseEngagement } from '@/lib/analytics/engagement';
import { analyseTiming, describeBestWindow } from '@/lib/analytics/timing';
import { computePerformanceScore } from '@/lib/analytics/score';
import { formatCompact, formatDate, formatDuration, formatPercent } from '@/lib/util/format';
import { formatRangeLabel } from '@/lib/util/date';
import { PageHeader } from '@/components/layout/Shell';
import { Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { PlatformBadge, ScorePill, StatCard, TrendArrow } from '@/components/ui/metrics';
import { TrendAreaChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Account overview' };

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const { dataset } = viewer;
  const summary = buildDashboardSummary(
    set.videos,
    set.platformVideos,
    set.range,
    dataset.timezone,
    now,
  );
  const baseline = baselineForSet(set.platformVideos, now);
  const categories = analyseCategories(set.videos, now);
  const retention = summariseRetention(set.videos, now);
  const engagement = analyseEngagement(set.videos, now);
  const timing = analyseTiming(set.videos, dataset.timezone, now);

  if (dataset.videos.length === 0) {
    return (
      <>
        <PageHeader title="Account overview" filter={filter} />
        <EmptyState title="No videos tracked yet" />
      </>
    );
  }

  const ranked = [...set.videos]
    .map((v) => {
      const result = computePerformanceScore(v, set.platformVideos, now);
      return { video: v, score: result.score, confidence: result.confidence };
    })
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <PageHeader
        title="Account overview"
        description="Everything the scoring engine uses as its baseline, in one place."
        filter={filter}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Tracked videos"
          value={String(dataset.videos.length)}
          hint="Across every platform, ignoring the date filter."
        />
        <StatCard
          label="In selected range"
          value={String(set.videos.length)}
          footer={
            <span className="text-xs text-ink-muted">
              {formatRangeLabel(filter, set.range)}
            </span>
          }
        />
        <StatCard
          label="Baseline sample"
          value={String(baseline.sampleSize)}
          hint="How many of your videos the account-wide baseline is built from."
        />
        <StatCard
          label="Performance trend"
          value={summary.trend.label}
          footer={<TrendArrow direction={summary.trend.direction} />}
        />
      </div>

      <Card className="mt-4">
        <SectionHeading
          title="Views and engagement over time"
          description={summary.trend.detail}
        />
        {summary.timeSeries.length > 0 ? (
          <TrendAreaChart
            data={summary.timeSeries as unknown as Array<Record<string, string | number | null>>}
            series={[
              { key: 'views', label: 'Views' },
              { key: 'engagements', label: 'Engagements', color: '#34d399' },
            ]}
            height={280}
          />
        ) : (
          <EmptyState title="No data in range" />
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionHeading
            title="Your account baseline"
            description="The numbers every performance score is measured against."
          />
          <dl className="space-y-2 text-sm">
            <Row label="Median views" value={formatCompact(baseline.medianViews)} />
            <Row label="Mean views" value={formatCompact(baseline.meanViews)} />
            <Row
              label="Mean retention"
              value={baseline.meanRetention === null ? null : formatPercent(baseline.meanRetention)}
            />
            <Row
              label="Mean engagement rate"
              value={
                baseline.meanEngagementRate === null
                  ? null
                  : formatPercent(baseline.meanEngagementRate, 2)
              }
            />
            <Row
              label="Mean 3-hour velocity"
              value={
                baseline.meanEarlyVelocity === null
                  ? null
                  : baseline.meanEarlyVelocity.toFixed(1) + ' views/hr'
              }
            />
            <Row
              label="Mean CTR"
              value={
                baseline.meanClickThroughRate === null
                  ? null
                  : formatPercent(baseline.meanClickThroughRate, 2)
              }
            />
            <Row
              label="Mean duration"
              value={
                baseline.meanDurationSeconds === null
                  ? null
                  : formatDuration(baseline.meanDurationSeconds)
              }
            />
          </dl>
        </Card>

        <Card>
          <SectionHeading title="Per-platform" description="Performance by surface in this range." />
          {summary.platformBreakdown.length === 0 ? (
            <EmptyState title="No data in range" />
          ) : (
            <ul className="space-y-2">
              {summary.platformBreakdown.map((p) => (
                <li key={p.platform} className="rounded-lg border border-base-800 bg-base-900/50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.label}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{p.videos} videos</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-ink-muted">
                    <span>{formatCompact(p.views)} views</span>
                    <span>
                      avg score <span className="font-medium text-ink">{p.avgScore ?? '—'}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading title="Headline numbers" />
          <dl className="space-y-2 text-sm">
            <Row
              label="Retention coverage"
              value={retention.coverage.withData + ' / ' + retention.coverage.total + ' videos'}
            />
            <Row
              label="Avg retention"
              value={retention.avgRetention === null ? null : formatPercent(retention.avgRetention)}
            />
            <Row
              label="Avg engagement"
              value={
                engagement.avgEngagementRate === null
                  ? null
                  : formatPercent(engagement.avgEngagementRate, 2)
              }
            />
            <Row
              label="Followers gained"
              value={
                engagement.totalFollowersGained === null
                  ? null
                  : formatCompact(engagement.totalFollowersGained)
              }
            />
            <Row label="Top topic" value={categories[0]?.name ?? null} />
            <Row
              label="Best posting window"
              value={timing.hasEnoughData && !timing.message ? describeBestWindow(timing) : null}
            />
          </dl>
          {timing.message ? <p className="mt-2 text-xs text-warn">{timing.message}</p> : null}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RankCard title="Top performers" rows={ranked.slice(0, 8)} timezone={dataset.timezone} />
        <RankCard
          title="Weakest performers"
          rows={[...ranked].reverse().slice(0, 8)}
          timezone={dataset.timezone}
        />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value === null ? <Unavailable /> : value}</dd>
    </div>
  );
}

function RankCard({
  title,
  rows,
  timezone,
}: {
  title: string;
  rows: Array<{
    video: { id: string; title: string; platform: Platform; publishedAt: string; metrics: { views: number } };
    score: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  }>;
  timezone: string;
}) {
  return (
    <Card>
      <SectionHeading title={title} />
      {rows.length === 0 ? (
        <EmptyState title="No videos in range" />
      ) : (
        <ul className="space-y-1.5">
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
                <div className="mt-0.5 flex items-center gap-2">
                  <PlatformBadge platform={row.video.platform} />
                  <span className="text-[11px] text-ink-muted">
                    {formatDate(row.video.publishedAt, timezone)} ·{' '}
                    {formatCompact(row.video.metrics.views)} views
                  </span>
                </div>
              </div>
              <ScorePill score={row.score} confidence={row.confidence} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
