import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { HOOK_LABELS, PLATFORM_LABELS } from '@/lib/types';
import { getViewer } from '@/lib/data/viewer';
import { computePerformanceScore, type ScoreComponentResult } from '@/lib/analytics/score';
import { computeViralPotential } from '@/lib/analytics/viral';
import { analyseVelocity } from '@/lib/analytics/velocity';
import { deriveMetrics } from '@/lib/analytics/metrics';
import { DAY_NAMES, formatHourLabel, zonedParts } from '@/lib/util/date';
import {
  formatCompact,
  formatDateTime,
  formatDelta,
  formatDuration,
  formatMinutes,
  formatNumber,
  formatPercent,
} from '@/lib/util/format';
import { PageHeader } from '@/components/layout/Shell';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeading,
  Unavailable,
} from '@/components/ui/primitives';
import {
  ConfidenceBadge,
  PlatformBadge,
  ScoreRing,
  SourceBadge,
} from '@/components/ui/metrics';
import { VelocityLineChart } from '@/components/charts/Charts';

export const metadata: Metadata = { title: 'Video detail' };

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  const { dataset } = viewer;
  const video = dataset.videos.find((v) => v.id === id);
  if (!video) notFound();

  const now = new Date();
  const all = dataset.videos;
  const score = computePerformanceScore(video, all, now);
  const viral = computeViralPotential(video, all, now);
  const velocity = analyseVelocity(video, all, now);
  const derived = deriveMetrics(video, now);
  const posted = zonedParts(video.publishedAt, dataset.timezone);

  return (
    <>
      <PageHeader
        title={video.title}
        showFilter={false}
        description={
          PLATFORM_LABELS[video.platform] +
          ' · ' +
          formatDateTime(video.publishedAt, dataset.timezone) +
          ' · ' +
          DAY_NAMES[posted.day] +
          ' ' +
          formatHourLabel(posted.hour)
        }
        actions={
          <div className="flex gap-2">
            <Link href="/videos" className="btn-ghost">
              ← All videos
            </Link>
            <Link href={'/compare?ids=' + video.id} className="btn-ghost">
              Compare
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PlatformBadge platform={video.platform} />
        <SourceBadge source={video.source} />
        <Badge tone="neutral">{video.categoryName}</Badge>
        <Badge tone="neutral" title="Hook style, classified from the hook text">
          {HOOK_LABELS[video.hookType]}
        </Badge>
        <Badge tone="neutral">{formatDuration(video.durationSeconds)}</Badge>
        {video.hashtags.slice(0, 6).map((tag) => (
          <Badge key={tag} tone="brand">
            {tag}
          </Badge>
        ))}
      </div>

      {velocity.alerts.length > 0 ? (
        <div className="mb-5 space-y-2">
          {velocity.alerts.map((alert) => (
            <Alert
              key={alert.id}
              tone={alert.severity === 'GOOD' ? 'good' : alert.severity === 'WARN' ? 'warn' : 'info'}
            >
              <span className="mr-1.5" aria-hidden>
                {alert.icon}
              </span>
              {alert.message}
            </Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* --- Score breakdown ------------------------------------------ */}
        <Card className="xl:col-span-2">
          <SectionHeading
            title="Performance score"
            description="Every component is one of your own metrics compared with your own historical average. No hidden model, and no claim about how the platform ranks content."
            action={<ConfidenceBadge confidence={score.confidence} />}
          />

          <div className="mb-4 flex flex-wrap items-center gap-6">
            <ScoreRing score={score.score} size={92} label="Performance score" confidence={score.confidence} />
            <div className="min-w-[240px] flex-1">
              <p className="label mb-1.5">Why this score</p>
              <ul className="space-y-1 text-sm">
                {score.reasons.map((reason, i) => (
                  <li key={i} className="flex gap-2 text-ink-muted">
                    <span aria-hidden className="text-brand-400">
                      •
                    </span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">{score.basisNote}</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {score.components.map((component) => (
              <ComponentRow key={component.key} component={component} />
            ))}
          </div>
        </Card>

        {/* --- Viral potential ------------------------------------------ */}
        <Card>
          <SectionHeading
            title="Viral potential"
            tooltip="Built only from early-life signals: view velocity, retention, shares, comments, engagement and follower conversion."
          />
          <div className="mb-3 flex items-center justify-between gap-3">
            <ScoreRing score={viral.score} size={82} kind="viral" label="Viral potential" confidence={viral.confidence} />
            <ConfidenceBadge confidence={viral.confidence} />
          </div>
          <p className="text-sm text-ink">{viral.reason}</p>

          <div className="mt-4 space-y-2">
            {viral.factors.map((factor) => (
              <div key={factor.key} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted">{factor.label}</span>
                  <span className="tabular-nums">
                    {factor.available && factor.multiplier !== null ? (
                      <span className={factor.multiplier >= 1 ? 'text-good' : 'text-ink-muted'}>
                        {factor.multiplier.toFixed(1)}x
                      </span>
                    ) : (
                      <Unavailable short reason={factor.note ?? undefined} />
                    )}
                  </span>
                </div>
                <ProgressBar
                  value={factor.subscore ?? 0}
                  tone={factor.available ? 'brand' : 'neutral'}
                  className="mt-1"
                />
              </div>
            ))}
          </div>

          <p className="mt-4 border-t border-base-800 pt-3 text-xs leading-relaxed text-ink-muted">
            {viral.disclaimer}
          </p>
        </Card>
      </div>

      {/* --- Velocity --------------------------------------------------- */}
      <Card className="mt-4">
        <SectionHeading
          title="View velocity"
          description="Measured views at each milestone after publish, against the average for the rest of your catalogue. Milestones with no snapshot are left blank rather than estimated."
        />
        {velocity.hasAnySnapshot ? (
          <>
            <VelocityLineChart
              data={velocity.points.map((p) => ({
                label: p.label,
                views: p.views,
                baselineViews: p.baselineViews,
              }))}
            />
            <div className="-mx-1 mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-base-700">
                    <th className="th">Milestone</th>
                    {velocity.points.map((p) => (
                      <th key={p.minutes} className="th text-right">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-800">
                  <tr>
                    <td className="td text-ink-muted">Views</td>
                    {velocity.points.map((p) => (
                      <td key={p.minutes} className="td text-right tabular-nums">
                        {p.views === null ? (
                          <Unavailable
                            short
                            reason={p.pending ? 'This video has not reached this milestone yet.' : 'Not measured.'}
                          />
                        ) : (
                          formatCompact(p.views)
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="td text-ink-muted">vs your average</td>
                    {velocity.points.map((p) => (
                      <td key={p.minutes} className="td text-right tabular-nums">
                        {p.multiplier === null ? (
                          <Unavailable short />
                        ) : (
                          <span className={p.multiplier >= 1 ? 'text-good' : 'text-bad'}>
                            {p.multiplier.toFixed(2)}x
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon="⚡"
            title="No velocity snapshots for this video"
            description="Velocity tracking needs view counts recorded at fixed milestones after publish. Add them through CSV import or the manual entry form."
          />
        )}
      </Card>

      {/* --- Raw metrics ------------------------------------------------ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionHeading title="Audience" />
          <MetricList
            items={[
              { label: 'Views', value: formatNumber(video.metrics.views) },
              { label: 'Views / hour (lifetime)', value: formatNumber(derived.viewsPerHour) },
              { label: 'Views / day (lifetime)', value: formatNumber(derived.viewsPerDay) },
              {
                label: 'Impressions',
                value: video.metrics.impressions === null ? null : formatNumber(video.metrics.impressions),
                unavailableReason: 'Impressions are only exposed by the YouTube Analytics API.',
              },
              {
                label: 'Click-through rate',
                value: video.metrics.clickThroughRate === null ? null : formatPercent(video.metrics.clickThroughRate, 2),
                unavailableReason: 'CTR is not available for this platform or channel.',
              },
            ]}
          />
        </Card>

        <Card>
          <SectionHeading title="Retention" />
          <MetricList
            items={[
              {
                label: 'Average percentage viewed',
                value: video.metrics.averagePercentageViewed === null ? null : formatPercent(video.metrics.averagePercentageViewed),
                unavailableReason: 'Retention is not exposed by this platform API. Import it via CSV to enable retention analysis.',
              },
              {
                label: 'Average view duration',
                value: video.metrics.averageViewDurationSeconds === null ? null : formatDuration(video.metrics.averageViewDurationSeconds),
                unavailableReason: 'Average view duration is not available for this video.',
              },
              {
                label: 'Total watch time',
                value: video.metrics.watchTimeMinutes === null ? null : formatMinutes(video.metrics.watchTimeMinutes),
                unavailableReason: 'Watch time is not available for this video.',
              },
              { label: 'Video length', value: formatDuration(video.durationSeconds) },
            ]}
          />
        </Card>

        <Card>
          <SectionHeading title="Engagement" />
          <MetricList
            items={[
              { label: 'Likes', value: formatNumber(video.metrics.likes) },
              { label: 'Comments', value: formatNumber(video.metrics.comments) },
              {
                label: 'Shares',
                value: formatNumber(video.metrics.shares),
                note: video.platform === 'YOUTUBE' ? 'YouTube does not expose share counts via API.' : undefined,
              },
              {
                label: 'Saves / favourites',
                value: video.metrics.saves === null ? null : formatNumber(video.metrics.saves),
                unavailableReason: 'Saves are not exposed for this platform.',
              },
              {
                label: 'Followers gained',
                value: video.metrics.followersGained === null ? null : formatNumber(video.metrics.followersGained),
                unavailableReason: 'Per-video follower attribution is not available for this platform.',
              },
              {
                label: 'Engagement rate',
                value: derived.engagementRate === null ? null : formatPercent(derived.engagementRate, 2),
              },
            ]}
          />
        </Card>
      </div>

      {/* --- Content --------------------------------------------------- */}
      <Card className="mt-4">
        <SectionHeading title="Content" />
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="label">Hook</dt>
            <dd className="mt-1 text-sm text-ink">
              {video.hookText ? (
                <>
                  <span className="italic">“{video.hookText}”</span>
                  <span className="mt-1 block text-xs text-ink-muted">
                    Classified as {HOOK_LABELS[video.hookType]}
                    {video.hookAuto ? ' (automatically)' : ' (set by you)'}
                  </span>
                </>
              ) : (
                <span className="text-ink-muted">
                  No hook recorded. Add one to include this video in hook analysis.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="label">Caption</dt>
            <dd className="mt-1 text-sm text-ink-muted">{video.caption ?? '—'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="label">Description</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
              {video.description ?? '—'}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}

function ComponentRow({ component }: { component: ScoreComponentResult }) {
  const unitSuffix = component.unit === 'percent' ? '%' : component.unit === 'perHour' ? '/hr' : '';
  const fmt = (value: number | null) => {
    if (value === null) return '—';
    if (component.unit === 'count') return formatCompact(value);
    if (component.unit === 'percent') return value.toFixed(2) + unitSuffix;
    return value.toFixed(1) + unitSuffix;
  };

  return (
    <div className="rounded-lg border border-base-800 bg-base-900/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">{component.label}</span>
          <Badge tone="neutral" title="Share of the final score after redistribution">
            {component.effectiveWeight.toFixed(0)}% weight
          </Badge>
        </div>
        {component.available ? (
          <div className="flex items-center gap-3 text-sm tabular-nums">
            <span className="text-ink-muted">
              {fmt(component.value)} vs {fmt(component.baseline)}
            </span>
            <span
              className={
                (component.delta ?? 0) > 0
                  ? 'font-medium text-good'
                  : (component.delta ?? 0) < 0
                    ? 'font-medium text-bad'
                    : 'text-ink-muted'
              }
            >
              {formatDelta(component.delta)}
            </span>
            <span className="w-14 text-right font-semibold">{component.subscore?.toFixed(0)}/100</span>
          </div>
        ) : (
          <Unavailable reason={component.unavailableReason ?? undefined} />
        )}
      </div>
      {component.available ? (
        <>
          <ProgressBar
            value={component.subscore ?? 0}
            tone={(component.subscore ?? 0) >= 50 ? 'good' : 'warn'}
            className="mt-2"
          />
          {component.note ? (
            <p className="mt-1.5 text-xs text-warn/80">{component.note}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">{component.unavailableReason}</p>
      )}
    </div>
  );
}

function MetricList({
  items,
}: {
  items: Array<{ label: string; value: string | null; unavailableReason?: string; note?: string }>;
}) {
  return (
    <dl className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 text-sm">
          <dt className="text-ink-muted">{item.label}</dt>
          <dd className="tabular-nums">
            {item.value === null ? (
              <Unavailable reason={item.unavailableReason} />
            ) : (
              <span title={item.note}>{item.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
