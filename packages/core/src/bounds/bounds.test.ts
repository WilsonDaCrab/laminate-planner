import { describe, expect, it } from 'vitest';
import { shapesArea } from '../geometry/clip';
import { buildBands, rowConfigFromSettings } from '../layout/bands';
import { buildRoomZone } from '../layout/roomZone';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { createProject, parseProject } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext, type PlanContext } from '../plan/context';
import { decodeOnsite } from '../plan/onsite';
import { createRng } from '../rng/index';
import { loadAt, lowerBounds } from './bounds';

const project = (id: string) => parseProject(instanceFiles.find((f) => f.id === id)!.raw);

const randomPhi = (ctx: PlanContext, seed: number) => {
  const rng = createRng(seed);
  return ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
};

/** Rectangle formula of ALGORITHM §10 from the band structure alone. */
function rectangleFormula(ctx: PlanContext): number {
  const { segments } = ctx.layout;
  const height = (s: (typeof segments)[number]) => s.yHi - s.yLo;
  const len = (s: (typeof segments)[number]) => s.b - s.a;
  const first = segments.filter((s) => s.band === 1);
  const lastBand = Math.max(...segments.map((s) => s.band));
  const last = segments.filter((s) => s.band === lastBand);
  const isStrip = (s: (typeof segments)[number]) => height(s) < ctx.W - 1e-6;
  const G = first.filter(isStrip).reduce((n, s) => n + len(s), 0);
  const T = lastBand === 1 ? 0 : last.filter(isStrip).reduce((n, s) => n + len(s), 0);
  const F = segments.filter((s) => !isStrip(s)).reduce((n, s) => n + len(s), 0);
  const a = first.find(isStrip);
  const b = lastBand === 1 ? undefined : last.find(isStrip);
  const fits = (a ? height(a) : 0) + (b ? height(b) : 0) <= ctx.W;
  const total = fits ? F + Math.max(G, T) : F + G + T;
  return Math.ceil(total / ctx.L - 1e-6);
}

describe('LB0', () => {
  it('is the area bound ⌈area(Z) / (L·W)⌉', () => {
    const ctx = buildContext(project('R1'));
    const area = shapesArea(ctx.zone.shapes);
    expect(lowerBounds(ctx).lb0).toBe(Math.ceil(area / (ctx.L * ctx.W) - 1e-9));
  });
});

describe('LB1 on rectangles matches the closed formula', () => {
  for (const id of ['R1', 'R2']) {
    it(`${id} for many row offsets y0`, () => {
      const p = project(id);
      const base = rowConfigFromSettings(p.settings);
      for (const y0 of [0, 1, 17, 50, 96, 100, 150, 191]) {
        const ctx = buildContext(p, { ...base, y0 });
        expect(lowerBounds(ctx).lb1, `y0 = ${y0}`).toBe(rectangleFormula(ctx));
      }
    });
  }
});

describe('LB1 when the two edge strips meet exactly (kerf = 0, a + b = W)', () => {
  // Zone height 2900 − 2·10 = 2880 = 15 × 192, so a + b ≡ 0 (mod W) and a + b = W is possible.
  const p = createProject({
    rules: { kerf: 0 },
    rooms: [
      {
        id: 'r1',
        name: 'Touching strips',
        code: 'T',
        outline: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 2900 },
          { x: 0, y: 2900 },
        ],
        edges: [{ kind: 'wall' }, { kind: 'wall' }, { kind: 'wall' }, { kind: 'wall' }],
        obstacles: [],
      },
    ],
  });

  /** A row offset for which the first and the last strip widths add up to exactly W. */
  function touchingY0(): number {
    const W = p.product.boardWidth;
    const zone = buildRoomZone(p, p.rooms[0]!.id);
    const cfg = rowConfigFromSettings(p.settings);
    for (let y0 = 0; y0 < W; y0++) {
      const layout = buildBands(zone.shapes, { ...cfg, y0 }, W);
      const heights = layout.bands.map((b) => {
        const s = layout.segments.find((q) => q.band === b.j)!;
        return s.yHi - s.yLo;
      });
      const a = heights[0]!;
      const b = heights[heights.length - 1]!;
      if (a < W - 1e-6 && b < W - 1e-6 && Math.abs(a + b - W) < 1e-6) return y0;
    }
    throw new Error('no y0 with a + b = W');
  }

  it('does not count both strips at the shared level, and stays below B', () => {
    const y0 = touchingY0();
    const ctx = buildContext(p, { ...rowConfigFromSettings(p.settings), y0 });
    const lb = lowerBounds(ctx);
    // With a + b ≤ W a low and a high strip can share a board, so the closed formula applies.
    expect(lb.lb1).toBe(rectangleFormula(ctx));
    for (let seed = 1; seed <= 30; seed++) {
      const phi = randomPhi(ctx, seed);
      expect(lb.lb).toBeLessThanOrEqual(buildPlan(ctx, phi).stats.boards);
      expect(lb.lb).toBeLessThanOrEqual(decodeOnsite(ctx, phi).B);
    }
  });
});

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('bounds on %s', (id, raw) => {
  const ctx = buildContext(parseProject(raw));
  const lb = lowerBounds(ctx);

  it('yStar is at least as loaded as every level of a fine grid', () => {
    let gridMax = 0;
    for (let yb = 0; yb <= ctx.W; yb += 0.5) gridMax = Math.max(gridMax, loadAt(ctx, yb));
    expect(lb.maxLoad).toBeGreaterThanOrEqual(gridMax - 1e-6);
    // Rectilinear rooms: the load is piecewise constant, so the grid finds the same maximum.
    if (['R1', 'R2', 'L1', 'U1'].includes(id)) expect(lb.maxLoad).toBeCloseTo(gridMax, 6);
  });

  it('never exceeds the boards of any plan (precut and onsite, random phases)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const phi = randomPhi(ctx, seed);
      expect(lb.lb).toBeLessThanOrEqual(buildPlan(ctx, phi).stats.boards);
      expect(lb.lb).toBeLessThanOrEqual(decodeOnsite(ctx, phi).B);
    }
  });

  it('is reported in the plan statistics', () => {
    const plan = buildPlan(ctx, randomPhi(ctx, 1));
    expect(plan.stats.lb0).toBe(lb.lb0);
    expect(plan.stats.lb1).toBe(lb.lb1);
    expect(plan.stats.provenOptimal).toBe(plan.stats.boards === lb.lb);
  });
});
