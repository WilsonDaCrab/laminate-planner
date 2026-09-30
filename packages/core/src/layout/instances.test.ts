import { describe, expect, it } from 'vitest';
import { shapesArea } from '../geometry/clip';
import { dist } from '../geometry/vec';
import { parseProject, saveProject } from '../model/index';
import { createRng } from '../rng/index';
import { buildBands, rowConfigFromSettings } from './bands';
import { contains, feasibleSet, sample } from './feasible';
import { instanceFiles } from './fixtures/instances';
import { buildNeighbors } from './neighbors';
import { describePieces, meetsMinLength } from './pieces';
import { buildRoomZone } from './roomZone';
import { buildProfiles } from './xprofile';

/**
 * Segment counts predicted by hand for y0 = 0, W = 192 (settings are 'auto' → θ = 0, stack left,
 * y0 = 0). The zone is the room shrunk by the 10 mm gap; rows are cut at multiples of 192:
 *  R1 zone y ∈ [10, 3990]: rows 182 + 19·192 + 150 → 21 rows.
 *  R2 zone y ∈ [10, 4990]: rows 182 + 24·192 + 190 → 26 rows.
 *  L1 zone y ∈ [−120, 4590]: the doorway on the bottom wall pushes the floor 120 mm outwards,
 *     which adds the row [−192, 0] (a 940 mm wide segment) to the 24 rows of the L itself
 *     (182 + 22·192 + 174 = 4580) → 25 rows, one segment each (the L stays connected).
 *  U1 zone y ∈ [10, 3990]: 21 rows; rows with lower edge ≥ 1490 (k ≥ 8, 13 rows) split into two arms:
 *     8 + 13·2 = 34 segments.
 *  S1 zone y ∈ [10, 2990]: 182 + 14·192 + 110 → 16 rows.
 *  S2 zone y ∈ [10, 1990]: 182 + 9·192 + 70 → 11 rows.
 *  C1 zone y ∈ [10, 2990] (the bay is tangent to the walls): 16 rows.
 *  C2 zone y ∈ [10, 3490]: 19 rows; the column hole (y ≈ 1540…1960) fully splits the row [1728, 1920]
 *     → 19 + 1 = 20 segments.
 *  T1 (3100×404) zone y ∈ [10, 394]: rows 182 + 192 + 10 → 3 rows.
 *  T2 (2600×300) zone y ∈ [10, 290]: rows 182 + 98 → 2 rows.
 *  T3 (L-shape, 404 high) zone y ∈ [10, 394]: 3 rows, the L stays connected → 3 segments.
 *  T4 (trapezoid, 404 high) zone y ∈ [10, 394]: 3 rows.
 */
const expectedSegments: Record<string, number> = {
  R1: 21,
  R2: 26,
  L1: 25,
  U1: 34,
  S1: 16,
  S2: 11,
  C1: 16,
  C2: 20,
  T1: 3,
  T2: 2,
  T3: 3,
  T4: 3,
};

describe('instances/*.json', () => {
  for (const file of instanceFiles) {
    describe(file.id, () => {
      const project = parseProject(file.raw);
      const room = project.rooms[0]!;
      const L = project.product.boardLength;
      const W = project.product.boardWidth;

      it('loads and is stored in canonical form (saveProject reproduces the file)', () => {
        expect(project.meta?.source).toBe('manual');
        expect(saveProject(project)).toBe(`${JSON.stringify(file.raw, null, 2)}\n`);
      });

      it('zone → segments → neighbours → profiles run through without warnings', () => {
        const zone = buildRoomZone(project, room.id);
        expect(zone.warnings).toEqual([]);
        expect(zone.shapes.length).toBeGreaterThan(0);

        const cfg = rowConfigFromSettings(project.settings);
        const layout = buildBands(zone.shapes, cfg, W);
        expect(layout.segments).toHaveLength(expectedSegments[file.id]!);

        // The segments tile the zone (Clipper grid: slanted and curved walls allow ~0.01 mm × perimeter).
        const zoneArea = shapesArea(zone.shapes);
        const total = shapesArea(layout.segments.map((s) => s.shape));
        const perimeter = zone.shapes
          .flatMap((s) => [s.outer, ...s.holes])
          .reduce(
            (sum, ring) =>
              sum + ring.reduce((a, p, i) => a + dist(p, ring[(i + 1) % ring.length]!), 0),
            0,
          );
        expect(Math.abs(total - zoneArea)).toBeLessThan(0.5 + 0.01 * perimeter);

        const graph = buildNeighbors(layout);
        const profiles = buildProfiles(layout.segments, graph);
        expect(Object.keys(profiles)).toHaveLength(layout.segments.length);
        // Every row above the first is connected to the one below it somewhere.
        for (const s of layout.segments) {
          if (s.band > 1) expect(graph.down[s.id]!.length, s.id).toBeGreaterThan(0);
        }
      });

      it('every segment has a non-empty F_s (L_min ≤ L/2) whose members satisfy the rule', () => {
        const zone = buildRoomZone(project, room.id);
        const layout = buildBands(zone.shapes, rowConfigFromSettings(project.settings), W);
        const profiles = buildProfiles(layout.segments, buildNeighbors(layout));
        const rng = createRng(project.settings.seed);
        for (const s of layout.segments) {
          const p = profiles[s.id]!;
          const { feasible, relaxed } = feasibleSet(p, L, project.rules.minPieceLength);
          expect(relaxed, s.id).toBe(false);
          for (let i = 0; i < 5; i++) {
            const phi = sample(feasible, rng);
            expect(contains(feasible, phi)).toBe(true);
            expect(
              meetsMinLength(describePieces(p, L, phi), project.rules.minPieceLength),
              `${s.id} φ=${phi}`,
            ).toBe(true);
          }
        }
      });
    });
  }

  it('the doorway of L1 extends the zone by width + 2·jamb undercut over depth + gap', () => {
    const l1 = parseProject(instanceFiles.find((f) => f.id === 'L1')!.raw);
    const withDoor = shapesArea(buildRoomZone(l1, 'r1').shapes);
    const without = shapesArea(buildRoomZone({ ...l1, doorways: [] }, 'r1').shapes);
    // (900 + 2·20) wide, from the wall line 120 mm outwards, plus the 10 mm gap that is now floor.
    expect(withDoor - without).toBeCloseTo(940 * (120 + 10), 2);
  });

  it('the pipe of L1 does not change the zone (ADR-008)', () => {
    const l1 = parseProject(instanceFiles.find((f) => f.id === 'L1')!.raw);
    const noPipe = {
      ...l1,
      rooms: [{ ...l1.rooms[0]!, obstacles: [] }],
      doorways: [],
    };
    const withPipe = { ...l1, doorways: [] };
    expect(shapesArea(buildRoomZone(withPipe, 'r1').shapes)).toBe(
      shapesArea(buildRoomZone(noPipe, 'r1').shapes),
    );
  });
});
