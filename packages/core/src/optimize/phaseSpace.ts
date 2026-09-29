/**
 * The search space of the phase vector: per segment the feasible set F_s (ALGORITHM §3.4), the
 * projection onto it, the whole-millimetre rule (ADR-013) and the equivalence classes of move M3.
 */

import { contains, project, sample, type Feasible } from '../layout/feasible';
import type { PlanContext } from '../plan/context';
import { EPS, mod } from '../num/index';
import type { Rng } from '../rng/index';

const key = (x: number): string => (Math.round(x * 1e6) / 1e6).toString();

export class PhaseSpace {
  readonly L: number;
  readonly size: number;
  readonly feasible: Feasible[];
  /** Left end a_s of each segment (the start piece has length (φ − a) mod L). */
  readonly a: number[];
  readonly b: number[];
  /** Rectangular segments keep φ − a whole; the others stay continuous. */
  readonly rect: boolean[];
  /** M3 classes: segments whose pieces are identical for equal φ, so swapping keeps B (else singletons). */
  readonly classes: number[][];
  readonly classOf: number[];
  /** Segment indices per band, bands ascending (M5). */
  readonly bands: number[][];

  constructor(ctx: PlanContext) {
    const segs = ctx.layout.segments;
    this.L = ctx.L;
    this.size = segs.length;
    this.feasible = segs.map((s) => ctx.feasible[s.id]!.feasible);
    this.a = segs.map((s) => ctx.profiles[s.id]!.a);
    this.b = segs.map((s) => ctx.profiles[s.id]!.b);
    this.rect = segs.map((s) => ctx.profiles[s.id]!.isRect);

    const classIndex = new Map<string, number>();
    this.classOf = [];
    this.classes = [];
    segs.forEach((s, i) => {
      const p = ctx.profiles[s.id]!;
      const k = this.rect[i]
        ? [
            key(mod(p.a, ctx.L)),
            key(p.b - p.a),
            p.openLow.length > 0,
            p.openHigh.length > 0,
            key(p.yHi - p.yLo),
            key(p.bandHi - p.bandLo),
          ].join('|')
        : `single:${i}`;
      let c = classIndex.get(k);
      if (c === undefined) {
        c = this.classes.length;
        classIndex.set(k, c);
        this.classes.push([]);
      }
      this.classes[c]!.push(i);
      this.classOf.push(c);
    });

    const bands = new Map<number, number[]>();
    segs.forEach((s, i) => {
      const list = bands.get(s.band) ?? [];
      list.push(i);
      bands.set(s.band, list);
    });
    this.bands = [...bands.entries()].sort((p, q) => p[0] - q[0]).map(([, list]) => list);
  }

  /** The feasible phase nearest to φ; for rectangular segments preferably with φ − a whole. */
  place(i: number, phi: number): number {
    const F = this.feasible[i]!;
    const p = project(F, phi);
    if (!this.rect[i]) return p;
    const a = this.a[i]!;
    const off = p - a;
    let v = mod(a + Math.round(off), this.L);
    if (contains(F, v)) return v;
    v = mod(a + Math.floor(off), this.L);
    if (contains(F, v)) return v;
    v = mod(a + Math.ceil(off), this.L);
    return contains(F, v) ? v : p;
  }

  /**
   * Length of the start piece of segment `i` for phase φ: the distance from a_s to the first seam
   * (a seam at the wall makes a whole board). Undefined when the segment has no seam (one piece).
   */
  startLen(i: number, phi: number): number | undefined {
    const r = mod(phi - this.a[i]!, this.L);
    const first = this.a[i]! + (r > EPS ? r : this.L);
    return first < this.b[i]! - EPS ? first - this.a[i]! : undefined;
  }

  /** Length of the end piece of segment `i` for phase φ (from the last seam to b_s); see `startLen`. */
  endLen(i: number, phi: number): number | undefined {
    const r = mod(phi - this.a[i]!, this.L);
    const first = this.a[i]! + (r > EPS ? r : this.L);
    if (!(first < this.b[i]! - EPS)) return undefined;
    const last = first + Math.floor((this.b[i]! - EPS - first) / this.L) * this.L;
    return this.b[i]! - last;
  }

  /** A uniformly random feasible phase (whole-mm for rectangular segments). */
  sample(i: number, rng: Rng): number {
    return this.place(i, sample(this.feasible[i]!, rng));
  }

  /** φ if it lies exactly in F_s, else undefined (no rounding: used by the targeted move M4). */
  exact(i: number, phi: number): number | undefined {
    const v = mod(phi, this.L);
    return contains(this.feasible[i]!, v) ? v : undefined;
  }
}
