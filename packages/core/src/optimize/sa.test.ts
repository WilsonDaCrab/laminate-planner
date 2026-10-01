import { describe, expect, it } from 'vitest';
import { lowerBounds } from '../bounds/bounds';
import { evaluate } from '../evaluate/evaluate';
import { createReferenceEvaluator } from '../evaluate/evaluator';
import { rowConfigFromSettings } from '../layout/bands';
import { contains } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { plantedFiles } from '../layout/fixtures/planted';
import { goodY0 } from '../layout/y0';
import { parseProject } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext } from '../plan/context';
import { createRng } from '../rng/index';
import { validatePlan } from '../validate/index';
import { runBInst } from './baselines/sequentialRuns';
import { MOVE_KINDS } from './moves';
import { isSaResult, runSa } from './sa';
import { runMethod } from './run';

const load = (id: string) => {
  const file = [...instanceFiles, ...plantedFiles].find((f) => f.id === id)!;
  const project = parseProject(file.raw);
  const y0 = project.settings.rowOffset === 'auto' ? (goodY0(project) ?? 0) : 0;
  return {
    project,
    ctx: buildContext(project, { ...rowConfigFromSettings(project.settings), y0 }),
  };
};

const ITERS = 1200;

describe('runSa on instances/*', () => {
  for (const file of instanceFiles) {
    it(`${file.id}: valid, feasible-first, never worse than its B-INST start`, () => {
      const { project, ctx } = load(file.id);
      const start = evaluate(ctx, runBInst(ctx, 'precut').phi, { mode: 'precut' });
      const r = runSa(ctx, createRng(1), { iters: ITERS, mode: 'precut' });

      ctx.layout.segments.forEach((s, i) =>
        expect(contains(ctx.feasible[s.id]!.feasible, r.phi[i]!)).toBe(true),
      );
      const plan = buildPlan(ctx, r.phi, { mode: r.mode });
      const val = validatePlan(project, plan);
      expect(r.evaluation.B).toBe(plan.boards.length);
      expect(val.boards).toBe(plan.boards.length);
      expect(val.violations.filter((v) => v.code !== 'stagger')).toEqual([]);
      if (r.evaluation.V === 0) expect(val.violations).toEqual([]);
      expect(r.evaluation.B).toBeGreaterThanOrEqual(lowerBounds(ctx).lb);
      if (start.feasible) {
        expect(r.evaluation.feasible).toBe(true);
        expect(r.evaluation.B).toBeLessThanOrEqual(start.B);
      }
      expect(r.evals).toBeLessThanOrEqual(ITERS);
    });
  }
});

