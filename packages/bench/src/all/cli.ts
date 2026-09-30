import { cpus } from 'node:os';
import { parseArgs } from 'node:util';
import { executePool } from './execute';
import { loadInstances } from './instances';
import { EXPERIMENTS, FULL_PRESET, QUICK_PRESET, type ExperimentId, type Preset } from './protocol';
import { runAll } from './runAll';

const toCount = (name: string, v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`);
  return n;
};

/** `bench all [--quick] [--only main,aesthetics] [--jobs N|auto] [--seeds N] [--iters N] [--out dir] [--instances dir]` */
export async function allCommand(args: string[], log: (line: string) => void): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      quick: { type: 'boolean' },
      only: { type: 'string' },
      jobs: { type: 'string' },
      seeds: { type: 'string' },
      iters: { type: 'string' },
      out: { type: 'string' },
      instances: { type: 'string' },
    },
  });
  const base = values.quick ? QUICK_PRESET : FULL_PRESET;
  const preset: Preset = {
    ...base,
    seeds: toCount('seeds', values.seeds, base.seeds),
    iters: toCount('iters', values.iters, base.iters),
  };
  const only = (values.only?.split(',').map((x) => x.trim()) ?? [...EXPERIMENTS]) as ExperimentId[];
  const bad = only.filter((e) => !EXPERIMENTS.includes(e));
  if (bad.length > 0) throw new Error(`--only: unknown experiment ${bad.join(', ')}`);
  const threads =
    values.jobs === 'auto' ? Math.max(1, cpus().length - 1) : toCount('jobs', values.jobs, 1);
  const root = values.instances ?? 'instances';
  const dir = values.out ?? (values.quick ? 'results/quick' : 'results');

  const instances = loadInstances(root);
  if (instances.length === 0) throw new Error(`all: no instance files in ${root}`);
  log(
    `bench all: ${instances.length} instances, ${preset.seeds} seeds, ${preset.iters} evaluations, ` +
      `${threads} thread${threads === 1 ? '' : 's'}, output ${dir}`,
  );
  const report = await runAll({
    instances,
    preset,
    dir,
    only,
    log,
    execute: threads > 1 ? executePool(threads, root) : undefined,
  });
  log(
    `done: ${report.ran} runs executed, ${report.skipped} reused; ${dir}/summary.csv and ${dir}/tables/`,
  );
  return 0;
}
