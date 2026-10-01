/**
 * Typed-array evaluator (ALGORITHM §14, ADR-016): the same objective as `evaluate` in `precut`
 * mode, without strings, objects or `Map`s in the hot path. It is a port of `plan/decode.ts` that
 * keeps only what the decisions depend on — a leftover is (w, h, profile flags) and their creation
 * order, positions are irrelevant — and the tests require B, V, H, N, f, the L_min deficit and the
 * unpaired pieces to equal `evaluate`'s exactly (CLAUDE.md rule 5).
 *
 * Tie-breaking by piece id (`byId`) is reproduced with a numeric key: segments ranked by their
 * label prefix, then role (`NN` < `B` < `S`), so pieces are generated directly in sorted order.
 */

import { pieceLabel, type PlanContext } from '../plan/context';
import {
  describePieces,
  seamsOf,
  type PieceDescriptor,
  type ShortNeeds,
  type LongNeeds,
} from '../layout/pieces';
import { MIN_OPEN_LENGTH } from '../layout/neighbors';
import { EPS, FIT_EPS, mod } from '../num/index';
import { regularityPenalty } from './evaluate';
import { defaultWeights, type EvalWeights } from './evaluate';
import type { Evaluator, QuickEval, UnpairedInfo, UnpairedList } from './evaluator';
import { fastPathApplies } from './seams';

const START = 0;
const END = 1;
const FULL = 2;
const FREE = 3;
const BOTH = 0;
const LOW = 1;
const HIGH = 2;
const NONE = 3;
/** Leftover profile flags. */
const F_LEFT = 1;
const F_RIGHT = 2;
const F_LOW = 4;
const F_HIGH = 8;
/** Unit sides (stage A units have both long edges and need no side). */
const SIDE_LOW = 1;
const SIDE_HIGH = 2;

/** Indices of the class lists. */
const C_FREE = 0;
const C_FULL_A = 1; // + 0 full, 1 ends, 2 starts
const C_LOW_FULL = 4;
const C_HIGH_FULL = 7;
/** Whole boards of a whole-width row: counted, never listed (they leave no leftover). */
const C_WHOLE = 10;

const ROLE_END = 1000;
const ROLE_START = 2000;
const KEY_STRIDE = 4096;
/** Pieces per row must stay below 99 so that `NN` labels compare like numbers. */
const MAX_PIECES_PER_ROW = 98;

const shortCode: Record<ShortNeeds, number> = { start: START, end: END, full: FULL, free: FREE };
const longCode: Record<LongNeeds, number> = { both: BOTH, low: LOW, high: HIGH, none: NONE };

/** Orders of the stage A lists. */
const BY_LEN_DESC = 0;
const BY_LEN_ASC = 1;

/**
 * BY_LEN_DESC: longer first, ties by larger key; BY_LEN_ASC: shorter first, ties by smaller key.
 * A strict total order, as keys are unique. Module-level with the arrays as arguments, so that it
 * does not depend on an evaluator's closure context.
 */
function comesBefore(
  ext: Float64Array,
  key: Float64Array,
  u: number,
  v: number,
  order: number,
): boolean {
  const lu = ext[u]!;
  const lv = ext[v]!;
  const desc = order === BY_LEN_DESC;
  if (lu !== lv) return desc ? lu > lv : lu < lv;
  return desc ? key[u]! > key[v]! : key[u]! < key[v]!;
}

/** Bottom-up merge sort of idx[0, n) by `comesBefore` (scratch: tmp). */
function mergeSort(
  idx: Int32Array,
  tmp: Int32Array,
  n: number,
  ext: Float64Array,
  key: Float64Array,
  order: number,
): void {
  let src = idx;
  let dst = tmp;
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n; lo += 2 * width) {
      const mid = Math.min(lo + width, n);
      const hi = Math.min(lo + 2 * width, n);
      let i = lo;
      let j = mid;
      let w = lo;
      while (i < mid && j < hi) {
        dst[w++] = comesBefore(ext, key, src[j]!, src[i]!, order) ? src[j++]! : src[i++]!;
      }
      while (i < mid) dst[w++] = src[i++]!;
      while (j < hi) dst[w++] = src[j++]!;
    }
    const t = src;
    src = dst;
    dst = t;
  }
  if (src !== idx) idx.set(src.subarray(0, n));
}

/**
 * `addStock` on explicit arrays and count (for the hot loops of stage A): appends the leftover when
 * it is not empty and not smaller than (minW, minH); returns the new count.
 */
function pushStock(
  sw: Float64Array,
  sh: Float64Array,
  sf: Uint8Array,
  n: number,
  wd: number,
  ht: number,
  flags: number,
  minW: number,
  minH: number,
): number {
  if (wd > EPS && ht > EPS && wd >= minW && ht >= minH) {
    if (n >= sw.length) throw new RangeError('fast evaluator: stock buffer overflow');
    sw[n] = wd;
    sh[n] = ht;
    sf[n] = flags;
    return n + 1;
  }
  return n;
}

export interface FastEvaluatorOptions {
  weights?: EvalWeights;
}

/**
 * `mod(x, L)` as a closure (see the notes inside); exported for the property test that pins it to `mod`.
 */
export function makeModL(L: number): (x: number) => number {
  // `mod(x, L)` bit for bit, without the float `%` (a libm call) in the hot path. For |x| < L the
  // first `%` of `mod` is the identity; beyond that and with an integer L, the truncated quotient is
  // an exact integer, `q · L` is exact, and so is `x − q · L` when q is right (the fmod result is
  // representable); a wrong q (off by one from rounding x / L) shows as a result out of range.
  // The second `%` works on t = r + L ∈ [0, 2L], where it is t, t − L (exact) or 0.
  const intL = Number.isInteger(L) && L > 0 && L < 2 ** 30;
  const FMOD_LIMIT = 2 ** 40;
  return (x: number): number => {
    let r = x;
    if (!(x > -L && x < L)) {
      if (!intL || !(x > -FMOD_LIMIT && x < FMOD_LIMIT)) return mod(x, L);
      let q = Math.trunc(x / L);
      r = x - q * L;
      if (x >= 0 ? r < 0 : r > 0) {
        q += x >= 0 ? -1 : 1;
        r = x - q * L;
      } else if (x >= 0 ? r >= L : r <= -L) {
        q += x >= 0 ? 1 : -1;
        r = x - q * L;
      }
    }
    const t = r + L;
    return t < L ? t : t < 2 * L ? t - L : 0;
  };
}

/**
 * Creates the evaluator, or undefined when the room is outside its scope (a row with 99 or more
 * pieces, where label order and number order differ). `mode` is always `precut`.
 */
