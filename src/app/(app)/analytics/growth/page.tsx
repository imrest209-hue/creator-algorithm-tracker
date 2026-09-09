import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { analyseGrowth } from '@/lib/analytics/growth';
import { formatCompact, formatPercent } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { PlatformBadge, StatCard } from '@/components/ui/metrics';
import { TrendAreaChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Growth' };

export default async function GrowthPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const growth = analyseGrowth(set.videos, viewer.dataset.timezone, now);

  if (set.videos.length === 0) {
    return (
      <>
        <PageHeader title="Growth" filter={filter} />
        <EmptyState title="No videos in this range" />
      </>
    );
  }

  const noData = growth.coverage.withData === 0;

  return (
    <>
      <PageHeader
        title="Follower growth"
        description="Followers and subscribers each platform attributes to individual videos."
        filter={filter}
      />

      {noData ? (
        <Alert tone="warn" title="Follower attribution unavailable">
          None of the videos in this range report followers gained. TikTok does not expose per-video
          follower counts through its API; YouTube provides them through the Analytics API for
          channels you own. You can also import the figures via CSV.
        </Alert>
      ) : (
        <Alert tone="info" title="What this measures">
          {growth.note} Data is available for {growth.coverage.withData} of {growth.coverage.total}{' '}
          videos in this range.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Followers gained"
          value={
            growth.totalFollowersGained === null ? null : formatCompact(growth.totalFollowersGained)
          }
          unavailableNote="Not reported for these videos."
        />
        <StatCard
          label="Avg per video"
          value={
            growth.avgFollowersPerVideo === null ? null : formatCompact(growth.avgFollowersPerVideo)
          }
          unavailableNote="Not reported for these videos."
        />
        <StatCard
          label="Avg follower conversion"
          value={
            growth.avgFollowerConversion === null
              ? null
              : formatPercent(growth.avgFollowerConversion, 3)
          }
          hint="Followers gained per 100 views."
          unavailableNote="Not reported for these videos."
        />
        <StatCard
          label="Coverage"
          value={growth.coverage.withData + ' / ' + growth.coverage.total}
          hint="Videos reporting follower attribution."
        />
      </div>

      {!noData ? (
        <>
          <Card className="mt-4">
            <SectionHeading
              title="Cumulative followers from tracked videos"
              description="Running total of the followers attributed to videos published in this range."
            />
            <TrendAreaChart
              data={growth.series as unknown as Array<Record<string, string | number | null>>}
              series={[
                { key: 'cumulative', label: 'Cumulative followers', color: '#34d399' },
                { key: 'followersGained', label: 'Per day', color: '#4f7cff' },
              ]}
            />
          </Card>

          {growth.bestConverter ? (
            <Card className="mt-4">
              <SectionHeading
                title="Best follower converter"
                description="The single video that brought in the most followers in this range."
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={'/videos/' + growth.bestConverter.video.id}
                    className="block truncate text-sm font-medium hover:text-brand-300"
                  >
                    {growth.bestConverter.video.title}
                  </Link>
                  <div className="mt-1">
                    <PlatformBadge platform={growth.bestConverter.video.platform} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums text-good">
                    +{formatCompact(growth.bestConverter.followersGained)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {growth.bestConverter.conversion === null
                      ? 'conversion unavailable'
                      : formatPercent(growth.bestConverter.conversion, 3) + ' of viewers'}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
