/**
 * The checks of ALGORITHM §11. Each returns violations; none reads planner code.
 */

import { difference, shapesArea, union, type Shape } from '../geometry/clip';
import { apply, applyAll } from '../geometry/frames';
import { ensureCCW, locatePoint } from '../geometry/polygon';
import { pointSegmentDist } from '../geometry/segment';
import { buildZone } from '../geometry/zone';
import type { Plan, PlannedPiece, Project, Room } from '../model/index';
import { normalizeIntervals, type Interval } from '../num/intervals';
import {
  connectionsOf,
  sharedBoundaries,
  toGeoms,
  type Connections,
  type PieceGeom,
  type SharedBoundary,
} from './prepare';
import { GRID_TOL, LINE_TOL, SHARED_MIN, type Violation } from './types';
import { zoneInputOf } from './zoneInput';

const v = (code: Violation['code'], message: string, refs: string[]): Violation => ({
  code,
  message,
  refs,
});

const RECT_TOL = GRID_TOL + 1e-6;

export function roomOf(project: Project, plan: Plan): Room | undefined {
  const id = plan.pieces[0]?.roomId;
  return id ? project.rooms.find((r) => r.id === id) : project.rooms[0];
}

// ---- 8. counts and bookkeeping ------------------------------------------------------------

export function checkCounts(project: Project, plan: Plan): Violation[] {
  const out: Violation[] = [];
  const ids = plan.boards.map((b) => b.id);
  if (new Set(ids).size !== ids.length) out.push(v('count', 'Duplicate board ids', ids));
  if (plan.stats.boards !== plan.boards.length) {
    out.push(v('count', `stats.boards ${plan.stats.boards} ≠ ${plan.boards.length} boards`, []));
  }
  const expectedPacks = Math.ceil(
    (plan.boards.length * (1 + project.rules.reservePercent / 100)) / project.product.boardsPerPack,
  );
  if (plan.stats.packs !== expectedPacks) {
    out.push(v('count', `stats.packs ${plan.stats.packs} ≠ ${expectedPacks}`, []));
  }

  const pieceIds = plan.pieces.map((p) => p.id);
  if (new Set(pieceIds).size !== pieceIds.length) out.push(v('count', 'Duplicate piece ids', []));
  const placed = new Map<string, { board: string; rect: PlannedPiece['boardRect'] }>();
  for (const b of plan.boards) {
    for (const pl of b.placements) {
      if (placed.has(pl.pieceId))
        out.push(v('count', `Piece ${pl.pieceId} placed twice`, [pl.pieceId]));
      placed.set(pl.pieceId, { board: b.id, rect: pl.rect });
    }
  }
  for (const p of plan.pieces) {
    const at = placed.get(p.id);
    if (!at) {
      out.push(v('count', `Piece ${p.id} is on no board`, [p.id]));
      continue;
    }
    const same =
      at.board === p.boardId &&
      ['x', 'y', 'w', 'h'].every(
        (k) => Math.abs(at.rect[k as 'x'] - p.boardRect[k as 'x']) <= 1e-9,
      );
    if (!same) out.push(v('count', `Piece ${p.id} disagrees with its board placement`, [p.id]));
  }
  for (const id of placed.keys()) {
    if (!pieceIds.includes(id)) out.push(v('count', `Placement of unknown piece ${id}`, [id]));
  }
  return out;
}

// ---- 2. boards ----------------------------------------------------------------------------

