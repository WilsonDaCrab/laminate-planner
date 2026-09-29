import type { Evaluation } from '../evaluate/evaluate';
import type { DecodeMode } from '../plan/run';

export type Method = 'b-next' | 'b-inst' | 'rs' | 'hc';

export interface OptimizeBudget {
  /** Number of evaluations (deterministic budget for experiments). */
  iters?: number;
  /** Wall-clock limit in ms; needs `clock`. */
  timeMs?: number;
  /** Time source (the core never reads the system clock itself). */
  clock?: () => number;
}

export interface TracePoint {
  eval: number;
  B: number;
}

export interface SearchResult {
  method: Method;
  phi: number[];
  /** Decoder the evaluation (and therefore B) refers to; build the plan with the same mode. */
  mode: DecodeMode;
  evaluation: Evaluation;
  /** Objective evaluations spent. */
  evals: number;
  /** Feasible and B equals the lower bound. */
  provenOptimal: boolean;
  /** Best-so-far board count over the run (thinned to a couple of hundred points). */
  trace: TracePoint[];
}