describe('runSa behaviour', () => {
  it('is deterministic for one seed (phases, statistics and trajectory)', () => {
    const { ctx } = load('R2');
    const run = (seed: number) => runSa(ctx, createRng(seed), { iters: ITERS });
    const a = run(5);
    const b = run(5);
    expect(a.phi).toEqual(b.phi);
    expect(a.stats).toEqual(b.stats);
    expect(a.curve).toEqual(b.curve);
    expect(run(6).stats).not.toEqual(a.stats);
  });

  it('calibrates T0 from the median uphill step: T0 scales with -1 / ln p0 for one seed', () => {
    const { ctx } = load('R2');
    const t0 = (p0: number) => runSa(ctx, createRng(3), { iters: 600, p0 }).stats.T0;
    const a = t0(0.8);
    const b = t0(0.2);
    expect(b / a).toBeCloseTo(Math.log(0.8) / Math.log(0.2), 6);
    // With the V-raising moves in the median T0 was ≈ 26 on R2; without them it is a board step.
    expect(a).toBeLessThan(10);
  });

  it('follows the same trajectory with the fast and the reference evaluator', () => {
    for (const id of ['R2', 'P1']) {
      const { ctx } = load(id);
      const iters = 600;
      const fast = runSa(ctx, createRng(9), { iters, mode: 'precut' });
      const reference = runSa(ctx, createRng(9), {
        iters,
        mode: 'precut',
        evaluator: createReferenceEvaluator(ctx, { mode: 'precut' }),
      });
      expect(fast.phi, id).toEqual(reference.phi);
      expect(fast.stats.byMove, id).toEqual(reference.stats.byMove);
      expect(fast.curve, id).toEqual(reference.curve);
    }
  });

  it('stops immediately when the start already meets the lower bound', () => {
    const { ctx } = load('R1'); // B-INST = LB = 49
    const r = runSa(ctx, createRng(1), { iters: ITERS, mode: 'onsite' });
    expect(r.provenOptimal).toBe(true);
    expect(r.evals).toBe(1);
    expect(r.method).toBe('sa-onsite');
  });

  it('records statistics that add up', () => {
    const { ctx } = load('R2');
    const r = runSa(ctx, createRng(2), { iters: ITERS, mode: 'precut' });
    const proposed = MOVE_KINDS.reduce((sum, k) => sum + r.stats.byMove[k].proposed, 0);
    expect(proposed).toBe(r.stats.iterations);
    for (const k of MOVE_KINDS) {
      const s = r.stats.byMove[k];
      expect(s.accepted).toBeLessThanOrEqual(s.proposed);
      expect(s.downhill).toBeLessThanOrEqual(s.accepted);
      expect(s.newBest).toBeLessThanOrEqual(s.accepted);
    }
    expect(r.stats.iterations + r.stats.calibrationEvals + 1).toBeLessThanOrEqual(r.evals);
    expect(r.stats.T0).toBeGreaterThanOrEqual(r.stats.Tend);
    expect(r.stats.acceptRate).toBeGreaterThan(0);
    expect(r.curve.length).toBeGreaterThan(2);
    // The best-so-far objective never increases along the trajectory.
    r.curve.reduce((prev, p) => {
      expect(p.best).toBeLessThanOrEqual(prev + 1e-9);
      return p.best;
    }, Infinity);
    expect(r.stats.evalsToBest).toBeLessThanOrEqual(r.evals);
  });

  it('honours a time limit through the injected clock', () => {
    const { ctx } = load('R2');
    let t = 0;
    const clock = () => (t += 400);
    const r = runSa(ctx, createRng(1), { timeMs: 2000, clock, mode: 'precut' });
    expect(r.evals).toBeGreaterThan(200);
    expect(r.stats.msToBest).toBeDefined();
    expect(r.evals).toBeLessThan(5000); // two clock reads per 256 evaluations, 400 ms each
    const again = { t: 0 };
    const clock2 = () => (again.t += 400);
    expect(runSa(ctx, createRng(1), { timeMs: 2000, clock: clock2, mode: 'precut' }).phi).toEqual(
      r.phi,
    );
  });

  it('rejects a time limit without a clock', () => {
    const { ctx } = load('R1');
    expect(() => runSa(ctx, createRng(1), { timeMs: 100 })).toThrow(/clock/);
  });

  it('reheats in time-limited runs too (progress without a new best, not an evaluation count)', () => {
    const { ctx } = load('R2');
    let t = 0;
    const clock = () => (t += 400);
    const r = runSa(ctx, createRng(1), { timeMs: 2000, clock, mode: 'precut' });
    expect(r.stats.reheats).toBeGreaterThan(0);
    const off = { t: 0 };
    const noReheat = runSa(ctx, createRng(1), {
      timeMs: 2000,
      clock: () => (off.t += 400),
      mode: 'precut',
      reheat: false,
    });
    expect(noReheat.stats.reheats).toBe(0);
  });

  it('uses the tuned defaults: p0 0.3, pEnd 1e-8, reheat on (ADR-027)', () => {
    const { ctx } = load('R2');
    const r = runSa(ctx, createRng(1), { iters: 1500, mode: 'precut' });
    expect(r.stats.Tend).toBeCloseTo(1 / Math.log(1e8), 12);
    expect(r.stats.reheats).toBeGreaterThanOrEqual(0);
    const hot = runSa(ctx, createRng(1), { iters: 1500, mode: 'precut', p0: 0.8 });
    expect(hot.stats.T0).toBeGreaterThan(r.stats.T0);
  });

  it('reheats without breaking the result invariants', () => {
    const { ctx } = load('R2');
    const r = runSa(ctx, createRng(3), { iters: ITERS, reheat: true, mode: 'precut' });
    expect(r.evals).toBeLessThanOrEqual(ITERS + r.stats.reheats);
    expect(r.evaluation.B).toBeGreaterThanOrEqual(lowerBounds(ctx).lb);
  });

  it('runMethod dispatches sa and sa-onsite', () => {
    const { project } = load('R1');
    const a = runMethod(project, 'sa', { seed: 1, budget: { iters: 300 } }).result;
    expect(isSaResult(a) && a.method === 'sa').toBe(true);
    const b = runMethod(project, 'sa-onsite', { seed: 1, budget: { iters: 300 } }).result;
    expect(b.method).toBe('sa-onsite');
    expect(b.mode).toBe('onsite');
  });
});
