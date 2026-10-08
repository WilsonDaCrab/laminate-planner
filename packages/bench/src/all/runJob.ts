/**
 * Executes one job of the `bench all` matrix and returns a flat, JSON-serialisable row
 * (one line of `results/raw/main.jsonl`). Pure with respect to the file system.
 */

import { lowerBounds, runMethod, shapesArea } from '@lp/core';
import { jobKey, type InstanceInfo, type Job } from './protocol';

export interface RawRow {
  key: string;
  instance: string;
  group: string;
  method: Job['method'];
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
  N: number;
  feasible: boolean;
  provenOptimal: boolean;
  mode: 'precut' | 'onsite';
  evals: number;
  /** First evaluation at which the final B was reached (0 when the method records no trace). */
  evalsToFinalB: number;
  /** Wall time of the run in ms (a noisy measure when several runs share the machine). */
  ms: number;
  /** Commit the row was produced at (set by `runAll`; null outside a git checkout). */
  commit: string | null;
}

export function runJob(job: Job, instance: InstanceInfo): RawRow {
  const t0 = performance.now();
  const { ctx, y0, result } = runMethod(instance.project, job.method, {
    seed: job.seed,
    budget: { iters: job.iters },
  });
  const ms = performance.now() - t0;
  const bounds = lowerBounds(ctx);
  const ev = result.evaluation;
  return {
    key: jobKey(job),
    instance: job.instance,
    group: instance.group,
    method: job.method,
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
    N: ev.N,
    feasible: ev.feasible,
    provenOptimal: result.provenOptimal,
    mode: result.mode,
    evals: result.evals,
    evalsToFinalB: result.trace.find((p) => p.B <= ev.B)?.eval ?? 0,
    ms,
    commit: null,
  };
}
