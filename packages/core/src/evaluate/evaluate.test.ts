import { describe, expect, it } from 'vitest';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { parseProject } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext, type PlanContext } from '../plan/context';
import { createRng } from '../rng/index';
import { defaultWeights, evaluate, patternPenalty, seamViolation } from './evaluate';
import { fastPathApplies, seamPenalty, seamPenaltyFast } from './seams';

const project = (id: string) => parseProject(instanceFiles.find((f) => f.id === id)!.raw);

const randomPhi = (ctx: PlanContext, seed: number): number[] => {
  const rng = createRng(seed);
  return ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
};

describe('seamPenalty (general path)', () => {
  it('penalises close seams linearly and ignores far ones', () => {
    expect(seamPenalty([500], [600], 0, 1000, 300)).toBeCloseTo((300 - 100) / 300, 12);
    expect(seamPenalty([500], [800], 0, 1000, 300)).toBe(0); // exactly D apart is allowed
    expect(seamPenalty([500], [900], 0, 1000, 300)).toBe(0);
  });

  it('counts only seams inside the interval widened by D', () => {
    expect(seamPenalty([1400], [1450], 0, 1000, 300)).toBe(0); // beyond hi + D
    expect(seamPenalty([1250], [1300], 0, 1000, 300)).toBeGreaterThan(0);
  });

  it('sums over all conflicting pairs', () => {
    expect(seamPenalty([100, 1300], [150, 1250], 0, 2000, 300)).toBeCloseTo(2 * (250 / 300), 12);
  });
});

describe('fast path', () => {
  it('applies to one long interval only', () => {
    expect(fastPathApplies([[0, 1585]], 1285, 300)).toBe(true);
    expect(fastPathApplies([[0, 1584]], 1285, 300)).toBe(false);
    expect(
      fastPathApplies(
        [
          [0, 2000],
          [2500, 4000],
        ],
        1285,
        300,
      ),
    ).toBe(false);
  });

  it('is zero exactly when circDist ≥ D', () => {
    expect(seamPenaltyFast(3000, 1285, 100, 400, 300)).toBe(0);
    expect(seamPenaltyFast(3000, 1285, 100, 399, 300)).toBeGreaterThan(0);
    // circular: phases 10 and 1280 are 15 apart around the board length
    expect(seamPenaltyFast(3000, 1285, 10, 1280, 300)).toBeGreaterThan(0);
  });

  for (const id of ['R1', 'R2']) {
    it(`${id}: V = 0 under the fast and the general path agree on random phases`, () => {
      const ctx = buildContext(project(id));
      for (let seed = 1; seed <= 100; seed++) {
        const phi = randomPhi(ctx, seed);
        const fast = seamViolation(ctx, phi, true);
        const general = seamViolation(ctx, phi, false);
        expect(fast === 0, `seed ${seed}: fast ${fast}, general ${general}`).toBe(general === 0);
      }
    });
  }
});

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('evaluate on %s', (_id, raw) => {
  const ctx = buildContext(parseProject(raw));

  it('B equals the plan board count in both modes', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const phi = randomPhi(ctx, seed);
      for (const mode of ['precut', 'onsite'] as const) {
        expect(evaluate(ctx, phi, { mode }).B).toBe(buildPlan(ctx, phi, { mode }).stats.boards);
      }
    }
  });

  it('N stays in [0, 1] and ε·N never outweighs one board', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = evaluate(ctx, randomPhi(ctx, seed));
      expect(e.N).toBeGreaterThanOrEqual(0);
      expect(e.N).toBeLessThanOrEqual(1);
      expect(0.2 * e.N).toBeLessThan(1);
    }
  });

  it('f is the weighted sum and feasibility means V = 0 and no L_min shortfall', () => {
    const w = defaultWeights(ctx.project.rules, ctx.project.settings);
    for (let seed = 1; seed <= 10; seed++) {
      const e = evaluate(ctx, randomPhi(ctx, seed), { weights: w });
      expect(e.f).toBeCloseTo(e.B + w.lambdaV * e.V + w.lambdaH * e.H + w.epsilon * e.N, 9);
      expect(e.feasible).toBe(e.V === 0 && e.lengthDeficit <= 0);
    }
  });

  it('phases from F_s never break L_min', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(evaluate(ctx, randomPhi(ctx, seed)).lengthDeficit).toBe(0);
    }
  });
});

describe('V, H and the feasibility flag on a rectangle', () => {
  const ctx = buildContext(project('R1'));
  const n = ctx.layout.segments.length;

  it('equal phases in every row violate the stagger rule and the H pattern', () => {
    const phi = new Array<number>(n).fill(0);
    const e = evaluate(ctx, phi);
    expect(e.V).toBeGreaterThan(0);
    expect(e.H).toBeGreaterThan(0);
    expect(e.feasible).toBe(false);
  });

  it('a staircase of phases with steps ≥ D is stagger-valid', () => {
    const step = ctx.project.rules.minStagger;
    const phi = ctx.layout.segments.map((_, i) => (i * step) % ctx.L);
    // Consecutive rows differ by `step`, and step ≤ L/2, so their circular distance is `step` ≥ D.
    const { V } = evaluate(ctx, phi);
    expect(V).toBe(0);
  });

  it('H is zero when the pattern is switched off', () => {
    const p = project('R1');
    const off = buildContext({
      ...p,
      rules: { ...p.rules, hPattern: { ...p.rules.hPattern, enabled: false } },
    });
    expect(patternPenalty(off, new Array<number>(n).fill(0))).toBe(0);
  });
});
