/**
 * Installable zone Z = offset_e(P, −g_e) − ⋃ inflate(O, g_O), plus doorway extensions.
 * (ALGORITHM.md §2.1.) Works purely on geometry-level input; `model` types are mapped onto
 * it later, so this module stays below `model` in the dependency order.
 */

import type { Mm } from '../num/index';
import { EPS } from '../num/index';
import { discretizeCircle, discretizePolygon } from './arcs';
import {
  CLIPPER_GRID_MM,
  difference,
  inflate,
  polygonShape,
  unionPaths,
  union,
  type Shape,
  shapesArea,
} from './clip';
import { signedArea } from './polygon';
import { add, cross, dot, len, neg, normalize, perp, scale, sub, type Vec2 } from './vec';

export interface ZoneEdge {
  /** Expansion gap kept between the floor and this wall (mm). */
  gap: Mm;
  /** DXF bulge of the arc edge outline[i] → outline[i+1]; 0/undefined = straight. */
  bulge?: number;
}

export type ZoneObstacle =
  | { kind: 'polygon'; points: Vec2[]; bulges?: number[]; gap: Mm }
  | { kind: 'circle'; center: Vec2; diameter: Mm; gap: Mm };

/** A door opening on a straight outline edge; the zone is extended into and under it. */
export interface ZoneDoorway {
  /** Index of the outline edge (outline[edge] → outline[edge + 1]). */
  edge: number;
  /** Distance from the edge start to the start of the opening (mm). */
  offset: Mm;
  width: Mm;
  /** How far the floor continues out through the opening (mm). */
  depth: Mm;
  /** How far the floor tucks under the door frame on each side (mm). */
  jambUndercut: Mm;
}

export interface ZoneInput {
  /** Simple polygon, counter-clockwise. */
  outline: Vec2[];
  /** edges[i] belongs to outline[i] → outline[i+1]. */
  edges: ZoneEdge[];
  obstacles?: ZoneObstacle[];
  doorways?: ZoneDoorway[];
}

export type ZoneWarning =
  | { code: 'sharpCorner'; edge: number; angleDeg: number }
  | { code: 'emptyZone' }
  | { code: 'doorwayOnArc'; edge: number }
  | { code: 'doorwayOutOfRange'; edge: number };

export interface ZoneResult {
  shapes: Shape[];
  warnings: ZoneWarning[];
}

/** Interior angles below this get a bevelled (not mitred) corner and a warning. */
export const SHARP_ANGLE_DEG = 30;
const MAX_TURN = Math.PI - (SHARP_ANGLE_DEG * Math.PI) / 180; // 150° turn = 30° interior angle
const MITER_LIMIT = 1 / Math.sin((SHARP_ANGLE_DEG * Math.PI) / 360); // 1 / sin(15°)
const PARALLEL_EPS = 1e-9;

/**
 * Inward offset of a CCW polygon with a separate distance per edge. Corners are mitres
 * (intersection of the neighbouring offset lines); too long mitres and steps between
 * different gaps become two points. The raw result may self-intersect and must be cleaned.
 */
function offsetPolygon(
  points: readonly Vec2[],
  gaps: readonly number[],
  sourceEdge: readonly number[],
  warnings: ZoneWarning[],
): Vec2[] {
  const n = points.length;
  const normals = points.map((p, k) => perp(normalize(sub(points[(k + 1) % n] as Vec2, p))));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const e0 = (i + n - 1) % n;
    const p = points[i] as Vec2;
    const n0 = normals[e0] as Vec2;
    const n1 = normals[i] as Vec2;
    const g0 = gaps[e0] as number;
    const g1 = gaps[i] as number;
    const a = add(p, scale(n0, g0));
    const b = add(p, scale(n1, g1));
    const det = cross(n0, n1);
    const turn = Math.atan2(det, dot(n0, n1));

    if (Math.abs(det) < PARALLEL_EPS) {
      if (dot(n0, n1) > 0 && Math.abs(g0 - g1) <= EPS) {
        out.push(a);
      } else {
        // Antiparallel neighbours are a 0° / 360° spike; a step between different gaps is not.
        if (dot(n0, n1) < 0) {
          warnings.push({ code: 'sharpCorner', edge: sourceEdge[i] as number, angleDeg: 0 });
        }
        out.push(a, b);
      }
      continue;
    }
    const d = {
      x: (g0 * n1.y - n0.y * g1) / det,
      y: (n0.x * g1 - g0 * n1.x) / det,
    };
    if (Math.abs(turn) > MAX_TURN) {
      warnings.push({
        code: 'sharpCorner',
        edge: sourceEdge[i] as number,
        // Interior angle: < 30° for a sharp convex corner, > 330° for a reflex one.
        angleDeg: 180 - (turn * 180) / Math.PI,
      });
    }
    // Long mitres are replaced by the two edge-offset endpoints; the Positive-union clean-up
    // then decides what remains. NOTE: at a convex sharp corner the mitre tip is the exact
    // inward offset and survives the clean-up (only the warning is issued).
    if (len(d) > MITER_LIMIT * Math.max(g0, g1) + EPS) out.push(a, b);
    else out.push(add(p, d));
  }
  return out;
}

