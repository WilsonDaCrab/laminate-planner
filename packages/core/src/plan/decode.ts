/**
 * Decoder core (ALGORITHM §4): pieces with descriptors → boards. Shared by `plan` (which adds
 * geometry, features and labels) and `evaluate` (which only needs B and the unpaired lists), so
 * that both report the same board count by construction.
 *
 * Everything is a board rectangle L × W in board coordinates (x along the board, y across it;
 * y = 0 carries the bottom-edge profile, y = W the top-edge profile). Stages:
 *   A  full-width pieces (long = both): whole boards and end/start pairs;
 *   B  strips (long = low | high): units paired by width so that low + high + kerf ≤ W;
 *   C  free pieces and pieces without long edges: best fit into leftover stock, else a new board.
 * Leftovers carry profile flags (which of their four edges are original board edges).
 */

import { EPS, FIT_EPS, type Mm } from '../num/index';
import type { LongNeeds, ShortNeeds } from '../layout/pieces';
import { maxPairs, type Item } from './pairing';

export interface DecodePiece {
  /** Unique, stable id; used to break ties so that decoding is deterministic. */
  id: string;
  short: ShortNeeds;
  long: LongNeeds;
  /** x extent (used for pairing). */
  extent: Mm;
  /** Width the piece must have. */
  width: Mm;
}

export interface DecodeParams {
  /** Board length L and width W. */
  L: Mm;
  W: Mm;
  kerf: Mm;
}

export interface Rect {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

export interface DecodedBoard {
  index: number;
  placements: { pieceId: string; rect: Rect }[];
}

export interface DecodeResult {
  /** B = BA + BB + BC. */
  B: number;
  BA: number;
  BB: number;
  BC: number;
  boards: DecodedBoard[];
  /** Unpaired end (left part) and start (right part) pieces of the full-width class after stage A. */
  unpairedEnds: Item[];
  unpairedStarts: Item[];
}

/** A leftover rectangle of a board and which of its edges are original (profiled) board edges. */
interface Stock {
  seq: number;
  board: number;
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  left: boolean;
  right: boolean;
  low: boolean;
  high: boolean;
}

type Flags = Pick<Stock, 'left' | 'right' | 'low' | 'high'>;

/** A strip of the board: one row of pieces sharing a y range (width = tallest piece). */
interface Unit {
  key: string;
  side: 'both' | 'low' | 'high';
  width: Mm;
  items: { piece: DecodePiece; x0: Mm; x1: Mm }[];
}

const byId = (p: DecodePiece, q: DecodePiece): number => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);

class Builder {
  readonly boards: DecodedBoard[] = [];
  readonly stock: Stock[] = [];
  private seq = 0;

  constructor(readonly params: DecodeParams) {}

  newBoard(): number {
    this.boards.push({ index: this.boards.length, placements: [] });
    return this.boards.length - 1;
  }

  put(board: number, pieceId: string, rect: Rect): void {
    this.boards[board]!.placements.push({ pieceId, rect });
  }

  /** Adds a leftover when it has positive size on both axes. */
  addStock(board: number, x: Mm, y: Mm, w: Mm, h: Mm, flags: Flags): void {
    if (w > EPS && h > EPS) this.stock.push({ seq: this.seq++, board, x, y, w, h, ...flags });
  }
}

/** Unit for one piece or an end/start pair, positioned on a board of length L. */
function makeUnit(
  side: Unit['side'],
  L: Mm,
  end: DecodePiece | undefined,
  start: DecodePiece | undefined,
  whole?: DecodePiece,
): Unit {
  const items: Unit['items'] = [];
  if (whole) items.push({ piece: whole, x0: 0, x1: whole.extent });
  if (end) items.push({ piece: end, x0: 0, x1: end.extent });
  if (start) items.push({ piece: start, x0: L - start.extent, x1: L });
  const first = items[0]!.piece;
  return {
    key: `u:${first.id}`,
    side,
    width: Math.max(...items.map((i) => i.piece.width)),
    items,
  };
}

