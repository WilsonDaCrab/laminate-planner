import { describe, expect, it } from 'vitest';
import { lowerBounds } from '../../bounds/bounds';
import { evaluate } from '../../evaluate/evaluate';
import { rowConfigFromSettings } from '../../layout/bands';
import { contains } from '../../layout/feasible';
import { instanceFiles } from '../../layout/fixtures/instances';
import { goodY0 } from '../../layout/y0';
import { parseProject } from '../../model/index';
import { buildPlan } from '../../plan/build';
import { buildContext } from '../../plan/context';
import { validatePlan } from '../../validate/index';
import { runBInst, runBNext } from './sequentialRuns';

describe('sequential baselines on instances/*', () => {
  for (const file of instanceFiles) {
    describe(file.id, () => {
      const project = parseProject(file.raw);
      const y0 = goodY0(project) ?? 0;
      const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
      const lb = lowerBounds(ctx).lb;
      const inst = runBInst(ctx);
      const next = runBNext(ctx);

      for (const [name, r] of [
        ['B-INST', inst],
        ['B-NEXT', next],
      ] as const) {
        it(`${name}: phases feasible, B agrees with plan and validator, B ≥ LB`, () => {
          ctx.layout.segments.forEach((s, i) => {
            expect(contains(ctx.feasible[s.id]!.feasible, r.phi[i]!)).toBe(true);
          });
          const plan = buildPlan(ctx, r.phi, { mode: 'onsite' });
          const val = validatePlan(project, plan);
          expect(r.evaluation.B).toBe(plan.boards.length);
          expect(val.boards).toBe(plan.boards.length);
          expect(val.violations.filter((v) => v.code !== 'stagger')).toEqual([]);
          if (r.evaluation.V === 0) expect(val.violations).toEqual([]);
          expect(r.evaluation.B).toBeGreaterThanOrEqual(lb);
        });
      }

      it('is deterministic', () => {
        expect(runBInst(ctx).phi).toEqual(inst.phi);
      });

      it('B-INST ≤ B-NEXT', () => {
        expect(inst.evaluation.B).toBeLessThanOrEqual(next.evaluation.B);
      });

      it('B-INST + precut is evaluated on the same phases', () => {
        const pre = runBInst(ctx, 'precut');
        expect(pre.phi).toEqual(inst.phi);
        expect(pre.evaluation.B).toBe(evaluate(ctx, inst.phi, { mode: 'precut' }).B);
      });
    });
  }
});
