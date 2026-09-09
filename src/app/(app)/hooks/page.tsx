import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import { analyseHooks, bestHook, MIN_HOOK_SAMPLE } from '@/lib/analytics/hooks';
import { suggestHooks } from '@/lib/analytics/recommendations';
import { formatCompact, formatPercent } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { SimpleBarChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Hook analyzer' };

export default async function HooksPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const stats = analyseHooks(set.videos, now);
  const { best, note } = bestHook(stats);
  const suggestions = suggestHooks(
    { videos: set.videos, timezone: viewer.dataset.timezone, now },
    'your next topic',
  );

  const withHooks = set.videos.filter((v) => v.hookText && v.hookText.trim().length > 0).length;

  return (
    <>
      <PageHeader
        title="Hook analyzer"
        description="The first few seconds of each video, classified into a hook style and compared against your own retention and performance."
        filter={filter}
      />

      {withHooks === 0 ? (
        <EmptyState
          icon="❝"
          title="No hooks recorded yet"
          description="Add the opening line of your videos to compare hook styles. You can enter them when adding a video manually, or map a hook column during CSV import."
          action={
            <div className="mt-2 flex gap-2">
              <Link href="/videos/new" className="btn-primary">
                Add a video with a hook
              </Link>
              <Link href="/import" className="btn-ghost">
                Import CSV
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <Alert tone={best ? 'good' : 'warn'} title={best ? 'Your strongest hook style' : 'Not enough data yet'}>
            {note}
          </Alert>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <SectionHeading
                title="Hook style vs performance score"
                description={
                  'Average performance score per hook style. Styles with fewer than ' +
                  MIN_HOOK_SAMPLE +
                  ' videos are shown but not ranked.'
                }
              />
              <SimpleBarChart
                data={stats.map((s) => ({ label: s.label, score: s.avgPerformanceScore ?? 0 }))}
                bars={[{ key: 'score', label: 'Avg score' }]}
                xKey="label"
                horizontal
                format="decimal"
                height={Math.max(220, stats.length * 34)}
              />
            </Card>

            <Card>
              <SectionHeading
                title="Hook style vs retention"
                description="Average percentage viewed per hook style, where retention is available."
              />
              {stats.some((s) => s.avgRetention !== null) ? (
                <SimpleBarChart
                  data={stats
                    .filter((s) => s.avgRetention !== null)
                    .map((s) => ({ label: s.label, retention: s.avgRetention ?? 0 }))}
                  bars={[{ key: 'retention', label: 'Avg retention %', color: '#34d399' }]}
                  xKey="label"
                  horizontal
                  format="percent"
                  height={Math.max(220, stats.length * 34)}
                />
              ) : (
                <EmptyState
                  title="Retention unavailable"
                  description="None of these videos report retention, so hook styles cannot be compared on retention."
                />
              )}
            </Card>
          </div>

          <Card className="mt-4">
            <SectionHeading title="All hook styles" description="Ranked by average performance score." />
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-base-700">
                    <th className="th">Hook style</th>
                    <th className="th text-right">Videos</th>
                    <th className="th text-right">Avg views</th>
                    <th className="th text-right">Avg retention</th>
                    <th className="th text-right">Avg engagement</th>
                    <th className="th text-right">Avg score</th>
                    <th className="th text-right">vs account</th>
                    <th className="th">Best example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  {stats.map((stat) => (
                    <tr key={stat.type} className="hover:bg-base-850/60">
                      <td className="td font-medium">
                        {stat.label}
                        {stat.videoCount < MIN_HOOK_SAMPLE ? (
                          <span className="ml-1.5 text-[11px] text-ink-muted">(low sample)</span>
                        ) : null}
                      </td>
                      <td className="td text-right tabular-nums">{stat.videoCount}</td>
                      <td className="td text-right tabular-nums">{formatCompact(stat.avgViews)}</td>
                      <td className="td text-right tabular-nums">
                        {stat.avgRetention === null ? (
                          <Unavailable short />
                        ) : (
                          formatPercent(stat.avgRetention)
                        )}
                      </td>
                      <td className="td text-right tabular-nums">
                        {stat.avgEngagementRate === null ? (
                          <Unavailable short />
                        ) : (
                          formatPercent(stat.avgEngagementRate, 2)
                        )}
                      </td>
                      <td className="td text-right tabular-nums font-semibold">
                        {stat.avgPerformanceScore ?? '—'}
                      </td>
                      <td className="td text-right tabular-nums">
                        {stat.scoreVsAccount === null ? (
                          '—'
                        ) : (
                          <Badge tone={stat.scoreVsAccount >= 0 ? 'good' : 'bad'}>
                            {stat.scoreVsAccount > 0 ? '+' : ''}
                            {stat.scoreVsAccount}
                          </Badge>
                        )}
                      </td>
                      <td className="td max-w-[240px]">
                        {stat.examples[0] ? (
                          <Link
                            href={'/videos/' + stat.examples[0].id}
                            className="block truncate text-xs text-ink-muted hover:text-brand-300"
                            title={stat.examples[0].hookText ?? stat.examples[0].title}
                          >
                            “{stat.examples[0].hookText ?? stat.examples[0].title}”
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Card className="mt-4">
        <SectionHeading
          title="Suggested hooks"
          description="Templates built around the hook styles that perform best for you."
          action={<Badge tone="warn">AI-GENERATED</Badge>}
        />
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li key={s.hookType} className="rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{s.label}</span>
                <Badge tone="warn">AI-GENERATED</Badge>
              </div>
              <p className="mt-1 text-sm italic text-ink">“{s.example}”</p>
              <p className="mt-1 text-xs text-ink-muted">{s.evidence}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
