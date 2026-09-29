import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildContext,
  buildPlan,
  evaluate,
  lowerBounds,
  parseProject,
  rowConfigFromSettings,
  saveProject,
  validatePlan,
} from '@lp/core';
import { describe, expect, it } from 'vitest';
import { generatePlanted, generatePlantedInstance, PLANTED_PRESETS } from './planted';

const root = (rel: string): string => fileURLToPath(new URL(`../../../../${rel}`, import.meta.url));
const base = parseProject(JSON.parse(readFileSync(root('instances/rect/R1.json'), 'utf8')));

describe('planted generator', () => {
  for (const [n, seed] of [
    [6, 1],
    [10, 2],
    [14, 3],
    [22, 4],
  ] as const) {
    it(`n=${n} seed=${seed}: B* = LB1 = knownOptimum, plan valid`, () => {
      const { project, phi } = generatePlantedInstance(base, { n, m: 3, seed });
      const optimum = project.meta!.knownOptimum!;
      const ctx = buildContext(project, rowConfigFromSettings(project.settings));
      expect(ctx.layout.segments).toHaveLength(n);
      expect(lowerBounds(ctx).lb).toBe(optimum);
      // The construction's phases reach the optimum with a valid plan (B* = LB1: proven optimal).
      const ev = evaluate(ctx, phi, { mode: 'precut' });
      expect(ev).toMatchObject({ B: optimum, V: 0, feasible: true });
      const plan = buildPlan(ctx, phi, { mode: 'precut' });
      expect(plan.boards).toHaveLength(optimum);
      expect(validatePlan(project, plan)).toEqual({ boards: optimum, violations: [] });
      expect(project.meta!.source).toBe('planted');
      expect(project.settings).toMatchObject({ angleDeg: 0, stackSide: 'left', rowOffset: 0 });
    });
  }

  it('is deterministic and its output survives a save/load round trip', () => {
    const p = { n: 10, m: 2, seed: 7 };
    const a = generatePlanted(base, p);
    expect(saveProject(a)).toBe(saveProject(generatePlanted(base, p)));
    expect(saveProject(parseProject(JSON.parse(saveProject(a))))).toBe(saveProject(a));
    expect(saveProject(a)).not.toBe(saveProject(generatePlanted(base, { ...p, seed: 8 })));
  });

  it('rejects impossible parameters', () => {
    expect(() => generatePlanted(base, { n: 8, m: 3, seed: 1 })).toThrow(/multiple of 4/);
    expect(() => generatePlanted(base, { n: 6, m: 0, seed: 1 })).toThrow(/m must/);
    expect(() => generatePlanted(base, { n: 502, m: 3, seed: 1 })).toThrow(/n·k/);
  });

  for (const [id, params] of Object.entries(PLANTED_PRESETS)) {
    it(`instances/planted/${id}.json is what the preset generates`, () => {
      const file = readFileSync(root(`instances/planted/${id}.json`), 'utf8');
      const generated = generatePlanted(base, { ...params, name: id });
      expect(file.trim()).toBe(saveProject(generated).trim());
      const project = parseProject(JSON.parse(file));
      const ctx = buildContext(project, rowConfigFromSettings(project.settings));
      expect(lowerBounds(ctx).lb).toBe(project.meta!.knownOptimum);
      // The optimum is reachable: the decoder finds it for the construction's phases (checked at
      // generation time); here the plan of the trivial phases must merely stay consistent.
      const phi = ctx.layout.segments.map(() => 0);
      expect(evaluate(ctx, phi).B).toBe(buildPlan(ctx, phi).boards.length);
    });
  }
});
