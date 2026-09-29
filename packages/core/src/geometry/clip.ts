/**
 * Adapter over clipper2-ts (Boost licence): polygon booleans and offsetting — geometry only.
 * Clipper works on integers, so coordinates are scaled by CLIPPER_SCALE (0.01 mm) here and
 * nowhere else. Results are snapped to that grid.
 */

import {
  Clipper64,
  ClipType,
  EndType,
  FillRule,
  JoinType,
  PolyTree64,
  inflatePaths,
  type Path64,
  type Paths64,
  type PolyPath64,
} from 'clipper2-ts';
import type { Mm } from '../num/index';
import { signedArea } from './polygon';
import type { Vec2 } from './vec';

/** Integer units per mm inside Clipper (0.01 mm). */
export const CLIPPER_SCALE = 100;

/** A polygon with holes. `outer` is counter-clockwise, every hole is clockwise. */
export interface Shape {
  outer: Vec2[];
  holes: Vec2[][];
}

export type FillRuleName = 'evenodd' | 'nonzero' | 'positive';

const FILL: Record<FillRuleName, FillRule> = {
  evenodd: FillRule.EvenOdd,
  nonzero: FillRule.NonZero,
  positive: FillRule.Positive,
};

const toPath = (poly: readonly Vec2[]): Path64 =>
  poly.map((p) => ({ x: Math.round(p.x * CLIPPER_SCALE), y: Math.round(p.y * CLIPPER_SCALE) }));

const fromPath = (path: Path64): Vec2[] =>
  path.map((p) => ({ x: p.x / CLIPPER_SCALE, y: p.y / CLIPPER_SCALE }));

function ccw(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? poly.reverse() : poly;
}

function cw(poly: Vec2[]): Vec2[] {
  return signedArea(poly) > 0 ? poly.reverse() : poly;
}

/** Shapes → Clipper paths with outer CCW / holes CW, so NonZero fills exactly the shape. */
function shapesToPaths(shapes: readonly Shape[]): Paths64 {
  const out: Paths64 = [];
  for (const s of shapes) {
    out.push(toPath(ccw([...s.outer])));
    for (const h of s.holes) out.push(toPath(cw([...h])));
  }
  return out;
}

function collect(node: PolyPath64, out: Shape[]): void {
  for (let i = 0; i < node.count; i++) {
    const child = node.child(i);
    if (child.isHole) continue;
    const outerPath = child.poly;
    if (!outerPath || outerPath.length < 3) continue;
    const holes: Vec2[][] = [];
    const islands: PolyPath64[] = [];
    for (let j = 0; j < child.count; j++) {
      const hole = child.child(j);
      const holePath = hole.poly;
      if (holePath && holePath.length >= 3) holes.push(cw(fromPath(holePath)));
      for (let k = 0; k < hole.count; k++) islands.push(hole.child(k));
    }
    out.push({ outer: ccw(fromPath(outerPath)), holes });
    // Islands inside holes are outer boundaries of their own shapes.
    for (const island of islands) {
      const wrapper = { count: 1, child: () => island } as unknown as PolyPath64;
      collect(wrapper, out);
    }
  }
}

/** PolyTree → shapes with holes; islands inside holes become separate shapes. */
export function polyTreeToShapes(tree: PolyTree64): Shape[] {
  const out: Shape[] = [];
  collect(tree, out);
  return out;
}

function boolean(
  op: ClipType,
  subject: Paths64,
  clip: Paths64,
  fillRule: FillRule = FillRule.NonZero,
): Shape[] {
  const c = new Clipper64();
  c.addSubject(subject);
  if (clip.length > 0) c.addClip(clip);
  const tree = new PolyTree64();
  c.execute(op, fillRule, tree);
  return polyTreeToShapes(tree);
}

export const intersect = (a: readonly Shape[], b: readonly Shape[]): Shape[] =>
  boolean(ClipType.Intersection, shapesToPaths(a), shapesToPaths(b));

export const difference = (a: readonly Shape[], b: readonly Shape[]): Shape[] =>
  boolean(ClipType.Difference, shapesToPaths(a), shapesToPaths(b));

/** Union of two shape sets. */
export const union = (a: readonly Shape[], b: readonly Shape[] = []): Shape[] =>
  boolean(ClipType.Union, shapesToPaths(a), shapesToPaths(b));

/**
 * Union of raw closed paths under an explicit fill rule. Used to clean self-intersecting
 * results (e.g. an offset polygon) with 'positive'; orientation of inputs is NOT normalised.
 */
export function unionPaths(paths: readonly (readonly Vec2[])[], rule: FillRuleName): Shape[] {
  return boolean(ClipType.Union, paths.map(toPath), [], FILL[rule]);
}

export interface InflateOptions {
  /** Miter limit (multiple of |delta|); sharper corners are squared off. Default 4. */
  miterLimit?: number;
  join?: 'miter' | 'square' | 'round';
}

/** Offsets shapes by `delta` mm (positive grows, negative shrinks); holes move the opposite way. */
export function inflate(shapes: readonly Shape[], delta: Mm, opts: InflateOptions = {}): Shape[] {
  const join = { miter: JoinType.Miter, square: JoinType.Square, round: JoinType.Round }[
    opts.join ?? 'miter'
  ];
  const paths = inflatePaths(
    shapesToPaths(shapes),
    delta * CLIPPER_SCALE,
    join,
    EndType.Polygon,
    opts.miterLimit ?? 4,
  );
  return boolean(ClipType.Union, paths, []);
}

/** Net area of a shape: outer minus holes. */
export const shapeArea = (s: Shape): number =>
  Math.abs(signedArea(s.outer)) - s.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);

export const shapesArea = (shapes: readonly Shape[]): number =>
  shapes.reduce((a, s) => a + shapeArea(s), 0);

/** Axis-aligned rectangle as a shape. */
export const rectShape = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Shape => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});

/** A simple polygon as a shape (orientation normalised to CCW). */
export const polygonShape = (poly: readonly Vec2[]): Shape => ({
  outer: ccw([...poly]),
  holes: [],
});
