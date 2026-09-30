/**
 * The experiment matrix of `bench all` (ALGORITHM §13.2–13.3), pure data: which runs exist, how
 * they are named and how an instance is varied. No file-system access and no execution here
 * (`runJob.ts` executes, `raw.ts` stores), so the matrix can be tested without running anything.
 *
 * E1 "main"       — every instance × every method × seeds; feeds the main table, G1 (SA traces)
 *                   and G3 (B-INST vs SA-onsite vs SA, all read from the same rows).
 * E3 "aesthetics" — SA under `hPattern.distance` D = 200…500 mm and with the pattern off (G2).
 *                   The instance is varied in memory; the files in `instances/` are never touched.
 */

import type { Method, Project } from '@lp/core';

export type ExperimentId = 'main' | 'aesthetics';

export const EXPERIMENTS: readonly ExperimentId[] = ['main', 'aesthetics'];

/** Methods of E1; B-NEXT and B-INST are deterministic (one run), the rest run once per seed. */
export const MAIN_METHODS: readonly Method[] = ['b-next', 'b-inst', 'rs', 'hc', 'sa', 'sa-onsite'];

export const isDeterministic = (method: Method): boolean =>
  method === 'b-next' || method === 'b-inst';

/** An H-pattern variant of an instance: seam-offset distance D in mm, or `null` = pattern off. */
export interface Variant {
  hDistance: number | null;
}

export interface Preset {
  /** Seeds 1…seeds for the stochastic methods. */
  seeds: number;
  /** Objective evaluations per run. */
  iters: number;
  /** E3: instance ids (skipped when absent from the instance list), D values in mm. */
  aestheticsInstances: readonly string[];
  aestheticsDistances: readonly (number | null)[];
  /** Keep only the first N instances for E1 (quick dry runs); undefined = all. */
  maxInstances?: number;
}

/** §13.2: 20 seeds, 200 000 evaluations. E3 uses one room per geometry family. */
export const FULL_PRESET: Preset = {
  seeds: 20,
  iters: 200_000,
  aestheticsInstances: ['R2', 'L1', 'S1', 'O1'],
  aestheticsDistances: [200, 250, 300, 350, 400, 450, 500, null],
};

/** Dry run of the whole chain in seconds: two instances, two seeds, a few hundred evaluations. */
export const QUICK_PRESET: Preset = {
  seeds: 2,
  iters: 300,
  aestheticsInstances: ['R2'],
  aestheticsDistances: [200, null],
  maxInstances: 2,
};

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
  experiment: ExperimentId;
  instance: string;
  method: Method;
  seed: number;
  iters: number;
  variant: Variant | null;
  /** `InstanceInfo.hash` of the instance at the time the matrix was built. */
  instanceHash: string;
}

export const variantLabel = (v: Variant | null): string =>
  v === null ? '-' : v.hDistance === null ? 'Hoff' : `D${v.hDistance}`;

/**
 * Stable identity of a run. The budget and the content hash of the instance are part of it, so
 * rows written with another budget, or for an instance that has since been edited, are never
 * mistaken for finished work when a run is resumed. (The code version is not: every row records
 * its commit and `runAll` warns about rows from other commits.)
 */
export const jobKey = (j: Job): string =>
  [
    j.experiment,
    j.instance,
    j.method,
    variantLabel(j.variant),
    `s${j.seed}`,
    `i${j.iters}`,
    `h${j.instanceHash}`,
  ].join('|');

/** The project of a job: a copy with the H-pattern of the variant; the input is not modified. */
export function applyVariant(project: Project, variant: Variant | null): Project {
  if (variant === null) return project;
  const hPattern =
    variant.hDistance === null
      ? { ...project.rules.hPattern, enabled: false }
      : { ...project.rules.hPattern, enabled: true, distance: variant.hDistance };
  return { ...project, rules: { ...project.rules, hPattern } };
}

/** Jobs of the selected experiments, in a fixed order: experiment, instance, method, variant, seed. */
export function buildJobs(
  instances: readonly InstanceInfo[],
  preset: Preset,
  only: readonly ExperimentId[] = EXPERIMENTS,
): Job[] {
  const jobs: Job[] = [];
  if (only.includes('main')) {
    const used =
      preset.maxInstances === undefined ? instances : instances.slice(0, preset.maxInstances);
    for (const inst of used) {
      for (const method of MAIN_METHODS) {
        const runs = isDeterministic(method) ? 1 : preset.seeds;
        for (let seed = 1; seed <= runs; seed++) {
          jobs.push({
            experiment: 'main',
            instance: inst.id,
            method,
            seed,
            iters: preset.iters,
            variant: null,
            instanceHash: inst.hash,
          });
        }
      }
    }
  }
  if (only.includes('aesthetics')) {
    for (const inst of instances) {
      if (!preset.aestheticsInstances.includes(inst.id)) continue;
      for (const hDistance of preset.aestheticsDistances) {
        for (let seed = 1; seed <= preset.seeds; seed++) {
          jobs.push({
            experiment: 'aesthetics',
            instance: inst.id,
            method: 'sa',
            seed,
            iters: preset.iters,
            variant: { hDistance },
            instanceHash: inst.hash,
          });
        }
      }
    }
  }
  return jobs;
}
