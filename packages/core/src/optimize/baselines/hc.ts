import { lowerBounds } from '../../bounds/bounds';
import { evaluate } from '../../evaluate/evaluate';
import { sample } from '../../layout/feasible';
import type { PlanContext } from '../../plan/context';
import type { DecodeMode } from '../../plan/run';
import type { Rng } from '../../rng/index';
import { Budget, Incumbent } from '../incumbent';
import { resetPhase, shiftPhase } from '../moves';
import type { OptimizeBudget, SearchResult } from '../types';
import { DEFAULT_ITERS } from './rs';

export interface HillClimbOptions {
  /** Restart from a random φ after this many evaluations without improvement. */
  stall?: number;
  /** Probability of M1 Reset (else M2 Shift). */
  resetProbability?: number;
  /** Start of the first climb (later climbs start from random phases). */
  start?: readonly number[];
  mode?: DecodeMode;
}

/**
 * HC: SA at T = 0 (accepts only Δf ≤ 0) with restarts; shows what accepting worse moves buys.
 * Moves: M1 Reset and M2 Shift (F5 shares the full move set with SA).
 */
export function runHillClimb(
  ctx: PlanContext,
  rng: Rng,
  budget: OptimizeBudget,
  opts: HillClimbOptions = {},
): SearchResult {
  const stall = opts.stall ?? 2000;
  const pReset = opts.resetProbability ?? 0.3;
  const { L } = ctx;
  const segs = ctx.layout.segments;
  const lb = lowerBounds(ctx).lb;
  const b = new Budget(budget, DEFAULT_ITERS);
  const best = new Incumbent();
  const evalAt = (phi: number[]) => evaluate(ctx, phi, { mode: opts.mode });
  const randomPhi = () => segs.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));

  if (!b.allows(0)) throw new RangeError('runHillClimb: budget allows no evaluation');
  let evals = 0;
  let phi = opts.start ? [...opts.start] : randomPhi();
  let cur = evalAt(phi);
  evals++;
  best.offer(phi, cur, evals);
  let proven = best.evaluation!.feasible && best.evaluation!.B === lb;
  let sinceImprove = 0;

  while (!proven && b.allows(evals)) {
    if (sinceImprove >= stall) {
      phi = randomPhi();
      cur = evalAt(phi);
      evals++;
      best.offer(phi, cur, evals);
      sinceImprove = 0;
    } else {
      const i = rng.int(0, segs.length - 1);
      const F = ctx.feasible[segs[i]!.id]!.feasible;
      const old = phi[i]!;
      const amplitude = Math.max(20, (L / 2) * rng.next() ** 2);
      phi[i] = rng.next() < pReset ? resetPhase(F, rng) : shiftPhase(F, old, amplitude, rng);
      const ev = evalAt(phi);
      evals++;
      if (ev.f <= cur.f) {
        sinceImprove = ev.f < cur.f ? 0 : sinceImprove + 1;
        cur = ev;
        if (best.offer(phi, ev, evals)) sinceImprove = 0;
      } else {
        phi[i] = old;
        sinceImprove++;
      }
    }
    proven = best.evaluation!.feasible && best.evaluation!.B === lb;
  }
  return {
    method: 'hc',
    phi: best.phi!,
    evaluation: best.evaluation!,
    evals,
    provenOptimal: proven,
    trace: best.trace(),
  };
}
