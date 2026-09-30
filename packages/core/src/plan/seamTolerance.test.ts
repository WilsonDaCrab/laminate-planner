/**
 * Regression (ADR-023): a seam within EPS of a wall is dropped, so the piece beside it can be
 * longer than L by up to EPS. SA reached such a phase on P1 (segment 6a, φ = 1276 − 1e-6, row length
 * 5131 = 4·1285 − 9); the on-site decoder then threw "piece P1-06-B does not fit on a board" by
 * 3·10⁻¹³ mm, which stopped the whole `bench all` run.
 */

import { describe, expect, it } from 'vitest';
import { createEvaluator } from '../evaluate/evaluator';
import { evaluate } from '../evaluate/evaluate';
import { rowConfigFromSettings } from '../layout/bands';
import { describePieces } from '../layout/pieces';
import { plantedFiles } from '../layout/fixtures/planted';
import { parseProject } from '../model/index';
import { validatePlan } from '../validate/index';
import { buildPlan } from './build';
import { buildContext } from './context';

const project = parseProject(plantedFiles.find((f) => f.id === 'P1')!.raw);
const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0: 0 });

// The phases SA held at the failing evaluation (segments 1a … 14a); segment 6a is 1276 − 1e-6.
const PHI = [
  0, 856.6666666666665, 428.33333333333326, 856.6666666666665, 344.33333333333303,
  1275.9999989999997, 428.33333333333303, 856.6666666666665, 478.33333333333303, 850.6666666666661,
  428.33333333333303, 786.6666666666661, 395.33333333333303, 850.6666666666661,
];

describe('a seam within EPS of the wall', () => {
  it('makes the last piece longer than L by about EPS (the premise of the regression)', () => {
    const seg = ctx.layout.segments[5]!;
    const pieces = describePieces(ctx.profiles[seg.id]!, ctx.L, PHI[5]!);
    const last = pieces[pieces.length - 1]!;
    expect(last.extent).toBeGreaterThan(ctx.L);
    expect(last.extent - ctx.L).toBeLessThan(2e-6);
  });

  for (const mode of ['precut', 'onsite'] as const) {
    it(`${mode}: decodes instead of throwing; evaluator, plan and validator count the same boards`, () => {
      const ev = evaluate(ctx, PHI, { mode });
      const plan = buildPlan(ctx, PHI, { mode });
      expect(plan.boards).toHaveLength(ev.B);
      const reference = createEvaluator(ctx, mode).evaluate(PHI);
      expect(reference.B).toBe(ev.B);
      const v = validatePlan(project, plan);
      expect(v.boards).toBe(ev.B);
      // the soft seam-offset rule ('stagger') may be violated by arbitrary phases
      expect(v.violations.filter((x) => x.code !== 'stagger')).toEqual([]);
    });
  }
});
