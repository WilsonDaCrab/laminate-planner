import { describe, expect, it } from 'vitest';
import { degToRad, roomToRow, transformShape } from '../geometry/frames';
import { buildBands } from '../layout/bands';
import { instanceFiles } from '../layout/fixtures/instances';
import { buildRoomZone } from '../layout/roomZone';
import { validY0s, y0Violations } from '../layout/y0';
import { parseProject, type Project } from '../model/index';
import { buildPlan } from '../plan/build';
import { validatePlan } from '../validate/index';
import { candidateConfigs, pickY0, runOuter, wallDirections } from './outer';

const load = (id: string): Project => parseProject(instanceFiles.find((f) => f.id === id)!.raw);
const withSettings = (project: Project, settings: Partial<Project['settings']>): Project => ({
  ...project,
  settings: { ...project.settings, ...settings },
});

/** The scan the analytic filter replaces: build the bands for every y0 and look at the ring edges. */
function bruteForceValid(project: Project, theta: number, stackSide: 'left' | 'right'): number[] {
  const W = project.product.boardWidth;
  const wMin = project.rules.minRipWidth;
  const zone = buildRoomZone(project, project.rooms[0]!.id);
  const out: number[] = [];
  for (let y0 = 0; y0 < W; y0++) {
    const layout = buildBands(zone.shapes, { theta, stackSide, y0 }, W);
    const ok = layout.segments.every((s) =>
      [s.shape.outer, ...s.shape.holes].every((ring) =>
        ring.every((a, k) => {
          const b = ring[(k + 1) % ring.length]!;
          if (Math.abs(a.y - b.y) > 1e-6) return true;
          const r = (((a.y - layout.cfg.y0) % W) + W) % W;
          return r < 0.02 || W - r < 0.02 || (r >= wMin && W - r >= wMin);
        }),
      ),
    );
    if (ok) out.push(y0);
  }
  return out;
}

describe('y0 filter', () => {
  for (const [id, deg, side] of [
    ['R1', 0, 'left'],
    ['L1', 0, 'right'],
    ['U1', 90, 'left'],
    ['S1', 0, 'left'],
    ['C2', 180, 'right'],
  ] as const) {
    it(`${id} at ${deg}° (${side}): the analytic filter equals scanning the bands`, () => {
      const project = load(id);
      const theta = degToRad(deg);
      expect(validY0s(project, { theta, stackSide: side })).toEqual(
        bruteForceValid(project, theta, side),
      );
    });
  }

  it('counts violations per offset and is consistent with the valid set', () => {
    const project = load('R2');
    const cfg = { theta: 0, stackSide: 'left' as const };
    const counts = y0Violations(project, cfg);
    expect(counts).toHaveLength(project.product.boardWidth);
    expect(validY0s(project, cfg)).toEqual(counts.flatMap((v, y) => (v === 0 ? [y] : [])));
    expect(counts.some((v) => v > 0)).toBe(true); // some offsets do break w_min
    // The row frame is what decides: a mirrored stack has its own answer.
    const frame = roomToRow(0, 'right');
    expect(frame).toBeDefined();
    const zone = buildRoomZone(project, project.rooms[0]!.id);
    expect(transformShape(frame, zone.shapes[0]!).outer.length).toBeGreaterThan(2);
  });
});

describe('configurations', () => {
  it('finds the directions of the long walls', () => {
    expect(wallDirections(load('R1'))).toEqual([0, 90]);
    // L: only the walls of 1000 mm or more count; all its walls are axis parallel.
    expect(wallDirections(load('L1')).every((d) => d === 0 || d === 90)).toBe(true);
    // A trapezoid has a slanted wall of its own.
    expect(wallDirections(load('S1')).some((d) => d > 0 && d < 90)).toBe(true);
  });

  it('enumerates auto settings and keeps fixed ones', () => {
    const r1 = load('R1');
    const auto = candidateConfigs(withSettings(r1, { angleDeg: 'auto', stackSide: 'auto' }));
    expect(auto).toHaveLength(2 * 2 * 2); // 2 directions × {θ, θ+180°} × 2 sides
    expect(new Set(auto.map((c) => `${c.angleDeg}/${c.stackSide}`)).size).toBe(auto.length);
    expect(candidateConfigs(withSettings(r1, { angleDeg: 30, stackSide: 'auto' }))).toEqual([
      { angleDeg: 30, stackSide: 'left' },
      { angleDeg: 30, stackSide: 'right' },
    ]);
    expect(candidateConfigs(withSettings(r1, { angleDeg: 0, stackSide: 'right' }))).toEqual([
      { angleDeg: 0, stackSide: 'right' },
    ]);
  });

  it('picks at most `max` offsets, keeping the ends of the valid runs', () => {
    const valid = [
      ...Array.from({ length: 60 }, (_, i) => 10 + i),
      ...Array.from({ length: 40 }, (_, i) => 120 + i),
    ];
    const picked = pickY0(valid, 12);
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked).toEqual([...new Set(picked)].sort((p, q) => p - q));
    expect(picked.every((y) => valid.includes(y))).toBe(true);
    expect(picked).toContain(10);
    expect(picked).toContain(159);
    expect(pickY0([5, 6, 7], 12)).toEqual([5, 6, 7]);
  });
});

