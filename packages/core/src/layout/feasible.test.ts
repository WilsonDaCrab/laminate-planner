import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Shape } from '../geometry/clip';
import { referenceRooms } from '../geometry/fixtures/rooms';
import { bbox } from '../geometry/polygon';
import { buildZone } from '../geometry/zone';
import { circDist } from '../num/index';
import { createRng } from '../rng/index';
import { buildBands, type Layout, type Segment } from './bands';
import { oraclePieces, oracleMeetsMinLength } from './fixtures/oracle';
import { contains, feasibleSet, measureOf, project, sample, type Feasible } from './feasible';
import { buildNeighbors, type NeighborGraph } from './neighbors';
import { describePieces, meetsMinLength, seamsOf } from './pieces';
import { buildProfile, buildProfiles, type XProfile } from './xprofile';

const W = 192;
const L = 1285;
const uniform = (n: number, gap = 10) => Array.from({ length: n }, () => ({ gap }));

const box = (x0: number, y0: number, x1: number, y1: number): Shape => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});

function standalone(shape: Shape): XProfile {
  const b = bbox(shape.outer);
  const segment: Segment = {
    id: '1a',
    band: 1,
    index: 0,
    shape,
    a: b.minX,
    b: b.maxX,
    bandLo: b.minY,
    bandHi: b.maxY,
    yLo: b.minY,
    yHi: b.maxY,
  };
  return buildProfile(segment, { low: [], high: [] });
}

const rectProfile = (a: number, b: number): XProfile => standalone(box(a, 0, b, 192));

const feasibleOk = (profile: XProfile, phi: number, lMin: number): boolean =>
  meetsMinLength(describePieces(profile, L, ((phi % L) + L) % L), lMin);

describe('rectangle: hand-computed F_s (a = 0, L = 1285, L_min = 300)', () => {
  it('b = 4000: exactly φ ∈ [300, 1130]', () => {
    // s ∈ [300, 1130] ⇒ first piece ≥ 300 and last piece ≥ 300 (seams at s, s+1285, s+2570, s+3855…).
    const { feasible, relaxed } = feasibleSet(rectProfile(0, 4000), L, 300);
    expect(relaxed).toBe(false);
    expect(feasible.intervals).toHaveLength(1);
    expect(feasible.intervals[0]![0]).toBeCloseTo(300, 9);
    expect(feasible.intervals[0]![1]).toBeCloseTo(1130, 9);
    expect(contains(feasible, 1130)).toBe(true);
    expect(contains(feasible, 1131)).toBe(false); // last piece would be 299
  });

  it('b = 1000 (shorter than a board): no seam inside, or a cut with both parts ≥ 300', () => {
    const { feasible } = feasibleSet(rectProfile(0, 1000), L, 300);
    expect(feasible.intervals).toEqual([
      [0, 0],
      [300, 700],
      [1000, 1285],
    ]);
    expect(contains(feasible, 0)).toBe(true); // seam at the wall: not a seam
    expect(contains(feasible, 1285)).toBe(true); // same phase
    expect(contains(feasible, 800)).toBe(false); // seam at 800: pieces 800 | 200, and 200 < L_min
  });

  it('a start offset shifts the set (a = 10: φ ∈ [310, 1140])', () => {
    const { feasible } = feasibleSet(rectProfile(10, 4010), L, 300);
    expect(feasible.intervals[0]![0]).toBeCloseTo(310, 9);
    expect(feasible.intervals[0]![1]).toBeCloseTo(1140, 9);
  });

  it('a set that wraps around φ = 0 is split at the wrap point', () => {
    // a = 1200: r ∈ [300, 1130] ⇒ φ = 1200 + r mod 1285 wraps: [1500, 2330] → [215, 1045].
    const { feasible } = feasibleSet(rectProfile(1200, 5200), L, 300);
    expect(feasible.intervals.length).toBeGreaterThanOrEqual(1);
    expect(contains(feasible, 215)).toBe(true);
    expect(contains(feasible, 1045)).toBe(true);
    expect(contains(feasible, 214)).toBe(false);
    expect(contains(feasible, 1046)).toBe(false);
  });

  it('no feasible phase (L_min too large) → whole circle and relaxed = true', () => {
    const r = feasibleSet(rectProfile(0, 1500), L, 1000);
    expect(r.relaxed).toBe(true);
    expect(r.feasible.intervals).toEqual([[0, L]]);
  });
});

