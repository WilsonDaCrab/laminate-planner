/**
 * `bench all`: build the matrix, run what is not yet in `results/raw/`, write the tables.
 *
 *   results/env.json                      machine and commit
 *   results/raw/<experiment>.jsonl        one row per run (resumable)
 *   results/summary.csv                   main table (E1)
 *   results/summary_bonly.csv             the same table for E4 (H pattern off)
 *   results/tables/g1|g2|g3_*.csv         data of the plots
 *   results/plots/G1|G2|G3.svg            the plots (plots.ts)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from './env';
import { executeSequential, type Execute } from './execute';
import {
  buildJobs,
  EXPERIMENTS,
  jobKey,
  type ExperimentId,
  type InstanceInfo,
  type Preset,
} from './protocol';
import { writePlots } from './plots';
import { appendRow, pendingJobs, rawPath, readRows } from './raw';
import type { RawRow } from './runJob';
import { aestheticsCsv, convergenceCsv, mainTableCsv, precutCsv } from './summary';

export interface RunAllOptions {
  instances: readonly InstanceInfo[];
  preset: Preset;
  /** Results directory (`results`). */
  dir: string;
  only?: readonly ExperimentId[];
  execute?: Execute;
  /** Worker threads used (recorded in `env.json`: wall times of parallel runs are noisy). */
  threads?: number;
  log?: (line: string) => void;
  /** Write a progress line every this many finished runs. */
  progressEvery?: number;
}

export interface RunAllReport {
  total: number;
  skipped: number;
  ran: number;
  /** Rows of the current matrix (in matrix order), as used for the tables. */
  rows: RawRow[];
}

/** Rows of the current matrix only: rows written with another budget or instance set are ignored. */
export function currentRows(dir: string, jobs: ReturnType<typeof buildJobs>): RawRow[] {
  const byKey = new Map<string, RawRow>();
  for (const e of EXPERIMENTS) for (const r of readRows(rawPath(dir, e))) byKey.set(r.key, r);
  return jobs.map((j) => byKey.get(jobKey(j))).filter((r): r is RawRow => r !== undefined);
}

export async function runAll(opts: RunAllOptions): Promise<RunAllReport> {
  const log = opts.log ?? (() => undefined);
  const jobs = buildJobs(opts.instances, opts.preset, opts.only);
  const todo = pendingJobs(opts.dir, jobs);
  log(
    `${jobs.length} runs in the matrix, ${jobs.length - todo.length} already done, ${todo.length} to run`,
  );

  mkdirSync(opts.dir, { recursive: true });
  const env = readEnv();
  // `env.json` describes the session that produced rows: a pass that only regenerates the tables
  // from finished rows must not overwrite it (it would claim another thread count and start time).
  if (todo.length > 0 || !existsSync(join(opts.dir, 'env.json'))) {
    writeFileSync(
      join(opts.dir, 'env.json'),
      `${JSON.stringify({ ...env, threads: opts.threads ?? 1 }, null, 2)}\n`,
    );
  }
  // Rows of earlier sessions stay in the files; their code may differ from this checkout.
  const foreign = currentRows(opts.dir, jobs).filter((r) => r.commit !== env.commit);
  if (foreign.length > 0) {
    const commits = [...new Set(foreign.map((r) => r.commit?.slice(0, 7) ?? 'unknown'))];
    log(
      `WARNING: ${foreign.length} finished rows come from other commits (${commits.join(', ')}; ` +
        `now ${env.commit?.slice(0, 7) ?? 'unknown'}). Delete results/raw to rerun them with the current code.`,
    );
  }

  const t0 = performance.now();
  let done = 0;
  const every = opts.progressEvery ?? 100;
  await (opts.execute ?? executeSequential)(todo, opts.instances, (row) => {
    appendRow(rawPath(opts.dir, row.experiment), { ...row, commit: env.commit });
    done++;
    if (done % every === 0 || done === todo.length) {
      const s = (performance.now() - t0) / 1000;
      const eta = (s / done) * (todo.length - done);
      log(`${done}/${todo.length} runs, ${s.toFixed(0)} s elapsed, about ${eta.toFixed(0)} s left`);
    }
  });

  const rows = currentRows(opts.dir, jobs);
  const known = new Map(
    opts.instances.map((i) => [
      i.id,
      { knownOptimum: i.project.meta?.knownOptimum, bestKnown: i.project.meta?.bestKnown },
    ]),
  );
  writeFileSync(join(opts.dir, 'summary.csv'), mainTableCsv(rows, known));
  writeFileSync(join(opts.dir, 'summary_bonly.csv'), mainTableCsv(rows, known, 'bonly'));
  mkdirSync(join(opts.dir, 'tables'), { recursive: true });
  writeFileSync(join(opts.dir, 'tables', 'g1_convergence.csv'), convergenceCsv(rows));
  writeFileSync(join(opts.dir, 'tables', 'g2_aesthetics.csv'), aestheticsCsv(rows));
  writeFileSync(join(opts.dir, 'tables', 'g3_precut.csv'), precutCsv(rows));
  await writePlots(opts.dir);
  return { total: jobs.length, skipped: jobs.length - todo.length, ran: todo.length, rows };
}
