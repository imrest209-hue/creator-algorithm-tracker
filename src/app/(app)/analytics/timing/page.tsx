import type { Metadata } from 'next';
import { PLATFORM_LABELS } from '@/lib/types';
import { getPageContext, type SearchParams } from '@/lib/data/page';
import {
  analyseTiming,
  analyseTimingByPlatform,
  describeBestWindow,
  MIN_BUCKET_SAMPLE,
  type TimingAnalysis,
  type TimingBucket,
} from '@/lib/analytics/timing';
import { DAY_SHORT, formatHourLabel } from '@/lib/util/date';
import { formatCompact } from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import { Alert, Card, EmptyState, SectionHeading } from '@/components/ui/primitives';
import { SimpleBarChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Posting time analysis' };

export default async function TimingPage({ searchParams }: { searchParams: SearchParams }) {
  const { viewer, filter, set, now } = await getPageContext(searchParams);
  const timezone = viewer.dataset.timezone;
  const timing = analyseTiming(set.videos, timezone, now);
  const perPlatform = analyseTimingByPlatform(set.videos, timezone, now);

  return (
    <>
      <PageHeader
        title="Posting time analysis"
        description={
          'Calculated entirely from when you posted and how those videos performed, in ' +
          timezone +
          '. No generic "best time to post" advice is used anywhere on this page.'
        }
        filter={filter}
      />

      {timing.message ? (
        <Alert tone="warn" title="Not enough account-specific data yet">
          {timing.message}
        </Alert>
      ) : (
        <Alert tone="good" title="Your best posting window">
          {describeBestWindow(timing)}
        </Alert>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Performance by day"
            description="Average performance score of videos published on each weekday."
          />
          <SimpleBarChart
            data={timing.byDay.map((d) => ({
              label: DAY_SHORT[d.day],
              score: d.avgPerformanceScore ?? 0,
            }))}
            bars={[{ key: 'score', label: 'Avg score' }]}
            xKey="label"
            format="decimal"
            height={230}
          />
          <BucketLegend buckets={timing.byDay} labelFor={(b) => b.dayName} />
        </Card>

        <Card>
          <SectionHeading
            title="Performance by hour"
            description={'Average performance score by publish hour (' + timezone + ').'}
          />
          <SimpleBarChart
            data={timing.byHour.map((h) => ({
              label: h.hour === null ? '' : String(h.hour),
              score: h.avgPerformanceScore ?? 0,
            }))}
            bars={[{ key: 'score', label: 'Avg score', color: '#34d399' }]}
            xKey="label"
            format="decimal"
            height={230}
          />
          <BucketLegend
            buckets={timing.byHour.filter((h) => h.videoCount > 0)}
            labelFor={(b) => (b.hour === null ? '' : formatHourLabel(b.hour))}
          />
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHeading
          title="Day × time heatmap"
          description={
            'Average performance score per 3-hour window. Cells with fewer than ' +
            MIN_BUCKET_SAMPLE +
            ' videos are shown but never used for recommendations.'
          }
        />
        <Heatmap analysis={timing} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {perPlatform.map(({ platform, analysis }) => (
          <Card key={platform}>
            <SectionHeading
              title={PLATFORM_LABELS[platform]}
              description={analysis.totalVideos + ' videos in this range'}
            />
            {analysis.message ? (
              <p className="text-sm text-ink-muted">{analysis.message}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="label mb-1">Best days</p>
                  <ul className="space-y-1 text-sm">
                    {analysis.bestDays.map((d) => (
                      <li key={d.key} className="flex justify-between">
                        <span>{d.dayName}</span>
                        <span className="tabular-nums text-ink-muted">
                          {d.avgPerformanceScore} · {d.videoCount} videos
                        </span>
                      </li>
                    ))}
                    {analysis.bestDays.length === 0 ? (
                      <li className="text-sm text-ink-muted">Not enough data per day yet.</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <p className="label mb-1">Best windows</p>
                  <ul className="space-y-1 text-sm">
                    {analysis.bestWindows.slice(0, 3).map((w) => (
                      <li key={w.key} className="flex justify-between gap-2">
                        <span>
                          {w.dayName} {w.hourLabel}
                        </span>
                        <span className="tabular-nums text-ink-muted">
                          {w.avgPerformanceScore} · {w.videoCount}
                        </span>
                      </li>
                    ))}
                    {analysis.bestWindows.length === 0 ? (
                      <li className="text-sm text-ink-muted">Not enough data per window yet.</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        ))}
        {perPlatform.length === 0 ? (
          <EmptyState title="No platform data in this range" />
        ) : null}
      </div>
    </>
  );
}

function BucketLegend({
  buckets,
  labelFor,
}: {
  buckets: TimingBucket[];
  labelFor: (bucket: TimingBucket) => string;
}) {
  const withData = buckets.filter((b) => b.videoCount > 0);
  if (withData.length === 0) {
    return <p className="mt-3 text-xs text-ink-muted">No videos published in this range.</p>;
  }
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted">
      {withData.map((bucket) => (
        <li key={bucket.key} className="flex justify-between gap-2">
          <span>{labelFor(bucket)}</span>
          <span className="tabular-nums">
            {bucket.videoCount} videos · {formatCompact(bucket.avgViews)} views
            {bucket.sufficient ? '' : ' *'}
          </span>
        </li>
      ))}
      <li className="col-span-2 pt-1 text-[11px] text-base-600">
        * fewer than {MIN_BUCKET_SAMPLE} videos — shown, but not used for recommendations.
      </li>
    </ul>
  );
}

/** Colour ramp for the heatmap: neutral for empty, red→green by score. */
function cellStyle(bucket: TimingBucket): { background: string; border: string } {
  if (bucket.videoCount === 0 || bucket.avgPerformanceScore === null) {
    return { background: 'rgba(35,41,57,0.4)', border: 'transparent' };
  }
  const score = bucket.avgPerformanceScore;
  const t = Math.max(0, Math.min(1, score / 100));
  // Interpolate red (0) -> amber (0.5) -> green (1).
  const color =
    t < 0.5
      ? 'rgba(248,113,113,' + (0.15 + (0.5 - t) * 1.1) + ')'
      : 'rgba(52,211,153,' + (0.15 + (t - 0.5) * 1.1) + ')';
  return { background: color, border: bucket.sufficient ? 'rgba(255,255,255,0.18)' : 'transparent' };
}

function Heatmap({ analysis }: { analysis: TimingAnalysis }) {
  const blocks = Array.from(new Set(analysis.byWindow.map((b) => b.hour))).filter(
    (h): h is number => h !== null,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-12" />
            {blocks.map((hour) => (
              <th key={hour} className="text-[10px] font-medium text-ink-muted">
                {formatHourLabel(hour)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((day) => (
            <tr key={day}>
              <th className="pr-1 text-right text-[11px] font-medium text-ink-muted">
                {DAY_SHORT[day]}
              </th>
              {blocks.map((hour) => {
                const bucket = analysis.byWindow.find((b) => b.day === day && b.hour === hour);
                if (!bucket) return <td key={hour} />;
                const style = cellStyle(bucket);
                return (
                  <td key={hour}>
                    <div
                      title={
                        bucket.dayName +
                        ' ' +
                        bucket.hourLabel +
                        ' — ' +
                        (bucket.videoCount === 0
                          ? 'no videos'
                          : bucket.videoCount +
                            ' videos, avg score ' +
                            bucket.avgPerformanceScore +
                            ', ' +
                            formatCompact(bucket.avgViews) +
                            ' avg views' +
                            (bucket.sufficient ? '' : ' (below the sample threshold)'))
                      }
                      className="flex h-8 items-center justify-center rounded text-[10px] tabular-nums text-ink"
                      style={{
                        backgroundColor: style.background,
                        boxShadow: 'inset 0 0 0 1px ' + style.border,
                      }}
                    >
                      {bucket.videoCount > 0 ? bucket.videoCount : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-muted">
        Numbers are how many videos you published in that window. Colour is the average performance
        score. Outlined cells have enough videos to be trusted.
      </p>
    </div>
  );
}
