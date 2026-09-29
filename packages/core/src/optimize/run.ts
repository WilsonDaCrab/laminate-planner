import { rowConfigFromSettings } from '../layout/bands';
import { goodY0 } from '../layout/y0';
import type { Project } from '../model/index';
import { buildContext, type PlanContext } from '../plan/context';
import { fork } from '../rng/index';
import { runHillClimb } from './baselines/hc';
import { runRandomSearch } from './baselines/rs';
import { runBInst, runBNext } from './baselines/sequentialRuns';
import { runSa } from './sa';
import type { Method, OptimizeBudget, SearchResult } from './types';

export interface RunOptions {
  seed?: number;
  budget?: OptimizeBudget;
  /** Row offset; default: the project's fixed `rowOffset`, else `goodY0` (first offset that keeps w_min). */
  y0?: number;
}

export interface MethodRun {
  ctx: PlanContext;
  y0: number;
  result: SearchResult;
}

/** One entry point for all baselines: builds the context and runs the method. */
export function runMethod(project: Project, method: Method, opts: RunOptions = {}): MethodRun {
  const base = rowConfigFromSettings(project.settings);
  const fixedY0 = project.settings.rowOffset === 'auto' ? undefined : base.y0;
  const y0 = opts.y0 ?? fixedY0 ?? goodY0(project) ?? base.y0;
  const ctx = buildContext(project, { ...base, y0 });
  const seed = opts.seed ?? project.settings.seed;
  const budget = opts.budget ?? {};
  let result: SearchResult;
  switch (method) {
    case 'b-next':
      result = runBNext(ctx);
      break;
    case 'b-inst':
      result = runBInst(ctx);
      break;
    case 'rs':
      result = runRandomSearch(ctx, fork(seed, 0), budget);
      break;
    case 'hc':
      result = runHillClimb(ctx, fork(seed, 0), budget, { start: runBInst(ctx).phi });
      break;
    case 'sa':
      result = runSa(ctx, fork(seed, 0), { ...budget });
      break;
    case 'sa-onsite':
      result = runSa(ctx, fork(seed, 0), { ...budget, mode: 'onsite' });
      break;
  }
  return { ctx, y0, result };
}
