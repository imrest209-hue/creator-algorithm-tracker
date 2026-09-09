import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { analyseEngagement, topEngagementVideos } from '@/lib/analytics/engagement';
import { formatCompact, formatPercent } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { PlatformBadge, StatCard } from '@/components/ui/metrics';
import { CorrelationScatter, MixPieChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Engagement' };

export default async function EngagementPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const videos = set.videos;
  const breakdown = analyseEngagement(videos, now);
  const leaders = topEngagementVideos(videos, 10, now);

  if (videos.length === 0) {
    return (
      <>
        <PageHeader title="Engagement" filter={filter} />
        <EmptyState title="No videos in this range" />
      </>
    );
  }

  const scatter = videos
    .filter((v) => v.metrics.views > 0)
    .map((v) => {
      const interactions =
        v.metrics.likes + v.metrics.comments + v.metrics.shares + (v.metrics.saves ?? 0);
      return {
        x: v.metrics.views,
        y: (interactions / v.metrics.views) * 100,
        z: v.metrics.comments,
        name: v.title,
      };
    });

  return (
    <>
      <PageHeader
        title="Engagement"
        description="Likes, comments, shares, saves and how well each video converts a view into a follower."
        filter={filter}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Likes" value={formatCompact(breakdown.totalLikes)} />
        <StatCard label="Comments" value={formatCompact(breakdown.totalComments)} />
        <StatCard
          label="Shares"
          value={formatCompact(breakdown.totalShares)}
          hint="Shares reported by connected platforms or imported data. Some APIs do not provide this count."
        />
        <StatCard
          label="Saves"
          value={breakdown.totalSaves === null ? null : formatCompact(breakdown.totalSaves)}
          unavailableNote="No video in this range reports saves/favourites."
        />
        <StatCard
          label="Followers gained"
          value={
            breakdown.totalFollowersGained === null
              ? null
              : formatCompact(breakdown.totalFollowersGained)
          }
          unavailableNote="Per-video follower attribution is not available for these videos."
        />
        <StatCard
          label="Avg engagement rate"
          value={
            breakdown.avgEngagementRate === null
              ? null
              : formatPercent(breakdown.avgEngagementRate, 2)
          }
          hint="(likes + comments + shares + saves) / views"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionHeading title="Interaction mix" description="Share of total interactions." />
          <MixPieChart data={breakdown.mix.map((m) => ({ label: m.label, value: m.value }))} />
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {breakdown.mix.map((m) => (
              <li key={m.key} className="flex justify-between">
                <span>{m.label}</span>
                <span className="tabular-nums">
                  {formatCompact(m.value)} · {m.share}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <SectionHeading
            title="Views vs engagement rate"
            description="Each dot is a video. Bubble size is comment count. High-view, high-engagement videos sit top-right."
          />
          <CorrelationScatter data={scatter} xLabel="Views" yLabel="Engagement rate (%)" />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Average rates per view" description="Across all videos in range." />
          <dl className="space-y-2 text-sm">
            <Rate label="Like rate" value={breakdown.avgLikeRate} />
            <Rate label="Comment rate" value={breakdown.avgCommentRate} />
            <Rate label="Share rate" value={breakdown.avgShareRate} />
            <Rate
              label="Follower conversion"
              value={breakdown.avgFollowerConversion}
              hint="Followers gained per 100 views."
            />
          </dl>
        </Card>

        <Card>
          <SectionHeading
            title="Highest engagement rate"
            description="Videos your audience interacted with most, relative to their view count."
          />
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="border-b border-base-700">
                  <th className="th">Video</th>
                  <th className="th text-right">Engagement</th>
                  <th className="th text-right">Comments</th>
                  <th className="th text-right">Followers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {leaders.map((leader) => (
                  <tr key={leader.video.id} className="hover:bg-base-850/60">
                    <td className="td max-w-[260px]">
                      <Link
                        href={'/videos/' + leader.video.id}
                        className="block truncate hover:text-brand-300"
                        title={leader.video.title}
                      >
                        {leader.video.title}
                      </Link>
                      <PlatformBadge platform={leader.video.platform} />
                    </td>
                    <td className="td text-right tabular-nums font-medium">
                      {formatPercent(leader.engagementRate, 2)}
                    </td>
                    <td className="td text-right tabular-nums">
                      {leader.commentRate === null ? (
                        <Unavailable short />
                      ) : (
                        formatPercent(leader.commentRate, 2)
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {leader.followerConversion === null ? (
                        <Unavailable short reason="Follower attribution not available." />
                      ) : (
                        formatPercent(leader.followerConversion, 3)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

function Rate({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted" title={hint}>
        {label}
      </dt>
      <dd className="tabular-nums">
        {value === null ? <Unavailable /> : formatPercent(value, 3)}
      </dd>
    </div>
  );
}
