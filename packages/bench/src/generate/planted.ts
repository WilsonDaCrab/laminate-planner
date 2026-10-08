/**
 * Planted "staircase" rooms with a known optimum (ALGORITHM §12.2, ADR-015).
 *
 * Row i occupies [0, R_i] × [(i−1)W, iW] with R_i = s_i + m_i·L + e_i, where s_i is the start piece
 * (right part of a board) and e_i the end piece (left part). Every end piece e_i is completed by the
 * start piece s_π(i) of one row so that e_i + s_π(i) + k = L exactly: every board is whole or one
 * exact pair, hence B* = Σ m_i + n. The row lengths give LB1 = ⌈Σ R_i / L⌉ = Σ m_i + n as well, so the
 * planted plan is optimal (a proof, not a heuristic).
 *
 * The pseudocode of §12.2 (random π, independent rows) cannot be used as written; three model
 * facts force a more structured construction (ADR-015):
 *  - rows 1 and n touch a wall on one long edge, so their pieces are strips of another class
 *    (K_high / K_low) that pair only among themselves: π fixes rows 1 and n;
 *  - the L_min rule and the piece class are measured along the *open* long edge. Where a row
 *    overhangs its neighbour, the end piece loses (part of) its open edge, changes class and the
 *    pairing breaks. Neighbouring rows must therefore stay close in length: the end piece of the
 *    longer row must overlap the shorter one by at least L_min;
 *  - neighbouring seams must be D apart.
 * The middle rows form blocks of four rows r..r+3 and π swaps rows two apart, (r r+2)(r+1 r+3):
 * with d = s_r − s_{r+2} small, R_r = C + M·L + d and R_{r+2} = C + M·L − d, so all rows have
 * nearly the same length (like the boundary rows, whose R = C + M·L) and the rows of a pair, which
 * are not neighbours, need no stagger between them. Phases and d are drawn block by block against
 * the previous row, and the finished room is verified with the real evaluator, bounds and validator.
 */

import {
  buildContext,
  buildPlan,
  circDist,
  createProject,
  createRng,
  evaluate,
  inflate,
  lowerBounds,
  rowConfigFromSettings,
  validatePlan,
  type Project,
  type Rng,
  type Room,
  type Vec2,
} from '@lp/core';

export interface PlantedParams {
  /** Number of rows: n − 2 must be a positive multiple of 4 (two boundary rows, blocks of four). */
  n: number;
  /** Whole boards M in every row. */
  m: number;
  seed: number;
  name?: string;
}

export const PLANTED_PRESETS: Record<string, PlantedParams> = {
  P1: { n: 14, m: 3, seed: 1 }, // ≈ 14 m²
  P2: { n: 22, m: 3, seed: 2 }, // ≈ 22 m²
  P3: { n: 30, m: 3, seed: 3 }, // ≈ 30 m²
  P4: { n: 42, m: 3, seed: 4 }, // ≈ 41 m²
  P5: { n: 50, m: 3, seed: 5 }, // ≈ 49 m²
  P6: { n: 62, m: 3, seed: 6 }, // ≈ 61 m²
};

const MAX_ATTEMPTS = 2000;
/** Largest |s_r − s_{r+2}| of a pair (mm): keeps the row lengths within 2·D_JITTER. */
const D_JITTER = 90;

interface Row {
  /** Start piece, end piece, whole boards and the resulting row length R = s + m·L + e. */
  s: number;
  e: number;
  m: number;
  R: number;
}

interface Limits {
  L: number;
  /** L − k: the length of two paired pieces. */
  C: number;
  Lmin: number;
  D: number;
}

const makeRow = (s: number, e: number, m: number, L: number): Row => ({
  s,
  e,
  m,
  R: s + m * L + e,
});

/** The polygon of the staircase zone (counter-clockwise, collinear vertices removed). */
function stairPolygon(lengths: readonly number[], W: number): Vec2[] {
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  lengths.forEach((R, i) => {
    pts.push({ x: R, y: i * W }, { x: R, y: (i + 1) * W });
  });
  pts.push({ x: 0, y: lengths.length * W });
  return pts.filter((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length]!;
    const b = pts[(i + 1) % pts.length]!;
    return (b.x - p.x) * (p.y - a.y) - (b.y - p.y) * (p.x - a.x) !== 0;
  });
}

function roomFor(lengths: readonly number[], W: number, gap: number, code: string): Room {
  const [shape] = inflate([{ outer: stairPolygon(lengths, W), holes: [] }], gap, {
    join: 'miter',
    miterLimit: 10,
  });
  if (!shape) throw new RangeError('planted: room outline vanished');
  const outline = shape.outer.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
  return {
    id: 'r1',
    name: 'Kāpņu telpa',
    code,
    outline,
    edges: outline.map(() => ({ kind: 'wall' as const })),
    obstacles: [],
  } as Room;
}

/**
 * May the rows x and y be neighbours? Their seams must be D apart, and the end piece of the longer
 * row must keep an open edge of at least L_min over the shorter one (else it loses its class).
 */
