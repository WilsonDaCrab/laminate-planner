/**
 * Sets of closed intervals on a line, kept sorted, merged and free of overlaps.
 * Used for open edges (neighbours) and for feasible seam phases.
 */

import { EPS } from './index';

export type Interval = [lo: number, hi: number];

export interface NormalizeOptions {
  /** Intervals closer than this are merged (default EPS). */
  eps?: number;
  /** Drop intervals shorter than this (default 0: points are kept). */
  minLength?: number;
}

/** Sorts, merges touching/overlapping intervals and drops empty or too-short ones. */
export function normalizeIntervals(
  intervals: readonly (readonly [number, number])[],
  opts: NormalizeOptions = {},
): Interval[] {
  const eps = opts.eps ?? EPS;
  const minLength = opts.minLength ?? 0;
  const sorted = intervals
    .filter(([lo, hi]) => hi >= lo)
    .map(([lo, hi]): Interval => [lo, hi])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + eps) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv);
  }
  return minLength > 0 ? out.filter(([lo, hi]) => hi - lo >= minLength) : out;
}

export const unionIntervals = (
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
  opts?: NormalizeOptions,
): Interval[] => normalizeIntervals([...a, ...b], opts);

/** Intersection of two normalised sets; touching intervals give a point [x, x]. */
export function intersectIntervals(
  a: readonly (readonly [number, number])[],
  b: readonly (readonly [number, number])[],
  opts: NormalizeOptions = {},
): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const p = a[i] as readonly [number, number];
    const q = b[j] as readonly [number, number];
    const lo = Math.max(p[0], q[0]);
    const hi = Math.min(p[1], q[1]);
    if (hi >= lo) out.push([lo, hi]);
    if (p[1] < q[1]) i++;
    else j++;
  }
  return normalizeIntervals(out, { ...opts, eps: opts.eps ?? 0 });
}

/** Total length of a set of intervals. */
export const measure = (a: readonly (readonly [number, number])[]): number =>
  a.reduce((s, [lo, hi]) => s + (hi - lo), 0);

/** Length of the part of `a` inside [lo, hi]. */
export const overlapMeasure = (
  a: readonly (readonly [number, number])[],
  lo: number,
  hi: number,
): number => measure(intersectIntervals(a, [[lo, hi]]));

/** The parts of [lo, hi] not covered by `a` (a must be normalised). */
export function complementIntervals(
  a: readonly (readonly [number, number])[],
  lo: number,
  hi: number,
): Interval[] {
  const out: Interval[] = [];
  let cursor = lo;
  for (const [s, e] of a) {
    if (e <= cursor) continue;
    if (s >= hi) break;
    if (s > cursor) out.push([cursor, Math.min(s, hi)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < hi) out.push([cursor, hi]);
  return out;
}
