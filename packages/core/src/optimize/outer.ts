/**
 * Outer loop (ALGORITHM §8): the row direction θ, the starting wall (stack side) and the row offset
 * y0. Every candidate is screened cheaply (LB1 and the B-INST result), the best few per direction
 * and side are then refined by SA, and the best solution overall is returned with a comparison
 * table of all configurations.
 */

import { lowerBounds } from '../bounds/bounds';
import type { StackSide } from '../geometry/frames';
import { degToRad } from '../geometry/frames';
import { rowConfigFromSettings, type RowConfig } from '../layout/bands';
import { buildRoomZone } from '../layout/roomZone';
import { y0Violations } from '../layout/y0';
import type { Project } from '../model/index';
import { buildContext, type PlanContext } from '../plan/context';
import { fork } from '../rng/index';
import { runBInst } from './baselines/sequentialRuns';
import { better } from './incumbent';
import { runSa, type SaConfig } from './sa';
import type { OptimizeBudget, SearchResult } from './types';

/** Walls shorter than this do not suggest a row direction (mm). */
const MIN_DIRECTION_EDGE = 1000;
const DIRECTION_TOLERANCE_DEG = 1e-3;

export interface OuterOptions {
  seed?: number;
  /** Evaluations (or time) for *all* SA runs together; split equally between them. */
  budget?: OptimizeBudget;
  /** SA runs per (θ, side) configuration; default 3. */
  topK?: number;
  /** At most this many y0 values are screened per configuration; default 24. */
  maxY0?: number;
  /** Extra SA settings (moves, temperatures, decoder mode). */
  sa?: Omit<SaConfig, 'iters' | 'timeMs' | 'clock'>;
  roomId?: string;
}

export interface ConfigRow {
  angleDeg: number;
  stackSide: 'left' | 'right';
  y0: number;
  segments: number;
  lb: number;
  /** Result of the quick screening (B-INST). */
  bInst: number;
  bInstFeasible: boolean;
  /** No y0 met the strict w_min filter; this offset has the fewest violations. */
  relaxed: boolean;
  /** SA outcome (only for the refined candidates). */
  sa?: { B: number; feasible: boolean; evals: number; provenOptimal: boolean };
}

export interface OuterResult {
  best: { row: ConfigRow; ctx: PlanContext; result: SearchResult };
  /** All screened candidates, best first (SA results where they exist). */
  table: ConfigRow[];
}

/** Directions (degrees, [0, 180)) of the straight walls of the room that are at least 1000 mm long. */
export function wallDirections(project: Project, roomId?: string): number[] {
  const room = roomId ? project.rooms.find((r) => r.id === roomId) : project.rooms[0];
  if (!room) throw new RangeError('wallDirections: no such room');
  const out: number[] = [];
  room.outline.forEach((a, i) => {
    const b = room.outline[(i + 1) % room.outline.length]!;
    if (room.edges[i]?.bulge) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < MIN_DIRECTION_EDGE) return;
    const deg = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
    if (!out.some((d) => Math.abs(d - deg) < DIRECTION_TOLERANCE_DEG)) out.push(deg);
  });
  return out.sort((p, q) => p - q);
}

/** The (θ, side) configurations to try: fixed settings are kept, 'auto' ones are enumerated. */
export function candidateConfigs(
  project: Project,
  roomId?: string,
): { angleDeg: number; stackSide: 'left' | 'right' }[] {
  const { angleDeg, stackSide } = project.settings;
  const angles =
    angleDeg === 'auto' ? wallDirections(project, roomId).flatMap((d) => [d, d + 180]) : [angleDeg];
  const sides: ('left' | 'right')[] = stackSide === 'auto' ? ['left', 'right'] : [stackSide];
  const configs = angles.length > 0 ? angles : [0];
  return configs.flatMap((a) => sides.map((s) => ({ angleDeg: a, stackSide: s })));
}

/** y0 values to screen: the ends of the valid runs (critical offsets) plus an even grid, at most `max`. */
export function pickY0(valid: readonly number[], max: number): number[] {
  if (valid.length <= max) return [...valid];
  const chosen = new Set<number>();
  valid.forEach((y, i) => {
    if (i === 0 || i === valid.length - 1 || valid[i - 1]! !== y - 1 || valid[i + 1]! !== y + 1) {
      chosen.add(y);
    }
  });
  const grid = Math.max(2, max - chosen.size);
  for (let k = 0; k < grid; k++)
    chosen.add(valid[Math.floor((k * (valid.length - 1)) / (grid - 1))]!);
  const all = [...chosen].sort((p, q) => p - q);
  if (all.length <= max) return all;
  return Array.from(
    { length: max },
    (_, k) => all[Math.floor((k * (all.length - 1)) / (max - 1))]!,
  );
}

