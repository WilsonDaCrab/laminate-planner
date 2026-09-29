/**
 * Cutting list (DOMAIN §10): for every board the saw cuts in a workable order (rips along the
 * board first, then crosscuts), the crosscut stops grouped by length, and the laying order by
 * rows. Every dimension in the output is rounded DOWN to whole millimetres with `Math.floor`
 * (not `floorMm`, which tolerates +1e-6, ADR-011), so a piece is never longer than its space.
 */

import type { BoardRect, Plan, PlannedBoard, Rules } from '../model/index';

export interface CutStep {
  kind: 'rip' | 'cross';
  /**
   * Distance (whole mm) from the low edge of `region` (bottom for a rip, left for a crosscut) to
   * the cut line; the saw kerf lies beyond it.
   */
  at: number;
  /** The rectangle being cut, board coordinates. */
  region: { x: number; y: number; w: number; h: number };
}

export interface CutPiece {
  pieceId: string;
  /** Whole millimetres, rounded down. */
  length: number;
  width: number;
  /** Space the piece is cut from (between kerfs and board edges), mm. */
  space: { length: number; width: number };
}

export interface BoardCutSheet {
  boardId: string;
  /** In cutting order: a region is fully split before its parts are cut further. */
  steps: CutStep[];
  pieces: CutPiece[];
  /** Regions that hold no piece (waste and usable leftovers), board coordinates. */
  offcuts: { x: number; y: number; w: number; h: number }[];
}

export interface StopGroup {
  /** Stop setting: the crosscut (or rip) distance in whole mm. */
  length: number;
  /** Boards cut at this setting (once per cut). */
  boards: string[];
}

export interface LayingRow {
  band: number;
  pieces: { id: string; boardId: string; length: number }[];
}

export interface CutList {
  sheets: BoardCutSheet[];
  /** Crosscut stops, longest first. */
  crossStops: StopGroup[];
  ripStops: StopGroup[];
  laying: LayingRow[];
}

interface Item {
  id: string;
  rect: BoardRect;
}

interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Tolerance for comparing exact placements. */
const TOL = 1e-6;
/** A margin of at most this is left uncut: rounding leaves up to one millimetre anyway. */
const MIN_MARGIN = 1 + 1e-6;

type Axis = 'x' | 'y';

const startOf = (r: BoardRect, axis: Axis): number => (axis === 'x' ? r.x : r.y);
const endOf = (r: BoardRect, axis: Axis): number => (axis === 'x' ? r.x + r.w : r.y + r.h);

/** Items grouped along an axis: a new group starts where a full kerf fits between them. */
function groupsAlong(items: readonly Item[], axis: Axis, kerf: number): Item[][] {
  const sorted = [...items].sort(
    (p, q) => startOf(p.rect, axis) - startOf(q.rect, axis) || (p.id < q.id ? -1 : 1),
  );
  const groups: Item[][] = [];
  let reach = -Infinity;
  for (const it of sorted) {
    const start = startOf(it.rect, axis);
    const end = endOf(it.rect, axis);
    if (groups.length === 0 || start >= reach + kerf - TOL) {
      groups.push([it]);
      reach = end;
    } else {
      groups[groups.length - 1]!.push(it);
      reach = Math.max(reach, end);
    }
  }
  return groups;
}

class SheetBuilder {
  readonly steps: CutStep[] = [];
  readonly pieces: CutPiece[] = [];
  readonly offcuts: BoardCutSheet['offcuts'] = [];

  constructor(private readonly kerf: number) {}

  /**
   * Cuts along one axis so that every group ends up in its own tight region. A group is measured
   * from the start of its region ("compacted"): a sliver in front of it that is too thin for a
   * cut simply becomes waste at the end, and the group's cuts stay exact relative to each other.
   */
  private cutAxis(
    region: Region,
    groups: Item[][],
    axis: Axis,
  ): { group: Item[]; region: Region }[] {
    const k = this.kerf;
    const lo = axis === 'x' ? region.x0 : region.y0;
    const hi = axis === 'x' ? region.x1 : region.y1;
    const out: { group: Item[]; region: Region }[] = [];
    let cursor = lo;

    const cut = (exact: number): void => {
      const at = Math.floor(exact - cursor);
      const whole =
        axis === 'x'
          ? { x: cursor, y: region.y0, w: hi - cursor, h: region.y1 - region.y0 }
          : { x: region.x0, y: cursor, w: region.x1 - region.x0, h: hi - cursor };
      this.steps.push({ kind: axis === 'x' ? 'cross' : 'rip', at, region: whole });
      cursor = cursor + at + k;
    };

    groups.forEach((group, gi) => {
      const start = Math.min(...group.map((i) => startOf(i.rect, axis)));
      if (start - cursor > k + MIN_MARGIN) {
        const from = cursor;
        cut(start - k); // waste before the group
        this.offcut(region, axis, from, cursor - k);
      }
      // Compact: the group starts where its region starts.
      const shift = cursor - start;
      const moved = group.map((it) => ({
        id: it.id,
        rect:
          axis === 'x'
            ? { ...it.rect, x: it.rect.x + shift }
            : { ...it.rect, y: it.rect.y + shift },
      }));
      const end = Math.max(...moved.map((i) => endOf(i.rect, axis)));
      const groupLo = cursor;
      const last = gi === groups.length - 1;
      let groupHi = hi;
      if (!last || hi - end > MIN_MARGIN) {
        cut(end);
        groupHi = cursor - k; // the cut line itself
        if (last) this.offcut(region, axis, cursor, hi);
      }
      out.push({
        group: moved,
        region:
          axis === 'x'
            ? { x0: groupLo, x1: groupHi, y0: region.y0, y1: region.y1 }
            : { x0: region.x0, x1: region.x1, y0: groupLo, y1: groupHi },
      });
    });
    return out;
  }

