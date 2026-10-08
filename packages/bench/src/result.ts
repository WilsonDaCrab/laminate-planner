import {
  parseProject,
  type CurvePoint,
  type Method,
  type SaStats,
  type Plan,
  type Project,
  type TracePoint,
} from '@lp/core';

export const RESULT_VERSION = 1;

export interface RunStats {
  B: number;
  lb0: number;
  lb1: number;
  /** B − max(lb0, lb1). */
  gap: number;
  V: number;
  N: number;
  feasible: boolean;
  lengthDeficit: number;
  evals: number;
  ms: number;
  provenOptimal: boolean;
  trace: TracePoint[];
}

/** JSON written by `run` and read by `validate`: self-contained (project + plan + statistics). */
export interface RunResult {
  version: number;
  instance: string;
  method: Method | 'exhaustive';
  seed: number;
  iters: number | null;
  timeMs: number | null;
  y0: number;
  mode: 'precut' | 'onsite';
  phi: number[];
  stats: RunStats;
  /** SA only: move statistics and the trajectory (ALGORITHM §15). */
  search?: { stats: SaStats; curve: CurvePoint[] };
  project: Project;
  plan: Plan;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Reads a result file. The project goes through the model schema; the plan is data to be checked
 * by the validator, so only its shape is asserted here.
 */
export function parseRunResult(raw: unknown): RunResult {
  if (!isRecord(raw)) throw new Error('result: not an object');
  if (raw.version !== RESULT_VERSION) {
    throw new Error(`result: unsupported version ${String(raw.version)}`);
  }
  const plan = raw.plan;
  if (!isRecord(plan) || !Array.isArray(plan.boards) || !Array.isArray(plan.pieces)) {
    throw new Error('result: "plan" is missing boards/pieces');
  }
  if (!isRecord(raw.stats)) throw new Error('result: "stats" is missing');
  if (!Array.isArray(raw.phi)) throw new Error('result: "phi" is missing');
  return { ...(raw as unknown as RunResult), project: parseProject(raw.project) };
}