/** Puts a unit's pieces on a board and turns the gaps along x into leftovers of the strip. */
function placeUnit(b: Builder, board: number, unit: Unit): { y0: Mm; y1: Mm } {
  const { L, W, kerf } = b.params;
  const y0 = unit.side === 'high' ? W - unit.width : 0;
  for (const { piece, x0, x1 } of unit.items) {
    const y = unit.side === 'high' ? W - piece.width : 0;
    b.put(board, piece.id, { x: x0, y, w: x1 - x0, h: piece.width });
  }
  const strip: Flags = {
    left: false,
    right: false,
    low: unit.side !== 'high',
    high: unit.side !== 'low',
  };
  const sorted = [...unit.items].sort((p, q) => p.x0 - q.x0);
  let cursor = 0; // start of the current free gap
  let cut = false; // is the gap's left edge a cut edge?
  for (const it of sorted) {
    const gapStart = cursor + (cut ? kerf : 0);
    b.addStock(board, gapStart, y0, it.x0 - kerf - gapStart, unit.width, {
      ...strip,
      left: !cut,
    });
    cursor = it.x1;
    cut = true;
  }
  const tail = cursor + (cut ? kerf : 0);
  b.addStock(board, tail, y0, L - tail, unit.width, { ...strip, left: !cut, right: true });
  return { y0, y1: y0 + unit.width };
}

/** What a piece needs from the leftover it is cut from. */
interface Needs {
  left: boolean;
  right: boolean;
  low: boolean;
  high: boolean;
}

const needsOf = (p: DecodePiece): Needs => ({
  left: p.short === 'end' || p.short === 'full',
  right: p.short === 'start' || p.short === 'full',
  low: p.long === 'low' || p.long === 'both',
  high: p.long === 'high' || p.long === 'both',
});

function fits(s: Stock, p: DecodePiece, n: Needs): boolean {
  if ((n.left && !s.left) || (n.right && !s.right) || (n.low && !s.low) || (n.high && !s.high)) {
    return false;
  }
  if (s.w < p.extent - FIT_EPS || s.h < p.width - FIT_EPS) return false;
  // A piece that keeps both original ends (or both original long edges) must span the stock.
  if (n.left && n.right && s.w - p.extent > EPS) return false;
  if (n.low && n.high && s.h - p.width > EPS) return false;
  return true;
}

/** Best fit: smallest area, ties by creation order. */
function findStock(stock: readonly Stock[], p: DecodePiece, n: Needs): number {
  let best = -1;
  let bestArea = Infinity;
  stock.forEach((s, i) => {
    if (!fits(s, p, n)) return;
    const area = s.w * s.h;
    if (area < bestArea - EPS || (Math.abs(area - bestArea) <= EPS && s.seq < stock[best]!.seq)) {
      best = i;
      bestArea = area;
    }
  });
  return best;
}

/** Cuts `p` out of `s` at a corner that keeps as many profiles as possible; returns leftovers. */
function cutFromStock(b: Builder, s: Stock, p: DecodePiece): void {
  const { kerf } = b.params;
  const n = needsOf(p);
  const atLeft = n.left ? true : n.right ? false : !s.left ? true : !s.right ? false : true;
  const atBottom = n.low ? true : n.high ? false : !s.low ? true : !s.high ? false : true;
  const px = atLeft ? s.x : s.x + s.w - p.extent;
  const py = atBottom ? s.y : s.y + s.h - p.width;
  b.put(s.board, p.id, { x: px, y: py, w: p.extent, h: p.width });

  // Leftover along x over the full stock height.
  const restW = s.w - p.extent - kerf;
  b.addStock(s.board, atLeft ? s.x + p.extent + kerf : s.x, s.y, restW, s.h, {
    left: atLeft ? false : s.left,
    right: atLeft ? s.right : false,
    low: s.low,
    high: s.high,
  });
  // Leftover strip beside the piece (its x range only).
  const restH = s.h - p.width - kerf;
  const wholeX = s.w - p.extent <= EPS; // no cut along x: the far edge stays original
  b.addStock(s.board, px, atBottom ? s.y + p.width + kerf : s.y, p.extent, restH, {
    left: atLeft ? s.left : wholeX && s.left,
    right: atLeft ? wholeX && s.right : s.right,
    low: atBottom ? false : s.low,
    high: atBottom ? s.high : false,
  });
}

/** Cuts `p` from the best-fitting existing leftover; returns false (and changes nothing) if none fits. */
function tryPlaceInStock(b: Builder, p: DecodePiece): boolean {
  const i = findStock(b.stock, p, needsOf(p));
  if (i < 0) return false;
  const s = b.stock[i]!;
  b.stock.splice(i, 1);
  cutFromStock(b, s, p);
  return true;
}

