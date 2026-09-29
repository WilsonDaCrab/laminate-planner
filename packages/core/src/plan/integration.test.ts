/**
 * F3 acceptance properties (ROADMAP): the evaluator, the plan constructor and the independent
 * validator agree on the board count; the validator reports nothing but seam offsets; V = 0 exactly
 * when the validator sees no seam-offset violation; and the lower bound never exceeds B.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lowerBounds } from '../bounds/bounds';
import { evaluate, seamViolation } from '../evaluate/evaluate';
import { rowConfigFromSettings } from '../layout/bands';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { goodY0 } from '../layout/fixtures/rows';
import { createProject, parseProject, type Project } from '../model/index';
import { createRng } from '../rng/index';
import { validatePlan } from '../validate/index';
import { buildPlan } from './build';
import { buildContext, type PlanContext } from './context';
import type { DecodeMode } from './run';

const randomPhi = (ctx: PlanContext, seed: number): number[] => {
  const rng = createRng(seed);
  return ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
};

/** Random phases improved by resampling single rows until neighbouring rows are staggered. */
function staggeredPhi(ctx: PlanContext, seed: number): number[] {
  const rng = createRng(seed);
  const phi = randomPhi(ctx, seed);
  let v = seamViolation(ctx, phi);
  for (let i = 0; i < 600 && v > 0; i++) {
    const s = rng.int(0, phi.length - 1);
    const old = phi[s]!;
    phi[s] = sample(ctx.feasible[ctx.layout.segments[s]!.id]!.feasible, rng);
    const v2 = seamViolation(ctx, phi);
    if (v2 <= v) v = v2;
    else phi[s] = old;
  }
  return phi;
}

/** All four agreements for one plan; returns whether the validator saw a stagger violation. */
function checkAgreement(
  project: Project,
  ctx: PlanContext,
  phi: number[],
  mode: DecodeMode,
  label: string,
): { stagger: boolean; v: number } {
  const plan = buildPlan(ctx, phi, { mode });
  const ev = evaluate(ctx, phi, { mode });
  const val = validatePlan(project, plan);

  expect(ev.B, label).toBe(plan.stats.boards);
  expect(plan.stats.boards, label).toBe(plan.boards.length);
  expect(val.boards, label).toBe(plan.boards.length);

  const others = val.violations.filter((x) => x.code !== 'stagger');
  expect(others, label).toEqual([]);

  const lb = lowerBounds(ctx);
  expect(Math.max(lb.lb0, lb.lb1), label).toBeLessThanOrEqual(plan.stats.boards);

  const stagger = val.violations.some((x) => x.code === 'stagger');
  expect(stagger, `${label}: V = ${ev.V}`).toBe(ev.V > 0);
  return { stagger, v: ev.V };
}

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))(
  'F3 properties on %s',
  (id, raw) => {
    const project = parseProject(raw);
    const y0 = goodY0(project)!;
    const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });

    for (const mode of ['precut', 'onsite'] as const) {
      it(`${mode}: random phases agree (B, violations, LB)`, () => {
        for (let seed = 1; seed <= 12; seed++) {
          checkAgreement(project, ctx, randomPhi(ctx, seed), mode, `${id} ${mode} seed ${seed}`);
        }
      });

      it(`${mode}: staggered phases give V = 0 and no validator stagger violation`, () => {
        let valid = 0;
        for (let seed = 1; seed <= 6; seed++) {
          const r = checkAgreement(
            project,
            ctx,
            staggeredPhi(ctx, seed),
            mode,
            `${id} ${mode} staggered ${seed}`,
          );
          if (r.v === 0) valid++;
        }
        // The property is only meaningful if the search actually reached V = 0.
        expect(valid).toBeGreaterThan(0);
      });
    }
  },
);

/** Random rectilinear "histogram" rooms: bars of random width and height on a common baseline. */
const histogramRoom = fc
  .array(
    fc.record({
      w: fc.integer({ min: 600, max: 1800 }),
      h: fc.integer({ min: 1200, max: 2600 }),
    }),
    { minLength: 1, maxLength: 4 },
  )
  .map((bars) => {
    const heights: number[] = [];
    for (const b of bars) heights.push(heights.at(-1) === b.h ? b.h + 50 : b.h);
    const total = bars.reduce((s, b) => s + b.w, 0);
    const pts = [
      { x: 0, y: 0 },
      { x: total, y: 0 },
    ];
    let right = total;
    for (let i = bars.length - 1; i >= 0; i--) {
      pts.push({ x: right, y: heights[i]! }, { x: (right -= bars[i]!.w), y: heights[i]! });
    }
    // Drop collinear vertices.
    return pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
    });
  });

describe('F3 properties on random rectilinear rooms', () => {
  it('B agrees three ways, only seam offsets may be violated, LB ≤ B, V = 0 ⇔ no stagger violation', () => {
    fc.assert(
      fc.property(histogramRoom, fc.integer({ min: 1, max: 1000 }), (outline, seed) => {
        const project = createProject({
          rooms: [
            {
              id: 'r1',
              name: 'Random',
              code: 'RR',
              outline,
              edges: outline.map(() => ({ kind: 'wall' as const })),
              obstacles: [],
            },
          ],
        });
        const y0 = goodY0(project);
        if (y0 === undefined) return; // no row offset keeps every strip ≥ w_min
        const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
        if (ctx.layout.segments.length === 0) return;
        checkAgreement(project, ctx, randomPhi(ctx, seed), 'precut', `room seed ${seed}`);
        checkAgreement(
          project,
          ctx,
          staggeredPhi(ctx, seed),
          'precut',
          `room seed ${seed} staggered`,
        );
      }),
      { numRuns: 25 },
    );
  });
});
