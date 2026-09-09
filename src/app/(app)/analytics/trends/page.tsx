import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import {
  categoryMomentum,
  detectAccountTrends,
  PUBLIC_TRENDS_NOT_CONFIGURED,
  TREND_DISCLAIMER,
  trendingOwnHashtags,
  type AccountTrend,
} from '@/lib/analytics/trends';
import { getPublicTrends } from '@/lib/integrations/public-trends';
import { formatCompact, formatDelta } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { SimpleBarChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Trends' };

export default async function TrendsPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter, set, now } = await getPageContext(searchParams);
  const trends = detectAccountTrends(set.videos, now);
  const momentum = categoryMomentum(set.videos, now);
  const hashtags = trendingOwnHashtags(set.videos, now);
  const publicTrends = await getPublicTrends().catch(() => PUBLIC_TRENDS_NOT_CONFIGURED);

  const rising = trends.filter((t) => t.direction === 'RISING' || t.direction === 'NEW');
  const falling = trends.filter((t) => t.direction === 'FALLING');

  return (
    <>
      <PageHeader
        title="Trends"
        description="Two separate sources, never mixed: what is changing inside your own account, and what public APIs report about the wider platform."
        filter={filter}
      />

      <Alert tone="info" title="What this page is not">
        {TREND_DISCLAIMER}
      </Alert>

      {/* ================= MY ACCOUNT DATA ============================== */}
      <section className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">My account data</h2>
          <Badge tone="brand">From your own videos</Badge>
        </div>

        {trends.length === 0 ? (
          <EmptyState
            title="Not enough history for trend detection"
            description="Trend detection splits your catalogue in half by time and compares the two. It needs at least 6 videos in the selected range."
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <TrendList
                title="Rising for you"
                description="Topics and hashtags performing better in your recent half than your earlier half."
                trends={rising}
                tone="good"
              />
              <TrendList
                title="Cooling off"
                description="Topics and hashtags that have lost ground in your recent videos."
                trends={falling}
                tone="bad"
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <SectionHeading
                  title="Category momentum"
                  description="Slope of per-video views over time, by category. Positive means each new video in that category tends to do better than the last."
                />
                {momentum.length === 0 ? (
                  <EmptyState title="Need at least 3 videos per category" />
                ) : (
                  <SimpleBarChart
                    data={momentum.map((m) => ({ label: m.label, slope: m.slope }))}
                    bars={[{ key: 'slope', label: 'Views trend per video' }]}
                    xKey="label"
                    horizontal
                    height={Math.max(200, momentum.length * 34)}
                  />
                )}
              </Card>

              <Card>
                <SectionHeading
                  title="Your best-performing hashtags"
                  description="Hashtags on 2+ of your videos, ranked by the average score of the videos using them."
                />
                {hashtags.length === 0 ? (
                  <EmptyState title="Not enough hashtag data" />
                ) : (
                  <ul className="space-y-1.5">
                    {hashtags.map((tag) => (
                      <li key={tag.tag} className="flex items-center justify-between gap-3 text-sm">
                        <Badge tone="brand">#{tag.tag}</Badge>
                        <span className="tabular-nums text-ink-muted">
                          {tag.videoCount} videos · {formatCompact(tag.avgViews)} avg views ·{' '}
                          <span className="font-medium text-ink">{tag.avgPerformanceScore}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </section>

      {/* ================= PUBLIC / TREND DATA ========================== */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink">Public / trend data</h2>
          <Badge tone="neutral">External sources</Badge>
        </div>

        <Card>
          {publicTrends.configured ? (
            <>
              <SectionHeading
                title={'Trending now — ' + (publicTrends.providerName ?? 'provider')}
                description={
                  'Fetched ' +
                  (publicTrends.fetchedAt ? new Date(publicTrends.fetchedAt).toLocaleString() : 'recently') +
                  '. This is public platform data about everyone, not about your account.'
                }
              />
              {publicTrends.items.length === 0 ? (
                <EmptyState title="Provider returned no items" description={publicTrends.note} />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {publicTrends.items.map((item) => (
                    <li
                      key={item.kind + item.term}
                      className="flex items-center justify-between gap-2 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.term}</p>
                        <p className="text-xs text-ink-muted">{item.kind.toLowerCase()}</p>
                      </div>
                      {item.metric !== null ? (
                        <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
                          {formatCompact(item.metric)} {item.metricLabel ?? ''}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyState
              icon="∿"
              title="No public trend provider connected"
              description={publicTrends.note}
            />
          )}
        </Card>
      </section>
    </>
  );
}

function TrendList({
  title,
  description,
  trends,
  tone,
}: {
  title: string;
  description: string;
  trends: AccountTrend[];
  tone: 'good' | 'bad';
}) {
  return (
    <Card>
      <SectionHeading title={title} description={description} />
      {trends.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <ul className="space-y-2">
          {trends.slice(0, 8).map((trend) => (
            <li
              key={trend.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-base-800 bg-base-900/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{trend.label}</p>
                <p className="text-xs text-ink-muted">
                  {trend.recentCount} recent vs {trend.priorCount} earlier ·{' '}
                  {trend.kind === 'CATEGORY' ? 'topic' : 'hashtag'}
                </p>
              </div>
              <div className="whitespace-nowrap text-right text-xs">
                {trend.scoreDelta !== null ? (
                  <Badge tone={tone}>
                    {trend.scoreDelta > 0 ? '+' : ''}
                    {trend.scoreDelta} pts
                  </Badge>
                ) : (
                  <Badge tone="neutral">new</Badge>
                )}
                {trend.viewsDelta !== null ? (
                  <p className="mt-1 tabular-nums text-ink-muted">
                    views {formatDelta(trend.viewsDelta)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
