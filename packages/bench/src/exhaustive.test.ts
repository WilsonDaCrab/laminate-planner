import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildContext,
  buildPlan,
  contains,
  createEvaluator,
  better,
  lowerBounds,
  parseProject,
  PhaseSpace,
  resolveY0,
  rowConfigFromSettings,
  runMethod,
  validatePlan,
  type PlanContext,
  type Project,
} from '@lp/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runExhaustive, segmentGrid } from './exhaustive';

const root = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const base = parseProject(JSON.parse(readFileSync(root('instances/rect/R1.json'), 'utf8')));

/** A rectangular room `w × h` mm on the R1 rules (L = 1285, W = 192). */
const room = (w: number, h: number): Project => ({
  ...base,
  rooms: [
    {
      ...base.rooms[0]!,
      outline: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
    },
  ],
});

/** The context `runMethod` would build, so that all methods work on the same segments. */
const contextOf = (project: Project): PlanContext =>
  buildContext(project, { ...rowConfigFromSettings(project.settings), y0: resolveY0(project) });

describe('segmentGrid', () => {
  const ctx = contextOf(room(3100, 404));
  const space = new PhaseSpace(ctx);

  it('holds only feasible, sorted, distinct phases inside [0, L)', () => {
    for (const step of [1, 7, 20]) {
      segmentGrid(space, step).forEach((g, i) => {
        expect(g.length).toBeGreaterThan(0);
        for (const v of g) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(space.L);
          expect(contains(space.feasible[i]!, v)).toBe(true);
        }
        expect([...g].sort((p, q) => p - q)).toEqual(g);
        expect(new Set(g).size).toBe(g.length);
      });
    }
  });

  it('keeps rectangular start pieces whole millimetres and includes the ends of F_s', () => {
    segmentGrid(space, 20).forEach((g, i) => {
      for (const v of g)
        expect(Math.abs(v - space.a[i]! - Math.round(v - space.a[i]!))).toBeLessThan(1e-9);
      for (const [lo, hi] of space.feasible[i]!.intervals) {
        expect(g).toContain(space.place(i, lo) % space.L);
        expect(g).toContain(space.place(i, hi) % space.L);
      }
    });
  });

  it('rejects a non-positive step', () => {
    expect(() => segmentGrid(space, 0)).toThrow(/step/);
  });
});

describe('runExhaustive', () => {
  const project = room(3100, 404);
  const ctx = contextOf(project);

  it('step 1 is a full whole-mm enumeration: LB ≤ B ≤ HC and SA, and the plan validates', () => {
    expect(ctx.layout.segments).toHaveLength(2);
    const r = runExhaustive(ctx, { step: 1 });
    const total = r.gridSizes.reduce((p, n) => p * n, 1);
    expect(r.evals).toBe(total);
    expect(r.evaluation.feasible).toBe(true);
    expect(r.evaluation.B).toBeGreaterThanOrEqual(r.lb);
    expect(r.lb).toBe(lowerBounds(ctx).lb);
    expect(r.provenOptimal).toBe(r.evaluation.B === r.lb);
    expect(r.ties).toBeGreaterThanOrEqual(1);
    for (const method of ['hc', 'sa'] as const) {
      const b = runMethod(project, method, { seed: 1, budget: { iters: 5000 } }).result.evaluation;
      expect(r.evaluation.B).toBeLessThanOrEqual(b.B);
    }
    // Rule 5: evaluator, plan and validator agree on the number of boards.
    const plan = buildPlan(ctx, r.phi, { mode: r.mode });
    expect(plan.boards).toHaveLength(r.evaluation.B);
    expect(validatePlan(project, plan).boards).toBe(r.evaluation.B);
  });

  it('no grid point beats the reported best', () => {
    const r = runExhaustive(ctx, { step: 20 });
    const grid = segmentGrid(new PhaseSpace(ctx), 20);
    const evaluator = createEvaluator(ctx, 'precut');
    fc.assert(
      fc.property(fc.tuple(...grid.map((g) => fc.nat(g.length - 1))), (pick) => {
        const ev = evaluator.evaluate(pick.map((k, i) => grid[i]![k]!));
        return !better(ev, r.evaluation);
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic', () => {
    const a = runExhaustive(ctx, { step: 20 });
    const b = runExhaustive(ctx, { step: 20 });
    expect(b).toEqual(a);
  });

  it('refuses a grid larger than maxEvals', () => {
    expect(() => runExhaustive(ctx, { step: 1, maxEvals: 1000 })).toThrow(/larger --step/);
  });

  it('a proven result agrees with the lower bound', () => {
    const easy = room(3100, 200);
    const easyCtx = contextOf(easy);
    const r = runExhaustive(easyCtx, { step: 5 });
    expect(r.provenOptimal).toBe(r.evaluation.feasible && r.evaluation.B === r.lb);
  });
});
