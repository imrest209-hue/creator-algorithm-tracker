'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatCompact } from '@/lib/util/format';

/**
 * Chart wrappers.
 *
 * All charts are client components (Recharts needs the DOM) and share one axis
 * / grid / tooltip style so the dashboard reads as a single system.
 */

const AXIS = {
  stroke: '#5a6479',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const GRID = { stroke: '#1d2331', strokeDasharray: '3 3' } as const;

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#11151f',
    border: '1px solid #2a3244',
    borderRadius: 10,
    fontSize: 12,
    color: '#e8ecf5',
  },
  labelStyle: { color: '#98a2b7', marginBottom: 4 },
  cursor: { fill: 'rgba(79,124,255,0.08)' },
} as const;

export const SERIES_COLORS = ['#4f7cff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee'];

function shortDate(value: string): string {
  // Values are YYYY-MM-DD bucket keys.
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return parts[1] + '/' + parts[2];
}

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
  /** Render on the right-hand axis. */
  rightAxis?: boolean;
}

export function TrendAreaChart({
  data,
  series,
  height = 260,
  xKey = 'date',
}: {
  data: Array<Record<string, string | number | null>>;
  series: SeriesDef[];
  height?: number;
  xKey?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={'grad-' + s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey={xKey} {...AXIS} tickFormatter={shortDate} minTickGap={24} />
        <YAxis {...AXIS} tickFormatter={(v: number) => formatCompact(v)} width={52} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(value: number | string) => formatCompact(Number(value))} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            fill={'url(#grad-' + s.key + ')'}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: '#98a2b7' }} /> : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Value formatting is chosen with a string token rather than a callback: these
 * are client components, and functions cannot cross the server/client boundary.
 */
export type ValueFormat = 'compact' | 'integer' | 'percent' | 'decimal' | 'multiplier';

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  compact: (v) => formatCompact(v),
  integer: (v) => String(Math.round(v)),
  percent: (v) => v.toFixed(1) + '%',
  decimal: (v) => v.toFixed(1),
  multiplier: (v) => v.toFixed(1) + 'x',
};

export function SimpleBarChart({
  data,
  bars,
  xKey,
  height = 260,
  horizontal = false,
  format = 'compact',
}: {
  data: Array<Record<string, string | number | null>>;
  bars: SeriesDef[];
  xKey: string;
  height?: number;
  horizontal?: boolean;
  format?: ValueFormat;
}) {
  const fmt = FORMATTERS[format];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : -12 }}
      >
        <CartesianGrid {...GRID} vertical={horizontal} horizontal={!horizontal} />
        {/*
         * XAxis/YAxis must be direct children of BarChart, never wrapped in a
         * Fragment - Recharts' child-type detection does not see through a
         * <>...</> here, so a Fragment-wrapped pair is silently ignored and
         * the chart falls back to a broken default scale (bars misplaced or
         * missing entirely). Two separate conditionals avoids that.
         */}
        {horizontal ? <XAxis type="number" {...AXIS} tickFormatter={fmt} /> : <XAxis dataKey={xKey} {...AXIS} interval={0} angle={0} />}
        {horizontal ? (
          <YAxis type="category" dataKey={xKey} {...AXIS} width={110} />
        ) : (
          <YAxis {...AXIS} tickFormatter={fmt} width={52} />
        )}
        <Tooltip {...TOOLTIP_STYLE} formatter={(value: number | string) => fmt(Number(value))} />
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={b.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
        {bars.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: '#98a2b7' }} /> : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VelocityLineChart({
  data,
  height = 280,
}: {
  data: Array<{ label: string; views: number | null; baselineViews: number | null }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v: number) => formatCompact(v)} width={52} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: number | string, name: string) => [
            value === null ? 'Not measured' : formatCompact(Number(value)),
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#98a2b7' }} />
        <Line
          type="monotone"
          dataKey="views"
          name="This video"
          stroke="#4f7cff"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="baselineViews"
          name="Your average"
          stroke="#98a2b7"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MixPieChart({
  data,
  height = 240,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((entry, i) => (
            <Cell key={entry.label} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP_STYLE} formatter={(value: number | string) => formatCompact(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#98a2b7' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CorrelationScatter({
  data,
  xLabel,
  yLabel,
  height = 300,
}: {
  data: Array<{ x: number; y: number; z?: number; name: string }>;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: -8 }}>
        <CartesianGrid {...GRID} />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          {...AXIS}
          tickFormatter={(v: number) => formatCompact(v)}
          label={{ value: xLabel, position: 'insideBottom', offset: -8, fill: '#98a2b7', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          {...AXIS}
          width={52}
          tickFormatter={(v: number) => formatCompact(v)}
        />
        <ZAxis type="number" dataKey="z" range={[40, 320]} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ strokeDasharray: '3 3', stroke: '#2a3244' }}
          formatter={(value: number | string, name: string) => [formatCompact(Number(value)), name]}
          labelFormatter={() => ''}
        />
        <Scatter data={data} fill="#4f7cff" isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
