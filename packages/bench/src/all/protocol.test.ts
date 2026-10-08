import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProject } from '@lp/core';
import { describe, expect, it } from 'vitest';
import {
  buildJobs,
  FULL_PRESET,
  jobKey,
  QUICK_PRESET,
  type InstanceInfo,
  type Preset,
} from './protocol';

const project = parseProject(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../instances/rect/R2.json', import.meta.url)),
      'utf8',
    ),
  ),
);
const inst = (id: string): InstanceInfo => ({ id, group: 'rect', project, hash: `h-${id}` });
const three = [inst('R2'), inst('L1'), inst('X9')];

describe('buildJobs', () => {
  const preset: Preset = { seeds: 3, iters: 100 };

  it('per instance 2 deterministic runs + 3 stochastic methods x seeds', () => {
    const jobs = buildJobs(three, preset);
    // by hand: 3 instances x (b-next 1 + b-inst 1 + hc, sa, sa-onsite 3 seeds each = 9) = 33
    expect(jobs).toHaveLength(33);
    const r2 = jobs.filter((j) => j.instance === 'R2');
    expect(r2.filter((j) => j.method === 'b-inst')).toHaveLength(1);
    expect(r2.filter((j) => j.method === 'sa').map((j) => j.seed)).toEqual([1, 2, 3]);
    expect(new Set(r2.map((j) => j.method))).toEqual(
      new Set(['b-next', 'b-inst', 'hc', 'sa', 'sa-onsite']),
    );
  });

  it('the key changes with the content of the instance (an edited room is new work)', () => {
    const a = buildJobs([inst('R2')], preset)[0]!;
    const b = buildJobs([{ ...inst('R2'), hash: 'other' }], preset)[0]!;
    expect(jobKey(a)).not.toBe(jobKey(b));
  });

  it('keys are unique and change with the budget', () => {
    const jobs = buildJobs(three, preset);
    expect(new Set(jobs.map(jobKey)).size).toBe(jobs.length);
    const other = buildJobs(three, { ...preset, iters: 101 });
    expect(jobKey(other[0]!)).not.toBe(jobKey(jobs[0]!));
  });

  it('is deterministic, and the presets have the documented size', () => {
    expect(buildJobs(three, preset)).toEqual(buildJobs(three, preset));
    // quick: 2 instances x (2 + 3·2) = 16 runs
    expect(buildJobs([inst('R2'), inst('L1'), inst('M')], QUICK_PRESET)).toHaveLength(16);
    // full: one instance = 2 + 3·20 = 62 runs
    expect(buildJobs([inst('R2')], FULL_PRESET)).toHaveLength(62);
  });
});
