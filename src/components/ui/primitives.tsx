import type { ReactNode } from 'react';
import clsx from 'clsx';

/** Small presentational building blocks shared across every page. */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={clsx('card', padded && 'card-pad', className)}>{children}</div>;
}

export function SectionHeading({
  title,
  description,
  action,
  tooltip,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {title}
          {tooltip ? <InfoDot text={tooltip} /> : null}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Native-title tooltip: keyboard accessible and needs no JS. */
export function InfoDot({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={text}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-base-600 text-[10px] font-bold text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
    >
      i
    </span>
  );
}

const TONES = {
  neutral: 'border-base-600 bg-base-800 text-ink-muted',
  good: 'border-good/40 bg-good/10 text-good',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  info: 'border-info/40 bg-info/10 text-info',
  brand: 'border-brand-500/40 bg-brand-500/10 text-brand-300',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The canonical "this metric does not exist" renderer.
 * Used everywhere instead of printing 0, so a missing metric always reads as
 * missing rather than as a measurement of zero.
 */
export function Unavailable({ reason, short }: { reason?: string; short?: boolean }) {
  return (
    <span
      title={reason ?? 'This metric is not available for this video or platform.'}
      className="cursor-help text-ink-muted"
    >
      {short ? '—' : 'Unavailable'}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '∅',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-base-700 px-6 py-10 text-center">
      <div className="text-2xl text-base-600" aria-hidden>
        {icon}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('rounded-lg border px-3 py-2.5 text-sm', TONES[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={clsx(title && 'mt-0.5', 'text-current/90')}>{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-base-800', className)} />;
}

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  /** 0-100. */
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const fill = {
    brand: 'bg-brand-500',
    good: 'bg-good',
    warn: 'bg-warn',
    bad: 'bg-bad',
    info: 'bg-info',
    neutral: 'bg-base-600',
  }[tone];
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-base-800', className)}>
      <div
        className={clsx('h-full rounded-full', fill)}
        style={{ width: Math.max(0, Math.min(100, value)) + '%' }}
      />
    </div>
  );
}

export function DataTable({
  headers,
  children,
  className,
}: {
  headers: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('-mx-1 overflow-x-auto', className)}>
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="border-b border-base-700">
            {headers.map((header, i) => (
              <th key={i} className="th">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base-800">{children}</tbody>
      </table>
    </div>
  );
}
