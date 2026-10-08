/**
 * The experiment matrix of `bench all` (ALGORITHM §13.2–13.3), pure data: which runs exist and how
 * they are named. No file-system access and no execution here (`runJob.ts` executes, `raw.ts`
 * stores), so the matrix can be tested without running anything.
 *
 * One experiment: every instance × every method × seeds, with the pure board-count objective
 * (f = B + soft terms that vanish on feasible plans; ADR-029). B-NEXT and B-INST are deterministic
 * (one run); HC, SA and SA-onsite run once per seed.
 */

import type { Method, Project } from '@lp/core';

/** Methods of the experiment, in the column order of `summary.csv`. */
export const METHODS: readonly Method[] = ['b-next', 'b-inst', 'hc', 'sa', 'sa-onsite'];

export const isDeterministic = (method: Method): boolean =>
  method === 'b-next' || method === 'b-inst';

export interface Preset {
  /** Seeds 1…seeds for the stochastic methods. */
  seeds: number;
  /** Objective evaluations per run. */
  iters: number;
  /** Keep only the first N instances (quick dry runs); undefined = all. */
  maxInstances?: number;
}

/** §13.2: 20 seeds, 200 000 evaluations. */
export const FULL_PRESET: Preset = { seeds: 20, iters: 200_000 };

/** Dry run of the whole chain in seconds: two instances, two seeds, a few hundred evaluations. */
export const QUICK_PRESET: Preset = { seeds: 2, iters: 300, maxInstances: 2 };

export interface InstanceInfo {
  /** File stem, e.g. `R2`. */
  id: string;
  /** Directory name under `instances/`, e.g. `rect`. */
  group: string;
  project: Project;
  /** Hash of the project without `meta` (geometry, product, rules, settings): part of the run key. */
  hash: string;
}

export interface Job {
  instance: string;
  method: Method;
  seed: number;
  iters: number;
  /** `InstanceInfo.hash` of the instance at the time the matrix was built. */
  instanceHash: string;
}

/**
 * Stable identity of a run. The budget and the content hash of the instance are part of it, so
 * rows written with another budget, or for an instance that has since been edited, are never
 * mistaken for finished work when a run is resumed. (The code version is not: every row records
 * its commit and `runAll` warns about rows from other commits.)
 */
export const jobKey = (j: Job): string =>
  [j.instance, j.method, `s${j.seed}`, `i${j.iters}`, `h${j.instanceHash}`].join('|');

/** Jobs of the matrix, in a fixed order: instance, method, seed. */
export function buildJobs(instances: readonly InstanceInfo[], preset: Preset): Job[] {
  const used =
    preset.maxInstances === undefined ? instances : instances.slice(0, preset.maxInstances);
  const jobs: Job[] = [];
  for (const inst of used) {
    for (const method of METHODS) {
      const runs = isDeterministic(method) ? 1 : preset.seeds;
      for (let seed = 1; seed <= runs; seed++) {
        jobs.push({
          instance: inst.id,
          method,
          seed,
          iters: preset.iters,
          instanceHash: inst.hash,
        });
      }
    }
  }
  return jobs;
}