interface Screened {
  row: ConfigRow;
  ctx: PlanContext;
}

const rank = (a: ConfigRow, b: ConfigRow): number =>
  Number(b.bInstFeasible) - Number(a.bInstFeasible) ||
  a.bInst - b.bInst ||
  a.lb - b.lb ||
  a.y0 - b.y0;

export function runOuter(project: Project, opts: OuterOptions = {}): OuterResult {
  const room = opts.roomId ? project.rooms.find((r) => r.id === opts.roomId) : project.rooms[0];
  if (!room) throw new RangeError('runOuter: no such room');
  const topK = opts.topK ?? 3;
  const maxY0 = opts.maxY0 ?? 24;
  const seed = opts.seed ?? project.settings.seed;
  const mode = opts.sa?.mode ?? project.settings.mode;
  const zone = buildRoomZone(project, room.id);
  const base = rowConfigFromSettings(project.settings);
  // A fixed row offset in the settings is respected; 'auto' is scanned.
  const fixedY0 = project.settings.rowOffset === 'auto' ? undefined : base.y0;

  // ---- screening ----------------------------------------------------------------------------
  const screened: Screened[][] = [];
  for (const cfg of candidateConfigs(project, room.id)) {
    const theta = degToRad(cfg.angleDeg);
    const stackSide: StackSide = cfg.stackSide;
    let offsets: number[];
    let relaxed = false;
    if (fixedY0 !== undefined) {
      offsets = [fixedY0];
    } else {
      const violations = y0Violations(project, { theta, stackSide }, room.id, zone);
      const valid = violations.flatMap((v, y) => (v === 0 ? [y] : []));
      if (valid.length > 0) {
        offsets = pickY0(valid, maxY0);
      } else {
        relaxed = true;
        const fewest = Math.min(...violations);
        offsets = pickY0(
          violations.flatMap((v, y) => (v === fewest ? [y] : [])),
          maxY0,
        );
      }
    }
    const rows: Screened[] = [];
    for (const y0 of offsets) {
      const rowCfg: RowConfig = { theta, stackSide, y0 };
      const ctx = buildContext(project, rowCfg, room.id, zone);
      const inst = runBInst(ctx, mode);
      rows.push({
        ctx,
        row: {
          angleDeg: cfg.angleDeg,
          stackSide: cfg.stackSide,
          y0,
          segments: ctx.layout.segments.length,
          lb: lowerBounds(ctx).lb,
          bInst: inst.evaluation.B,
          bInstFeasible: inst.evaluation.feasible,
          relaxed,
        },
      });
    }
    rows.sort((p, q) => rank(p.row, q.row));
    screened.push(rows);
  }

  // ---- SA on the best few of each configuration ------------------------------------------------
  const chosen = screened.flatMap((rows) => rows.slice(0, topK));
  const { iters, timeMs, clock } = opts.budget ?? {};
  const share = (x: number | undefined): number | undefined =>
    x === undefined ? undefined : Math.max(1, Math.floor(x / Math.max(1, chosen.length)));
  let best: OuterResult['best'] | undefined;
  chosen.forEach((c, index) => {
    const result = runSa(c.ctx, fork(seed, index), {
      ...opts.sa,
      iters: share(iters),
      timeMs: share(timeMs),
      clock,
    });
    c.row.sa = {
      B: result.evaluation.B,
      feasible: result.evaluation.feasible,
      evals: result.evals,
      provenOptimal: result.provenOptimal,
    };
    if (!best || better(result.evaluation, best.result.evaluation)) {
      best = { row: c.row, ctx: c.ctx, result };
    }
  });
  if (!best) throw new RangeError('runOuter: no candidate configuration');

  const table = screened
    .flat()
    .map((s) => s.row)
    .sort((p, q) => {
      const bp = p.sa ? p.sa.B : Infinity;
      const bq = q.sa ? q.sa.B : Infinity;
      return bp - bq || rank(p, q);
    });
  return { best, table };
}
