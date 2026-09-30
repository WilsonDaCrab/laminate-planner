import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProject } from '@lp/core';
import { describe, expect, it } from 'vitest';
import {
  applyVariant,
  buildJobs,
  FULL_PRESET,
  jobKey,
  QUICK_PRESET,
  variantLabel,
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
const inst = (id: string): InstanceInfo => ({ id, group: 'rect', project });
const three = [inst('R2'), inst('L1'), inst('X9')];

describe('buildJobs', () => {
  const preset: Preset = {
    seeds: 3,
    iters: 100,
    aestheticsInstances: ['R2', 'L1', 'absent'],
    aestheticsDistances: [200, 300, null],
  };

  it('E1: per instance 2 deterministic runs + 4 stochastic methods x seeds', () => {
    const jobs = buildJobs(three, preset, ['main']);
    // by hand: 3 instances x (b-next 1 + b-inst 1 + rs, hc, sa, sa-onsite 3 seeds each = 12) = 42
    expect(jobs).toHaveLength(42);
    const r2 = jobs.filter((j) => j.instance === 'R2');
    expect(r2.filter((j) => j.method === 'b-inst')).toHaveLength(1);
    expect(r2.filter((j) => j.method === 'sa').map((j) => j.seed)).toEqual([1, 2, 3]);
    expect(jobs.every((j) => j.experiment === 'main' && j.variant === null)).toBe(true);
  });

  it('E3: SA only, instances of the preset that exist, every distance x seeds', () => {
    const jobs = buildJobs(three, preset, ['aesthetics']);
    // by hand: R2 and L1 (X9 is not in the preset, "absent" is not in the list) x 3 variants x 3 seeds
    expect(jobs).toHaveLength(18);
    expect(jobs.every((j) => j.method === 'sa' && j.variant !== null)).toBe(true);
    expect(new Set(jobs.map((j) => variantLabel(j.variant)))).toEqual(
      new Set(['D200', 'D300', 'Hoff']),
    );
  });

  it('keys are unique and change with the budget', () => {
    const jobs = buildJobs(three, preset);
    expect(new Set(jobs.map(jobKey)).size).toBe(jobs.length);
    const other = buildJobs(three, { ...preset, iters: 101 });
    expect(jobKey(other[0]!)).not.toBe(jobKey(jobs[0]!));
  });

  it('is deterministic, and the presets have the documented size', () => {
    expect(buildJobs(three, preset)).toEqual(buildJobs(three, preset));
    // quick: 2 instances x (2 + 4·2) = 20 main runs; R2 x 2 variants x 2 seeds = 4 E3 runs
    expect(buildJobs([inst('R2'), inst('L1'), inst('M')], QUICK_PRESET)).toHaveLength(24);
    // full: one instance = 2 + 4·20 = 82 main runs; R2 = 8 distances x 20 seeds = 160 E3 runs
    expect(buildJobs([inst('R2')], FULL_PRESET)).toHaveLength(82 + 160);
  });
});

describe('applyVariant', () => {
  it('sets the H-pattern in a copy and leaves the original alone', () => {
    const d = applyVariant(project, { hDistance: 350 });
    expect(d.rules.hPattern).toMatchObject({ enabled: true, distance: 350 });
    const off = applyVariant(project, { hDistance: null });
    expect(off.rules.hPattern.enabled).toBe(false);
    expect(project.rules.hPattern).toEqual({ enabled: true, distance: 100 });
    expect(applyVariant(project, null)).toBe(project);
  });
});