export function createFastEvaluator(
  ctx: PlanContext,
  opts: FastEvaluatorOptions = {},
): Evaluator | undefined {
  const { L, W, project } = ctx;
  const kerf = project.rules.kerf;
  const D = project.rules.minStagger;
  const minLen = project.rules.minPieceLength;
  const C = L - kerf;
  const weights = opts.weights ?? defaultWeights(project.rules, project.settings);
  const segs = ctx.layout.segments;
  const nSeg = segs.length;

  const modL = makeModL(L);

  // ---- static per-segment data ------------------------------------------------------------
  const profiles = segs.map((s) => ctx.profiles[s.id]!);
  const a = Float64Array.from(profiles, (p) => p.a);
  const b = Float64Array.from(profiles, (p) => p.b);
  const rect = Uint8Array.from(profiles, (p) => (p.isRect ? 1 : 0));
  const lowOpen = Uint8Array.from(profiles, (p) => (p.openLow.length > 0 ? 1 : 0));
  const highOpen = Uint8Array.from(profiles, (p) => (p.openHigh.length > 0 ? 1 : 0));
  const wBoth = Float64Array.from(profiles, (p) => p.bandHi - p.bandLo);
  const wLow = Float64Array.from(profiles, (p) => p.yHi - p.bandLo);
  const wHigh = Float64Array.from(profiles, (p) => p.bandHi - p.yLo);
  const wNone = Float64Array.from(profiles, (p) => p.yHi - p.yLo);
  /** Rectangular row open on both long edges and longer than a board: always ≥ 1 seam. */
  const simple = Uint8Array.from(profiles, (p) =>
    p.isRect && p.openLow.length > 0 && p.openHigh.length > 0 && p.b - p.a > L + 1 ? 1 : 0,
  );

  const maxSeams = new Int32Array(nSeg);
  const pieceBase = new Int32Array(nSeg);
  const seamOff = new Int32Array(nSeg + 1);
  let pieceCap = 0;
  for (let i = 0; i < nSeg; i++) {
    maxSeams[i] = Math.ceil((b[i]! - a[i]!) / L) + 1;
    if (maxSeams[i]! + 1 > MAX_PIECES_PER_ROW) return undefined;
    seamOff[i + 1] = seamOff[i]! + maxSeams[i]!;
    pieceBase[i] = pieceCap;
    pieceCap += maxSeams[i]! + 2;
  }

  // Segments in id order of their labels: pieces are generated in sorted-id order.
  const inBand = new Map(ctx.layout.bands.map((band) => [band.j, band.segmentIds.length]));
  const labelOf = segs.map((s) =>
    pieceLabel(ctx.room.code, s.id, s.band, { short: 'full', index: 0 }, inBand.get(s.band) ?? 1),
  );
  const segOrder = Int32Array.from(segs.keys()).sort((p, q) =>
    labelOf[p]! < labelOf[q]! ? -1 : labelOf[p]! > labelOf[q]! ? 1 : 0,
  );
  const segRank = new Int32Array(nSeg);
  segOrder.forEach((seg, rank) => {
    segRank[seg] = rank;
  });

  // ---- links, second-order pairs -----------------------------------------------------------
  const segIndex = new Map(segs.map((s, i) => [s.id, i]));
  const links = ctx.graph.links.map((link) => {
    const lower = segIndex.get(link.lower)!;
    const upper = segIndex.get(link.upper)!;
    return {
      lower,
      upper,
      intervals: link.intervals,
      fast:
        fastPathApplies(link.intervals, L, D) && profiles[lower]!.isRect && profiles[upper]!.isRect,
      length: link.intervals.length > 0 ? link.intervals[0]![1] - link.intervals[0]![0] : 0,
    };
  });
  const hRule = project.rules.hPattern;
  const hPairs = hRule.enabled
    ? ctx.graph.secondOrder.map((pair) => {
        const lower = segIndex.get(pair.lower)!;
        const upper = segIndex.get(pair.upper)!;
        return {
          lower,
          upper,
          lo: Math.max(a[lower]!, a[upper]!),
          hi: Math.min(b[lower]!, b[upper]!),
        };
      })
    : [];

  // Penalty terms, flattened in the order of the reference sums (V: per link interval or one fast
  // term per link, then H per second-order pair); a term is recomputed only when one of its two
  // segments changed, which keeps the sums identical to the reference.
  const term = {
    a: [] as number[],
    b: [] as number[],
    lo: [] as number[],
    hi: [] as number[],
    len: [] as number[],
    fast: [] as number[],
    dist: [] as number[],
  };
  const pushTerm = (
    sa: number,
    sb: number,
    lo: number,
    hi: number,
    len: number,
    fast: number,
    dist: number,
  ) => {
    term.a.push(sa);
    term.b.push(sb);
    term.lo.push(lo);
    term.hi.push(hi);
    term.len.push(len);
    term.fast.push(fast);
    term.dist.push(dist);
  };
  for (const link of links) {
    if (link.fast) pushTerm(link.lower, link.upper, 0, 0, link.length, 1, D);
    else for (const [lo, hi] of link.intervals) pushTerm(link.lower, link.upper, lo, hi, 0, 0, D);
  }
  const vTerms = term.a.length;
  for (const pair of hPairs) {
    if (pair.hi <= pair.lo) continue;
    pushTerm(pair.lower, pair.upper, pair.lo, pair.hi, 0, 0, hRule.distance);
  }
  const nTerms = term.a.length;
  const tA = Int32Array.from(term.a);
  const tB = Int32Array.from(term.b);
  const tLo = Float64Array.from(term.lo);
  const tHi = Float64Array.from(term.hi);
  const tLen = Float64Array.from(term.len);
  const tFast = Uint8Array.from(term.fast);
  const tDist = Float64Array.from(term.dist);
  const tVal = new Float64Array(nTerms);
  /** ⌈|I| / L⌉ of the fast-path terms (the factor `seamPenaltyFast` recomputes each time). */
  const tCeil = tLen.map((len) => Math.ceil(len / L));
  // Terms touching each segment (CSR): a changed segment refreshes exactly these.
  const termStart = new Int32Array(nSeg + 1);
  for (let k = 0; k < nTerms; k++) {
    termStart[tA[k]! + 1] = termStart[tA[k]! + 1]! + 1;
    if (tB[k] !== tA[k]) termStart[tB[k]! + 1] = termStart[tB[k]! + 1]! + 1;
  }
  for (let i = 0; i < nSeg; i++) termStart[i + 1] = termStart[i + 1]! + termStart[i]!;
  const termList = new Int32Array(termStart[nSeg]!);
  const termFill = termStart.slice(0, nSeg);
  for (let k = 0; k < nTerms; k++) {
    termList[termFill[tA[k]!]!++] = k;
    if (tB[k] !== tA[k]) termList[termFill[tB[k]!]!++] = k;
  }

  // ---- scratch buffers --------------------------------------------------------------------
  const seamPos = new Float64Array(seamOff[nSeg]!);
  const seamCnt = new Int32Array(nSeg);
  const segDeficit = new Float64Array(nSeg);
  /** Pieces of each segment live in a persistent slot and are regenerated only when φ_s changes. */
  const segPieces = new Int32Array(nSeg);
  const lastPhi = new Float64Array(nSeg).fill(NaN);
  /** Evaluation in which the slot's segment was last regenerated (all its slots, used or not). */
  const pStamp = new Int32Array(pieceCap);
  let evalGen = 0;
  const segWhole = new Int32Array(nSeg);
  /** Sum of the per-segment L_min deficits, re-added (in segment order) only when one changed. */
  let deficitTotal = 0;
  let deficitStale = true;
  /** 1 when the segment has pieces beyond whole boards and whole-width starts/ends (scanned each evaluation). */
  const special = new Uint8Array(nSeg);
  /** Special segments in rank order, rebuilt when a flag changed. */
  const specialList = new Int32Array(nSeg);
  let nSpecial = 0;
  let specialStale = true;
  const dirtyList = new Int32Array(nSeg);
  let nDirty = 0;
  let wholeTotal = 0;

  const pSeg = new Int32Array(pieceCap);
  const pShort = new Uint8Array(pieceCap);
  const pLong = new Uint8Array(pieceCap);
  const pExt = new Float64Array(pieceCap);
  const pWid = new Float64Array(pieceCap);
  const pKey = new Float64Array(pieceCap);
  const pClass = new Uint8Array(pieceCap);
  for (let i = 0; i < nSeg; i++) {
    // A piece slot always belongs to the same segment.
    for (let k = 0; k < maxSeams[i]! + 2; k++) pSeg[pieceBase[i]! + k] = i;
  }

  const lFree = new Int32Array(pieceCap);
  const lFullA = new Int32Array(pieceCap);
  const lLow = {
    full: new Int32Array(pieceCap),
    ends: new Int32Array(pieceCap),
    starts: new Int32Array(pieceCap),
  };
  const lHigh = {
    full: new Int32Array(pieceCap),
    ends: new Int32Array(pieceCap),
    starts: new Int32Array(pieceCap),
  };
  const cnt = {
    free: 0,
    fullA: 0,
    lowFull: 0,
    lowEnds: 0,
    lowStarts: 0,
    highFull: 0,
    highEnds: 0,
    highStarts: 0,
  };

  // Marks by generation number instead of clearing arrays each evaluation.
  const paired = new Int32Array(pieceCap);
  let pairedGen = 0;
  const inStock = new Int32Array(pieceCap);
  let inStockGen = 0;
  const tmpE = new Int32Array(pieceCap);
  const tmpS = new Int32Array(pieceCap);
  const pairEnd = new Int32Array(pieceCap);
  const pairStart = new Int32Array(pieceCap);
  const strip = new Int32Array(pieceCap);
  const unpEnd = new Int32Array(pieceCap);
  const unpStart = new Int32Array(pieceCap);
  let nUnpEnd = 0;
  let nUnpStart = 0;
  let minUnpEnd = Infinity;
  let minUnpStart = Infinity;

  // Units of stage B (a piece, a pair, or a lone start/end) — up to one per piece.
  const uWid = new Float64Array(pieceCap);
  const uKey = new Float64Array(pieceCap);
  const uEnd = new Float64Array(pieceCap); // extent of the end part, −1 if none
  const uStart = new Float64Array(pieceCap); // extent of the start part, −1 if none
  const uWhole = new Float64Array(pieceCap); // extent of a whole piece, −1 if none
  const lowUnitIdx = new Int32Array(pieceCap);
  const highUnitIdx = new Int32Array(pieceCap);
  const pairLow = new Int32Array(pieceCap);
  const pairHigh = new Int32Array(pieceCap);
  const usedUnit = new Int32Array(2 * pieceCap);
  let usedGen = 0;
  let nUnits = 0;

  const stockCap = 6 * pieceCap + 64;
  const sw = new Float64Array(stockCap);
  const sh = new Float64Array(stockCap);
  const sf = new Uint8Array(stockCap);
  let ns = 0;

  // Leftovers smaller than every piece that can still be cut are never chosen: skip them.
  let minStockW = 0;
  let minStockH = 0;
  const addStock = (wd: number, ht: number, flags: number): void => {
    if (wd > EPS && ht > EPS && wd >= minStockW && ht >= minStockH) {
      if (ns >= stockCap) throw new RangeError('fast evaluator: stock buffer overflow');
      sw[ns] = wd;
      sh[ns] = ht;
      sf[ns] = flags;
      ns++;
    }
  };
  const removeStock = (i: number): void => {
    sw.copyWithin(i, i + 1, ns);
    sh.copyWithin(i, i + 1, ns);
    sf.copyWithin(i, i + 1, ns);
    ns--;
  };

  const needs = (short: number, long: number): number =>
    (short === END || short === FULL ? F_LEFT : 0) |
    (short === START || short === FULL ? F_RIGHT : 0) |
    (long === LOW || long === BOTH ? F_LOW : 0) |
    (long === HIGH || long === BOTH ? F_HIGH : 0);

  const fits = (i: number, ext: number, wid: number, nf: number): boolean => {
    if ((nf & ~sf[i]!) !== 0) return false;
    if (sw[i]! < ext - FIT_EPS || sh[i]! < wid - FIT_EPS) return false;
    if ((nf & F_LEFT) !== 0 && (nf & F_RIGHT) !== 0 && sw[i]! - ext > EPS) return false;
    if ((nf & F_LOW) !== 0 && (nf & F_HIGH) !== 0 && sh[i]! - wid > EPS) return false;
    return true;
  };

  /** Best fit: smallest area; ties keep the older leftover (array order = creation order). */
  const findStock = (ext: number, wid: number, nf: number): number => {
    let best = -1;
    let bestArea = Infinity;
    for (let i = 0; i < ns; i++) {
      if (!fits(i, ext, wid, nf)) continue;
      const area = sw[i]! * sh[i]!;
      if (area < bestArea - EPS) {
        best = i;
        bestArea = area;
      }
    }
    return best;
  };

  /** Removes leftover `i` and cuts a piece out of it (`cutFromStock` of the reference). */
  const cutFrom = (i: number, ext: number, wid: number, nf: number): void => {
    const w0 = sw[i]!;
    const h0 = sh[i]!;
    const f0 = sf[i]!;
    removeStock(i);
    const sL = (f0 & F_LEFT) !== 0;
    const sR = (f0 & F_RIGHT) !== 0;
    const sLow = (f0 & F_LOW) !== 0;
    const sHigh = (f0 & F_HIGH) !== 0;
    const nL = (nf & F_LEFT) !== 0;
    const nR = (nf & F_RIGHT) !== 0;
    const nLow = (nf & F_LOW) !== 0;
    const nHigh = (nf & F_HIGH) !== 0;
    const atLeft = nL ? true : nR ? false : !sL ? true : !sR ? false : true;
    const atBottom = nLow ? true : nHigh ? false : !sLow ? true : !sHigh ? false : true;
    addStock(
      w0 - ext - kerf,
      h0,
      (atLeft ? 0 : sL ? F_LEFT : 0) |
        (atLeft ? (sR ? F_RIGHT : 0) : 0) |
        (sLow ? F_LOW : 0) |
        (sHigh ? F_HIGH : 0),
    );
    const wholeX = w0 - ext <= EPS;
    const left2 = atLeft ? sL : wholeX && sL;
    const right2 = atLeft ? wholeX && sR : sR;
    const low2 = atBottom ? false : sLow;
    const high2 = atBottom ? sHigh : false;
    addStock(
      ext,
      h0 - wid - kerf,
      (left2 ? F_LEFT : 0) | (right2 ? F_RIGHT : 0) | (low2 ? F_LOW : 0) | (high2 ? F_HIGH : 0),
    );
  };

  // State of `unitStocks` (module-level variables instead of a closure: the hot path allocates nothing).
  let uCursor = 0;
  let uCut = false;
  const stockPart = (x0: number, x1: number, width: number, base: number): void => {
    const gapStart = uCursor + (uCut ? kerf : 0);
    addStock(x0 - kerf - gapStart, width, base | (uCut ? 0 : F_LEFT));
    uCursor = x1;
    uCut = true;
  };

  /** Leftovers along x of a strip on a fresh board (`placeUnit`); parts are −1 when absent. */
  const unitStocks = (
    side: number,
    width: number,
    endExt: number,
    startExt: number,
    whole: number,
  ): void => {
    const base = (side !== SIDE_HIGH ? F_LOW : 0) | (side !== SIDE_LOW ? F_HIGH : 0);
    uCursor = 0;
    uCut = false;
    if (whole >= 0) stockPart(0, whole, width, base);
    if (endExt >= 0) stockPart(0, endExt, width, base);
    if (startExt >= 0) stockPart(L - startExt, L, width, base);
    const tail = uCursor + (uCut ? kerf : 0);
    addStock(L - tail, width, base | F_RIGHT | (uCut ? 0 : F_LEFT));
  };

  // Insertion sorts of small index arrays by (value, key).
  const sortByLenKey = (
    idx: Int32Array,
    n: number,
    len: Float64Array,
    key: Float64Array,
    desc: boolean,
  ): void => {
    for (let i = 1; i < n; i++) {
      const v = idx[i]!;
      const lv = len[v]!;
      const kv = key[v]!;
      let j = i - 1;
      while (j >= 0) {
        const u = idx[j]!;
        const lu = len[u]!;
        // desc: u must come before v when lu > lv, or equal length and larger key.
        const before = desc
          ? lu !== lv
            ? lu > lv
            : key[u]! > kv
          : lu !== lv
            ? lu < lv
            : key[u]! < kv;
        if (before) break;
        idx[j + 1] = u;
        j--;
      }
      idx[j + 1] = v;
    }
  };
  const area = new Float64Array(pieceCap);
  const sortByAreaKey = (idx: Int32Array, n: number): void => {
    for (let i = 1; i < n; i++) {
      const v = idx[i]!;
      let j = i - 1;
      while (j >= 0) {
        const u = idx[j]!;
        const before = area[u]! !== area[v]! ? area[u]! > area[v]! : pKey[u]! < pKey[v]!;
        if (before) break;
        idx[j + 1] = u;
        j--;
      }
      idx[j + 1] = v;
    }
  };

  /**
   * Maximum pairing (ALGORITHM §4.1) of `ends` with `starts` (lengths `len`, ids `key`), capacity
   * `cap`. Writes the pairs to outEnd/outStart in the order of the ends, returns their number.
   */
  const pairUp = (
    ends: Int32Array,
    nE: number,
    starts: Int32Array,
    nS: number,
    len: Float64Array,
    key: Float64Array,
    cap: number,
    outEnd: Int32Array,
    outStart: Int32Array,
  ): number => {
    for (let i = 0; i < nE; i++) tmpE[i] = ends[i]!;
    for (let i = 0; i < nS; i++) tmpS[i] = starts[i]!;
    sortByLenKey(tmpE, nE, len, key, true);
    sortByLenKey(tmpS, nS, len, key, false);
    let j = 0;
    let n = 0;
    for (let i = 0; i < nE; i++) {
      if (j < nS && len[tmpE[i]!]! + len[tmpS[j]!]! <= cap + EPS) {
        outEnd[n] = tmpE[i]!;
        outStart[n] = tmpS[j]!;
        n++;
        j++;
      }
    }
    return n;
  };

  /** Class of a piece for the decoder (index into the class lists). */
  const classOfPiece = (short: number, long: number): number => {
    if (long === NONE || short === FREE) return C_FREE;
    const k = short === FULL ? 0 : short === END ? 1 : 2;
    return long === BOTH ? C_FULL_A + k : long === LOW ? C_LOW_FULL + k : C_HIGH_FULL + k;
  };

  const addPiece = (
    seg: number,
    short: number,
    long: number,
    ext: number,
    wid: number,
    role: number,
  ): void => {
    const k = segPieces[seg]!;
    segPieces[seg] = k + 1;
    const p = pieceBase[seg]! + k;
    pSeg[p] = seg;
    pShort[p] = short;
    pLong[p] = long;
    pExt[p] = ext;
    pWid[p] = wid;
    pKey[p] = segRank[seg]! * KEY_STRIDE + role;
    area[p] = ext * wid;
    let cls = classOfPiece(short, long);
    // A piece as wide as the board is a full-width piece whatever long edge it needs (decode.ts).
    if (wid >= W - EPS && (long === LOW || long === HIGH) && short !== FREE) {
      cls = C_FULL_A + (short === FULL ? 0 : short === END ? 1 : 2);
    }
    if (cls === C_FULL_A && L - (ext + kerf) <= EPS) {
      cls = C_WHOLE;
      segWhole[seg] = segWhole[seg]! + 1;
    }
    pClass[p] = cls;
  };

  const shortShortfall = (have: number): number => (minLen - have > EPS ? minLen - have : 0);

  let curDeficit = 0;

  /** Whole-width end or start piece of a `simple` row (open on both edges): class BOTH. */
  const addSimple = (i: number, short: number, ext: number, role: number): void => {
    // Both long edges are open, so a shortfall counts once per edge (see `lengthDeficit`).
    const need = shortShortfall(ext);
    curDeficit += need;
    curDeficit += need;
    // Only what stage A reads for whole-width pieces (extent, width, id key, class); the strip and
    // free-piece code never sees these pieces.
    const k = segPieces[i]!;
    segPieces[i] = k + 1;
    const p = pieceBase[i]! + k;
    pExt[p] = ext;
    pWid[p] = wBoth[i]!;
    pKey[p] = segRank[i]! * KEY_STRIDE + role;
    pClass[p] = short === END ? C_FULL_A + 1 : C_FULL_A + 2;
  };

  /** Piece `t` of the rectangular segment `i` with `m` seams (see `describePiecesFast`). */
  const emitRect = (i: number, t: number, m: number, off: number): void => {
    const ext = (t === m ? b[i]! : seamPos[off + t]!) - (t === 0 ? a[i]! : seamPos[off + t - 1]!);
    const openLow = lowOpen[i] === 1 ? ext : 0;
    const openHigh = highOpen[i] === 1 ? ext : 0;
    const lowNeeded = openLow > MIN_OPEN_LENGTH;
    const highNeeded = openHigh > MIN_OPEN_LENGTH;
    const long = lowNeeded && highNeeded ? BOTH : lowNeeded ? LOW : highNeeded ? HIGH : NONE;
    const wid =
      long === BOTH ? wBoth[i]! : long === LOW ? wLow[i]! : long === HIGH ? wHigh[i]! : wNone[i]!;
    const short = m === 0 ? FREE : t === 0 ? START : t === m ? END : FULL;
    const role = short === START ? ROLE_START : short === END ? ROLE_END : t + 1;
    if (short === START || short === END) {
      if (lowNeeded) curDeficit += shortShortfall(openLow);
      if (highNeeded) curDeficit += shortShortfall(openHigh);
      if (!lowNeeded && !highNeeded) curDeficit += shortShortfall(ext);
    }
    addPiece(i, short, long, ext, wid, role);
  };

  const emitDescriptor = (i: number, d: PieceDescriptor): void => {
    const short = shortCode[d.short];
    const role = short === START ? ROLE_START : short === END ? ROLE_END : d.index + 1;
    addPiece(i, short, longCode[d.long], d.extent, d.width, role);
  };

  /** Pieces of segment `i` for phase φ, emitted in id order; also seams and the L_min deficit. */
  const generate = (i: number, phi: number): void => {
    const off = seamOff[i]!;
    const ai = a[i]!;
    const bi = b[i]!;
    curDeficit = 0;
    segPieces[i] = 0;
    wholeTotal -= segWhole[i]!;
    segWhole[i] = 0;
    if (rect[i] === 1) {
      const r = modL(phi - ai);
      let x = ai + (r > EPS ? r : L);
      let m = 0;
      while (x < bi - EPS) {
        seamPos[off + m++] = x;
        x += L;
      }
      seamCnt[i] = m;
      // Typical row: whole boards in the middle are only counted; the end and start pieces are listed.
      if (simple[i] === 1 && m >= 1) {
        const extStart = seamPos[off]! - ai;
        const extEnd = bi - seamPos[off + m - 1]!;
        if (extStart > MIN_OPEN_LENGTH && extEnd > MIN_OPEN_LENGTH) {
          segWhole[i] = m - 1; // middle pieces: exactly one board each, no leftover
          for (let t = 1; t < m; t++) {
            if (L - (seamPos[off + t]! - seamPos[off + t - 1]! + kerf) > EPS) segWhole[i] = -1;
          }
          if (segWhole[i]! >= 0) {
            addSimple(i, END, extEnd, ROLE_END);
            addSimple(i, START, extStart, ROLE_START);
            wholeTotal += segWhole[i]!;
            if (special[i] !== 0) specialStale = true;
            special[i] = 0;
            if (segDeficit[i] !== curDeficit) deficitStale = true;
            segDeficit[i] = curDeficit;
            return;
          }
          segWhole[i] = 0; // not all whole after all: the generic path below counts them
        }
      }
      if (m === 0) emitRect(i, 0, 0, off);
      else {
        for (let t = 1; t < m; t++) emitRect(i, t, m, off);
        emitRect(i, m, m, off);
        emitRect(i, 0, m, off);
      }
    } else {
      const seams = seamsOf(ai, bi, L, phi);
      seamCnt[i] = seams.length;
      for (let t = 0; t < seams.length; t++) seamPos[off + t] = seams[t]!;
      const ds = describePieces(profiles[i]!, L, phi);
      for (const d of ds) if (d.short !== 'start' && d.short !== 'end') emitDescriptor(i, d);
      for (const d of ds) if (d.short === 'end') emitDescriptor(i, d);
      for (const d of ds) if (d.short === 'start') emitDescriptor(i, d);
      // Same accumulation as `lengthDeficit`.
      for (const d of ds) {
        if (d.short !== 'start' && d.short !== 'end') continue;
        const lows = d.openLow > MIN_OPEN_LENGTH;
        const highs = d.openHigh > MIN_OPEN_LENGTH;
        if (lows) curDeficit += shortShortfall(d.openLow);
        if (highs) curDeficit += shortShortfall(d.openHigh);
        if (!lows && !highs) curDeficit += shortShortfall(d.extent);
      }
    }
    if (segDeficit[i] !== curDeficit) deficitStale = true;
    segDeficit[i] = curDeficit;
    wholeTotal += segWhole[i]!;
    let sp = 0;
    for (let k = 0; k < segPieces[i]!; k++) {
      const c = pClass[pieceBase[i]! + k]!;
      if (c !== C_WHOLE && c !== C_FULL_A + 1 && c !== C_FULL_A + 2) sp = 1;
    }
    if (special[i] !== sp) specialStale = true;
    special[i] = sp;
  };

  /** Seam penalty of two rows over [lo, hi] (the general path of `seamPenalty`, same order of sums). */
  const seamPen = (segA: number, segB: number, lo: number, hi: number, dist: number): number => {
    if (!(dist > 0)) return 0;
    const from = lo - dist;
    const to = hi + dist;
    const offA = seamOff[segA]!;
    const offB = seamOff[segB]!;
    const nA = seamCnt[segA]!;
    const nB = seamCnt[segB]!;
    let sum = 0;
    for (let p = 0; p < nA; p++) {
      const x = seamPos[offA + p]!;
      if (x < from || x > to) continue;
      for (let q = 0; q < nB; q++) {
        const y = seamPos[offB + q]!;
        if (y < from || y > to) continue;
        const d = Math.abs(x - y);
        if (d < dist) sum += (dist - d) / dist;
      }
    }
    return sum;
  };

  let needStocks = false;
  const compact = (list: Int32Array, n: number, placed: boolean): number => {
    if (!placed) return n;
    let m = 0;
    for (let i = 0; i < n; i++) if (inStock[list[i]!] !== inStockGen) list[m++] = list[i]!;
    return m;
  };

  const buildUnits = (
    full: Int32Array,
    nFull: number,
    ends: Int32Array,
    nEnds: number,
    starts: Int32Array,
    nStarts: number,
    out: Int32Array,
  ): number => {
    let n = 0;
    for (let i = 0; i < nFull; i++) {
      const p = full[i]!;
      const u = nUnits++;
      uWid[u] = pWid[p]!;
      uKey[u] = pKey[p]!;
      uEnd[u] = -1;
      uStart[u] = -1;
      uWhole[u] = pExt[p]!;
      out[n++] = u;
    }
    const np = pairUp(ends, nEnds, starts, nStarts, pExt, pKey, C, pairEnd, pairStart);
    pairedGen++;
    for (let i = 0; i < np; i++) {
      const e = pairEnd[i]!;
      const s = pairStart[i]!;
      paired[e] = pairedGen;
      paired[s] = pairedGen;
      const u = nUnits++;
      uWid[u] = Math.max(pWid[e]!, pWid[s]!);
      uKey[u] = pKey[e]!;
      uEnd[u] = pExt[e]!;
      uStart[u] = pExt[s]!;
      uWhole[u] = -1;
      out[n++] = u;
    }
    for (let i = 0; i < nStarts; i++) {
      const p = starts[i]!;
      if (paired[p] === pairedGen) continue;
      const u = nUnits++;
      uWid[u] = pWid[p]!;
      uKey[u] = pKey[p]!;
      uEnd[u] = -1;
      uStart[u] = pExt[p]!;
      uWhole[u] = -1;
      out[n++] = u;
    }
    for (let i = 0; i < nEnds; i++) {
      const p = ends[i]!;
      if (paired[p] === pairedGen) continue;
      const u = nUnits++;
      uWid[u] = pWid[p]!;
      uKey[u] = pKey[p]!;
      uEnd[u] = pExt[p]!;
      uStart[u] = -1;
      uWhole[u] = -1;
      out[n++] = u;
    }
    return n;
  };

  const rowLeftovers = (lowW: number, highW: number): void => {
    // lowW / highW < 0 means "no unit on that side".
    if (lowW >= 0 && highW >= 0) addStock(L, W - highW - lowW - 2 * kerf, F_LEFT | F_RIGHT);
    else if (lowW >= 0) addStock(L, W - lowW - kerf, F_LEFT | F_RIGHT | F_HIGH);
    else if (highW >= 0) addStock(L, W - highW - kerf, F_LEFT | F_RIGHT | F_LOW);
  };
  const place = (u: number, side: number): void => {
    unitStocks(side, uWid[u]!, uEnd[u]!, uStart[u]!, uWhole[u]!);
  };

  // Stage A keeps its ends (longest first) and starts (shortest first) sorted across evaluations:
  // between two evaluations only the pieces of changed segments move, so the arrays are nearly
  // sorted and refreshing them costs O(n) instead of a sort.
  const sortedE = new Int32Array(pieceCap);
  const sortedS = new Int32Array(pieceCap);
  /**
   * By segment rank: the slot of the segment's stage A end / start piece, −1 if none (a segment has
   * at most one start and one end piece), so scanning the ranks gives them in id order.
   */
  const aEndByRank = new Int32Array(nSeg).fill(-1);
  const aStartByRank = new Int32Array(nSeg).fill(-1);
  let nSortedE = 0;
  let nSortedS = 0;

  const fresh = new Int32Array(pieceCap);
  const freshTmp = new Int32Array(pieceCap);

  /**
   * Drops the pieces of changed segments and inserts their new pieces (`byRank`): the new
   * pieces are sorted on their own, then merged with the kept (sorted) ones from the back, in
   * place. `comesBefore` is a strict total order (keys are unique), so the result is the same as
   * sorting everything.
   */
  const refreshSorted = (
    sorted: Int32Array,
    prevN: number,
    byRank: Int32Array,
    order: number,
  ): number => {
    // Captured arrays and counters are read into locals: when several evaluators exist, V8 no
    // longer specialises the closures to their context, and loads in loops are not hoisted.
    const gen = evalGen;
    const stamp = pStamp;
    const ext = pExt;
    const key = pKey;
    const fr = fresh;
    let kept = 0;
    for (let i = 0; i < prevN; i++) {
      const q = sorted[i]!;
      if (stamp[q] !== gen) sorted[kept++] = q;
    }
    // The new pieces: at most one per changed segment (its stage A end or start piece).
    let k = 0;
    const dl = dirtyList;
    const rank = segRank;
    for (let d = 0; d < nDirty; d++) {
      const p = byRank[rank[dl[d]!]!]!;
      if (p >= 0) fr[k++] = p;
    }
    if (k <= 16) {
      for (let i = 1; i < k; i++) {
        const v = fr[i]!;
        let j = i - 1;
        while (j >= 0 && comesBefore(ext, key, v, fr[j]!, order)) {
          fr[j + 1] = fr[j]!;
          j--;
        }
        fr[j + 1] = v;
      }
    } else mergeSort(fr, freshTmp, k, ext, key, order);
    // Merge from the back: the place of each new piece among the kept ones by binary search (few
    // comparisons, the kept pieces between two places are only shifted).
    const m = kept + k;
    let hiKept = kept; // kept pieces [0, hiKept) are not placed yet
    let w = m;
    for (let j = k - 1; j >= 0; j--) {
      const v = fr[j]!;
      let lo = 0;
      let hi = hiKept;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (comesBefore(ext, key, sorted[mid]!, v, order)) lo = mid + 1;
        else hi = mid;
      }
      for (let i = hiKept - 1; i >= lo; i--) sorted[--w] = sorted[i]!;
      sorted[--w] = v;
      hiKept = lo;
    }
    return m;
  };

  // ---- decoder (port of `decode`) ---------------------------------------------------------
  const decode = (): number => {
    ns = 0;
    let boards = 0;
    // Leftovers are only read by B.3 (strip pieces) and stage C (free pieces).
    const nStripAll = cnt.lowEnds + cnt.lowStarts + cnt.highEnds + cnt.highStarts;
    const stockA = cnt.free > 0 || nStripAll > 0;
    minStockW = 0;
    minStockH = 0;
    if (cnt.free === 0 && nStripAll > 0) {
      // Only strip pieces will look at the leftovers: drop those smaller than all of them.
      let mw = Infinity;
      let mh = Infinity;
      for (let i = 0; i < cnt.lowEnds; i++) {
        mw = Math.min(mw, pExt[lLow.ends[i]!]!);
        mh = Math.min(mh, pWid[lLow.ends[i]!]!);
      }
      for (let i = 0; i < cnt.lowStarts; i++) {
        mw = Math.min(mw, pExt[lLow.starts[i]!]!);
        mh = Math.min(mh, pWid[lLow.starts[i]!]!);
      }
      for (let i = 0; i < cnt.highEnds; i++) {
        mw = Math.min(mw, pExt[lHigh.ends[i]!]!);
        mh = Math.min(mh, pWid[lHigh.ends[i]!]!);
      }
      for (let i = 0; i < cnt.highStarts; i++) {
        mw = Math.min(mw, pExt[lHigh.starts[i]!]!);
        mh = Math.min(mh, pWid[lHigh.starts[i]!]!);
      }
      // Same tolerance as `fits` (ADR-023): a leftover that a piece could still fit into is kept.
      minStockW = mw - FIT_EPS;
      minStockH = mh - FIT_EPS;
    }
    // Stage A: whole-width pieces. Whole boards were counted when the pieces were generated.
    // (Hot loops read the captured arrays through locals, see `refreshSorted`.)
    const ext = pExt;
    const wid = pWid;
    const mark = paired;
    const sE = sortedE;
    const sS = sortedS;
    const pE = pairEnd;
    const pS = pairStart;
    const kf = kerf;
    const mw = minStockW;
    const mh = minStockH;
    const stW = sw;
    const stH = sh;
    const stF = sf;
    let n = ns;
    boards += wholeTotal;
    const nFullA = cnt.fullA;
    for (let i = 0; i < nFullA; i++) {
      const p = lFullA[i]!;
      // Leftover of a short whole-width piece: to its right, with the original right end.
      if (stockA)
        n = pushStock(
          stW,
          stH,
          stF,
          n,
          L - (ext[p]! + kf),
          wid[p]!,
          F_RIGHT | F_LOW | F_HIGH,
          mw,
          mh,
        );
    }
    boards += nFullA;
    nSortedE = refreshSorted(sE, nSortedE, aEndByRank, BY_LEN_DESC);
    nSortedS = refreshSorted(sS, nSortedS, aStartByRank, BY_LEN_ASC);
    // Two-pointer maximum pairing (ALGORITHM §4.1) of the sorted ends and starts (see `pairUp`).
    let nPairsA = 0;
    let js = 0;
    const gen = ++pairedGen;
    const nE = nSortedE;
    const nS = nSortedS;
    const capA = C + EPS;
    for (let i = 0; i < nE && js < nS; i++) {
      const e = sE[i]!;
      const s = sS[js]!;
      if (ext[e]! + ext[s]! <= capA) {
        pE[nPairsA] = e;
        pS[nPairsA] = s;
        mark[e] = gen;
        mark[s] = gen;
        nPairsA++;
        js++;
      }
    }
    // Unpaired starts, then ends, each in id order (the order in which the reference makes boards).
    let nUS = 0;
    let minUS = Infinity;
    const uS = unpStart;
    const lS = aStartByRank;
    for (let r = 0; r < nSeg; r++) {
      const s = lS[r]!;
      if (s < 0 || mark[s] === gen) continue;
      uS[nUS++] = s;
      if (ext[s]! < minUS) minUS = ext[s]!;
    }
    let nUE = 0;
    let minUE = Infinity;
    const uE = unpEnd;
    const lE = aEndByRank;
    for (let r = 0; r < nSeg; r++) {
      const e = lE[r]!;
      if (e < 0 || mark[e] === gen) continue;
      uE[nUE++] = e;
      if (ext[e]! < minUE) minUE = ext[e]!;
    }
    nUnpStart = nUS;
    minUnpStart = minUS;
    nUnpEnd = nUE;
    minUnpEnd = minUE;
    boards += nPairsA + nUS + nUE;
    if (stockA) {
      for (let i = 0; i < nPairsA; i++) {
        const e = pE[i]!;
        const s = pS[i]!;
        // Between the two parts of a pair (only when e + s + k < L).
        const w = Math.max(wid[e]!, wid[s]!);
        n = pushStock(
          stW,
          stH,
          stF,
          n,
          L - ext[s]! - kf - (ext[e]! + kf),
          w,
          F_LOW | F_HIGH,
          mw,
          mh,
        );
      }
      for (let i = 0; i < nUS; i++) {
        const p = uS[i]!;
        // Left part of the board of a lone start piece: original left end.
        n = pushStock(stW, stH, stF, n, L - ext[p]! - kf, wid[p]!, F_LEFT | F_LOW | F_HIGH, mw, mh);
      }
      for (let i = 0; i < nUE; i++) {
        const p = uE[i]!;
        // Right part of the board of a lone end piece: original right end.
        n = pushStock(
          stW,
          stH,
          stF,
          n,
          L - (ext[p]! + kf),
          wid[p]!,
          F_RIGHT | F_LOW | F_HIGH,
          mw,
          mh,
        );
      }
    }
    ns = n;

    // B.3: strip pieces into the leftovers of stage A.
    let nStrip = 0;
    for (let i = 0; i < cnt.lowEnds; i++) strip[nStrip++] = lLow.ends[i]!;
    for (let i = 0; i < cnt.lowStarts; i++) strip[nStrip++] = lLow.starts[i]!;
    for (let i = 0; i < cnt.highEnds; i++) strip[nStrip++] = lHigh.ends[i]!;
    for (let i = 0; i < cnt.highStarts; i++) strip[nStrip++] = lHigh.starts[i]!;
    let anyPlaced = false;
    if (nStrip > 0 && ns > 0) {
      sortByAreaKey(strip, nStrip);
      inStockGen++;
      for (let i = 0; i < nStrip; i++) {
        const p = strip[i]!;
        const nf = needs(pShort[p]!, pLong[p]!);
        const at = findStock(pExt[p]!, pWid[p]!, nf);
        if (at < 0) continue;
        cutFrom(at, pExt[p]!, pWid[p]!, nf);
        inStock[p] = inStockGen;
        anyPlaced = true;
      }
    }
    cnt.lowEnds = compact(lLow.ends, cnt.lowEnds, anyPlaced);
    cnt.lowStarts = compact(lLow.starts, cnt.lowStarts, anyPlaced);
    cnt.highEnds = compact(lHigh.ends, cnt.highEnds, anyPlaced);
    cnt.highStarts = compact(lHigh.starts, cnt.highStarts, anyPlaced);

    // Stage B: strips. Units of one side; `pairUp` pairs the pieces inside a side.
    needStocks = cnt.free > 0;
    nUnits = 0;
    const nLowU = buildUnits(
      lLow.full,
      cnt.lowFull,
      lLow.ends,
      cnt.lowEnds,
      lLow.starts,
      cnt.lowStarts,
      lowUnitIdx,
    );
    const nHighU = buildUnits(
      lHigh.full,
      cnt.highFull,
      lHigh.ends,
      cnt.highEnds,
      lHigh.starts,
      cnt.highStarts,
      highUnitIdx,
    );
    const nPairsB = pairUp(
      lowUnitIdx,
      nLowU,
      highUnitIdx,
      nHighU,
      uWid,
      uKey,
      W - kerf,
      pairLow,
      pairHigh,
    );
    usedGen++;
    for (let i = 0; i < nPairsB; i++) {
      const lo = pairLow[i]!;
      const hi = pairHigh[i]!;
      usedUnit[lo] = usedGen;
      usedUnit[hi] = usedGen;
      boards++;
      if (needStocks) {
        place(lo, SIDE_LOW);
        place(hi, SIDE_HIGH);
        rowLeftovers(uWid[lo]!, uWid[hi]!);
      }
    }
    for (let i = 0; i < nLowU; i++) {
      const u = lowUnitIdx[i]!;
      if (usedUnit[u] === usedGen) continue;
      boards++;
      if (needStocks) {
        place(u, SIDE_LOW);
        rowLeftovers(uWid[u]!, -1);
      }
    }
    for (let i = 0; i < nHighU; i++) {
      const u = highUnitIdx[i]!;
      if (usedUnit[u] === usedGen) continue;
      boards++;
      if (needStocks) {
        place(u, SIDE_HIGH);
        rowLeftovers(-1, uWid[u]!);
      }
    }

    // Stage C: free pieces, best fit, largest area first.
    if (cnt.free > 0) {
      sortByAreaKey(lFree, cnt.free);
      for (let i = 0; i < cnt.free; i++) {
        const p = lFree[i]!;
        const nf = needs(pShort[p]!, pLong[p]!);
        let at = findStock(pExt[p]!, pWid[p]!, nf);
        if (at < 0) {
          boards++;
          addStock(L, W, F_LEFT | F_RIGHT | F_LOW | F_HIGH);
          at = ns - 1;
          if (!fits(at, pExt[p]!, pWid[p]!, nf)) {
            throw new RangeError('fast evaluator: a piece does not fit on a board');
          }
        }
        cutFrom(at, pExt[p]!, pWid[p]!, nf);
      }
    }
    return boards;
  };

  const evaluator: Evaluator = {
    evaluate(phi: readonly number[]): QuickEval {
      if (phi.length !== nSeg) {
        throw new RangeError(`phi has ${phi.length} entries for ${nSeg} segments`);
      }
      // Regenerate the pieces of the segments whose phase changed; the rest is reused.
      // (Hot loops read the captured arrays through locals, see `refreshSorted`.)
      const gen = ++evalGen;
      const last = lastPhi;
      const dl = dirtyList;
      const stamp = pStamp;
      let nd = 0;
      for (let i = 0; i < nSeg; i++) {
        const v = phi[i]!;
        if (v !== last[i]) {
          const base = pieceBase[i]!;
          for (let p = base + maxSeams[i]! + 1; p >= base; p--) stamp[p] = gen;
          generate(i, v);
          let aEnd = -1;
          let aStart = -1;
          for (let p = base, end = base + segPieces[i]!; p < end; p++) {
            const c = pClass[p];
            if (c === C_FULL_A + 1) aEnd = p;
            else if (c === C_FULL_A + 2) aStart = p;
          }
          aEndByRank[segRank[i]!] = aEnd;
          aStartByRank[segRank[i]!] = aStart;
          last[i] = v;
          dl[nd++] = i;
        }
      }
      nDirty = nd;
      if (specialStale) {
        nSpecial = 0;
        for (let r = 0; r < nSeg; r++) {
          const i = segOrder[r]!;
          if (special[i] !== 0) specialList[nSpecial++] = i;
        }
        specialStale = false;
      }
      // Class lists in sorted-id order (segments by label rank, pieces in slot order). Segments that
      // are not special have only whole boards and whole-width starts/ends: nothing to list.
      cnt.free = cnt.fullA = 0;
      cnt.lowFull = cnt.lowEnds = cnt.lowStarts = 0;
      cnt.highFull = cnt.highEnds = cnt.highStarts = 0;
      for (let r = 0; r < nSpecial; r++) {
        const i = specialList[r]!;
        const end = pieceBase[i]! + segPieces[i]!;
        for (let p = pieceBase[i]!; p < end; p++) {
          switch (pClass[p]) {
            case C_FREE:
              lFree[cnt.free++] = p;
              break;
            case C_FULL_A:
              lFullA[cnt.fullA++] = p;
              break;
            case C_FULL_A + 1: // whole-width ends and starts live in the sorted arrays
            case C_FULL_A + 2:
              break;
            case C_LOW_FULL:
              lLow.full[cnt.lowFull++] = p;
              break;
            case C_LOW_FULL + 1:
              lLow.ends[cnt.lowEnds++] = p;
              break;
            case C_LOW_FULL + 2:
              lLow.starts[cnt.lowStarts++] = p;
              break;
            case C_HIGH_FULL:
              lHigh.full[cnt.highFull++] = p;
              break;
            case C_HIGH_FULL + 1:
              lHigh.ends[cnt.highEnds++] = p;
              break;
            case C_WHOLE:
              break;
            default:
              lHigh.starts[cnt.highStarts++] = p;
          }
        }
      }
      const B = decode();

      const val = tVal;
      const ta = tA;
      const tb = tB;
      const fastTerm = tFast;
      const ceil = tCeil;
      const ts = termStart;
      const tl = termList;
      for (let j = 0; j < nd; j++) {
        const i = dl[j]!;
        for (let q = ts[i]!, qEnd = ts[i + 1]!; q < qEnd; q++) {
          const k = tl[q]!;
          if (fastTerm[k] === 1) {
            // `seamPenaltyFast` with `circDist` spelled out over `modL` (same operations).
            if (!(D > 0)) val[k] = 0;
            else {
              const d = modL(phi[ta[k]!]! - phi[tb[k]!]!);
              val[k] = ceil[k]! * (Math.max(0, D - Math.min(d, L - d)) / D);
            }
          } else val[k] = seamPen(ta[k]!, tb[k]!, tLo[k]!, tHi[k]!, tDist[k]!);
        }
      }
      // Sums in the order of the reference (links, then second-order pairs).
      let V = 0;
      let H = 0;
      const nV = vTerms;
      const nT = nTerms;
      for (let k = 0; k < nV; k++) V += val[k]!;
      for (let k = nV; k < nT; k++) H += val[k]!;
      const R = weights.lambdaR > 0 ? regularityPenalty(ctx, phi, weights.regularityDistance) : 0;

      let N = 0;
      if (nUnpEnd > 0 && nUnpStart > 0) {
        N = Math.min(1, Math.max(0, (minUnpEnd + minUnpStart + kerf - L) / L));
      }

      if (deficitStale) {
        let sum = 0;
        for (let i = 0; i < nSeg; i++) sum += segDeficit[i]!;
        deficitTotal = sum;
        deficitStale = false;
      }
      const deficit = deficitTotal;
      return {
        B,
        V,
        H,
        R,
        N,
        f:
          B + weights.lambdaV * V + weights.lambdaH * H + weights.lambdaR * R + weights.epsilon * N,
        feasible: V === 0 && deficit <= 0,
        lengthDeficit: deficit,
      };
    },
    unpaired(): UnpairedInfo {
      const toList = (idx: Int32Array, n: number): UnpairedList => {
        // Plain arrays: a snapshot is taken per accepted SA move, and typed arrays are costly to allocate.
        const segment = new Array<number>(n);
        const len = new Array<number>(n);
        for (let k = 0; k < n; k++) {
          segment[k] = pSeg[idx[k]!]!;
          len[k] = pExt[idx[k]!]!;
        }
        return { count: n, segment, len };
      };
      return { ends: toList(unpEnd, nUnpEnd), starts: toList(unpStart, nUnpStart) };
    },
  };
  return evaluator;
}
