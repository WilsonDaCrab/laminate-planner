import { describe, expect, it } from 'vitest';
import { ARC_TOL } from '../geometry/arcs';
import { CLIPPER_GRID_MM } from '../geometry/clip';
import { edgeGap } from '../model/defaults';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import type { PieceFeature, Plan } from '../model/plan';
import { parseProject } from '../model/index';
import { createRng } from '../rng/index';
import { buildPlan } from './build';
import { buildContext, type PlanContext } from './context';

function planOf(id: string): { ctx: PlanContext; plan: Plan } {
  const file = instanceFiles.find((f) => f.id === id)!;
  const ctx = buildContext(parseProject(file.raw));
  const rng = createRng(1);
  const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
  return { ctx, plan: buildPlan(ctx, phi) };
}

const featuresOf = <K extends PieceFeature['kind']>(plan: Plan, kind: K) =>
  plan.pieces.flatMap((p) =>
    p.features.filter((f): f is Extract<PieceFeature, { kind: K }> => f.kind === kind),
  );

describe('rectangles have no shape features', () => {
  for (const id of ['R1', 'R2']) {
    it(id, () => {
      expect(planOf(id).plan.pieces.flatMap((p) => p.features)).toEqual([]);
    });
  }
});

describe('L room: notches and the pipe drill', () => {
  const { ctx, plan } = planOf('L1');

  it('has notches with positive size', () => {
    const notches = featuresOf(plan, 'notch');
    expect(notches.length).toBeGreaterThan(0);
    for (const n of notches) {
      expect(n.dx).toBeGreaterThan(0);
      expect(n.dy).toBeGreaterThan(0);
    }
  });

  it('assigns the pipe to a piece as a drill with the pipe diameter, near the piece', () => {
    const pipe = ctx.room.obstacles.find((o) => o.kind === 'pipe')!;
    const drills = plan.pieces.flatMap((p) =>
      p.features.filter((f) => f.kind === 'drill').map((f) => ({ p, f })),
    );
    expect(drills.length).toBeGreaterThanOrEqual(1);
    for (const { p, f } of drills) {
      if (f.kind !== 'drill') continue;
      expect(f.diameter).toBe((pipe as { diameter: number }).diameter);
      // Piece-local coordinates: inside the piece's rectangle, or at most one radius outside.
      const r = f.diameter / 2;
      expect(f.x).toBeGreaterThanOrEqual(-r);
      expect(f.x).toBeLessThanOrEqual(p.boardRect.w + r);
      expect(f.y).toBeGreaterThanOrEqual(-r);
      expect(f.y).toBeLessThanOrEqual(p.boardRect.h + r);
    }
  });
});

describe('slanted rooms: bevels and scribes', () => {
  for (const id of ['S1', 'S2']) {
    it(`${id} has bevel cuts with different low/high lengths`, () => {
      const { plan } = planOf(id);
      const bevels = featuresOf(plan, 'bevelCut');
      expect(bevels.length).toBeGreaterThan(0);
      for (const b of bevels) expect(Math.abs(b.lengthLow - b.lengthHigh)).toBeGreaterThan(0);
    });
    it(`${id} has scribes with different widths at the ends`, () => {
      const scribes = featuresOf(planOf(id).plan, 'scribe');
      expect(scribes.length).toBeGreaterThan(0);
      for (const s of scribes) expect(s.widthAtLeft).not.toBe(s.widthAtRight);
    });
  }
});

describe('curved room C1: curve cuts follow the arc', () => {
  const { ctx, plan } = planOf('C1');
  const cuts = plan.pieces.flatMap((p) =>
    p.features.filter((f) => f.kind === 'curveCut').map((f) => ({ p, f })),
  );

  it('produces curve cuts (never on the left wall) with ordered ordinates ≤ 50 mm apart', () => {
    expect(cuts.length).toBeGreaterThan(0);
    for (const { f } of cuts) {
      if (f.kind !== 'curveCut') continue;
      // The arc bulges to the right; at its ends it turns horizontal, so bands there see a low/high edge.
      expect(['right', 'low', 'high']).toContain(f.side);
      expect(f.ordinates.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < f.ordinates.length; i++) {
        const step = f.ordinates[i]!.at - f.ordinates[i - 1]!.at;
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThanOrEqual(50 + 1e-6);
      }
      for (const o of f.ordinates) expect(o.offset).toBeGreaterThanOrEqual(-CLIPPER_GRID_MM);
    }
  });

  it('ordinates lie on the offset arc within ARC_TOL (full-width pieces)', () => {
    // Edge 1 is the arc; room frame equals the row frame (θ = 0, stack left).
    const room = ctx.room;
    const p0 = room.outline[1]!;
    const p1 = room.outline[2]!;
    const centre = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const radius =
      Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2 - edgeGap(room.edges[1]!, ctx.project.rules);
    let checked = 0;
    for (const { p, f } of cuts) {
      if (f.kind !== 'curveCut' || p.long !== 'both' || f.side !== 'right') continue;
      const segment = ctx.layout.segments.find((s) => s.id === p.segmentId)!;
      const xRight = Math.max(...p.outline.map((q) => q.x));
      for (const o of f.ordinates) {
        const x = xRight - o.offset;
        const y = segment.bandLo + o.at;
        const d = Math.hypot(x - centre.x, y - centre.y);
        expect(Math.abs(d - radius), `${p.id} at ${o.at}`).toBeLessThanOrEqual(2 * ARC_TOL);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
