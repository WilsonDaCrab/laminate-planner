import {
  better,
  contains,
  createEvaluator,
  lowerBounds,
  mod,
  PhaseSpace,
  type DecodeMode,
  type PlanContext,
  type QuickEval,
} from '@lp/core';

/** Default cap on the number of evaluations; a larger grid is refused (use a coarser step). */
export const DEFAULT_MAX_EVALS = 50_000_000;

export interface ExhaustiveOptions {
  /** Grid step in mm along F_s (ALGORITHM §12.1). */
  step: number;
  maxEvals?: number;
}

export interface ExhaustiveResult {
  phi: number[];
  evaluation: QuickEval;
  mode: DecodeMode;
  step: number;
  evals: number;
  /** Grid points with the same feasibility and B as the best one. */
  ties: number;
  /** Candidate phases per segment. */
  gridSizes: number[];
  lb: number;
  /** B equals the lower bound: the optimum over all φ, not only over the grid. */
  provenOptimal: boolean;
}

const key = (x: number): number => Math.round(x * 1e6);

/**
 * Candidate phases of every segment: the grid points of F_s (`a_s + j·step` for rectangular
 * segments, which keeps the start piece whole mm as in ADR-013; multiples of `step` otherwise)
 * plus the ends of the F_s intervals, where the L_min rule usually binds.
 */
export function segmentGrid(space: PhaseSpace, step: number): number[][] {
  if (!(step > 0)) throw new RangeError('segmentGrid: step must be positive');
  const L = space.L;
  return space.feasible.map((F, i) => {
    const found = new Map<number, number>();
    const add = (v: number): void => {
      const w = mod(v, L);
      if (contains(F, w)) found.set(key(w), w);
    };
    const origin = space.rect[i] ? space.a[i]! : 0;
    for (let j = 0; j * step < L; j++) add(origin + j * step);
    for (const [lo, hi] of F.intervals) {
      for (const end of [lo, hi]) {
        const v = space.place(i, end);
        found.set(key(mod(v, L)), mod(v, L));
      }
    }
    return [...found.values()].sort((p, q) => p - q);
  });
}

/**
 * Full enumeration of the phase vectors on the grid, in the order of `better` (feasible, then B,
 * then f). The best point is an upper bound of the optimum; when B equals LB1 it is proven optimal.
 * Deterministic: no randomness and no clock.
 */
export function runExhaustive(ctx: PlanContext, opts: ExhaustiveOptions): ExhaustiveResult {
  const mode: DecodeMode = 'precut';
  const space = new PhaseSpace(ctx);
  const grid = segmentGrid(space, opts.step);
  const sizes = grid.map((g) => g.length);
  const total = sizes.reduce((p, n) => p * n, 1);
  const cap = opts.maxEvals ?? DEFAULT_MAX_EVALS;
  if (grid.some((g) => g.length === 0)) throw new RangeError('exhaustive: empty feasible set');
  if (total > cap) {
    throw new RangeError(
      `exhaustive: grid has ${total} points (> ${cap}); use a larger --step or --max-evals`,
    );
  }

  const evaluator = createEvaluator(ctx, mode);
  const n = grid.length;
  const idx = new Array<number>(n).fill(0);
  const phi = new Array<number>(n).fill(0);
  let best: { phi: number[]; ev: QuickEval } | undefined;
  let ties = 0;
  let evals = 0;
  for (;;) {
    for (let i = 0; i < n; i++) phi[i] = grid[i]![idx[i]!]!;
    const ev = evaluator.evaluate(phi);
    evals++;
    const same = best !== undefined && ev.feasible === best.ev.feasible && ev.B === best.ev.B;
    if (!best || better(ev, best.ev)) {
      best = { phi: [...phi], ev: { ...ev } };
      ties = same ? ties + 1 : 1;
    } else if (same) ties++;
    let d = n - 1;
    while (d >= 0 && ++idx[d]! === sizes[d]) idx[d--] = 0;
    if (d < 0) break;
  }

  const lb = lowerBounds(ctx).lb;
  return {
    phi: best!.phi,
    evaluation: best!.ev,
    mode,
    step: opts.step,
    evals,
    ties,
    gridSizes: sizes,
    lb,
    provenOptimal: best!.ev.feasible && best!.ev.B === lb,
  };
}
