/**
 * Piece features (ALGORITHM §3.2, DOMAIN §8): bevel cuts at slanted walls, notches at reflex
 * corners, scribes along walls that are not parallel to the rows, jigsaw curve cuts along arcs and
 * drill holes for pipes. All detection works on the exact piece shape in board coordinates
 * (same orientation as the row frame); arcs are recognised in room coordinates.
 */

import { apply } from '../geometry/frames';
import { locatePoint } from '../geometry/polygon';
import { pointSegmentDist } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec';
import { recoverArcEdges } from '../geometry/zoneArcs';
import { roomToZoneInput } from '../layout/roomZone';
import type { BoardRect, PieceFeature, PieceLong, PieceShort, PiecePart } from '../model/plan';
import type { Mm } from '../num/index';
import type { PlanContext } from './context';

/** Bevels or scribes smaller than this (mm) are drawing noise, not a cut. */
export const FEATURE_TOL: Mm = 0.5;
/** Spacing of curve-cut ordinates (mm). */
export const ORDINATE_STEP: Mm = 50;
/** Rectilinear rings tolerate this much grid noise (Clipper 0.01 mm grid). */
const AXIS_TOL = 0.05;

export interface PipeDrill {
  pipeId: string;
  feature: Extract<PieceFeature, { kind: 'drill' }>;
  /** The pipe centre lies inside the piece and the hole stays clear of its edges. */
  clear: boolean;
}

export interface FeatureInput {
  short: PieceShort;
  long: PieceLong;
  rect: BoardRect;
  parts: readonly PiecePart[];
  /** Row-frame point → board point for this piece. */
  toBoard: (p: Vec2) => Vec2;
}

const ringDist = (p: Vec2, ring: readonly Vec2[]): number =>
  Math.min(...ring.map((a, i) => pointSegmentDist(p, a, ring[(i + 1) % ring.length]!)));

const isRectilinear = (ring: readonly Vec2[]): boolean =>
  ring.every((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return Math.abs(a.x - b.x) <= AXIS_TOL || Math.abs(a.y - b.y) <= AXIS_TOL;
  });

/** Vertical extent of a ring at abscissa x (min and max y of the crossings). */
function extentAt(ring: readonly Vec2[], x: number): number {
  const ys: number[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) {
      ys.push(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
    } else if (a.x === x && b.x === x) ys.push(a.y, b.y);
  });
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
}