describe('runOuter', () => {
  const small = { topK: 1, maxY0: 3, budget: { iters: 1500 } };

  it('returns a valid best solution and a table of all screened configurations', () => {
    const project = withSettings(load('R1'), {
      angleDeg: 'auto',
      stackSide: 'auto',
      rowOffset: 'auto',
    });
    const out = runOuter(project, { ...small, seed: 3 });
    // Up to `maxY0` offsets per configuration (fewer where fewer are valid).
    expect(out.table.length).toBeGreaterThanOrEqual(8);
    expect(out.table.length).toBeLessThanOrEqual(8 * 3);
    expect(out.table.filter((r) => r.sa).length).toBe(8); // topK = 1 per configuration
    // Every screened offset keeps the w_min rule (a valid y0 exists for the rectangle).
    expect(out.table.every((r) => !r.relaxed)).toBe(true);

    const { best } = out;
    const plan = buildPlan(best.ctx, best.result.phi, { mode: best.result.mode });
    expect(plan.stats.boards).toBe(best.result.evaluation.B);
    const violations = validatePlan(
      // The result is validated against the project with the chosen row configuration fixed.
      withSettings(project, {
        angleDeg: best.row.angleDeg,
        stackSide: best.row.stackSide,
        rowOffset: best.row.y0,
      }),
      plan,
    ).violations.filter((v) => v.code !== 'stagger');
    expect(violations).toEqual([]);
    // The best SA result is the best of the table.
    const saBest = Math.min(...out.table.flatMap((r) => (r.sa ? [r.sa.B] : [])));
    expect(best.result.evaluation.B).toBe(saBest);
    // ... and never worse than what quick screening found for the same configuration.
    expect(best.result.evaluation.B).toBeLessThanOrEqual(best.row.bInst);
  });

  it('respects fixed angle, side and offset', () => {
    const project = withSettings(load('R1'), { angleDeg: 0, stackSide: 'left', rowOffset: 60 });
    const out = runOuter(project, { ...small, seed: 1 });
    expect(out.table).toHaveLength(1);
    expect(out.table[0]).toMatchObject({ angleDeg: 0, stackSide: 'left', y0: 60 });
  });

  it('is deterministic for one seed (iteration budget)', () => {
    const project = withSettings(load('R1'), { angleDeg: 0, stackSide: 'auto', rowOffset: 'auto' });
    const a = runOuter(project, { ...small, seed: 5 });
    const b = runOuter(project, { ...small, seed: 5 });
    expect(a.best.result.phi).toEqual(b.best.result.phi);
    expect(a.table).toEqual(b.table);
  });

  it('falls back to the offsets with the fewest violations when none keeps w_min', () => {
    // With w_min = 100 mm on 192 mm boards no strip beside a wall can satisfy both sides, so only an
    // offset that puts a wall exactly on a band line helps: one wall at most (10 and 3990 mm).
    const base = load('R1');
    const strict = withSettings(
      { ...base, rules: { ...base.rules, minRipWidth: 100 } },
      { angleDeg: 0, stackSide: 'left', rowOffset: 'auto' },
    );
    expect(validY0s(strict, { theta: 0, stackSide: 'left' })).toEqual([]);
    const out = runOuter(strict, { ...small, seed: 1 });
    expect(out.table.length).toBeGreaterThan(0);
    expect(out.table.every((r) => r.relaxed)).toBe(true);
    const fewest = Math.min(...y0Violations(strict, { theta: 0, stackSide: 'left' }));
    expect(fewest).toBe(1);
    const counts = y0Violations(strict, { theta: 0, stackSide: 'left' });
    expect(out.table.every((r) => counts[r.y0] === fewest)).toBe(true);
  });
});
