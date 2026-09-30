/**
 * Executes one job of the `bench all` matrix and returns a flat, JSON-serialisable row
 * (one line of `results/raw/<experiment>.jsonl`). Pure with respect to the file system.
 */

import { lowerBounds, runMethod, shapesArea, type TracePoint } from '@lp/core';
import { applyVariant, jobKey, variantLabel, type InstanceInfo, type Job } from './protocol';

export interface RawRow {
  key: string;
  experiment: Job['experiment'];
  instance: string;
  group: string;
  method: Job['method'];
  /** `-` (none), `D300` or `Hoff`. */
  variant: string;
  seed: number;
  iters: number;
  y0: number;
  segments: number;
  /** Area of the installable zone in m² (room minus gaps and obstacles). */
  zoneM2: number;
  lb0: number;
  lb1: number;
  /** max(lb0, lb1). */
  lb: number;
  B: number;
  V: number;
  H: number;
  N: number;
  feasible: boolean;
  provenOptimal: boolean;
  mode: 'precut' | 'onsite';
  evals: number;
  /** Evaluation index of the last improvement (0 when the method records no trace). */
  evalsToBest: number;
  /** Wall time of the run in ms (a noisy measure when several runs share the machine). */
  ms: number;
  knownOptimum: number | null;
  bestKnown: number | null;
  /** Best B against the evaluation count; kept only for the SA methods (G1). */
  trace: TracePoint[];
}

const keepsTrace = (method: Job['method']): boolean => method === 'sa' || method === 'sa-onsite';

export function runJob(job: Job, instance: InstanceInfo): RawRow {
  const project = applyVariant(instance.project, job.variant);
  const t0 = performance.now();
  const { ctx, y0, result } = runMethod(project, job.method, {
    seed: job.seed,
    budget: { iters: job.iters },
  });
  const ms = performance.now() - t0;
  const bounds = lowerBounds(ctx);
  const ev = result.evaluation;
  return {
    key: jobKey(job),
    experiment: job.experiment,
    instance: job.instance,
    group: instance.group,
    method: job.method,
    variant: variantLabel(job.variant),
    seed: job.seed,
    iters: job.iters,
    y0,
    segments: ctx.layout.segments.length,
    zoneM2: shapesArea(ctx.zone.shapes) / 1e6,
    lb0: bounds.lb0,
    lb1: bounds.lb1,
    lb: bounds.lb,
    B: ev.B,
    V: ev.V,
    H: ev.H,
    N: ev.N,
    feasible: ev.feasible,
    provenOptimal: result.provenOptimal,
    mode: result.mode,
    evals: result.evals,
    evalsToBest: result.trace.length > 0 ? result.trace[result.trace.length - 1]!.eval : 0,
    ms,
    knownOptimum: instance.project.meta?.knownOptimum ?? null,
    bestKnown: instance.project.meta?.bestKnown ?? null,
    trace: keepsTrace(job.method) ? result.trace : [],
  };
}
