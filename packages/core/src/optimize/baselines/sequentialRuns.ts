import { lowerBounds } from '../../bounds/bounds';
import { evaluate } from '../../evaluate/evaluate';
import type { PlanContext } from '../../plan/context';
import type { Method, SearchResult } from '../types';
import { sequentialPhases, type SequentialPolicy } from './sequential';

/**
 * B-INST / B-NEXT: phases from the offcut-stack simulation, board count from the sequential
 * (on-site) decoder. `mode: 'precut'` gives "B-INST + precut" (what pre-cutting alone would save).
 */
export function runSequential(
  ctx: PlanContext,
  policy: SequentialPolicy,
  mode: 'onsite' | 'precut' = 'onsite',
): SearchResult {
  const phi = sequentialPhases(ctx, policy);
  const evaluation = evaluate(ctx, phi, { mode });
  const method: Method = policy === 'inst' ? 'b-inst' : 'b-next';
  return {
    method,
    phi,
    mode,
    evaluation,
    evals: 1,
    provenOptimal: evaluation.feasible && evaluation.B === lowerBounds(ctx).lb,
    trace: [{ eval: 1, B: evaluation.B }],
  };
}

export const runBInst = (ctx: PlanContext, mode: 'onsite' | 'precut' = 'onsite'): SearchResult =>
  runSequential(ctx, 'inst', mode);
export const runBNext = (ctx: PlanContext): SearchResult => runSequential(ctx, 'next');
