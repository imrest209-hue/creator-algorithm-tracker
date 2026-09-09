import Link from 'next/link';
import type { Metadata } from 'next';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import {
  analyseCategories,
  analyseHashtags,
  analyseLengths,
  analyseTitleTerms,
  categoryVerdict,
  MIN_CATEGORY_SAMPLE,
} from '@/lib/analytics/content';
import { formatCompact, formatPercent } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Badge, Card, EmptyState, SectionHeading, Unavailable } from '@/components/ui/primitives';
import { SimpleBarChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Content analysis' };

export default async function ContentPage({ searchParams }: { searchParams: SearchParams }) {
  const { filter, set, now } = await getPageContext(searchParams);
  const videos = set.videos;

  const categories = analyseCategories(videos, now);
  const verdict = categoryVerdict(categories);
  const hashtags = analyseHashtags(videos, now, 2);
  const titleTerms = analyseTitleTerms(videos, now, 3);
  const shortLengths = analyseLengths(
    videos.filter((v) => v.platform !== 'YOUTUBE'),
    'short',
    now,
  );
  const longLengths = analyseLengths(
    videos.filter((v) => v.platform === 'YOUTUBE'),
    'long',
    now,
  );

  if (videos.length === 0) {
    return (
      <>
        <PageHeader title="Content analysis" filter={filter} />
        <EmptyState title="No videos in this range" description="Widen the date range or import videos." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Content analysis"
        description="Which topics, lengths, hashtags and title patterns actually work for you. Categories are assigned by keyword classification and can be overridden per video."
        filter={filter}
      />

      {/* --- Make more / make less ------------------------------------- */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Make more of this"
            description={
              'Topics scoring at least 5 points above your account average, with ' +
              MIN_CATEGORY_SAMPLE +
              '+ videos.'
            }
          />
          {verdict.makeMore.length === 0 ? (
            <EmptyState
              title="No clear winner yet"
              description="No topic is far enough above your average, with a big enough sample, to call it out."
            />
          ) : (
            <ul className="space-y-2">
              {verdict.makeMore.map((cat) => (
                <li
                  key={cat.slug}
                  className="flex items-center justify-between gap-3 rounded-lg border border-good/25 bg-good/5 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-ink-muted">
                      {cat.videoCount} videos · {formatCompact(cat.avgViews)} avg views ·{' '}
                      {cat.avgRetention === null ? 'retention n/a' : formatPercent(cat.avgRetention) + ' retention'}
                    </p>
                  </div>
                  <Badge tone="good">+{cat.scoreVsAccount} pts</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Consider making less"
            description="Topics scoring at least 5 points below your account average."
          />
          {verdict.makeLess.length === 0 ? (
            <EmptyState
              title="Nothing is clearly underperforming"
              description="No topic sits far enough below your average to recommend dropping it."
            />
          ) : (
            <ul className="space-y-2">
              {verdict.makeLess.map((cat) => (
                <li
                  key={cat.slug}
                  className="flex items-center justify-between gap-3 rounded-lg border border-bad/25 bg-bad/5 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{cat.name}</p>
                    <p className="text-xs text-ink-muted">
                      {cat.videoCount} videos · {formatCompact(cat.avgViews)} avg views
                    </p>
                  </div>
                  <Badge tone="bad">{cat.scoreVsAccount} pts</Badge>
                </li>
              ))}
            </ul>
          )}
          {verdict.needsMoreData.length > 0 ? (
            <p className="mt-3 text-xs text-ink-muted">
              Not judged yet (fewer than {MIN_CATEGORY_SAMPLE} videos):{' '}
              {verdict.needsMoreData.map((c) => c.name).join(', ')}.
            </p>
          ) : null}
        </Card>
      </div>

      {/* --- Category table -------------------------------------------- */}
      <Card className="mb-4">
        <SectionHeading
          title="Topic performance"
          description="Averages per category, ranked by performance score."
        />
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-base-700">
                <th className="th">Topic</th>
                <th className="th text-right">Videos</th>
                <th className="th text-right">Share of library</th>
                <th className="th text-right">Total views</th>
                <th className="th text-right">Avg views</th>
                <th className="th text-right">Avg retention</th>
                <th className="th text-right">Avg engagement</th>
                <th className="th text-right">Followers</th>
                <th className="th text-right">Avg score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-800">
              {categories.map((cat) => (
                <tr key={cat.slug} className="hover:bg-base-850/60">
                  <td className="td font-medium">{cat.name}</td>
                  <td className="td text-right tabular-nums">{cat.videoCount}</td>
                  <td className="td text-right tabular-nums text-ink-muted">{cat.shareOfLibrary}%</td>
                  <td className="td text-right tabular-nums">{formatCompact(cat.totalViews)}</td>
                  <td className="td text-right tabular-nums">{formatCompact(cat.avgViews)}</td>
                  <td className="td text-right tabular-nums">
                    {cat.avgRetention === null ? <Unavailable short /> : formatPercent(cat.avgRetention)}
                  </td>
                  <td className="td text-right tabular-nums">
                    {cat.avgEngagementRate === null ? (
                      <Unavailable short />
                    ) : (
                      formatPercent(cat.avgEngagementRate, 2)
                    )}
                  </td>
                  <td className="td text-right tabular-nums">
                    {cat.totalFollowersGained === null ? (
                      <Unavailable short reason="Follower attribution not available for these videos." />
                    ) : (
                      formatCompact(cat.totalFollowersGained)
                    )}
                  </td>
                  <td className="td text-right tabular-nums font-semibold">
                    {cat.avgPerformanceScore ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- Lengths ---------------------------------------------------- */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Best short-form length"
            description="Average performance score by duration bucket (TikTok + Shorts)."
          />
          {shortLengths.some((b) => b.videoCount > 0) ? (
            <SimpleBarChart
              data={shortLengths.map((b) => ({
                label: b.label,
                score: b.avgPerformanceScore ?? 0,
                videos: b.videoCount,
              }))}
              bars={[{ key: 'score', label: 'Avg score' }]}
              xKey="label"
              format="decimal"
              height={220}
            />
          ) : (
            <EmptyState title="No short-form videos in range" />
          )}
          <LengthLegend buckets={shortLengths} />
        </Card>

        <Card>
          <SectionHeading
            title="Best long-form length"
            description="Average performance score by duration bucket (YouTube uploads)."
          />
          {longLengths.some((b) => b.videoCount > 0) ? (
            <SimpleBarChart
              data={longLengths.map((b) => ({
                label: b.label,
                score: b.avgPerformanceScore ?? 0,
              }))}
              bars={[{ key: 'score', label: 'Avg score', color: '#a78bfa' }]}
              xKey="label"
              format="decimal"
              height={220}
            />
          ) : (
            <EmptyState title="No long-form videos in range" />
          )}
          <LengthLegend buckets={longLengths} />
        </Card>
      </div>

      {/* --- Hashtags + title terms ------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Hashtag performance"
            description="Hashtags used on 2 or more videos, ranked by the average score of the videos using them."
          />
          {hashtags.length === 0 ? (
            <EmptyState
              title="Not enough hashtag data"
              description="Hashtags need to appear on at least 2 videos before they can be compared."
            />
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[440px] border-collapse">
                <thead>
                  <tr className="border-b border-base-700">
                    <th className="th">Hashtag</th>
                    <th className="th text-right">Videos</th>
                    <th className="th text-right">Avg views</th>
                    <th className="th text-right">Avg engagement</th>
                    <th className="th text-right">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  {hashtags.slice(0, 15).map((tag) => (
                    <tr key={tag.tag}>
                      <td className="td">
                        <Badge tone="brand">#{tag.tag}</Badge>
                      </td>
                      <td className="td text-right tabular-nums">{tag.videoCount}</td>
                      <td className="td text-right tabular-nums">{formatCompact(tag.avgViews)}</td>
                      <td className="td text-right tabular-nums">
                        {tag.avgEngagementRate === null ? (
                          <Unavailable short />
                        ) : (
                          formatPercent(tag.avgEngagementRate, 2)
                        )}
                      </td>
                      <td className="td text-right tabular-nums font-semibold">
                        {tag.avgPerformanceScore ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Title patterns"
            description="Words appearing in 3 or more titles, ranked by average score. Correlation only — a word is not a cause."
          />
          {titleTerms.length === 0 ? (
            <EmptyState
              title="Not enough title data"
              description="A word needs to appear in at least 3 titles before it is ranked."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {titleTerms.slice(0, 24).map((term) => (
                <span
                  key={term.term}
                  title={
                    term.videoCount +
                    ' videos · avg score ' +
                    (term.avgPerformanceScore ?? 0) +
                    ' · ' +
                    formatCompact(term.avgViews) +
                    ' avg views'
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-base-700 bg-base-800 px-2 py-1 text-xs"
                >
                  <span className="font-medium">{term.term}</span>
                  <span
                    className={
                      (term.avgPerformanceScore ?? 0) >= 55
                        ? 'text-good'
                        : (term.avgPerformanceScore ?? 0) <= 45
                          ? 'text-bad'
                          : 'text-ink-muted'
                    }
                  >
                    {term.avgPerformanceScore}
                  </span>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Alert tone="info" title="How categories are assigned">
        Each video is classified from its title, caption, description and hashtags using a keyword
        classifier. You can override the category on any video, and you can add your own categories
        in <Link href="/settings" className="link">Settings</Link>.
      </Alert>
    </>
  );
}

function LengthLegend({
  buckets,
}: {
  buckets: Array<{ label: string; videoCount: number; avgViews: number | null; avgRetention: number | null }>;
}) {
  const withData = buckets.filter((b) => b.videoCount > 0);
  if (withData.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 text-xs text-ink-muted">
      {withData.map((b) => (
        <li key={b.label} className="flex justify-between gap-3">
          <span>{b.label}</span>
          <span className="tabular-nums">
            {b.videoCount} videos · {formatCompact(b.avgViews)} avg views ·{' '}
            {b.avgRetention === null ? 'retention n/a' : formatPercent(b.avgRetention) + ' retention'}
          </span>
        </li>
      ))}
    </ul>
  );
}
