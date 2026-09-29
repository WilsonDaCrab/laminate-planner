/**
 * Arcs are stored exactly as edge `bulge = tan(θ/4)` (DXF convention, θ = signed included angle).
 * bulge > 0: the arc runs counter-clockwise from p0 to p1 and bulges to the right of the
 * directed chord (outwards for a CCW room outline); bulge < 0 mirrors that; ±1 is a semicircle.
 * This is the ONLY module that turns arcs into polylines (tolerance ARC_TOL).
 */

import type { Mm } from '../num/index';
import { dist, midpoint, perp, type Vec2 } from './vec';

/** Maximum allowed deviation (mm) between an arc and its polyline. */
export const ARC_TOL: Mm = 0.5;

/** Minimum number of segments for an arc edge and for a full circle. */
export const MIN_ARC_SEGMENTS = 2;
export const MIN_CIRCLE_SEGMENTS = 8;

export interface Arc {
  center: Vec2;
  radius: Mm;
  /** Angle of p0 as seen from the centre (radians). */
  startAngle: number;
  /** Signed included angle θ (radians); > 0 counter-clockwise. |θ| < 2π. */
  sweep: number;
  /** Chord length |p0 p1|. */
  chord: Mm;
  /** Sagitta (height of the arc over its chord), always ≥ 0. */
  sagitta: Mm;
}

export const bulgeFromSweep = (sweep: number): number => Math.tan(sweep / 4);
export const sweepFromBulge = (bulge: number): number => 4 * Math.atan(bulge);

/** Signed bulge for a given chord and sagitta; `sign` selects the side (+1 / -1). */
export function bulgeFromSagitta(chord: Mm, sagitta: Mm, sign: 1 | -1 = 1): number {
  return (sign * 2 * sagitta) / chord;
}

/** Radius from chord and sagitta: r = (c²/4 + s²) / (2s). */
export function radiusFromChordSagitta(chord: Mm, sagitta: Mm): Mm {
  return (chord * chord) / 4 / (2 * sagitta) + sagitta / 2;
}

/** Full arc description for edge p0 → p1 with a non-zero bulge. */
export function arcFromBulge(p0: Vec2, p1: Vec2, bulge: number): Arc {
  if (bulge === 0) throw new RangeError('arcFromBulge: bulge must be non-zero');
  const chord = dist(p0, p1);
  if (chord === 0) throw new RangeError('arcFromBulge: zero-length chord');
  const sweep = sweepFromBulge(bulge);
  const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2));
  const sagitta = (chord / 2) * Math.abs(bulge);
  const mid = midpoint(p0, p1);
  const left = perp({ x: (p1.x - p0.x) / chord, y: (p1.y - p0.y) / chord });
  const k = ((chord / 2) * (1 - bulge * bulge)) / (2 * bulge);
  const center = { x: mid.x + left.x * k, y: mid.y + left.y * k };
  return {
    center,
    radius,
    startAngle: Math.atan2(p0.y - center.y, p0.x - center.x),
    sweep,
    chord,
    sagitta,
  };
}

/** Point on the arc at parameter t ∈ [0, 1] (0 = p0, 1 = p1). */
export function arcPoint(arc: Arc, t: number): Vec2 {
  const a = arc.startAngle + arc.sweep * t;
  return { x: arc.center.x + arc.radius * Math.cos(a), y: arc.center.y + arc.radius * Math.sin(a) };
}

/** Area between the arc and its chord, signed: positive for a bulge > 0, negative for < 0. */
export function arcSegmentArea(arc: Arc): number {
  return ((arc.radius * arc.radius) / 2) * (arc.sweep - Math.sin(arc.sweep));
}

/** Number of polyline segments so that the deviation from the arc stays ≤ tol. */
export function arcSegmentCount(radius: Mm, sweep: number, min: number, tol: Mm = ARC_TOL): number {
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / radius)));
  if (!(step > 0)) return min;
  return Math.max(min, Math.ceil(Math.abs(sweep) / step - 1e-9));
}

/** Interior points of the arc p0 → p1 (endpoints excluded), in travel order. */
export function discretizeEdge(p0: Vec2, p1: Vec2, bulge: number, tol: Mm = ARC_TOL): Vec2[] {
  if (bulge === 0) return [];
  const arc = arcFromBulge(p0, p1, bulge);
  const n = arcSegmentCount(arc.radius, arc.sweep, MIN_ARC_SEGMENTS, tol);
  const out: Vec2[] = [];
  for (let i = 1; i < n; i++) out.push(arcPoint(arc, i / n));
  return out;
}

export interface DiscretizedPolygon {
  points: Vec2[];
  /** For output edge k (points[k] → points[k+1], wrapping): index of the original outline edge. */
  sourceEdge: number[];
  /** For output edge k: true when it is a piece of an arc (bulge ≠ 0). */
  fromArc: boolean[];
}

/**
 * Turns an outline with optional per-edge bulges into a plain polygon. Original vertices are
 * kept; each output edge remembers the outline edge it came from (`sourceEdge`).
 */
export function discretizePolygon(
  outline: readonly Vec2[],
  bulges: readonly (number | undefined)[] = [],
  tol: Mm = ARC_TOL,
): DiscretizedPolygon {
  const points: Vec2[] = [];
  const sourceEdge: number[] = [];
  const fromArc: boolean[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const p0 = outline[i] as Vec2;
    const p1 = outline[(i + 1) % n] as Vec2;
    const bulge = bulges[i] ?? 0;
    const inner = discretizeEdge(p0, p1, bulge, tol);
    points.push(p0, ...inner);
    for (let k = 0; k <= inner.length; k++) {
      sourceEdge.push(i);
      fromArc.push(bulge !== 0);
    }
  }
  return { points, sourceEdge, fromArc };
}

/**
 * Regular polygon approximating a circle, counter-clockwise, first vertex at angle 0.
 * 'inscribed': vertices on the circle (max deviation ≤ tol, polygon slightly smaller).
 * 'circumscribed': edge midpoints on the circle (polygon contains the circle) — use for obstacles.
 */
export function discretizeCircle(
  center: Vec2,
  diameter: Mm,
  mode: 'inscribed' | 'circumscribed' = 'inscribed',
  tol: Mm = ARC_TOL,
): Vec2[] {
  const r = diameter / 2;
  const n = arcSegmentCount(r, 2 * Math.PI, MIN_CIRCLE_SEGMENTS, tol);
  const rv = mode === 'circumscribed' ? r / Math.cos(Math.PI / n) : r;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push({ x: center.x + rv * Math.cos(a), y: center.y + rv * Math.sin(a) });
  }
  return out;
}
