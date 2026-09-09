/** Small numeric helpers shared by the analytics engine. */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Arithmetic mean, ignoring null/undefined/NaN. Returns null when nothing usable. */
export function mean(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

export function median(values: Array<number | null | undefined>): number | null {
  const usable = values
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (usable.length === 0) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 === 0 ? (usable[mid - 1] + usable[mid]) / 2 : usable[mid];
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (acc, v) => acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0),
    0,
  );
}

/** Safe division; returns null instead of Infinity/NaN. */
export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Maps a "value vs baseline" ratio onto a 0-100 subscore using a log2 curve.
 *
 * This is the single shared curve behind every scoring component, which is what
 * keeps the score explainable:
 *   0.25x -> 0, 0.5x -> 25, 1x (at baseline) -> 50, 2x -> 75, 4x -> 100
 */
export function ratioToScore(ratio: number | null): number | null {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) return null;
  if (ratio === 0) return 0;
  return clamp(50 + (50 * Math.log2(ratio)) / 2, 0, 100);
}

/** Percentage difference of value against baseline, e.g. 0.32 => +32%. */
export function percentDelta(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return (value - baseline) / baseline;
}

/** Population standard deviation. */
export function stdDev(values: number[]): number | null {
  if (values.length === 0) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Slope of a simple least-squares fit; used for trend direction. */
export function linearSlope(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}
