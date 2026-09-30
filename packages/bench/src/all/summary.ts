/**
 * Aggregation of the raw rows into the tables of ALGORITHM §13.3. Pure: rows in, CSV text out.
 *
 * - `summary.csv`      main table, one line per instance (E1)
 * - `g1_convergence.csv` best B so far against evaluations, mean/min/max over the seeds (SA, E1)
 * - `g2_aesthetics.csv`  B against the H-pattern distance D (E3)
 * - `g3_precut.csv`      B-INST (on-site) against SA-onsite against SA, per instance (E1)
 *
 * Means and deviations are taken over the runs that ended feasible (as in `bench compare`); the
 * share of feasible runs is always reported beside them, so a mean never hides failures.
 * The deviation is the sample deviation (n − 1; 0 for one run).
 */

import type { Method } from '@lp/core';
import { MAIN_METHODS } from './protocol';
import type { RawRow } from './runJob';

export interface Stats {
  runs: number;
  feasible: number;
  /** Over the feasible runs; undefined when none was feasible. */
  best: number | undefined;
  mean: number | undefined;
  std: number | undefined;
  /** Mean wall time over all runs (ms). */
  meanMs: number;
}

export function stats(rows: readonly RawRow[]): Stats {
  const ok = rows.filter((r) => r.feasible).map((r) => r.B);
  const mean = ok.length > 0 ? ok.reduce((a, b) => a + b, 0) / ok.length : undefined;
  const std =
    mean === undefined
      ? undefined
      : ok.length < 2
        ? 0
        : Math.sqrt(ok.reduce((a, b) => a + (b - mean) ** 2, 0) / (ok.length - 1));
  return {
    runs: rows.length,
    feasible: ok.length,
    best: ok.length > 0 ? Math.min(...ok) : undefined,
    mean,
    std,
    meanMs: rows.length > 0 ? rows.reduce((a, r) => a + r.ms, 0) / rows.length : 0,
  };
}

const cell = (x: number | string | null | undefined, digits = 3): string =>
  x === undefined || x === null
    ? ''
    : typeof x === 'string'
      ? x
      : Number.isInteger(x)
        ? String(x)
        : x.toFixed(digits);

export const csvLine = (cells: readonly (number | string | null | undefined)[]): string =>
  cells.map((c) => cell(c)).join(',');

const groupBy = <T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
};

const methodKey = (m: Method): string => m.replace('-', '_');

/** Main table: one line per instance, in the order the instances first appear in the rows. */
export function mainTableCsv(rows: readonly RawRow[]): string {
  const main = rows.filter((r) => r.experiment === 'main');
  const head = [
    'instance',
    'group',
    'zoneM2',
    'segments',
    'lb',
    'knownOptimum',
    'bestKnown',
    ...MAIN_METHODS.flatMap((m) =>
      ['best', 'mean', 'std', 'ms', 'feasible'].map((c) => `${methodKey(m)}_${c}`),
    ),
  ];
  const lines = [head.join(',')];
  for (const [instance, list] of groupBy(main, (r) => r.instance)) {
    const first = list[0]!;
    const cells: (number | string | null | undefined)[] = [
      instance,
      first.group,
      first.zoneM2,
      first.segments,
      first.lb,
      first.knownOptimum,
      first.bestKnown,
    ];
    for (const m of MAIN_METHODS) {
      const s = stats(list.filter((r) => r.method === m));
      cells.push(s.best, s.mean, s.std, s.meanMs, s.runs > 0 ? `${s.feasible}/${s.runs}` : '');
    }
    lines.push(csvLine(cells));
  }
  return `${lines.join('\n')}\n`;
}

/** Evaluation counts of the convergence grid: about `points` values, evenly spaced on a log scale. */
export function evalGrid(maxEval: number, points = 40): number[] {
  const grid = new Set<number>();
  for (let i = 0; i <= points; i++) grid.add(Math.max(1, Math.round(maxEval ** (i / points))));
  return [...grid].sort((a, b) => a - b);
}

/** Best B found up to `evals` evaluations; before the first trace point, the first recorded B. */
export function bestAt(
  trace: readonly { eval: number; B: number }[],
  evals: number,
): number | undefined {
  if (trace.length === 0) return undefined;
  let best = trace[0]!.B;
  for (const p of trace) {
    if (p.eval > evals) break;
    best = p.B;
  }
  return best;
}

/** G1: mean, min and max over the seeds of the best B so far, on a log grid of evaluations. */
export function convergenceCsv(rows: readonly RawRow[]): string {
  const lines = ['instance,method,eval,mean,min,max,seeds'];
  const sa = rows.filter((r) => r.experiment === 'main' && r.method === 'sa' && r.trace.length > 0);
  for (const [instance, list] of groupBy(sa, (r) => r.instance)) {
    const maxEval = Math.max(...list.map((r) => r.iters));
    for (const evals of evalGrid(maxEval)) {
      const values = list
        .map((r) => bestAt(r.trace, evals))
        .filter((b): b is number => b !== undefined);
      if (values.length === 0) continue;
      lines.push(
        csvLine([
          instance,
          'sa',
          evals,
          values.reduce((a, b) => a + b, 0) / values.length,
          Math.min(...values),
          Math.max(...values),
          values.length,
        ]),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** G2: B and H against the seam-offset distance D ("off" = no pattern). */
export function aestheticsCsv(rows: readonly RawRow[]): string {
  const lines = ['instance,variant,distance,runs,feasible,best,mean,std,meanH'];
  const e3 = rows.filter((r) => r.experiment === 'aesthetics');
  for (const [instance, list] of groupBy(e3, (r) => r.instance)) {
    for (const [variant, runs] of groupBy(list, (r) => r.variant)) {
      const s = stats(runs);
      const ok = runs.filter((r) => r.feasible);
      lines.push(
        csvLine([
          instance,
          variant,
          variant === 'Hoff' ? 'off' : variant.slice(1),
          s.runs,
          s.feasible,
          s.best,
          s.mean,
          s.std,
          ok.length > 0 ? ok.reduce((a, r) => a + r.H, 0) / ok.length : undefined,
        ]),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** G3: the value of cutting in advance. B-INST and SA-onsite are on-site; SA is precut. */
export function precutCsv(rows: readonly RawRow[]): string {
  const lines = ['instance,method,mean,best,feasible'];
  const main = rows.filter((r) => r.experiment === 'main');
  for (const [instance, list] of groupBy(main, (r) => r.instance)) {
    for (const m of ['b-inst', 'sa-onsite', 'sa'] as const) {
      const s = stats(list.filter((r) => r.method === m));
      if (s.runs === 0) continue;
      lines.push(csvLine([instance, m, s.mean, s.best, `${s.feasible}/${s.runs}`]));
    }
  }
  return `${lines.join('\n')}\n`;
}
