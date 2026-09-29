/**
 * Piece geometry in the row frame and the boundaries pieces share, derived only from the plan's
 * exact shapes. The seam, connection and stagger checks read from this.
 */

import { applyAll } from '../geometry/frames';
import { bbox, type BBox } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec';
import type { Plan, PlannedPiece } from '../model/index';
import { normalizeIntervals, type Interval } from '../num/intervals';
import { LINE_TOL, SHARED_MIN } from './types';

export interface PieceGeom {
  piece: PlannedPiece;
  /** Outer rings of all parts and every ring (with holes), row frame. */
  outers: Vec2[][];
  rings: Vec2[][];
  box: BBox;
  cx: number;
  cy: number;
}

/** Boundary shared by pieces `a` and `b` (indices into `geoms`), a < b. */
export interface SharedBoundary {
  a: number;
  b: number;
  /** Vertical shared edges: x position and total length. */
  vertical: { x: number; length: number }[];
  verticalLength: number;
  horizontalLength: number;
  /** x intervals of the shared horizontal boundary. */
  horizontal: Interval[];
}

const AXIS_TOL = 0.05;

export function toGeoms(plan: Plan): PieceGeom[] {
  return plan.pieces.map((piece) => {
    const outers = piece.parts.map((p) => applyAll(plan.frame, p.outline));
    const rings = [
      ...outers,
      ...piece.parts.flatMap((p) => p.holes.map((h) => applyAll(plan.frame, h))),
    ];
    const points = outers.flat();
    const box = points.length ? bbox(points) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return {
      piece,
      outers,
      rings,
      box,
      cx: (box.minX + box.maxX) / 2,
      cy: (box.minY + box.maxY) / 2,
    };
  });
}

interface Edge {
  a: Vec2;
  b: Vec2;
}

const edgesOf = (rings: readonly Vec2[][]): Edge[] =>
  rings.flatMap((r) => r.map((a, i) => ({ a, b: r[(i + 1) % r.length]! })));

const isVertical = (e: Edge): boolean => Math.abs(e.a.x - e.b.x) <= AXIS_TOL;
const isHorizontal = (e: Edge): boolean => Math.abs(e.a.y - e.b.y) <= AXIS_TOL;

function overlap(lo1: number, hi1: number, lo2: number, hi2: number): [number, number] | undefined {
  const lo = Math.max(lo1, lo2);
  const hi = Math.min(hi1, hi2);
  return hi - lo > 0 ? [lo, hi] : undefined;
}

/** Collinear axis-parallel edges of two pieces that overlap along their length. */
export function sharedBoundaries(geoms: readonly PieceGeom[]): SharedBoundary[] {
  const out: SharedBoundary[] = [];
  const edges = geoms.map((g) => edgesOf(g.rings));
  for (let i = 0; i < geoms.length; i++) {
    for (let j = i + 1; j < geoms.length; j++) {
      const p = geoms[i]!.box;
      const q = geoms[j]!.box;
      if (
        p.maxX + LINE_TOL < q.minX ||
        q.maxX + LINE_TOL < p.minX ||
        p.maxY + LINE_TOL < q.minY ||
        q.maxY + LINE_TOL < p.minY
      ) {
        continue;
      }
      const s: SharedBoundary = {
        a: i,
        b: j,
        vertical: [],
        verticalLength: 0,
        horizontalLength: 0,
        horizontal: [],
      };
      const horizontal: Interval[] = [];
      for (const e of edges[i]!) {
        for (const f of edges[j]!) {
          if (isVertical(e) && isVertical(f)) {
            const x = (e.a.x + e.b.x) / 2;
            if (Math.abs(x - (f.a.x + f.b.x) / 2) > LINE_TOL) continue;
            const o = overlap(
              Math.min(e.a.y, e.b.y),
              Math.max(e.a.y, e.b.y),
              Math.min(f.a.y, f.b.y),
              Math.max(f.a.y, f.b.y),
            );
            if (!o) continue;
            s.vertical.push({ x, length: o[1] - o[0] });
            s.verticalLength += o[1] - o[0];
          } else if (isHorizontal(e) && isHorizontal(f)) {
            const y = (e.a.y + e.b.y) / 2;
            if (Math.abs(y - (f.a.y + f.b.y) / 2) > LINE_TOL) continue;
            const o = overlap(
              Math.min(e.a.x, e.b.x),
              Math.max(e.a.x, e.b.x),
              Math.min(f.a.x, f.b.x),
              Math.max(f.a.x, f.b.x),
            );
            if (!o) continue;
            horizontal.push(o);
            s.horizontalLength += o[1] - o[0];
          }
        }
      }
      s.horizontal = normalizeIntervals(horizontal, { eps: LINE_TOL });
      if (s.verticalLength > SHARED_MIN || s.horizontalLength > SHARED_MIN) out.push(s);
    }
  }
  return out;
}

/** Sides on which a piece connects to other pieces (shared boundary longer than noise). */
export interface Connections {
  left: boolean;
  right: boolean;
  /** Total shared length along the bottom and top edges. */
  lowLength: number;
  highLength: number;
}

export function connectionsOf(
  geoms: readonly PieceGeom[],
  shared: readonly SharedBoundary[],
): Connections[] {
  const conn: Connections[] = geoms.map(() => ({
    left: false,
    right: false,
    lowLength: 0,
    highLength: 0,
  }));
  for (const s of shared) {
    const A = geoms[s.a]!;
    const B = geoms[s.b]!;
    if (s.verticalLength > SHARED_MIN) {
      const aLeft = A.cx < B.cx; // A lies left of B
      conn[s.a]![aLeft ? 'right' : 'left'] = true;
      conn[s.b]![aLeft ? 'left' : 'right'] = true;
    }
    if (s.horizontalLength > SHARED_MIN) {
      const aBelow = A.cy < B.cy;
      conn[s.a]![aBelow ? 'highLength' : 'lowLength'] += s.horizontalLength;
      conn[s.b]![aBelow ? 'lowLength' : 'highLength'] += s.horizontalLength;
    }
  }
  return conn;
}