export function checkBoards(project: Project, plan: Plan): Violation[] {
  const out: Violation[] = [];
  const L = project.product.boardLength;
  const W = project.product.boardWidth;
  const k = project.rules.kerf;

  for (const board of plan.boards) {
    for (const { pieceId, rect } of board.placements) {
      if (
        rect.x < -RECT_TOL ||
        rect.y < -RECT_TOL ||
        rect.x + rect.w > L + RECT_TOL ||
        rect.y + rect.h > W + RECT_TOL
      ) {
        out.push(
          v('boardBounds', `Piece ${pieceId} leaves board ${board.id}`, [pieceId, board.id]),
        );
      }
    }
    const pl = board.placements;
    for (let i = 0; i < pl.length; i++) {
      for (let j = i + 1; j < pl.length; j++) {
        const a = pl[i]!.rect;
        const b = pl[j]!.rect;
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        const refs = [pl[i]!.pieceId, pl[j]!.pieceId, board.id];
        if (gapX < -RECT_TOL && gapY < -RECT_TOL) {
          out.push(v('overlap', `Pieces overlap on board ${board.id}`, refs));
        } else if (Math.max(gapX, gapY) < k - RECT_TOL) {
          out.push(v('kerf', `Pieces closer than the kerf on board ${board.id}`, refs));
        }
      }
    }
  }

  for (const p of plan.pieces) {
    const r = p.boardRect;
    for (const part of p.parts) {
      const row = applyAll(plan.frame, part.outline);
      if (row.length !== part.boardOutline.length) {
        out.push(v('shapeNotOnBoard', `Piece ${p.id}: board image has other vertex count`, [p.id]));
        continue;
      }
      // The board image must be the row-frame shape moved by one constant vector.
      const t = { x: part.boardOutline[0]!.x - row[0]!.x, y: part.boardOutline[0]!.y - row[0]!.y };
      const turned = row.some(
        (q, i) =>
          Math.abs(part.boardOutline[i]!.x - q.x - t.x) > LINE_TOL ||
          Math.abs(part.boardOutline[i]!.y - q.y - t.y) > LINE_TOL,
      );
      if (turned) {
        out.push(v('orientation', `Piece ${p.id} is rotated or mirrored on its board`, [p.id]));
      }
      const outside = part.boardOutline.some(
        (q) =>
          q.x < r.x - RECT_TOL ||
          q.x > r.x + r.w + RECT_TOL ||
          q.y < r.y - RECT_TOL ||
          q.y > r.y + r.h + RECT_TOL,
      );
      if (outside) {
        out.push(v('shapeNotOnBoard', `Piece ${p.id} does not fit its board rectangle`, [p.id]));
      }
    }
  }
  return out;
}

// ---- 1. coverage --------------------------------------------------------------------------

const shapesOfPiece = (p: PlannedPiece): Shape[] =>
  p.parts.map((part) => ({
    outer: ensureCCW(part.outline),
    holes: part.holes.map((h) => ensureCCW(h).reverse()),
  }));

const perimeter = (shapes: readonly Shape[]): number =>
  shapes.reduce(
    (sum, s) =>
      sum +
      [s.outer, ...s.holes].reduce(
        (a, ring) =>
          a +
          ring.reduce(
            (l, p, i) =>
              l +
              Math.hypot(
                ring[(i + 1) % ring.length]!.x - p.x,
                ring[(i + 1) % ring.length]!.y - p.y,
              ),
            0,
          ),
        0,
      ),
    0,
  );

export function checkCoverage(project: Project, plan: Plan): Violation[] {
  const room = roomOf(project, plan);
  if (!room) return [v('coverage', 'The plan refers to no room of the project', [])];
  const zone = buildZone(zoneInputOf(project, room)).shapes;
  const pieces = plan.pieces.flatMap(shapesOfPiece);
  const merged = union(pieces);
  const tol = 0.5 + 0.01 * perimeter(zone);
  const missing = shapesArea(difference(zone, merged));
  const extra = shapesArea(difference(merged, zone));
  const out: Violation[] = [];
  if (missing > tol)
    out.push(v('coverage', `${missing.toFixed(1)} mm² of the zone is not covered`, []));
  if (extra > tol) out.push(v('coverage', `${extra.toFixed(1)} mm² lies outside the zone`, []));
  const overlapArea =
    pieces.reduce((s, sh) => s + Math.abs(shapesArea([sh])), 0) - shapesArea(merged);
  if (overlapArea > tol)
    out.push(v('overlap', `Pieces overlap by ${overlapArea.toFixed(1)} mm²`, []));
  return out;
}

// ---- 3–5. connections, L_min, w_min ---------------------------------------------------------

