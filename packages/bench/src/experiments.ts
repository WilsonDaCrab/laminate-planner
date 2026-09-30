/**
 * Small reproducible experiments of F5: the comparison of the methods (`compare`, the criterion
 * "SA ≤ every baseline, on average over the seeds") and the parameter grid of SA (`tune`, ADR-016).
 */

import {
  buildContext,
  DEFAULT_MOVE_WEIGHTS,
  DEFAULT_PAIRING,
  fork,
  goodY0,
  rowConfigFromSettings,
  runMethod,
  runSa,
  SPEC_MOVE_WEIGHTS,
  type MoveWeights,
  type PairingOptions,
  type Method,
  type Project,
} from '@lp/core';

export interface MethodStats {
  method: Method;
  /** Mean board count over the runs that ended feasible (V = 0); undefined if there was none. */
  meanB: number | undefined;
  best: number | undefined;
  /** Share of the runs whose result is feasible. */
  feasibleShare: number;
  meanMs: number;
}

/** Runs a method `seeds` times (once for the deterministic ones) and summarises it. */
export function measureMethod(
  project: Project,
  method: Method,
  seeds: number,
  iters: number,
): MethodStats {
  const deterministic = method === 'b-next' || method === 'b-inst';
  const runs = deterministic ? 1 : seeds;
  const feasible: number[] = [];
  let ms = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const t0 = performance.now();
    const { result } = runMethod(project, method, { seed, budget: { iters } });
    ms += performance.now() - t0;
    if (result.evaluation.feasible) feasible.push(result.evaluation.B);
  }
  return {
    method,
    meanB: feasible.length > 0 ? feasible.reduce((a, b) => a + b, 0) / feasible.length : undefined,
    best: feasible.length > 0 ? Math.min(...feasible) : undefined,
    feasibleShare: feasible.length / runs,
    meanMs: ms / runs,
  };
}

export const COMPARE_METHODS: readonly Method[] = ['b-next', 'b-inst', 'rs', 'hc', 'sa'];

export interface TuningConfig {
  name: string;
  p0: number;
  weights: MoveWeights;
  pairing: PairingOptions;
}

const NO_CLOSURE: PairingOptions = { closureProbability: 0, anySourceProbability: 0 };

/** The grid of `tune`: what the specification said first, then the changes one by one. */
export const TUNING_CONFIGS: readonly TuningConfig[] = [
  { name: 'spec (§6/§7)', p0: 0.8, weights: SPEC_MOVE_WEIGHTS, pairing: NO_CLOSURE },
  { name: 'spec + closure', p0: 0.8, weights: SPEC_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
  { name: 'M4 60 %, no closure', p0: 0.8, weights: DEFAULT_MOVE_WEIGHTS, pairing: NO_CLOSURE },
  { name: 'tuned (default)', p0: 0.8, weights: DEFAULT_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
  { name: 'tuned, p0 = 0.5', p0: 0.5, weights: DEFAULT_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
  { name: 'tuned, p0 = 0.2', p0: 0.2, weights: DEFAULT_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
  { name: 'tuned, p0 = 0.1', p0: 0.1, weights: DEFAULT_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
  { name: 'tuned, p0 = 0.05', p0: 0.05, weights: DEFAULT_MOVE_WEIGHTS, pairing: DEFAULT_PAIRING },
];

export interface TuningCell {
  meanB: number;
  found: number;
  runs: number;
}

/** SA with one configuration on one instance; `found` counts runs that reach `meta.knownOptimum`. */
export function tuneOne(
  project: Project,
  config: TuningConfig,
  seeds: number,
  iters: number,
): TuningCell {
  const base = rowConfigFromSettings(project.settings);
  const fixed = project.settings.rowOffset === 'auto' ? undefined : base.y0;
  const y0 = fixed ?? goodY0(project) ?? base.y0;
  const ctx = buildContext(project, { ...base, y0 });
  const optimum = project.meta?.knownOptimum;
  let sum = 0;
  let found = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = runSa(ctx, fork(seed, 0), {
      iters,
      p0: config.p0,
      weights: config.weights,
      pairing: config.pairing,
      mode: 'precut',
    });
    sum += r.evaluation.B;
    if (optimum !== undefined && r.evaluation.feasible && r.evaluation.B === optimum) found++;
  }
  return { meanB: sum / seeds, found, runs: seeds };
}