function compatible(x: Row, y: Row, q: Limits): boolean {
  if (circDist(x.s, y.s, q.L) < q.D) return false;
  const keepsEdge = (long: Row, short: Row): boolean =>
    long.R <= short.R || short.R - (long.R - long.e) >= q.Lmin;
  return keepsEdge(x, y) && keepsEdge(y, x);
}

/** Draws the four rows of a block that fit `prev`; undefined after too many failures. */
function drawBlock(prev: Row, M: number, q: Limits, rng: Rng): Row[] | undefined {
  const inRange = (v: number): boolean => v >= q.Lmin && v <= q.C - q.Lmin;
  for (let t = 0; t < 300; t++) {
    const s0 = rng.int(q.Lmin, q.C - q.Lmin);
    const s1 = rng.int(q.Lmin, q.C - q.Lmin);
    const s2 = s0 - rng.int(-D_JITTER, D_JITTER);
    const s3 = s1 - rng.int(-D_JITTER, D_JITTER);
    if (!inRange(s2) || !inRange(s3)) continue;
    // π swaps rows (0 2) and (1 3): the end piece of a row completes its partner's start piece.
    const rows = [
      makeRow(s0, q.C - s2, M, q.L),
      makeRow(s1, q.C - s3, M, q.L),
      makeRow(s2, q.C - s0, M, q.L),
      makeRow(s3, q.C - s1, M, q.L),
    ];
    if ([prev, ...rows].every((r, i, all) => i === 0 || compatible(all[i - 1]!, r, q))) return rows;
  }
  return undefined;
}

export interface PlantedInstance {
  project: Project;
  /** Phases of the construction (one per row, bottom to top): a plan with B = knownOptimum. */
  phi: number[];
}

/** One attempt; undefined when the drawn structure or one of the final checks fails. */
function attempt(base: Project, p: PlantedParams, rng: Rng): PlantedInstance | undefined {
  const { boardLength: L, boardWidth: W } = base.product;
  const { kerf: k, minPieceLength: Lmin, minStagger: D, expansionGap: g } = base.rules;
  const q: Limits = { L, C: L - k, Lmin, D };
  const { n, m: M } = p;

  const boundary = (): Row => {
    const s = rng.int(Lmin, q.C - Lmin);
    return makeRow(s, q.C - s, M, L); // a row that pairs with itself
  };
  const rows: Row[] = [boundary()];
  for (let i = 1; i < n - 1; i += 4) {
    const block = drawBlock(rows[rows.length - 1]!, M, q, rng);
    if (!block) return undefined;
    rows.push(...block);
  }
  const last = boundary();
  if (!compatible(rows[rows.length - 1]!, last, q)) return undefined;
  rows.push(last);

  const lengths = rows.map((r) => r.R);
  const optimum = rows.reduce((a, r) => a + r.m, 0) + n;
  const name = p.name ?? `P${n}`;
  const project = createProject({
    name,
    product: base.product,
    rules: base.rules,
    rooms: [roomFor(lengths, W, g, name)],
    settings: { ...base.settings, angleDeg: 0, stackSide: 'left', rowOffset: 0, seed: 1 },
    meta: { source: 'planted', knownOptimum: optimum },
  });

  const ctx = buildContext(project, rowConfigFromSettings(project.settings));
  const segments = ctx.layout.segments;
  if (segments.length !== n) return undefined;
  const extentsOk = segments.every((seg, i) => {
    const prof = ctx.profiles[seg.id]!;
    return Math.abs(prof.a) < 0.02 && Math.abs(prof.b - lengths[i]!) < 0.02;
  });
  if (!extentsOk) return undefined;

  const phi = rows.map((r) => r.s % L);
  for (const fast of [true, false]) {
    const ev = evaluate(ctx, phi, { mode: 'precut', fast });
    if (!ev.feasible || ev.V !== 0 || ev.B !== optimum) return undefined;
  }
  if (lowerBounds(ctx).lb !== optimum) return undefined;
  const check = validatePlan(project, buildPlan(ctx, phi, { mode: 'precut' }));
  if (check.violations.length > 0 || check.boards !== optimum) return undefined;
  return { project, phi };
}

/** A planted instance whose optimum (`meta.knownOptimum`) equals LB1. `base` supplies product and rules. */
export function generatePlantedInstance(base: Project, p: PlantedParams): PlantedInstance {
  const { boardLength: L } = base.product;
  const { kerf: k, minPieceLength: Lmin } = base.rules;
  if (p.n < 6 || (p.n - 2) % 4 !== 0)
    throw new RangeError('planted: n − 2 must be a positive multiple of 4');
  if (!Number.isInteger(p.m) || p.m < 1) throw new RangeError('planted: m must be an integer ≥ 1');
  if (!(p.n * k < L)) throw new RangeError('planted: n·k must be smaller than L');
  if (!(Lmin <= L - k - Lmin)) throw new RangeError('planted: L_min too large for this board');
  const rng = createRng(p.seed);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const c = attempt(base, p, rng);
    if (c) return c;
  }
  throw new Error(`planted: no valid instance in ${MAX_ATTEMPTS} attempts`);
}

/** Like `generatePlantedInstance`, only the project. */
export const generatePlanted = (base: Project, p: PlantedParams): Project =>
  generatePlantedInstance(base, p).project;
