/**
 * Storage of the raw rows: `results/raw/<experiment>.jsonl`, one JSON object per line, appended
 * as soon as a run finishes. A run that is interrupted can be resumed: finished keys are skipped.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, truncateSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { jobKey, type ExperimentId, type Job } from './protocol';
import type { RawRow } from './runJob';

export const rawPath = (dir: string, experiment: ExperimentId): string =>
  join(dir, 'raw', `${experiment}.jsonl`);

/** Drops an incomplete last line (a write cut short), so that the next append starts a new line. */
export function repairTail(file: string): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  if (text === '' || text.endsWith('\n')) return;
  truncateSync(file, Buffer.byteLength(text.slice(0, text.lastIndexOf('\n') + 1), 'utf8'));
}

/** All complete rows of a file; unreadable lines are ignored. */
export function readRows(file: string): RawRow[] {
  if (!existsSync(file)) return [];
  const rows: RawRow[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const row = JSON.parse(line) as RawRow;
      if (typeof row.key === 'string') rows.push(row);
    } catch {
      // a damaged line is treated as unfinished work
    }
  }
  return rows;
}

export function appendRow(file: string, row: RawRow): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(row)}\n`);
}

/** The jobs whose key is not yet in the file of their experiment, in the original order. */
export function pendingJobs(dir: string, jobs: readonly Job[]): Job[] {
  const done = new Map<ExperimentId, Set<string>>();
  const doneOf = (e: ExperimentId): Set<string> => {
    let s = done.get(e);
    if (!s) {
      const file = rawPath(dir, e);
      repairTail(file);
      s = new Set(readRows(file).map((r) => r.key));
      done.set(e, s);
    }
    return s;
  };
  return jobs.filter((j) => !doneOf(j.experiment).has(jobKey(j)));
}