export function checkConnections(
  project: Project,
  geoms: readonly PieceGeom[],
  conn: readonly Connections[],
): Violation[] {
  const out: Violation[] = [];
  const L = project.product.boardLength;
  const W = project.product.boardWidth;
  const { minPieceLength, minRipWidth } = project.rules;

  geoms.forEach((g, i) => {
    const p = g.piece;
    const c = conn[i]!;
    const r = p.boardRect;
    // Profiles: a connected edge must be the matching original board edge.
    const bad: string[] = [];
    if (c.left && Math.abs(r.x) > RECT_TOL) bad.push('left');
    if (c.right && Math.abs(r.x + r.w - L) > RECT_TOL) bad.push('right');
    if (c.lowLength > SHARED_MIN && Math.abs(r.y) > RECT_TOL) bad.push('bottom');
    if (c.highLength > SHARED_MIN && Math.abs(r.y + r.h - W) > RECT_TOL) bad.push('top');
    if (bad.length) {
      out.push(
        v('profile', `Piece ${p.id}: ${bad.join(', ')} edge is not an original board edge`, [p.id]),
      );
    }

    // L_min: a piece with exactly one seam (start or end piece).
    if (c.left !== c.right) {
      const have = (len: number): boolean => len >= minPieceLength - GRID_TOL;
      const lows = c.lowLength > SHARED_MIN;
      const highs = c.highLength > SHARED_MIN;
      const extent = g.box.maxX - g.box.minX;
      const short =
        (lows && !have(c.lowLength)) ||
        (highs && !have(c.highLength)) ||
        (!lows && !highs && !have(extent));
      if (short)
        out.push(v('minLength', `Piece ${p.id} is shorter than the minimum length`, [p.id]));
    }

    // w_min: only strips whose outline is axis-parallel (slanted walls give scribes instead).
    const height = g.box.maxY - g.box.minY;
    const axisParallel = g.outers.every((ring) =>
      ring.every((a, k) => {
        const b = ring[(k + 1) % ring.length]!;
        return Math.abs(a.x - b.x) <= 0.05 || Math.abs(a.y - b.y) <= 0.05;
      }),
    );
    if (axisParallel && height < W - GRID_TOL && height < minRipWidth - GRID_TOL) {
      out.push(v('ripWidth', `Strip ${p.id} is narrower than the minimum width`, [p.id]));
    }
  });
  return out;
}

// ---- 6. stagger ---------------------------------------------------------------------------

/** Seam positions (row frame) of every segment, from shared vertical edges inside the segment. */
function seamsBySegment(
  geoms: readonly PieceGeom[],
  shared: readonly SharedBoundary[],
): Map<string, number[]> {
  const seams = new Map<string, number[]>();
  for (const s of shared) {
    const A = geoms[s.a]!.piece;
    const B = geoms[s.b]!.piece;
    if (A.segmentId !== B.segmentId || s.verticalLength <= SHARED_MIN) continue;
    const list = seams.get(A.segmentId) ?? [];
    for (const e of s.vertical)
      if (!list.some((x) => Math.abs(x - e.x) <= LINE_TOL)) list.push(e.x);
    seams.set(A.segmentId, list);
  }
  for (const list of seams.values()) list.sort((p, q) => p - q);
  return seams;
}

export function checkStagger(
  project: Project,
  geoms: readonly PieceGeom[],
  shared: readonly SharedBoundary[],
): Violation[] {
  const D = project.rules.minStagger;
  const seams = seamsBySegment(geoms, shared);
  // Shared horizontal boundary per (lower segment, upper segment).
  const links = new Map<string, Interval[]>();
  for (const s of shared) {
    if (s.horizontalLength <= SHARED_MIN) continue;
    const A = geoms[s.a]!;
    const B = geoms[s.b]!;
    if (Math.abs(A.piece.band - B.piece.band) !== 1) continue;
    const [lower, upper] = A.cy < B.cy ? [A, B] : [B, A];
    const key = `${lower.piece.segmentId}|${upper.piece.segmentId}`;
    links.set(key, [...(links.get(key) ?? []), ...s.horizontal]);
  }

  const out: Violation[] = [];
  for (const [key, raw] of links) {
    const [lower, upper] = key.split('|') as [string, string];
    const a = seams.get(lower) ?? [];
    const b = seams.get(upper) ?? [];
    for (const [lo, hi] of normalizeIntervals(raw, { eps: LINE_TOL })) {
      const from = lo - D;
      const to = hi + D;
      for (const x of a) {
        if (x < from || x > to) continue;
        for (const y of b) {
          if (y < from || y > to) continue;
          if (Math.abs(x - y) < D - GRID_TOL) {
            out.push(
              v(
                'stagger',
                `Seams of segments ${lower} and ${upper} are ${Math.abs(x - y).toFixed(1)} mm apart`,
                [lower, upper],
              ),
            );
          }
        }
      }
    }
  }
  return out;
}

