/**
 * Coordinate frames: room ↔ row ↔ board. All conversions between them go through this module.
 *
 * - room:  the user's drawing.
 * - row:   rotated by −θ so rows run along +x and stack along +y; mirrored about the x axis
 *          when `stackSide = 'right'`.
 * - board: x_b ∈ [0, L], y_b ∈ [0, W]; a pure translation of the row frame (board orientation is fixed).
 */

import type { Shape } from './clip';
import { cross, type Vec2 } from './vec';

/** Affine map: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type StackSide = 'left' | 'right';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const translation = (dx: number, dy: number): Affine => ({ ...IDENTITY, e: dx, f: dy });

/** Counter-clockwise rotation about the origin (radians). */
export function rotation(angle: number): Affine {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
}

/** Mirror about the x axis (y → −y). */
export const mirrorX: Affine = { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 };

/** `compose(outer, inner)` applies `inner` first, then `outer`. */
export function compose(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

export const determinant = (m: Affine): number => m.a * m.d - m.b * m.c;

export function invert(m: Affine): Affine {
  const det = determinant(m);
  if (det === 0) throw new RangeError('invert: singular transform');
  const a = m.d / det;
  const b = -m.b / det;
  const c = -m.c / det;
  const d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}

export const apply = (m: Affine, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

export const applyAll = (m: Affine, pts: readonly Vec2[]): Vec2[] => pts.map((p) => apply(m, p));

/**
 * Applies `m` to a polygon and restores counter-clockwise order if the map reverses
 * orientation (a mirror), so callers always receive CCW polygons.
 */
export function applyToPolygon(m: Affine, poly: readonly Vec2[]): Vec2[] {
  const out = applyAll(m, poly);
  return determinant(m) < 0 ? out.reverse() : out;
}

/** Transforms a shape and keeps its convention: outer counter-clockwise, holes clockwise. */
export function transformShape(m: Affine, s: Shape): Shape {
  const outer = applyAll(m, s.outer);
  const holes = s.holes.map((h) => applyAll(m, h));
  return determinant(m) < 0
    ? { outer: outer.reverse(), holes: holes.map((h) => h.reverse()) }
    : { outer, holes };
}

/** True when the map reverses orientation (mirrors). */
export const flipsOrientation = (m: Affine): boolean => determinant(m) < 0;

/** room → row: rotate by −θ (radians); mirror about the x axis when rows stack to the right. */
export function roomToRow(theta: number, stackSide: StackSide): Affine {
  const rot = rotation(-theta);
  return stackSide === 'right' ? compose(mirrorX, rot) : rot;
}

/** row → board: translate so that the board's lower-left corner (x0, y0 in row coordinates) is the origin. */
export const rowToBoard = (x0: number, y0: number): Affine => translation(-x0, -y0);

/** +1 for a proper rotation/translation, −1 when the map mirrors. */
export const handedness = (m: Affine): 1 | -1 =>
  cross({ x: m.a, y: m.b }, { x: m.c, y: m.d }) >= 0 ? 1 : -1;
