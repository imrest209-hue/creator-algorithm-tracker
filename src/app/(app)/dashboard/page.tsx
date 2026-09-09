import Link from 'next/link';
import type { Metadata } from 'next';
import type { VideoRecord } from '@/lib/types';
import { buildDashboardSummary, type VideoHighlight } from '@/lib/analytics/summary';
import { computePerformanceScore } from '@/lib/analytics/score';
import { analyseVelocity } from '@/lib/analytics/velocity';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { filterToQuery } from '@/lib/analytics/filter';
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatMinutes,
  formatNumber,
  formatPercent,
} from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import {
  ConfidenceBadge,
  PlatformBadge,
  ScorePill,
  ScoreRing,
  SourceBadge,
  StatCard,
  TrendArrow,
} from '@/components/ui/metrics';
import { MixPieChart, SimpleBarChart, TrendAreaChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const { dataset } = viewer;
  const query = filterToQuery(filter);

  const summary = buildDashboardSummary(
    set.videos,
    set.platformVideos,
    set.range,
    dataset.timezone,
    now,
  );

  const hasVideos = dataset.videos.length > 0;
  const hasInRange = set.videos.length > 0;

  return (
    <>
      <PageHeader
        title={'Welcome back, ' + dataset.ownerLabel.split(' ')[0]}
        description="Performance across your connected platforms, scored against your own historical baseline."
        filter={filter}
        actions={
          <div className="flex gap-2">
            <Link href={'/videos?' + query} className="btn-ghost">
              All videos
            </Link>
            <Link href={'/ideas?' + query} className="btn-primary">
              What should I post next?
            </Link>
          </div>
        }
      />

      {!hasVideos ? (
        <EmptyState
          icon="▶"
          title="No videos tracked yet"
          description="Connect YouTube or TikTok, import a CSV export, or add a video manually to start building your baseline."
          action={
            <div className="mt-2 flex gap-2">
              <Link href="/settings" className="btn-primary">
                Connect an account
              </Link>
              <Link href="/import" className="btn-ghost">
                Import CSV
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-5">
          {!hasInRange ? (
            <Alert tone="warn" title="No videos in this date range">
              You have {dataset.videos.length} tracked videos, but none were published in the
              selected window. Widen the range to see data.
            </Alert>
          ) : null}

          {/* --- KPI row ------------------------------------------------- */}
          <section>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label="Total views"
                value={formatCompact(summary.totalViews.value)}
                delta={summary.totalViews.delta}
                hint="Sum of views for videos published in this range."
              />
              <StatCard
                label="Total likes"
                value={formatCompact(summary.totalLikes.value)}
                delta={summary.totalLikes.delta}
              />
              <StatCard
                label="Total comments"
                value={formatCompact(summary.totalComments.value)}
                delta={summary.totalComments.delta}
              />
              <StatCard
                label="Total shares"
                value={formatCompact(summary.totalShares.value)}
                delta={summary.totalShares.delta}
                hint="Shares reported by connected platforms or imported data. Some APIs do not provide this count."
              />
              <StatCard
                label="Videos posted"
                value={formatNumber(summary.videosPosted.value)}
                delta={summary.videosPosted.delta}
              />
              <StatCard
                label="Avg watch time"
                value={
                  summary.avgWatchTimeMinutes.value === null
                    ? null
                    : formatDuration(summary.avgWatchTimeMinutes.value)
                }
                delta={summary.avgWatchTimeMinutes.delta}
                unavailableNote={summary.avgWatchTimeMinutes.unavailableNote}
                hint="Average view duration across videos that report it."
              />
              <StatCard
                label="Avg retention"
                value={
                  summary.avgRetention.value === null
                    ? null
                    : formatPercent(summary.avgRetention.value)
                }
                delta={summary.avgRetention.delta}
                unavailableNote={summary.avgRetention.unavailableNote}
                hint="Average percentage of each video watched."
              />
              <StatCard
                label="Avg engagement"
                value={
                  summary.avgEngagementRate.value === null
                    ? null
                    : formatPercent(summary.avgEngagementRate.value, 2)
                }
                delta={summary.avgEngagementRate.delta}
                hint="(likes + comments + shares + saves) / views."
              />
              <StatCard
                label="Followers gained"
                value={formatCompact(summary.followersGained.value)}
                delta={summary.followersGained.delta}
                unavailableNote={summary.followersGained.unavailableNote}
                hint="Attributed by the platform to these videos; excludes profile-page follows."
              />
              <StatCard
                label="Avg performance score"
                value={
                  summary.avgPerformanceScore.value === null
                    ? null
                    : summary.avgPerformanceScore.value.toFixed(1)
                }
                delta={summary.avgPerformanceScore.delta}
                hint="50 = exactly at your account average. See any video for the full breakdown."
              />
            </div>
          </section>

          {/* --- Trend + charts ------------------------------------------ */}
          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <SectionHeading
                title="Views over time"
                description={
                  filter.preset === 'all'
                    ? 'All videos in your library.'
                    : 'Videos published between ' + formatDate(set.range.from) + ' and ' + formatDate(set.range.to) + '.'
                }
                action={<TrendArrow direction={summary.trend.direction} />}
              />
              {hasInRange ? (
                <TrendAreaChart
                  data={summary.timeSeries as unknown as Array<Record<string, string | number | null>>}
                  series={[
                    { key: 'views', label: 'Views' },
                    { key: 'engagements', label: 'Engagements', color: '#34d399' },
                  ]}
                />
              ) : (
                <EmptyState title="Nothing published in this window" />
              )}
              <p className="mt-2 text-xs text-ink-muted">{summary.trend.detail}</p>
            </Card>

            <Card>
              <SectionHeading
                title="Platform mix"
                description="Views by platform in this range."
              />
              {summary.platformBreakdown.length > 0 ? (
                <>
                  <MixPieChart
                    data={summary.platformBreakdown.map((p) => ({ label: p.label, value: p.views }))}
                  />
                  <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                    {summary.platformBreakdown.map((p) => (
                      <li key={p.platform} className="flex justify-between">
                        <span>{p.label}</span>
                        <span className="tabular-nums">
                          {p.videos} videos · avg score {p.avgScore ?? '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <EmptyState title="No platform data in range" />
              )}
            </Card>
          </section>

          {/* --- Highlights ---------------------------------------------- */}
          <section className="grid gap-4 lg:grid-cols-3">
            <HighlightCard
              title="Best-performing video"
              tooltip="Highest transparent performance score in the selected range."
              highlight={summary.bestVideo}
              query={query}
            />
            <HighlightCard
              title="Fastest-growing video"
              tooltip="Largest view-velocity multiplier against your own historical pace."
              highlight={summary.fastestGrowingVideo}
              query={query}
            />
            <HighlightCard
              title="Strongest early signals"
              tooltip="Highest viral-potential score. This describes measured early performance, not a prediction."
              highlight={summary.highestViralPotential}
              query={query}
              kind="viral"
            />
          </section>

          {/* --- Recent videos ------------------------------------------- */}
          <section>
            <Card>
              <SectionHeading
                title="Recent videos"
                description="Newest first, scored against your full catalogue."
                action={
                  <Link href={'/videos?' + query} className="text-sm link">
                    View all →
                  </Link>
                }
              />
              {hasInRange ? (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-base-700">
                        <th className="th">Video</th>
                        <th className="th">Platform</th>
                        <th className="th">Published</th>
                        <th className="th text-right">Views</th>
                        <th className="th text-right">Retention</th>
                        <th className="th text-right">Engagement</th>
                        <th className="th text-right">Velocity</th>
                        <th className="th text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-800">
                      {[...set.videos]
                        .sort(
                          (a, b) =>
                            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
                        )
                        .slice(0, 8)
                        .map((video) => {
                          const score = computePerformanceScore(video, set.platformVideos, now);
                          const velocity = analyseVelocity(video, set.platformVideos, now);
                          const interactions =
                            video.metrics.likes +
                            video.metrics.comments +
                            video.metrics.shares +
                            (video.metrics.saves ?? 0);
                          const engagement =
                            video.metrics.views > 0
                              ? (interactions / video.metrics.views) * 100
                              : null;
                          return (
                            <tr key={video.id} className="hover:bg-base-850/60">
                              <td className="td max-w-[280px]">
                                <Link
                                  href={'/videos/' + video.id}
                                  className="block truncate font-medium text-ink hover:text-brand-300"
                                  title={video.title}
                                >
                                  {video.title}
                                </Link>
                                <span className="text-xs text-ink-muted">{video.categoryName}</span>
                              </td>
                              <td className="td">
                                <PlatformBadge platform={video.platform} />
                              </td>
                              <td className="td text-ink-muted">
                                {formatDate(video.publishedAt, dataset.timezone)}
                              </td>
                              <td className="td text-right tabular-nums">
                                {formatCompact(video.metrics.views)}
                              </td>
                              <td className="td text-right tabular-nums">
                                {video.metrics.averagePercentageViewed === null ? (
                                  <Unavailable short reason="Retention is not available for this video." />
                                ) : (
                                  formatPercent(video.metrics.averagePercentageViewed)
                                )}
                              </td>
                              <td className="td text-right tabular-nums">
                                {engagement === null ? (
                                  <Unavailable short />
                                ) : (
                                  formatPercent(engagement, 2)
                                )}
                              </td>
                              <td className="td text-right tabular-nums">
                                {velocity.headlineMultiplier === null ? (
                                  <Unavailable short reason="No velocity snapshots recorded." />
                                ) : (
                                  velocity.headlineMultiplier.toFixed(1) + 'x'
                                )}
                              </td>
                              <td className="td text-right">
                                <ScorePill score={score.score} confidence={score.confidence} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No videos published in this range" />
              )}
            </Card>
          </section>

          {/* --- Score distribution -------------------------------------- */}
          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading
                title="Performance score distribution"
                description="How your videos in this range spread across the 0-100 scale."
              />
              <SimpleBarChart
                data={scoreBuckets(set.videos, set.platformVideos, now)}
                bars={[{ key: 'count', label: 'Videos' }]}
                xKey="bucket"
                format="integer"
                height={220}
              />
            </Card>
            <Card>
              <SectionHeading
                title="Watch time contribution"
                description="Total minutes watched per platform, where the platform reports it."
              />
              <WatchTimeBreakdown videos={set.videos} />
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function HighlightCard({
  title,
  highlight,
  tooltip,
  query,
  kind = 'performance',
}: {
  title: string;
  tooltip: string;
  highlight: VideoHighlight | null;
  query: string;
  kind?: 'performance' | 'viral';
}) {
  return (
    <Card>
      <SectionHeading title={title} tooltip={tooltip} />
      {highlight ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={'/videos/' + highlight.video.id + '?' + query}
                className="line-clamp-2 text-sm font-medium text-ink hover:text-brand-300"
              >
                {highlight.video.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <PlatformBadge platform={highlight.video.platform} />
                <SourceBadge source={highlight.video.source} />
                <span className="text-xs text-ink-muted">
                  {formatCompact(highlight.video.metrics.views)} views
                </span>
              </div>
            </div>
            <ScoreRing
              score={highlight.score}
              size={62}
              kind={kind}
              label={kind === 'viral' ? 'Viral potential' : 'Score'}
              confidence={highlight.confidence}
            />
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">{highlight.headline}</p>
        </div>
      ) : (
        <EmptyState title="Not enough data" description="No video in this range qualifies yet." />
      )}
    </Card>
  );
}

function scoreBuckets(
  videos: VideoRecord[],
  all: VideoRecord[],
  now: Date,
): Array<Record<string, string | number>> {
  const buckets = [
    { bucket: '0-19', count: 0 },
    { bucket: '20-39', count: 0 },
    { bucket: '40-59', count: 0 },
    { bucket: '60-79', count: 0 },
    { bucket: '80-100', count: 0 },
  ];
  for (const video of videos) {
    const { score } = computePerformanceScore(video, all, now);
    const index = Math.min(Math.floor(score / 20), 4);
    buckets[index].count += 1;
  }
  return buckets;
}

function WatchTimeBreakdown({ videos }: { videos: VideoRecord[] }) {
  const labels: Record<string, string> = {
    YOUTUBE: 'YouTube',
    YOUTUBE_SHORTS: 'Shorts',
    TIKTOK: 'TikTok',
  };
  const totals = new Map<string, number>();
  let anyData = false;
  for (const v of videos) {
    if (v.metrics.watchTimeMinutes === null) continue;
    anyData = true;
    totals.set(v.platform, (totals.get(v.platform) ?? 0) + v.metrics.watchTimeMinutes);
  }
  if (!anyData) {
    return (
      <EmptyState
        title="Watch time unavailable"
        description="None of the videos in this range report watch time. TikTok does not expose it through its API; import a CSV export to add it."
      />
    );
  }
  const data = Array.from(totals.entries()).map(([platform, minutes]) => ({
    platform: labels[platform] ?? platform,
    minutes: Math.round(minutes),
  }));
  return (
    <>
      <SimpleBarChart
        data={data}
        bars={[{ key: 'minutes', label: 'Minutes watched', color: '#a78bfa' }]}
        xKey="platform"
        height={220}
      />
      <p className="mt-2 text-xs text-ink-muted">
        Total: {formatMinutes(data.reduce((acc, d) => acc + d.minutes, 0))}
      </p>
    </>
  );
}
