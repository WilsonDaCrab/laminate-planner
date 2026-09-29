import { lowerBounds } from '../../bounds/bounds';
import { evaluate } from '../../evaluate/evaluate';
import { sample } from '../../layout/feasible';
import type { PlanContext } from '../../plan/context';
import type { DecodeMode } from '../../plan/run';
import type { Rng } from '../../rng/index';
import { Budget, Incumbent } from '../incumbent';
import type { OptimizeBudget, SearchResult } from '../types';

export const DEFAULT_ITERS = 10_000;

/** RS: φ_s ~ U(F_s) independently, best feasible of the budget (ALGORITHM §9). */
export function runRandomSearch(
  ctx: PlanContext,
  rng: Rng,
  budget: OptimizeBudget,
  mode?: DecodeMode,
): SearchResult {
  const lb = lowerBounds(ctx).lb;
  const b = new Budget(budget, DEFAULT_ITERS);
  const best = new Incumbent();
  let evals = 0;
  let proven = false;
  while (!proven && b.allows(evals)) {
    const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
    const ev = evaluate(ctx, phi, { mode });
    evals++;
    best.offer(phi, ev, evals);
    proven = best.evaluation!.feasible && best.evaluation!.B === lb;
  }
  if (!best.phi) throw new RangeError('runRandomSearch: budget allows no evaluation');
  return {
    method: 'rs',
    phi: best.phi,
    mode: mode ?? ctx.project.settings.mode,
    evaluation: best.evaluation!,
    evals,
    provenOptimal: proven,
    trace: best.trace(),
  };
}