describe('rectangle: analytic set agrees with brute force over φ', () => {
  const cases: [number, number, number][] = [
    [0, 4000, 300],
    [10, 3990, 300],
    [0, 1000, 300],
    [0, 1285, 300],
    [0, 1500, 300],
    [0, 2570, 300],
    [37.5, 1400, 200],
    [0, 3000, 642.5],
    [123, 6000, 400],
  ];
  for (const [a, b, lMin] of cases) {
    it(`a = ${a}, b = ${b}, L_min = ${lMin}`, () => {
      const profile = rectProfile(a, b);
      const { feasible, relaxed } = feasibleSet(profile, L, lMin);
      if (relaxed) {
        // Then brute force must find nothing either.
        for (let phi = 0; phi < L; phi += 0.5) expect(feasibleOk(profile, phi, lMin)).toBe(false);
        return;
      }
      for (let phi = 0; phi < L; phi += 0.5) {
        expect(contains(feasible, phi), `φ = ${phi}`).toBe(feasibleOk(profile, phi, lMin));
      }
    });
  }

  it('F_s is never empty when L_min ≤ L/2 (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1284 }),
        fc.integer({ min: 100, max: 8000 }),
        fc.integer({ min: 50, max: 642 }),
        (a, len, lMin) => {
          const r = feasibleSet(rectProfile(a, a + len), L, lMin);
          return !r.relaxed && r.feasible.intervals.length > 0;
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('scanned F_s (non-rectangular segments)', () => {
  const lShape = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 1500 },
    { x: 2000, y: 1500 },
    { x: 2000, y: 3000 },
    { x: 0, y: 3000 },
  ];
  const zone = buildZone({ outline: lShape, edges: uniform(6) }).shapes;
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);
  const graph = buildNeighbors(layout);
  const profiles = buildProfiles(layout.segments, graph);

  it('the L-shaped row has the hand-derived set φ ∈ [310, 1120]', () => {
    // Only the bottom edge and the narrow part's top edge are open; every piece that could be
    // constrained is constrained by its bottom edge: same as a rectangle x ∈ [10, 3990].
    const p = profiles['8a']!;
    expect(p.isRect).toBe(false);
    const { feasible, relaxed } = feasibleSet(p, L, 300);
    expect(relaxed).toBe(false);
    expect(feasible.intervals).toHaveLength(1);
    expect(feasible.intervals[0]![0]).toBeCloseTo(310, 4);
    expect(feasible.intervals[0]![1]).toBeCloseTo(1120, 4);
  });

  it('the scan endpoints lie on the feasible side and the next point outside is infeasible', () => {
    const p = profiles['8a']!;
    const { feasible } = feasibleSet(p, L, 300);
    const [lo, hi] = feasible.intervals[0]!;
    expect(feasibleOk(p, lo, 300)).toBe(true);
    expect(feasibleOk(p, hi, 300)).toBe(true);
    expect(feasibleOk(p, lo - 0.01, 300)).toBe(false);
    expect(feasibleOk(p, hi + 0.01, 300)).toBe(false);
  });

  it('a sloped-wall row (trapezoid) gets a non-empty set whose members all satisfy L_min', () => {
    const trap = buildZone({
      outline: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 1000, y: 3000 },
      ],
      edges: uniform(4),
    }).shapes;
    const l = buildBands(trap, { theta: 0, stackSide: 'left', y0: 0 }, W);
    const prof = buildProfiles(l.segments, buildNeighbors(l));
    for (const s of l.segments) {
      const p = prof[s.id]!;
      const r = feasibleSet(p, L, 300);
      expect(r.relaxed, s.id).toBe(false);
      for (let phi = 0; phi < L; phi += 7.3) {
        if (contains(r.feasible, phi))
          expect(feasibleOk(p, phi, 300), `${s.id} φ=${phi}`).toBe(true);
      }
    }
  });
});