// ---- 7. pipes -----------------------------------------------------------------------------

export function checkPipes(project: Project, plan: Plan, geoms: readonly PieceGeom[]): Violation[] {
  const room = roomOf(project, plan);
  if (!room) return [];
  const out: Violation[] = [];
  const expectedDrills = new Map<string, number>(); // piece id → drills that should exist

  for (const pipe of room.obstacles) {
    if (pipe.kind !== 'pipe') continue;
    const r = pipe.diameter / 2;
    const centreRow = apply(plan.frame, pipe.center);
    const hits: { g: PieceGeom; inside: boolean }[] = [];
    for (const g of geoms) {
      const parts = g.piece.parts;
      let inside = false;
      let distance = Infinity;
      parts.forEach((part) => {
        const loc = locatePoint(pipe.center, part.outline);
        const inHole = part.holes.some((h) => locatePoint(pipe.center, h) === 'inside');
        if (loc === 'inside' && !inHole) inside = true;
        for (const ring of [part.outline, ...part.holes]) {
          ring.forEach((a, i) => {
            distance = Math.min(
              distance,
              pointSegmentDist(pipe.center, a, ring[(i + 1) % ring.length]!),
            );
          });
        }
      });
      if (inside || distance <= r) hits.push({ g, inside });
    }

    for (const { g } of hits) {
      const id = g.piece.id;
      expectedDrills.set(id, (expectedDrills.get(id) ?? 0) + 1);
      const drill = g.piece.features.find(
        (f) => f.kind === 'drill' && Math.abs(f.diameter - pipe.diameter) <= 1e-9,
      );
      if (!drill || drill.kind !== 'drill') {
        out.push(v('pipe', `Pipe ${pipe.id} has no drill hole on piece ${id}`, [pipe.id, id]));
        continue;
      }
      // Expected local position: the board image is a pure translation of the row-frame shape.
      const part = g.piece.parts[0]!;
      const row = applyAll(plan.frame, part.outline)[0]!;
      const t = { x: part.boardOutline[0]!.x - row.x, y: part.boardOutline[0]!.y - row.y };
      const local = {
        x: centreRow.x + t.x - g.piece.boardRect.x,
        y: centreRow.y + t.y - g.piece.boardRect.y,
      };
      if (Math.abs(drill.x - local.x) > 0.05 || Math.abs(drill.y - local.y) > 0.05) {
        out.push(v('pipe', `Drill of pipe ${pipe.id} on piece ${id} is misplaced`, [pipe.id, id]));
      }
    }
  }

  for (const g of geoms) {
    const have = g.piece.features.filter((f) => f.kind === 'drill').length;
    const want = expectedDrills.get(g.piece.id) ?? 0;
    if (have !== want) {
      out.push(
        v('pipe', `Piece ${g.piece.id} has ${have} drill holes, expected ${want}`, [g.piece.id]),
      );
    }
  }
  return out;
}

export function geometryChecks(project: Project, plan: Plan): Violation[] {
  const geoms = toGeoms(plan);
  const shared = sharedBoundaries(geoms);
  const conn = connectionsOf(geoms, shared);
  return [
    ...checkConnections(project, geoms, conn),
    ...checkStagger(project, geoms, shared),
    ...checkPipes(project, plan, geoms),
  ];
}
