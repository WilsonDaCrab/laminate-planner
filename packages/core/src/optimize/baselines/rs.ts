import { lowerBounds } from '../../bounds/bounds';
import { createEvaluator } from '../../evaluate/evaluator';
import type { PlanContext } from '../../plan/context';
import type { DecodeMode } from '../../plan/run';
import type { Rng } from '../../rng/index';
import { Budget, Incumbent } from '../incumbent';
import { PhaseSpace } from '../phaseSpace';
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
  const space = new PhaseSpace(ctx);
  const evaluator = createEvaluator(ctx, mode ?? ctx.project.settings.mode);
  let evals = 0;
  let proven = false;
  while (!proven && b.allows(evals)) {
    const phi = ctx.layout.segments.map((_, i) => space.sample(i, rng));
    const ev = evaluator.evaluate(phi);
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
