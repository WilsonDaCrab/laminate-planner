import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lowerBounds } from '../bounds/bounds';
import { evaluate } from '../evaluate/evaluate';
import { contains } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { parseProject } from '../model/index';
import { buildPlan } from '../plan/build';
import { createRng } from '../rng/index';
import { validatePlan } from '../validate/index';
import { runBInst } from './baselines/sequentialRuns';
import { runHillClimb } from './baselines/hc';
import { better, Budget } from './incumbent';
import { resetPhase, shiftPhase } from './moves';
import { runMethod } from './run';
import type { Method } from './types';

const methods: Method[] = ['b-next', 'b-inst', 'rs', 'hc'];
const ITERS = 300;

describe('baselines on instances/*', () => {
  for (const file of instanceFiles) {
    describe(file.id, () => {
      const project = parseProject(file.raw);

      for (const method of methods) {
        it(`${method}: valid plan, B agrees with plan and validator, B ≥ LB, φ ∈ F`, () => {
          const { ctx, result } = runMethod(project, method, { seed: 1, budget: { iters: ITERS } });
          const mode = result.mode;
          const plan = buildPlan(ctx, result.phi, { mode });
          const val = validatePlan(project, plan);
          expect(result.evaluation.B).toBe(plan.boards.length);
          expect(val.boards).toBe(plan.boards.length);
          expect(val.violations.filter((v) => v.code !== 'stagger')).toEqual([]);
          if (result.evaluation.V === 0) expect(val.violations).toEqual([]);
          expect(result.evaluation.B).toBeGreaterThanOrEqual(lowerBounds(ctx).lb);
          ctx.layout.segments.forEach((s, i) =>
            expect(contains(ctx.feasible[s.id]!.feasible, result.phi[i]!)).toBe(true),
          );
          expect(result.evals).toBeLessThanOrEqual(Math.max(ITERS, 1));
        });
      }

      it('rs and hc are deterministic for one seed; rs differs between seeds', () => {
        for (const m of ['rs', 'hc'] as const) {
          const run = (seed: number) =>
            runMethod(project, m, { seed, budget: { iters: 60 } }).result.phi;
          expect(run(3)).toEqual(run(3));
          // HC starts from B-INST and may legitimately return it unchanged for any seed.
          if (m === 'rs') expect(run(3)).not.toEqual(run(4));
        }
      });

      it('hc is never worse than its B-INST start (same decoder)', () => {
        const { ctx } = runMethod(project, 'b-inst');
        const start = runBInst(ctx).phi;
        const hc = runHillClimb(ctx, createRng(1), { iters: 100 }, { start });
        const before = evaluate(ctx, start, { mode: hc.mode });
        expect(better(before, hc.evaluation)).toBe(false);
      });
    });
  }
});

describe('run budget', () => {
  it('rejects a time limit without a clock', () => {
    expect(() => new Budget({ timeMs: 100 }, 10)).toThrow(/clock/);
    const project = parseProject(instanceFiles[0]!.raw);
    expect(() => runMethod(project, 'rs', { budget: { timeMs: 100 } })).toThrow(/clock/);
  });

  const project = parseProject(instanceFiles[0]!.raw);

  it('honours the evaluation budget exactly when the bound is not reached', () => {
    const r = runMethod(project, 'rs', { seed: 2, budget: { iters: 25 } }).result;
    expect(r.evals).toBeLessThanOrEqual(25);
    expect(r.evals).toBeGreaterThan(0);
  });

  it('stops on the injected clock', () => {
    let t = 0;
    const clock = () => (t += 100);
    const r = runMethod(project, 'rs', { seed: 2, budget: { timeMs: 250, clock } }).result;
    // Clock reads: start 100; at 0 evals 200 (elapsed 100); at 256 → 300 (200); at 512 → 400 (300 ≥ 250).
    expect(r.evals).toBe(512);
  });
});

describe('moves keep φ in F_s', () => {
  const project = parseProject(instanceFiles[3]!.raw); // U1: several segment shapes
  const { ctx } = runMethod(project, 'b-inst');

  it('reset and shift stay feasible (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.double({ min: 0, max: 3000, noNaN: true }),
        (seed, delta) => {
          const rng = createRng(seed);
          const s = ctx.layout.segments[seed % ctx.layout.segments.length]!;
          const F = ctx.feasible[s.id]!.feasible;
          const a = resetPhase(F, rng);
          const b = shiftPhase(F, a, delta, rng);
          return contains(F, a) && contains(F, b) && b >= 0 && b < ctx.L + 1e-9;
        },
      ),
      { numRuns: 200 },
    );
  });
});
