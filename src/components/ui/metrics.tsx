import type { ReactNode } from 'react';
import clsx from 'clsx';
import { DATA_SOURCE_LABELS, PLATFORM_LABELS, type DataSource, type Platform } from '@/lib/types';
import { scoreBand } from '@/lib/analytics/score';
import { viralBand } from '@/lib/analytics/viral';
import { formatDelta } from '@/lib/util/format';
import { Badge, InfoDot, Unavailable, type Tone } from '@/components/ui/primitives';

/** Metric-flavoured display components. */

export function StatCard({
  label,
  value,
  delta,
  hint,
  unavailableNote,
  footer,
  tone,
}: {
  label: string;
  value: string | null;
  delta?: number | null;
  hint?: string;
  unavailableNote?: string | null;
  footer?: ReactNode;
  tone?: Tone;
}) {
  const deltaTone =
    delta === null || delta === undefined ? 'neutral' : delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral';
  return (
    <div className="card card-pad flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="label">{label}</span>
        {hint ? <InfoDot text={hint} /> : null}
      </div>
      {value === null ? (
        <p className="text-lg font-semibold">
          <Unavailable reason={unavailableNote ?? undefined} />
        </p>
      ) : (
        <p
          className={clsx(
            'text-2xl font-semibold tabular-nums',
            tone === 'good' && 'text-good',
            tone === 'bad' && 'text-bad',
          )}
        >
          {value}
        </p>
      )}
      <div className="flex items-center gap-2">
        {delta !== null && delta !== undefined ? (
          <Badge tone={deltaTone} title="Change vs the equivalent preceding period">
            {formatDelta(delta)}
          </Badge>
        ) : null}
        {footer}
      </div>
    </div>
  );
}

const PLATFORM_TONE: Record<Platform, string> = {
  YOUTUBE: 'border-yt/40 bg-yt/10 text-yt',
  YOUTUBE_SHORTS: 'border-sh/40 bg-sh/10 text-sh',
  TIKTOK: 'border-tt/40 bg-tt/10 text-tt',
  TWITCH: 'border-tw/40 bg-tw/10 text-tw',
  KICK: 'border-kk/40 bg-kk/10 text-kk',
};

const PLATFORM_SHORT: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  YOUTUBE_SHORTS: 'Shorts',
  TIKTOK: 'TikTok',
  TWITCH: 'Twitch',
  KICK: 'Kick',
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span
      title={PLATFORM_LABELS[platform]}
      className={clsx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        PLATFORM_TONE[platform],
      )}
    >
      {PLATFORM_SHORT[platform]}
    </span>
  );
}

export function SourceBadge({ source }: { source: DataSource }) {
  if (source === 'DEMO') {
    return (
      <Badge tone="warn" title="Synthetic demo data - not real analytics">
        DEMO
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" title={'Data source: ' + DATA_SOURCE_LABELS[source]}>
      {DATA_SOURCE_LABELS[source]}
    </Badge>
  );
}

const TONE_TEXT: Record<'good' | 'ok' | 'warn' | 'bad', string> = {
  good: 'text-good',
  ok: 'text-info',
  warn: 'text-warn',
  bad: 'text-bad',
};

const TONE_RING: Record<'good' | 'ok' | 'warn' | 'bad', string> = {
  good: 'var(--good)',
  ok: 'var(--info)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

type ScoreConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | undefined;

const INSUFFICIENT_DATA_TITLE =
  'Not enough comparison videos yet for this baseline. This is not a score of zero - once more videos exist to compare against, a real score will appear.';

export function ScoreRing({
  score,
  size = 72,
  label = 'Performance',
  kind = 'performance',
  confidence,
}: {
  score: number;
  size?: number;
  label?: string;
  kind?: 'performance' | 'viral';
  /** Pass the score's confidence so a NONE baseline renders "N/A" instead of a misleading 0. */
  confidence?: ScoreConfidence;
}) {
  const insufficientData = confidence === 'NONE';
  const band = kind === 'viral' ? viralBand(score) : scoreBand(score);
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = insufficientData ? 0 : (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={insufficientData ? label + ' - not enough data yet' : label + ' score ' + score + ' out of 100'}
      >
        <title>{insufficientData ? INSUFFICIENT_DATA_TITLE : undefined}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        {insufficientData ? null : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={TONE_RING[band.tone]}
            strokeWidth={stroke}
            strokeDasharray={dash + ' ' + circumference}
            strokeLinecap="round"
            transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
          />
        )}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-current text-ink"
          style={{ fontSize: insufficientData ? size / 4.5 : size / 3.2, fontWeight: 600 }}
        >
          {insufficientData ? 'N/A' : score}
        </text>
      </svg>
      <div>
        <p className="label">{label}</p>
        <p
          className={clsx(
            'text-sm font-semibold',
            insufficientData ? 'text-ink-muted' : TONE_TEXT[band.tone],
          )}
          title={insufficientData ? INSUFFICIENT_DATA_TITLE : undefined}
        >
          {insufficientData ? 'Not enough data' : band.label}
        </p>
      </div>
    </div>
  );
}

export function ScorePill({
  score,
  kind = 'performance',
  confidence,
}: {
  score: number;
  kind?: 'performance' | 'viral';
  /** Pass the score's confidence so a NONE baseline renders "N/A" instead of a misleading 0. */
  confidence?: ScoreConfidence;
}) {
  if (confidence === 'NONE') {
    return (
      <Badge tone="neutral" title={INSUFFICIENT_DATA_TITLE}>
        N/A
      </Badge>
    );
  }
  const band = kind === 'viral' ? viralBand(score) : scoreBand(score);
  const tone: Tone = band.tone === 'ok' ? 'info' : band.tone;
  return (
    <Badge tone={tone} title={band.label}>
      <span className="tabular-nums">{score}</span>
      <span className="opacity-60">/100</span>
    </Badge>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const tone: Tone =
    confidence === 'HIGH' ? 'good' : confidence === 'MEDIUM' ? 'info' : confidence === 'LOW' ? 'warn' : 'neutral';
  return (
    <Badge
      tone={tone}
      title="Confidence reflects how many of your own videos the comparison had available."
    >
      Confidence: {confidence.charAt(0) + confidence.slice(1).toLowerCase()}
    </Badge>
  );
}

export function TrendArrow({ direction }: { direction: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN' }) {
  const map = {
    UP: { icon: '▲', tone: 'good' as Tone, label: 'Improving' },
    DOWN: { icon: '▼', tone: 'bad' as Tone, label: 'Declining' },
    FLAT: { icon: '■', tone: 'neutral' as Tone, label: 'Stable' },
    UNKNOWN: { icon: '?', tone: 'neutral' as Tone, label: 'Unknown' },
  }[direction];
  return (
    <Badge tone={map.tone}>
      <span aria-hidden>{map.icon}</span> {map.label}
    </Badge>
  );
}
