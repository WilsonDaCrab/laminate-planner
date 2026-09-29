/**
 * Lower bounds on the board count (ALGORITHM §10). Neither depends on the seam phases φ; they
 * are computed once per row configuration (θ, stack side, y0).
 *
 *   LB0 = ⌈ area(Z) / (L·W) ⌉
 *   LB1 = ⌈ max_{y_b ∈ [0, W]} Σ_s c_s(y_b) / L ⌉
 *
 * c_s(y_b) is the length of the part of the open edges of segment s (bottom ∪ top) whose piece
 * contains the board level y_b. A piece touching an open edge has its board position fixed in y,
 * and pieces on one board do not overlap, so every board supplies at most L per level.
 */

import { CLIPPER_GRID_MM, shapesArea, type Shape } from '../geometry/clip';
import type { Layout } from '../layout/bands';
import type { XProfile } from '../layout/xprofile';
import { EPS, type Mm } from '../num/index';
import { intersectIntervals, measure, unionIntervals, type Interval } from '../num/intervals';

/** The parts of a plan context the bounds need (structural, so `PlanContext` fits). */
export interface BoundsInput {
  layout: Layout;
  profiles: Record<string, XProfile>;
  zone: { shapes: readonly Shape[] };
  L: Mm;
  W: Mm;
}

export interface LowerBounds {
  lb0: number;
  lb1: number;
  /** max(lb0, lb1). */
  lb: number;
  /** Board level y_b where Σ c_s is largest (mm from the bottom edge of the board). */
  yStar: Mm;
  /** The maximum of Σ c_s (mm). */
  maxLoad: Mm;
}

/** x range of a section where `lo + slope·t ≤ y` (below = true) or `≥ y` (below = false). */
function linearRange(f0: number, f1: number, x0: number, x1: number, y: number, below: boolean) {
  const ok0 = below ? f0 <= y + EPS : f0 >= y - EPS;
  const ok1 = below ? f1 <= y + EPS : f1 >= y - EPS;
  if (ok0 && ok1) return [x0, x1] as Interval;
  if (!ok0 && !ok1) return undefined;
  const cross = x0 + ((y - f0) / (f1 - f0)) * (x1 - x0);
  return (ok0 ? [x0, cross] : [cross, x1]) as Interval;
}

/** c_s at the absolute level y: length of open-edge x inside the segment at that height. */
export function coverageAt(profile: XProfile, y: number): number {
  const open = unionIntervals(profile.openLow, profile.openHigh);
  if (open.length === 0) return 0;
  const inside: Interval[] = [];
  for (const section of profile.sections) {
    for (const s of section.spans) {
      const above = linearRange(s.loA, s.loB, section.x0, section.x1, y, true); // lo(x) ≤ y
      const below = linearRange(s.hiA, s.hiB, section.x0, section.x1, y, false); // hi(x) ≥ y
      if (!above || !below) continue;
      const lo = Math.max(above[0], below[0]);
      const hi = Math.min(above[1], below[1]);
      if (hi >= lo) inside.push([lo, hi]);
    }
  }
  return measure(intersectIntervals(open, unionIntervals(inside, [])));
}

/** Total load Σ_s c_s at board level y_b. */
export function loadAt(input: BoundsInput, yb: number): number {
  let sum = 0;
  for (const s of input.layout.segments) sum += coverageAt(input.profiles[s.id]!, s.bandLo + yb);
  return sum;
}

/** Candidate levels: the ends of the board and every vertex height inside a band. */
function candidateLevels(input: BoundsInput): number[] {
  const levels = new Set<number>([0, input.W]);
  for (const seg of input.layout.segments) {
    for (const section of input.profiles[seg.id]!.sections) {
      for (const s of section.spans) {
        for (const y of [s.loA, s.loB, s.hiA, s.hiB]) {
          const yb = y - seg.bandLo;
          if (yb >= -EPS && yb <= input.W + EPS) levels.add(Math.min(input.W, Math.max(0, yb)));
        }
      }
    }
  }
  return [...levels].sort((p, q) => p - q);
}

/** Ceiling that forgives clipping noise, so a bound never exceeds the true value. */
const ceilBound = (x: number, noise: number): number => Math.max(0, Math.ceil(x - noise - 1e-9));

export function lowerBounds(input: BoundsInput): LowerBounds {
  const { L, W } = input;
  const segments = input.layout.segments.length;
  // Each segment contributes up to one Clipper grid step of noise per unit of length coverage.
  const noise = (CLIPPER_GRID_MM * Math.max(1, segments)) / L;

  const lb0 = ceilBound(shapesArea(input.zone.shapes) / (L * W), 1e-9);

  let maxLoad = 0;
  let yStar = 0;
  for (const yb of candidateLevels(input)) {
    const load = loadAt(input, yb);
    if (load > maxLoad + EPS) {
      maxLoad = load;
      yStar = yb;
    }
  }
  const lb1 = ceilBound(maxLoad / L, noise);
  return { lb0, lb1, lb: Math.max(lb0, lb1), yStar, maxLoad };
}