describe('operations: contains / measureOf / sample / project', () => {
  const F: Feasible = {
    L: 1285,
    intervals: [
      [0, 100],
      [400, 500],
      [1200, 1285],
    ],
  };

  it('contains treats 0 and L as the same point and phases modulo L', () => {
    expect(contains(F, 50)).toBe(true);
    expect(contains(F, 1285)).toBe(true);
    expect(contains(F, 1285 + 450)).toBe(true);
    expect(contains(F, -10)).toBe(true); // ≡ 1275
    expect(contains(F, 300)).toBe(false);
    expect(measureOf(F)).toBe(100 + 100 + 85);
  });

  it('project returns the nearest feasible phase on the circle (also across the wrap)', () => {
    expect(project(F, 50)).toBe(50);
    expect(project(F, 300)).toBe(400); // 100 away from 400, 200 from 100
    expect(project(F, 1150)).toBe(1200);
    expect(project(F, 130)).toBe(100);
    // Nearest via the wrap: from 1190 → 1200 (10) rather than 100 (195).
    expect(project(F, 1190)).toBe(1200);
    // 620 is 120 from 500 and 665 from 1200 → 500.
    expect(project(F, 620)).toBe(500);
  });

  it('project minimises the circular distance (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1284.99, noNaN: true }), (phi) => {
        const p = project(F, phi);
        if (!contains(F, p)) return false;
        let best = Infinity;
        for (let x = 0; x < 1285; x += 0.25) {
          if (contains(F, x)) best = Math.min(best, circDist(phi, x, 1285));
        }
        return circDist(phi, p, 1285) <= best + 0.25;
      }),
      { numRuns: 300 },
    );
  });

  it('sample stays inside the set and is roughly proportional to interval length', () => {
    const rng = createRng(3);
    const counts = [0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const phi = sample(F, rng);
      expect(contains(F, phi)).toBe(true);
      if (phi <= 100) counts[0]!++;
      else if (phi <= 500) counts[1]!++;
      else counts[2]!++;
    }
    const total = 285;
    expect(counts[0]! / n).toBeCloseTo(100 / total, 1);
    expect(counts[1]! / n).toBeCloseTo(100 / total, 1);
    expect(counts[2]! / n).toBeCloseTo(85 / total, 1);
  });

  it('sample of a set of points picks one of them; an empty set throws', () => {
    const points: Feasible = {
      L: 1285,
      intervals: [
        [0, 0],
        [700, 700],
      ],
    };
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) expect([0, 700]).toContain(sample(points, rng));
    expect(() => sample({ L: 1285, intervals: [] }, rng)).toThrow();
    expect(() => project({ L: 1285, intervals: [] }, 5)).toThrow();
  });
});

describe('property: every φ ∈ F_s meets L_min (reference rooms, several row configurations)', () => {
  const items: {
    profile: XProfile;
    feasible: Feasible;
    segment: Segment;
    layout: Layout;
    graph: NeighborGraph;
  }[] = [];
  let counter = 0;
  for (const room of referenceRooms) {
    const shapes = buildZone(room.input).shapes;
    for (const c of [
      { theta: 0, y0: 0 },
      { theta: Math.PI / 6, y0: 40 },
    ]) {
      const layout = buildBands(shapes, { ...c, stackSide: 'left' }, W);
      const graph = buildNeighbors(layout);
      const profiles = buildProfiles(layout.segments, graph);
      for (const s of layout.segments) {
        const profile = profiles[s.id]!;
        // Scans are the slow part: keep every rectangle but only a sample of the other segments.
        if (!profile.isRect && counter++ % 6 !== 0) continue;
        const { feasible, relaxed } = feasibleSet(profile, L, 300);
        if (!relaxed) items.push({ profile, feasible, segment: s, layout, graph });
      }
    }
  }

  /** The rule judged on exact Clipper piece shapes (no `describePieces`), grid tolerance 0.05 mm. */
  const oracleOk = (i: number, phi: number): boolean => {
    const { segment, layout, graph } = items[i]!;
    const seams = seamsOf(segment.a, segment.b, L, ((phi % L) + L) % L);
    return oracleMeetsMinLength(oraclePieces(layout, graph, segment, seams), 300, 0.05);
  };

  it('the corpus mixes rectangles and scanned segments', () => {
    expect(items.some((i) => i.profile.isRect)).toBe(true);
    expect(items.filter((i) => !i.profile.isRect).length).toBeGreaterThan(20);
  });

  it('random members of F_s (drawn with sample) satisfy the rule', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: items.length - 1 }),
        fc.integer({ min: 1, max: 2 ** 31 }),
        (i, seed) => {
          const { profile, feasible } = items[i]!;
          const phi = sample(feasible, createRng(seed));
          return feasibleOk(profile, phi, 300) && oracleOk(i, phi);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('interval endpoints and midpoints satisfy the rule too (also on the exact-shape oracle)', () => {
    items.forEach(({ profile, feasible }, i) => {
      for (const [lo, hi] of feasible.intervals) {
        for (const phi of [lo, hi, (lo + hi) / 2]) {
          expect(feasibleOk(profile, phi, 300), `${profile.segmentId} φ=${phi}`).toBe(true);
          expect(oracleOk(i, phi), `oracle ${profile.segmentId} φ=${phi}`).toBe(true);
        }
      }
    });
  });
});
