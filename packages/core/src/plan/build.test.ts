import { describe, expect, it } from 'vitest';
import { CLIPPER_GRID_MM, shapeArea } from '../geometry/clip';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { parseProject } from '../model/index';
import { createRng } from '../rng/index';
import { buildPlan } from './build';
import { buildContext } from './context';

// Exact shapes come from Clipper (0.01 mm grid, ADR-011) while board rectangles use exact seams.
const TOL = CLIPPER_GRID_MM;

function randomPhi(ctx: ReturnType<typeof buildContext>, seed: number): number[] {
  const rng = createRng(seed);
  return ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
}

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('buildPlan on %s', (_id, raw) => {
  const project = parseProject(raw);
  const ctx = buildContext(project);

  it('covers the zone: the piece areas add up to the segment areas', () => {
    const plan = buildPlan(ctx, randomPhi(ctx, 1));
    const piecesArea = plan.pieces.reduce(
      (sum, p) => sum + p.parts.reduce((a, part) => a + areaOfRing(part.outline, part.holes), 0),
      0,
    );
    const segmentsArea = ctx.layout.segments.reduce((sum, s) => sum + shapeArea(s.shape), 0);
    // Clipper grid noise only: relative error stays far below 1e-4.
    expect(Math.abs(piecesArea - segmentsArea) / segmentsArea).toBeLessThan(1e-4);
  });

  it('places every piece inside its board rectangle', () => {
    const plan = buildPlan(ctx, randomPhi(ctx, 2));
    const L = ctx.L;
    const W = ctx.W;
    for (const p of plan.pieces) {
      expect(p.parts.length, p.id).toBeGreaterThan(0);
      const r = p.boardRect;
      expect(r.x).toBeGreaterThanOrEqual(-TOL);
      expect(r.y).toBeGreaterThanOrEqual(-TOL);
      expect(r.x + r.w).toBeLessThanOrEqual(L + TOL);
      expect(r.y + r.h).toBeLessThanOrEqual(W + TOL);
      for (const part of p.parts) {
        for (const q of part.boardOutline) {
          expect(q.x, p.id).toBeGreaterThanOrEqual(r.x - TOL);
          expect(q.x, p.id).toBeLessThanOrEqual(r.x + r.w + TOL);
          expect(q.y, p.id).toBeGreaterThanOrEqual(r.y - TOL);
          expect(q.y, p.id).toBeLessThanOrEqual(r.y + r.h + TOL);
        }
      }
    }
  });

  it('is consistent: ids unique, board count matches, statistics sane', () => {
    const plan = buildPlan(ctx, randomPhi(ctx, 3));
    expect(new Set(plan.pieces.map((p) => p.id)).size).toBe(plan.pieces.length);
    expect(plan.stats.boards).toBe(plan.boards.length);
    expect(plan.boards.reduce((n, b) => n + b.placements.length, 0)).toBe(plan.pieces.length);
    expect(plan.stats.wastePct).toBeGreaterThanOrEqual(0);
    expect(plan.stats.wastePct).toBeLessThan(100);
    expect(plan.stats.packs * project.product.boardsPerPack).toBeGreaterThanOrEqual(
      plan.stats.boards,
    );
  });

  it('is deterministic for the same phases', () => {
    const phi = randomPhi(ctx, 4);
    expect(JSON.stringify(buildPlan(ctx, phi))).toBe(JSON.stringify(buildPlan(ctx, phi)));
  });
});

describe('buildPlan input checks', () => {
  it('rejects a phase vector of the wrong length', () => {
    const ctx = buildContext(parseProject(instanceFiles[0]!.raw));
    expect(() => buildPlan(ctx, [])).toThrow(RangeError);
  });
});

/** Shoelace area of a ring minus its holes (room coordinates; sign-insensitive). */
function areaOfRing(ring: readonly { x: number; y: number }[], holes: readonly (typeof ring)[]) {
  const a = (r: typeof ring): number => {
    let s = 0;
    r.forEach((p, i) => {
      const q = r[(i + 1) % r.length]!;
      s += p.x * q.y - q.x * p.y;
    });
    return Math.abs(s) / 2;
  };
  return a(ring) - holes.reduce((n, h) => n + a(h), 0);
}