function bboxOf(ring: readonly Vec2[]) {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Extreme x among vertices lying on the bottom (y = min) or top (y = max) of the bounding box. */
function edgeXs(ring: readonly Vec2[], level: 'min' | 'max'): { lo: number; hi: number } {
  const box = bboxOf(ring);
  const y = level === 'min' ? box.minY : box.maxY;
  const xs = ring.filter((p) => Math.abs(p.y - y) <= AXIS_TOL).map((p) => p.x);
  return { lo: Math.min(...xs), hi: Math.max(...xs) };
}

/** Arc runs of a part: maximal chains of consecutive edges lying on an outline arc. */
function arcRuns(sources: readonly (number | null)[]): { from: number; count: number }[] {
  const n = sources.length;
  if (!sources.some((s) => s !== null)) return [];
  if (sources.every((s) => s !== null)) return [{ from: 0, count: n }];
  const start = sources.findIndex((s, i) => s !== null && sources[(i + n - 1) % n] === null);
  const runs: { from: number; count: number }[] = [];
  let i = 0;
  while (i < n) {
    const idx = (start + i) % n;
    if (sources[idx] === null) {
      i++;
      continue;
    }
    let count = 0;
    while (i + count < n && sources[(start + i + count) % n] !== null) count++;
    runs.push({ from: idx, count });
    i += count;
  }
  return runs;
}

function curveSide(pts: readonly Vec2[], rect: BoardRect): 'left' | 'right' | 'low' | 'high' {
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const dx = (mx - (rect.x + rect.w / 2)) / (rect.w / 2 || 1);
  const dy = (my - (rect.y + rect.h / 2)) / (rect.h / 2 || 1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'low' : 'high';
}

/** Distance from the piece's bounding edge to the curve at position `at` along that edge. */
function offsetAt(
  pts: readonly Vec2[],
  side: 'left' | 'right' | 'low' | 'high',
  rect: BoardRect,
  at: number,
): number | undefined {
  const vertical = side === 'left' || side === 'right'; // curve is a function of y
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const [ca, cb] = vertical ? [a.y, b.y] : [a.x, b.x];
    if ((ca - at) * (cb - at) > 0 || ca === cb) continue;
    const t = (at - ca) / (cb - ca);
    const other = vertical ? a.x + (b.x - a.x) * t : a.y + (b.y - a.y) * t;
    return side === 'left'
      ? other - rect.x
      : side === 'right'
        ? rect.x + rect.w - other
        : side === 'low'
          ? other - rect.y
          : rect.y + rect.h - other;
  }
  return undefined;
}

function curveFeature(
  pts: readonly Vec2[],
  rect: BoardRect,
): Extract<PieceFeature, { kind: 'curveCut' }> {
  const side = curveSide(pts, rect);
  const vertical = side === 'left' || side === 'right';
  const coords = pts.map((p) => (vertical ? p.y : p.x));
  const lo = Math.min(...coords);
  const hi = Math.max(...coords);
  const base = vertical ? rect.y : rect.x;
  const ordinates: { at: Mm; offset: Mm }[] = [];
  const first = Math.ceil((lo - base) / ORDINATE_STEP) * ORDINATE_STEP;
  const marks = new Set<number>([lo - base, hi - base]);
  for (let t = first; t <= hi - base; t += ORDINATE_STEP) marks.add(t);
  for (const at of [...marks].sort((p, q) => p - q)) {
    const offset = offsetAt(pts, side, rect, base + at);
    if (offset !== undefined) ordinates.push({ at, offset });
  }
  return { kind: 'curveCut', side, ordinates, tool: 'jigsaw', cutOnSite: false };
}

/** Notches: bounding-box corners missing from a rectilinear ring, sized by the reflex vertex. */
function notches(ring: readonly Vec2[]): Extract<PieceFeature, { kind: 'notch' }>[] {
  if (ring.length <= 4 || !isRectilinear(ring)) return [];
  const box = bboxOf(ring);
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= AXIS_TOL;
  const corners = [
    { x: box.minX, y: box.minY, name: 'lowLeft' as const },
    { x: box.maxX, y: box.minY, name: 'lowRight' as const },
    { x: box.minX, y: box.maxY, name: 'highLeft' as const },
    { x: box.maxX, y: box.maxY, name: 'highRight' as const },
  ];
  const reflex = ring.filter(
    (p) =>
      p.x > box.minX + AXIS_TOL &&
      p.x < box.maxX - AXIS_TOL &&
      p.y > box.minY + AXIS_TOL &&
      p.y < box.maxY - AXIS_TOL,
  );
  const out: Extract<PieceFeature, { kind: 'notch' }>[] = [];
  for (const c of corners) {
    if (ring.some((p) => near(p.x, c.x) && near(p.y, c.y))) continue;
    let best: Vec2 | undefined;
    let bestSize = Infinity;
    for (const v of reflex) {
      const size = Math.abs(v.x - c.x) + Math.abs(v.y - c.y);
      const [x0, x1] = [Math.min(v.x, c.x), Math.max(v.x, c.x)];
      const [y0, y1] = [Math.min(v.y, c.y), Math.max(v.y, c.y)];
      const blocked = ring.some(
        (p) =>
          p !== v &&
          p.x > x0 + AXIS_TOL &&
          p.x < x1 - AXIS_TOL &&
          p.y > y0 + AXIS_TOL &&
          p.y < y1 - AXIS_TOL,
      );
      if (!blocked && size < bestSize) {
        best = v;
        bestSize = size;
      }
    }
    if (best) {
      out.push({
        kind: 'notch',
        corner: c.name,
        dx: Math.abs(best.x - c.x),
        dy: Math.abs(best.y - c.y),
      });
    }
  }
  return out;
}

/** Arc classification of a piece's parts (room coordinates), shared across pieces by the caller. */
export function arcSourcesOf(ctx: PlanContext, parts: readonly PiecePart[]) {
  if (!ctx.room.edges.some((e) => (e.bulge ?? 0) !== 0)) return null;
  const input = roomToZoneInput(ctx.room, ctx.project.rules, ctx.project.doorways);
  return recoverArcEdges(
    parts.map((p) => ({ outer: p.outline, holes: p.holes })),
    input.outline,
    input.edges,
  );
}

/** Geometry-derived features of one piece (everything except drills). */
export function shapeFeatures(ctx: PlanContext, input: FeatureInput): PieceFeature[] {
  const { parts, rect, short, long } = input;
  const main = parts[0];
  if (!main) return [];
  const features: PieceFeature[] = [];
  const ring = main.boardOutline;

  const sources = arcSourcesOf(ctx, parts);
  const curvedSides = new Set<string>();
  if (sources) {
    parts.forEach((part, pi) => {
      for (const run of arcRuns(sources[pi]!.outer)) {
        const pts: Vec2[] = [];
        for (let k = 0; k <= run.count; k++) {
          pts.push(part.boardOutline[(run.from + k) % part.boardOutline.length]!);
        }
        const f = curveFeature(pts, rect);
        if (f.ordinates.length >= 2) {
          features.push(f);
          curvedSides.add(f.side);
        }
      }
    });
  }

  // Bevels: the wall ends of start/end/free pieces (left end of `start`, right end of `end`).
  const bottom = edgeXs(ring, 'min');
  const top = edgeXs(ring, 'max');
  const lengthLow = bottom.hi - bottom.lo;
  const lengthHigh = top.hi - top.lo;
  const wallLeft = short === 'start' || short === 'free';
  const wallRight = short === 'end' || short === 'free';
  if (wallLeft && !curvedSides.has('left') && Math.abs(bottom.lo - top.lo) > FEATURE_TOL) {
    features.push({ kind: 'bevelCut', side: 'left', lengthLow, lengthHigh });
  }
  if (wallRight && !curvedSides.has('right') && Math.abs(bottom.hi - top.hi) > FEATURE_TOL) {
    features.push({ kind: 'bevelCut', side: 'right', lengthLow, lengthHigh });
  }

  features.push(...notches(ring));

  // Scribe: a strip whose long edge runs at an angle to the rows (not a rectilinear shape).
  if (long !== 'both' && !isRectilinear(ring) && !curvedSides.size) {
    const box = bboxOf(ring);
    const inset = Math.min(1, (box.maxX - box.minX) / 4);
    const wl = extentAt(ring, box.minX + inset);
    const wr = extentAt(ring, box.maxX - inset);
    if (Math.abs(wl - wr) > FEATURE_TOL) {
      features.push({ kind: 'scribe', widthAtLeft: wl, widthAtRight: wr });
    }
  }
  return features;
}

/** Pipe holes that land on this piece (centre inside, or the hole reaches into the piece). */
export function pipeDrills(ctx: PlanContext, input: FeatureInput): PipeDrill[] {
  const pipes = ctx.room.obstacles.filter((o) => o.kind === 'pipe');
  if (pipes.length === 0 || input.parts.length === 0) return [];
  const out: PipeDrill[] = [];
  for (const pipe of pipes) {
    if (pipe.kind !== 'pipe') continue;
    const r = pipe.diameter / 2;
    let inside = false;
    let distance = Infinity;
    for (const part of input.parts) {
      const loc = locatePoint(pipe.center, part.outline);
      const inHole = part.holes.some((h) => locatePoint(pipe.center, h) === 'inside');
      if (loc === 'inside' && !inHole) inside = true;
      const d = Math.min(
        ringDist(pipe.center, part.outline),
        ...part.holes.map((h) => ringDist(pipe.center, h)),
      );
      distance = Math.min(distance, d);
    }
    if (!inside && distance > r) continue;
    const board = input.toBoard(apply(ctx.layout.frame, pipe.center));
    out.push({
      pipeId: pipe.id,
      clear: inside && distance >= r,
      feature: {
        kind: 'drill',
        x: board.x - input.rect.x,
        y: board.y - input.rect.y,
        diameter: pipe.diameter,
      },
    });
  }
  return out;
}
