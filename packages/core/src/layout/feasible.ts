/**
 * Feasible seam phases F_s ⊂ [0, L) of a segment (ALGORITHM §3.4): the phases for which every
 * start/end piece satisfies the L_min rule. Stored as sorted closed intervals of the circle
 * [0, L]; the point L is the same as 0. Simulated annealing needs three operations: draw a random
 * feasible phase, project any phase onto the nearest feasible one, and test membership.
 */

import { circDist, EPS, mod, type Mm } from '../num/index';
import { normalizeIntervals, type Interval } from '../num/intervals';
import type { Rng } from '../rng/index';
import { describePieces, meetsMinLength } from './pieces';
import type { XProfile } from './xprofile';

export interface Feasible {
  L: Mm;
  /** Sorted, disjoint, inside [0, L]; a point (lo = hi) is allowed. */
  intervals: Interval[];
}

export interface FeasibleResult {
  feasible: Feasible;
  /**
   * True when no phase satisfies L_min: the whole circle is returned and the shortfall must be
   * penalised in the objective (a warning for the user).
   */
  relaxed: boolean;
}

/** Scan step of the general path (mm), as in ALGORITHM §3.4. */
export const SCAN_STEP: Mm = 1;
const BISECTION_STEPS = 40;

/** Maps intervals in "offset space" onto the circle [0, L]: shift by `offset`, wrap, normalise. */
function toCircle(intervals: readonly Interval[], offset: number, L: Mm): Interval[] {
  const out: Interval[] = [];
  for (const [lo, hi] of intervals) {
    if (hi - lo >= L) {
      out.push([0, L]);
      continue;
    }
    const start = mod(lo + offset, L);
    const end = start + (hi - lo);
    if (end <= L) out.push([start, end]);
    else out.push([start, L], [0, end - L]);
  }
  return normalizeIntervals(out);
}

/**
 * Analytic F_s of a rectangular segment. With r = (φ − a) mod L:
 *  - no seam inside: r = 0 or r ≥ len (only possible when len ≤ L);
 *  - otherwise the first piece is s = r (L when r = 0) and the last one e = ((len − s) mod L, or L),
 *    and both must reach L_min. In s-space the feasible set is
 *    ⋃_m [len − (m+1)L, len − mL − L_min] ∩ [L_min, min(L, len)).
 */
function feasibleRect(a: Mm, b: Mm, L: Mm, minLength: Mm): Interval[] {
  const len = b - a;
  const rIntervals: Interval[] = [];

  if (len <= L + EPS) rIntervals.push([0, 0], [Math.min(len, L), L]);

  const sMax = Math.min(L, len - EPS);
  for (let m = 0; len - m * L - minLength >= minLength - EPS; m++) {
    const lo = Math.max(minLength, len - (m + 1) * L);
    const hi = Math.min(sMax, len - m * L - minLength);
    if (hi >= lo) rIntervals.push([lo, hi]);
  }
  // s = L is r = 0: on the circle both are the same phase, so mapping s → r needs no change
  // (an interval ending at L ends at the wrap point).
  return toCircle(normalizeIntervals(rIntervals), a, L);
}

/** General path: 1 mm scan of φ with bisection of every run boundary from the feasible side. */
function feasibleScan(profile: XProfile, L: Mm, minLength: Mm): Interval[] | 'all' | 'none' {
  const ok = (phi: number): boolean =>
    meetsMinLength(describePieces(profile, L, mod(phi, L)), minLength);

  const n = Math.max(1, Math.ceil(L / SCAN_STEP - 1e-9));
  const step = L / n;
  const good = Array.from({ length: n }, (_, k) => ok(k * step));
  const bad = good.indexOf(false);
  if (bad === -1) return 'all';
  if (!good.includes(true)) return 'none';

  // Walk the circle once, starting right after a bad sample, so runs never straddle the start.
  const runs: Interval[] = [];
  let k = 1;
  while (k <= n) {
    const idx = bad + k;
    if (!good[idx % n]) {
      k++;
      continue;
    }
    const first = idx;
    let last = idx;
    while (k + 1 <= n && good[(bad + k + 1) % n]) {
      k++;
      last = bad + k;
    }
    k++;

    // Left boundary between the bad sample first−1 and the good first; right between last and last+1.
    let lo = (first - 1) * step;
    let hi = first * step;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) hi = mid;
      else lo = mid;
    }
    const left = hi;
    let gl = last * step;
    let bl = (last + 1) * step;
    for (let i = 0; i < BISECTION_STEPS; i++) {
      const mid = (gl + bl) / 2;
      if (ok(mid)) gl = mid;
      else bl = mid;
    }
    runs.push([left, gl]);
  }
  return toCircle(runs, 0, L);
}

/**
 * F_s of a segment for board length L and minimum piece length L_min. Rectangles are solved
 * analytically, other segments by scanning; a scan endpoint always lies on the feasible side, so
 * the set is conservative (never contains a phase that violates L_min).
 */
export function feasibleSet(profile: XProfile, L: Mm, minLength: Mm): FeasibleResult {
  const full: Feasible = { L, intervals: [[0, L]] };
  let intervals: Interval[];
  if (profile.isRect) {
    intervals = feasibleRect(profile.a, profile.b, L, minLength);
  } else {
    const scanned = feasibleScan(profile, L, minLength);
    if (scanned === 'all') return { feasible: full, relaxed: false };
    if (scanned === 'none') return { feasible: full, relaxed: true };
    intervals = scanned;
  }
  if (intervals.length === 0) return { feasible: full, relaxed: true };
  return { feasible: { L, intervals }, relaxed: false };
}

/** Membership test (phases are taken modulo L; 0 and L are the same point). */
export function contains(F: Feasible, phi: number): boolean {
  const p = mod(phi, F.L);
  const intervals = F.intervals;
  // A plain loop: this is called several times per proposed move.
  for (let i = 0; i < intervals.length; i++) {
    const lo = intervals[i]![0];
    const hi = intervals[i]![1];
    if ((p >= lo - EPS && p <= hi + EPS) || (p + F.L >= lo - EPS && p + F.L <= hi + EPS))
      return true;
  }
  return false;
}

/** Total length of the feasible set. */
export const measureOf = (F: Feasible): number =>
  F.intervals.reduce((s, [lo, hi]) => s + (hi - lo), 0);

/** A uniformly distributed feasible phase (a random point if the set has zero length). */
export function sample(F: Feasible, rng: Rng): number {
  if (F.intervals.length === 0) throw new RangeError('sample: empty feasible set');
  const total = measureOf(F);
  if (total <= 0) return mod(rng.pick(F.intervals)[0], F.L);
  let u = rng.next() * total;
  for (const [lo, hi] of F.intervals) {
    const len = hi - lo;
    if (u < len) return mod(lo + u, F.L);
    u -= len;
  }
  return mod(F.intervals[F.intervals.length - 1]![1], F.L);
}

/** The feasible phase nearest to φ on the circle (φ itself when feasible). */
export function project(F: Feasible, phi: number): number {
  if (F.intervals.length === 0) throw new RangeError('project: empty feasible set');
  const p = mod(phi, F.L);
  if (contains(F, p)) return p;
  let best = F.intervals[0]![0];
  let bestDist = Infinity;
  for (const [lo, hi] of F.intervals) {
    for (const end of [lo, hi]) {
      const d = circDist(p, end, F.L);
      if (d < bestDist) {
        bestDist = d;
        best = end;
      }
    }
  }
  return mod(best, F.L);
}
