import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject } from '@lp/core';
import { afterAll, describe, expect, it } from 'vitest';
import { appendRow, pendingJobs, rawPath, readRows, repairTail } from './raw';
import { buildJobs, jobKey, type InstanceInfo, type Job } from './protocol';
import { runJob } from './runJob';

const tmp = mkdtempSync(join(tmpdir(), 'lp-raw-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const R1: InstanceInfo = {
  id: 'R1',
  group: 'rect',
  hash: 'testhash',
  project: parseProject(
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../instances/rect/R1.json', import.meta.url)),
        'utf8',
      ),
    ),
  ),
};
const job = (over: Partial<Job> = {}): Job => ({
  experiment: 'main',
  instance: 'R1',
  method: 'sa',
  seed: 1,
  iters: 200,
  variant: null,
  instanceHash: 'testhash',
  ...over,
});

describe('runJob', () => {
  it('returns a consistent row: key, bounds, feasibility, SA trace', () => {
    const row = runJob(job(), R1);
    expect(row.key).toBe(jobKey(job()));
    expect(row).toMatchObject({ instance: 'R1', group: 'rect', method: 'sa', variant: '-' });
    expect(row.lb).toBe(Math.max(row.lb0, row.lb1));
    expect(row.B).toBeGreaterThanOrEqual(row.lb);
    expect(row.segments).toBe(21); // hand-computed in layout/instances.test.ts
    expect(row.feasible).toBe(true);
    expect(row.evals).toBeGreaterThan(0);
    expect(row.trace.length).toBeGreaterThan(0);
    // the first trace point that already has the final B
    expect(row.evalsToFinalB).toBe(row.trace.find((p) => p.B <= row.B)!.eval);
    expect(row.commit).toBeNull(); // stamped by runAll, not by runJob
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  it('is deterministic per seed apart from the wall time', () => {
    const a = runJob(job({ seed: 3 }), R1);
    const b = runJob(job({ seed: 3 }), R1);
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 });
  });

  it('keeps the trace for SA only and runs the deterministic methods', () => {
    expect(runJob(job({ method: 'hc' }), R1).trace).toEqual([]);
    const inst = runJob(job({ method: 'b-inst' }), R1);
    expect(inst.B).toBeGreaterThanOrEqual(inst.lb);
    expect(inst.trace).toEqual([]);
  });

  it('applies the H-pattern variant in the run', () => {
    const row = runJob(job({ experiment: 'aesthetics', variant: { hDistance: 400 } }), R1);
    expect(row.variant).toBe('D400');
    expect(row.key).toContain('aesthetics|R1|sa|D400');
  });
});

describe('raw rows', () => {
  it('appends, reads back, and resumes: finished keys are not pending', () => {
    const jobs = buildJobs(
      [R1],
      { seeds: 2, iters: 100, aestheticsInstances: [], aestheticsDistances: [] },
      ['main'],
    );
    expect(jobs).toHaveLength(10); // 2 + 4·2
    const file = rawPath(tmp, 'main');
    for (const j of jobs.slice(0, 4)) appendRow(file, runJob(j, R1));
    expect(readRows(file).map((r) => r.key)).toEqual(jobs.slice(0, 4).map(jobKey));
    expect(pendingJobs(tmp, jobs)).toEqual(jobs.slice(4));
  });

  it('repairs a write cut short: the damaged line is dropped, later rows stay readable', () => {
    const file = rawPath(tmp, 'aesthetics');
    appendRow(file, runJob(job({ experiment: 'aesthetics', variant: { hDistance: 300 } }), R1));
    appendFileSync(file, '{"key":"aesthetics|R1|sa|D2'); // no closing brace, no newline
    expect(readRows(file)).toHaveLength(1);
    repairTail(file);
    appendRow(file, runJob(job({ experiment: 'aesthetics', variant: { hDistance: 200 } }), R1));
    const keys = readRows(file).map((r) => r.variant);
    expect(keys).toEqual(['D300', 'D200']);
    expect(readFileSync(file, 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
  });
});