/** Cuts `p` from the best-fitting leftover, or from a fresh board when nothing fits. */
function placeBestFit(b: Builder, p: DecodePiece): void {
  const { L, W } = b.params;
  const n = needsOf(p);
  let i = findStock(b.stock, p, n);
  if (i < 0) {
    const bi = b.newBoard();
    b.addStock(bi, 0, 0, L, W, { left: true, right: true, low: true, high: true });
    i = b.stock.length - 1;
    if (!fits(b.stock[i]!, p, n)) {
      // Piece larger than a board (extent > L or width > W): decoder input is invalid.
      throw new RangeError(`decode: piece ${p.id} does not fit on a board`);
    }
  }
  const s = b.stock[i]!;
  b.stock.splice(i, 1);
  cutFromStock(b, s, p);
}

export function decode(pieces: readonly DecodePiece[], params: DecodeParams): DecodeResult {
  const { L, W, kerf } = params;
  const b = new Builder(params);
  const sorted = [...pieces].sort(byId);
  const toItem = (p: DecodePiece): Item => ({ id: p.id, len: p.extent });
  const byKey = new Map(sorted.map((p) => [p.id, p]));
  const get = (id: string): DecodePiece => byKey.get(id)!;

  const free: DecodePiece[] = []; // stage C
  const fullA: DecodePiece[] = [];
  const endsA: DecodePiece[] = [];
  const startsA: DecodePiece[] = [];
  const lowB = {
    full: [] as DecodePiece[],
    ends: [] as DecodePiece[],
    starts: [] as DecodePiece[],
  };
  const highB = {
    full: [] as DecodePiece[],
    ends: [] as DecodePiece[],
    starts: [] as DecodePiece[],
  };

  for (const p of sorted) {
    if (p.long === 'none' || p.short === 'free') {
      free.push(p);
      continue;
    }
    // A piece as wide as the board has both long edges of its board whatever it needs, so it is a
    // full-width piece (stage A): e.g. the first and last row of a room whose rows are not clipped.
    const target = p.long === 'both' || p.width >= W - EPS ? null : p.long === 'low' ? lowB : highB;
    if (target === null) {
      (p.short === 'full' ? fullA : p.short === 'end' ? endsA : startsA).push(p);
    } else {
      (p.short === 'full' ? target.full : p.short === 'end' ? target.ends : target.starts).push(p);
    }
  }

  // ---- A: full-width pieces --------------------------------------------------------------
  for (const p of fullA) {
    const bi = b.newBoard();
    placeUnit(b, bi, makeUnit('both', L, undefined, undefined, p));
  }
  const pairsA = maxPairs(endsA.map(toItem), startsA.map(toItem), L - kerf);
  const pairedEnd = new Set(pairsA.map((q) => q.end.id));
  const pairedStart = new Set(pairsA.map((q) => q.start.id));
  for (const q of pairsA) {
    const bi = b.newBoard();
    placeUnit(b, bi, makeUnit('both', L, get(q.end.id), get(q.start.id)));
  }
  for (const p of startsA) {
    if (pairedStart.has(p.id)) continue;
    const bi = b.newBoard();
    placeUnit(b, bi, makeUnit('both', L, undefined, p));
  }
  for (const p of endsA) {
    if (pairedEnd.has(p.id)) continue;
    const bi = b.newBoard();
    placeUnit(b, bi, makeUnit('both', L, p, undefined));
  }
  const BA = b.boards.length;
  const unpairedEnds = endsA.filter((p) => !pairedEnd.has(p.id)).map(toItem);
  const unpairedStarts = startsA.filter((p) => !pairedStart.has(p.id)).map(toItem);

  // ---- B.3: strip pieces into the leftovers of stage A -------------------------------------
  // Start/end pieces of the first and last row need a profiled end and one long edge; the
  // leftover of a full-width pair often has both. Placing one there never costs a board: it
  // removes one strip unit, and the maximum pairing of the rest drops by at most one.
  const stripPieces = [...lowB.ends, ...lowB.starts, ...highB.ends, ...highB.starts].sort(
    (p, q) => q.extent * q.width - p.extent * p.width || byId(p, q),
  );
  const inLeftover = new Set(stripPieces.filter((p) => tryPlaceInStock(b, p)).map((p) => p.id));
  for (const g of [lowB, highB]) {
    g.ends = g.ends.filter((p) => !inLeftover.has(p.id));
    g.starts = g.starts.filter((p) => !inLeftover.has(p.id));
  }

  // ---- B: strips ---------------------------------------------------------------------------
  const unitsOf = (side: 'low' | 'high', g: typeof lowB): Unit[] => {
    const units: Unit[] = g.full.map((p) => makeUnit(side, L, undefined, undefined, p));
    const pairs = maxPairs(g.ends.map(toItem), g.starts.map(toItem), L - kerf);
    const pe = new Set(pairs.map((q) => q.end.id));
    const ps = new Set(pairs.map((q) => q.start.id));
    for (const q of pairs) units.push(makeUnit(side, L, get(q.end.id), get(q.start.id)));
    for (const p of g.starts) if (!ps.has(p.id)) units.push(makeUnit(side, L, undefined, p));
    for (const p of g.ends) if (!pe.has(p.id)) units.push(makeUnit(side, L, p, undefined));
    return units;
  };
  const lowUnits = unitsOf('low', lowB);
  const highUnits = unitsOf('high', highB);
  const unitByKey = new Map([...lowUnits, ...highUnits].map((u) => [u.key, u]));
  const widthItem = (u: Unit): Item => ({ id: u.key, len: u.width });
  const pairsB = maxPairs(lowUnits.map(widthItem), highUnits.map(widthItem), W - kerf);
  const usedLow = new Set(pairsB.map((q) => q.end.id));
  const usedHigh = new Set(pairsB.map((q) => q.start.id));
  const rowLeftovers = (bi: number, lowW: Mm | null, highW: Mm | null): void => {
    const x = { left: true, right: true };
    if (lowW !== null && highW !== null) {
      b.addStock(bi, 0, lowW + kerf, L, W - highW - lowW - 2 * kerf, {
        ...x,
        low: false,
        high: false,
      });
    } else if (lowW !== null) {
      b.addStock(bi, 0, lowW + kerf, L, W - lowW - kerf, { ...x, low: false, high: true });
    } else if (highW !== null) {
      b.addStock(bi, 0, 0, L, W - highW - kerf, { ...x, low: true, high: false });
    }
  };
  for (const q of pairsB) {
    const bi = b.newBoard();
    const lo = unitByKey.get(q.end.id)!;
    const hi = unitByKey.get(q.start.id)!;
    placeUnit(b, bi, lo);
    placeUnit(b, bi, hi);
    rowLeftovers(bi, lo.width, hi.width);
  }
  for (const u of lowUnits) {
    if (usedLow.has(u.key)) continue;
    const bi = b.newBoard();
    placeUnit(b, bi, u);
    rowLeftovers(bi, u.width, null);
  }
  for (const u of highUnits) {
    if (usedHigh.has(u.key)) continue;
    const bi = b.newBoard();
    placeUnit(b, bi, u);
    rowLeftovers(bi, null, u.width);
  }
  const BB = b.boards.length - BA;

  // ---- C: free pieces, best fit -----------------------------------------------------------
  const order = [...free].sort((p, q) => q.extent * q.width - p.extent * p.width || byId(p, q));
  for (const p of order) placeBestFit(b, p);
  const BC = b.boards.length - BA - BB;
  return {
    B: b.boards.length,
    BA,
    BB,
    BC,
    boards: b.boards,
    unpairedEnds,
    unpairedStarts,
  };
}

/**
 * Sequential decoder (ALGORITHM §4.5): pieces are laid in the given order and a leftover can only
 * serve pieces laid later. Every piece is best-fitted into the leftovers (start pieces need the
 * right-end profile, end pieces the left-end profile, ...) or opens a new board; no global pairing.
 * The input order is kept (no sorting).
 */
export function decodeSequential(
  pieces: readonly DecodePiece[],
  params: DecodeParams,
): DecodeResult {
  const b = new Builder(params);
  for (const p of pieces) placeBestFit(b, p);
  return {
    B: b.boards.length,
    BA: 0,
    BB: 0,
    BC: b.boards.length,
    boards: b.boards,
    unpairedEnds: [],
    unpairedStarts: [],
  };
}