  private offcut(region: Region, axis: Axis, from: number, to: number): void {
    if (to - from <= TOL) return;
    this.offcuts.push(
      axis === 'x'
        ? { x: from, y: region.y0, w: to - from, h: region.y1 - region.y0 }
        : { x: region.x0, y: from, w: region.x1 - region.x0, h: to - from },
    );
  }

  /** Splits a region into single pieces: rips first, then crosscuts. */
  process(region: Region, items: readonly Item[]): void {
    for (const axis of ['y', 'x'] as const) {
      const groups = groupsAlong(items, axis, this.kerf);
      const lo = axis === 'x' ? region.x0 : region.y0;
      const hi = axis === 'x' ? region.x1 : region.y1;
      const start = Math.min(...items.map((i) => startOf(i.rect, axis)));
      const end = Math.max(...items.map((i) => endOf(i.rect, axis)));
      const needsCut = groups.length > 1 || start - lo > MIN_MARGIN || hi - end > MIN_MARGIN;
      if (!needsCut) continue;
      for (const part of this.cutAxis(region, groups, axis)) this.process(part.region, part.group);
      return;
    }
    if (items.length !== 1) {
      throw new RangeError('cutlist: pieces overlap, the board is not a guillotine layout');
    }
    const { id, rect } = items[0]!;
    this.pieces.push({
      pieceId: id,
      length: Math.floor(rect.w),
      width: Math.floor(rect.h),
      space: { length: region.x1 - region.x0, width: region.y1 - region.y0 },
    });
  }
}

export function buildBoardSheet(
  board: PlannedBoard,
  dims: { L: number; W: number },
  kerf: number,
): BoardCutSheet {
  const sheet = new SheetBuilder(kerf);
  const items = board.placements.map((p) => ({ id: p.pieceId, rect: p.rect }));
  if (items.length === 0) {
    return {
      boardId: board.id,
      steps: [],
      pieces: [],
      offcuts: [{ x: 0, y: 0, w: dims.L, h: dims.W }],
    };
  }
  sheet.process({ x0: 0, x1: dims.L, y0: 0, y1: dims.W }, items);
  return { boardId: board.id, steps: sheet.steps, pieces: sheet.pieces, offcuts: sheet.offcuts };
}

function groupStops(sheets: readonly BoardCutSheet[], kind: CutStep['kind']): StopGroup[] {
  const by = new Map<number, string[]>();
  for (const s of sheets) {
    for (const step of s.steps) {
      if (step.kind !== kind) continue;
      by.set(step.at, [...(by.get(step.at) ?? []), s.boardId]);
    }
  }
  return [...by.entries()]
    .sort((p, q) => q[0] - p[0])
    .map(([length, boards]) => ({ length, boards: boards.sort() }));
}

/** Position of a segment letter group in reading order: 'a' < 'b' < … < 'z' < 'aa'. */
const segmentRank = (segmentId: string): [number, string] => {
  const letters = segmentId.replace(/^\d+/, '');
  return [letters.length, letters];
};

export function buildCutList(
  plan: Plan,
  dims: { L: number; W: number },
  rules: Pick<Rules, 'kerf'>,
): CutList {
  const sheets = plan.boards.map((b) => buildBoardSheet(b, dims, rules.kerf));
  const length = new Map<string, number>();
  for (const s of sheets) for (const p of s.pieces) length.set(p.pieceId, p.length);

  const byBand = new Map<number, LayingRow['pieces'][number][]>();
  const ordered = [...plan.pieces].sort((p, q) => {
    const [pl, ps] = segmentRank(p.segmentId);
    const [ql, qs] = segmentRank(q.segmentId);
    return (
      p.band - q.band || pl - ql || (ps < qs ? -1 : ps > qs ? 1 : 0) || p.indexInRow - q.indexInRow
    );
  });
  for (const p of ordered) {
    const row = byBand.get(p.band) ?? [];
    row.push({
      id: p.id,
      boardId: p.boardId,
      length: length.get(p.id) ?? Math.floor(p.boardRect.w),
    });
    byBand.set(p.band, row);
  }
  const laying = [...byBand.entries()]
    .sort((p, q) => p[0] - q[0])
    .map(([band, pieces]) => ({ band, pieces }));

  return {
    sheets,
    crossStops: groupStops(sheets, 'cross'),
    ripStops: groupStops(sheets, 'rip'),
    laying,
  };
}
