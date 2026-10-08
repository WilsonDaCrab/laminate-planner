/**
 * Aggregation of the raw rows into the tables of ALGORITHM §13.3. Pure: rows in, CSV text out.
 *
 * - `summary.csv`      main table, one line per instance
 *
 * Means and deviations are taken over the runs that ended feasible (as in `bench compare`); the
 * share of feasible runs is always reported beside them, so a mean never hides failures.
 * The deviation is the sample deviation (n − 1; 0 for one run).
 */

import type { Method } from '@lp/core';
import { METHODS } from './protocol';
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

/** `meta` of an instance as it is now (not as it was when a row was written). */
export interface KnownValues {
  knownOptimum?: number | null;
  bestKnown?: number | null;
}

/**
 * Main table: one line per instance, in the order the instances first appear in the rows.
 * `knownOptimum` and `bestKnown` come from `known` (the current instance files), because
 * `bestknown` may rewrite them while a long run is going on.
 */
export function mainTableCsv(
  rows: readonly RawRow[],
  known: ReadonlyMap<string, KnownValues> = new Map(),
): string {
  const head = [
    'instance',
    'group',
    'zoneM2',
    'segments',
    'lb',
    'knownOptimum',
    'bestKnown',
    ...METHODS.flatMap((m) =>
      ['best', 'mean', 'std', 'ms', 'feasible'].map((c) => `${methodKey(m)}_${c}`),
    ),
  ];
  const lines = [head.join(',')];
  for (const [instance, list] of groupBy(rows, (r) => r.instance)) {
    const first = list[0]!;
    const cells: (number | string | null | undefined)[] = [
      instance,
      first.group,
      first.zoneM2,
      first.segments,
      first.lb,
      known.get(instance)?.knownOptimum,
      known.get(instance)?.bestKnown,
    ];
    for (const m of METHODS) {
      const s = stats(list.filter((r) => r.method === m));
      cells.push(s.best, s.mean, s.std, s.meanMs, s.runs > 0 ? `${s.feasible}/${s.runs}` : '');
    }
    lines.push(csvLine(cells));
  }
  return `${lines.join('\n')}\n`;
}
