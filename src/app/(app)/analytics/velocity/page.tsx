import Link from 'next/link';
import type { Metadata } from 'next';
import { VELOCITY_MILESTONE_LABELS, VELOCITY_MILESTONES } from '@/lib/types';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import {
  analyseVelocity,
  findContinuedGrowthCandidates,
  milestoneBaselines,
} from '@/lib/analytics/velocity';
import { viralWatchlist } from '@/lib/analytics/recommendations';
import { formatCompact, formatDate } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { ConfidenceBadge, PlatformBadge, ScorePill } from '@/components/ui/metrics';

export const metadata: Metadata = { title: 'Velocity' };

export default async function VelocityPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const videos = set.videos;
  const baselines = milestoneBaselines(set.platformVideos);
  const growthCandidates = findContinuedGrowthCandidates(videos, now).slice(0, 6);
  const watchlist = viralWatchlist(videos, now, 6);

  const withAlerts = videos
    .map((video) => ({ video, analysis: analyseVelocity(video, set.platformVideos, now) }))
    .filter((entry) => entry.analysis.alerts.some((a) => a.id !== 'no-snapshots'))
    .sort(
      (a, b) => (b.analysis.headlineMultiplier ?? 0) - (a.analysis.headlineMultiplier ?? 0),
    )
    .slice(0, 8);

  if (videos.length === 0) {
    return (
      <>
        <PageHeader title="Velocity" filter={filter} />
        <EmptyState title="No videos in this range" />
      </>
    );
  }

  const snapshotCoverage = videos.filter((v) => v.snapshots.length > 0).length;

  return (
    <>
      <PageHeader
        title="View velocity"
        description="How fast each video gathers views after publish, compared with your own historical pace at the same milestone."
        filter={filter}
      />

      {snapshotCoverage === 0 ? (
        <Alert tone="warn" title="No velocity snapshots recorded">
          Velocity needs view counts captured at fixed milestones after publish. Import them via CSV
          or record them when adding a video. Nothing on this page is estimated.
        </Alert>
      ) : (
        <Alert tone="info">
          {snapshotCoverage} of {videos.length} videos in this range have velocity snapshots.
          Milestones without a snapshot are left blank rather than interpolated.
        </Alert>
      )}

      <Card className="mt-4">
        <SectionHeading
          title="Your average pace"
          description="Mean views at each milestone across the videos that have snapshots. This is the baseline every velocity comparison uses."
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-base-700">
                {VELOCITY_MILESTONES.map((m) => (
                  <th key={m} className="th text-right">
                    {VELOCITY_MILESTONE_LABELS[m]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {VELOCITY_MILESTONES.map((m) => {
                  const value = baselines.get(m) ?? null;
                  return (
                    <td key={m} className="td text-right tabular-nums">
                      {value === null ? <Unavailable short /> : formatCompact(value)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Active alerts"
            description="Rule-based observations about measured early performance."
          />
          {withAlerts.length === 0 ? (
            <EmptyState title="No alerts" description="No video in this range triggered a velocity rule." />
          ) : (
            <ul className="space-y-2">
              {withAlerts.map(({ video, analysis }) => (
                <li key={video.id} className="rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5">
                  <Link
                    href={'/videos/' + video.id}
                    className="block truncate text-sm font-medium hover:text-brand-300"
                    title={video.title}
                  >
                    {video.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <PlatformBadge platform={video.platform} />
                    <span className="text-xs text-ink-muted">
                      {formatDate(video.publishedAt, viewer.dataset.timezone)}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {analysis.alerts
                      .filter((a) => a.id !== 'no-snapshots')
                      .map((alert) => (
                        <li key={alert.id} className="text-xs leading-relaxed text-ink-muted">
                          <span aria-hidden className="mr-1">
                            {alert.icon}
                          </span>
                          {alert.message}
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Likely to keep gaining views"
            description="Videos whose later milestones are outpacing their early ones relative to your baseline — long-tail behaviour rather than a spike."
          />
          {growthCandidates.length === 0 ? (
            <EmptyState
              title="No long-tail candidates"
              description="No video in this range is accelerating after its first hours."
            />
          ) : (
            <ul className="space-y-2">
              {growthCandidates.map((candidate) => (
                <li
                  key={candidate.video.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={'/videos/' + candidate.video.id}
                      className="block truncate text-sm hover:text-brand-300"
                      title={candidate.video.title}
                    >
                      {candidate.video.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {candidate.earlyMultiplier.toFixed(1)}x early →{' '}
                      {candidate.lateMultiplier.toFixed(1)}x after 24h
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs font-medium tabular-nums text-good">
                    {candidate.accelerationRatio.toFixed(1)}x accel
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeading
          title="Viral potential watchlist"
          description="Ranked by early-signal score. This describes measured early performance relative to your history — it is not a prediction."
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-base-700">
                <th className="th">Video</th>
                <th className="th">Platform</th>
                <th className="th">Published</th>
                <th className="th text-right">Viral potential</th>
                <th className="th">Confidence</th>
                <th className="th">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800">
              {watchlist.map((item) => (
                <tr key={item.video.id} className="hover:bg-base-850/60">
                  <td className="td max-w-[240px]">
                    <Link
                      href={'/videos/' + item.video.id}
                      className="block truncate hover:text-brand-300"
                      title={item.video.title}
                    >
                      {item.video.title}
                    </Link>
                  </td>
                  <td className="td">
                    <PlatformBadge platform={item.video.platform} />
                  </td>
                  <td className="td text-ink-muted">
                    {formatDate(item.video.publishedAt, viewer.dataset.timezone)}
                  </td>
                  <td className="td text-right">
                    <ScorePill score={item.viralScore} kind="viral" confidence={item.confidence} />
                  </td>
                  <td className="td">
                    <ConfidenceBadge confidence={item.confidence} />
                  </td>
                  <td className="td max-w-[280px] whitespace-normal text-xs text-ink-muted">
                    {item.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