/** Re-orients a polygon with per-edge bulges to counter-clockwise. */
function orientCCW(
  points: readonly Vec2[],
  bulges: readonly (number | undefined)[] = [],
): { points: Vec2[]; bulges: number[] } {
  const n = points.length;
  const b = points.map((_, i) => bulges[i] ?? 0);
  if (signedArea(points) >= 0) return { points: [...points], bulges: b };
  // Reversed traversal: edge j runs along original edge (n − 2 − j) backwards, so bulge flips.
  return {
    points: [...points].reverse(),
    bulges: points.map((_, j) => -(b[(n - 2 - j + 2 * n) % n] as number)),
  };
}

function obstacleShape(o: ZoneObstacle): Shape {
  if (o.kind === 'circle') {
    // Circumscribed polygon touches the circle at edge midpoints; one Clipper grid step of margin
    // keeps the circle inside the obstacle after coordinates are snapped to the grid.
    const margin = CLIPPER_GRID_MM;
    return polygonShape(discretizeCircle(o.center, o.diameter + 2 * margin, 'circumscribed'));
  }
  const oriented = orientCCW(o.points, o.bulges);
  return polygonShape(discretizePolygon(oriented.points, oriented.bulges).points);
}

function doorwayShape(
  input: ZoneInput,
  door: ZoneDoorway,
  warnings: ZoneWarning[],
): Shape | undefined {
  const n = input.outline.length;
  const edge = input.edges[door.edge];
  const p0 = input.outline[door.edge] as Vec2;
  const p1 = input.outline[(door.edge + 1) % n] as Vec2;
  if (!edge || (edge.bulge ?? 0) !== 0) {
    warnings.push({ code: 'doorwayOnArc', edge: door.edge });
    return undefined;
  }
  const length = len(sub(p1, p0));
  let from = door.offset - door.jambUndercut;
  let to = door.offset + door.width + door.jambUndercut;
  if (from < 0 || to > length) {
    warnings.push({ code: 'doorwayOutOfRange', edge: door.edge });
    from = Math.max(0, from);
    to = Math.min(length, to);
  }
  const u = normalize(sub(p1, p0));
  const inward = perp(u); // CCW outline: interior is on the left
  const outward = neg(inward);
  // Start 1 mm inside the zone boundary (gap inward) so that the union merges cleanly;
  // `depth` is measured from the wall line, so the far side lies `depth` beyond the wall.
  const back = scale(inward, edge.gap + 1);
  const front = scale(outward, edge.gap + 1 + door.depth);
  const a = add(add(p0, scale(u, from)), back);
  const b = add(add(p0, scale(u, to)), back);
  return polygonShape([a, b, add(b, front), add(a, front)]);
}

/** Builds the installable zone of one room. */
export function buildZone(input: ZoneInput): ZoneResult {
  if (signedArea(input.outline) <= 0) {
    throw new RangeError('buildZone: outline must be counter-clockwise');
  }
  if (input.edges.length !== input.outline.length) {
    throw new RangeError('buildZone: edges must match outline vertices one to one');
  }
  for (let i = 0; i < input.outline.length; i++) {
    const p = input.outline[i] as Vec2;
    const q = input.outline[(i + 1) % input.outline.length] as Vec2;
    if (Math.hypot(q.x - p.x, q.y - p.y) <= EPS) {
      throw new RangeError(`buildZone: outline edge ${i} has zero length (duplicate vertex)`);
    }
  }
  const warnings: ZoneWarning[] = [];

  const flat = discretizePolygon(
    input.outline,
    input.edges.map((e) => e.bulge),
  );
  const gaps = flat.sourceEdge.map((e) => (input.edges[e] as ZoneEdge).gap);
  const raw = offsetPolygon(flat.points, gaps, flat.sourceEdge, warnings);
  // Self-intersections (short edges, narrow niches, bevelled corners) are cleaned by a
  // union with the Positive fill rule: loops with negative winding disappear.
  let shapes = unionPaths([raw], 'positive');

  for (const door of input.doorways ?? []) {
    const s = doorwayShape(input, door, warnings);
    if (s) shapes = union(shapes, [s]);
  }

  for (const o of input.obstacles ?? []) {
    const grown = inflate([obstacleShape(o)], o.gap, { join: 'miter' });
    shapes = difference(shapes, grown);
  }

  if (shapes.length === 0 || shapesArea(shapes) <= EPS) warnings.push({ code: 'emptyZone' });
  return { shapes, warnings };
}
