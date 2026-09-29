import { describe, expect, it } from 'vitest';
import { shapeArea, type Shape } from '../geometry/clip';
import { referenceRooms } from '../geometry/fixtures/rooms';
import { buildZone } from '../geometry/zone';
import { buildBands, segmentById, type Segment } from './bands';
import { buildNeighbors } from './neighbors';
import { buildProfile, buildProfiles, profileArea, sectionsIn, spansAt } from './xprofile';

const W = 192;
const uniform = (n: number, gap = 10) => Array.from({ length: n }, () => ({ gap }));

function layoutOf(outline: { x: number; y: number }[], y0: number, theta = 0) {
  const shapes = buildZone({ outline, edges: uniform(outline.length) }).shapes;
  const layout = buildBands(shapes, { theta, stackSide: 'left', y0 }, W);
  const graph = buildNeighbors(layout);
  return { layout, graph, profiles: buildProfiles(layout.segments, graph) };
}

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

const lShape = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 1500 },
  { x: 2000, y: 1500 },
  { x: 2000, y: 3000 },
  { x: 0, y: 3000 },
];

/** A segment made directly from a polygon (tests that need shapes rooms cannot easily produce). */
function segmentFrom(shape: Shape, bandLo: number, bandHi: number): Segment {
  const xs = shape.outer.map((p) => p.x);
  const ys = shape.outer.map((p) => p.y);
  return {
    id: '1a',
    band: 1,
    index: 0,
    shape,
    a: Math.min(...xs),
    b: Math.max(...xs),
    bandLo,
    bandHi,
    yLo: Math.min(...ys),
    yHi: Math.max(...ys),
  };
}

describe('rectangle rows', () => {
  const { profiles } = layoutOf(rect(4000, 3000), 10);

  it('a middle row is a fast-path rectangle with one section', () => {
    const p = profiles['5a']!;
    expect(p.isRectShape).toBe(true);
    expect(p.isRect).toBe(true);
    expect(p.complex).toBe(false);
    expect(p.breaks).toEqual([10, 3990]);
    expect(p.sections).toHaveLength(1);
    expect(spansAt(p, 2000)).toEqual([[10 + 4 * W, 10 + 5 * W]]);
  });

  it('the first and last rows are fast-path rectangles too (closed on one side)', () => {
    expect(profiles['1a']!.isRect).toBe(true);
    expect(profiles['16a']!.isRect).toBe(true);
  });
});

describe('rectangle with a partly open edge', () => {
  it('is a rectangle shape but not a fast-path segment', () => {
    // y0 = 1490: the wide lower row of the L shape has only [10, 1990] of its top edge open.
    const { layout, profiles } = layoutOf(lShape, 1490);
    const wide = layout.segments.find((s) => Math.abs(s.yHi - 1490) < 1e-6 && s.b > 3000)!;
    const p = profiles[wide.id]!;
    expect(p.isRectShape).toBe(true);
    expect(p.isRect).toBe(false);
    expect(p.openHigh).toEqual([[10, 1990]]);
  });
});

describe('L-shaped row (step inside the band)', () => {
  const { profiles } = layoutOf(lShape, 10);

  it('has breakpoints at the step and two sections', () => {
    const p = profiles['8a']!; // band [1354, 1546] contains the step at y = 1490
    expect(p.isRectShape).toBe(false);
    expect(p.isRect).toBe(false);
    expect(p.complex).toBe(false);
    expect(p.breaks).toEqual([10, 1990, 3990]);
    expect(spansAt(p, 1000)).toEqual([[1354, 1546]]);
    const right = spansAt(p, 3000);
    expect(right).toHaveLength(1);
    expect(right[0]![0]).toBeCloseTo(1354, 6);
    expect(right[0]![1]).toBeCloseTo(1490, 6);
  });
});

describe('trapezoid: slanted walls give linear sections', () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 1000, y: 3000 },
  ];
  const { layout, profiles } = layoutOf(outline, 0);

  it('a middle row has three sections: left slope, plateau, right slope', () => {
    const p = profiles['8a']!;
    expect(p.isRect).toBe(false);
    expect(p.complex).toBe(false);
    expect(p.sections).toHaveLength(3);
    const [left, mid, right] = p.sections;
    // Plateau: full band height. Left slope rises with the wall, right slope falls.
    expect(mid!.spans[0]!.loA).toBeCloseTo(p.bandLo, 6);
    expect(mid!.spans[0]!.hiA).toBeCloseTo(p.bandHi, 6);
    // The left wall leans right, so the room lies to its right and the wall bounds each vertical
    // slice from ABOVE: the upper boundary climbs with x while the lower one stays on the band edge.
    expect(left!.spans[0]!.loA).toBeCloseTo(p.bandLo, 6);
    expect(left!.spans[0]!.loB).toBeCloseTo(p.bandLo, 6);
    expect(left!.spans[0]!.hiB).toBeGreaterThan(left!.spans[0]!.hiA);
    expect(left!.spans[0]!.hiB).toBeCloseTo(p.bandHi, 6);
    // The right wall leans left: the upper boundary falls with x.
    expect(right!.spans[0]!.loA).toBeCloseTo(p.bandLo, 6);
    expect(right!.spans[0]!.hiB).toBeLessThan(right!.spans[0]!.hiA);
    expect(right!.spans[0]!.hiA).toBeCloseTo(p.bandHi, 6);
  });

  it('sections integrate to the segment area for every row (±1e-6 relative)', () => {
    for (const s of layout.segments) {
      const area = shapeArea(s.shape);
      expect(Math.abs(profileArea(profiles[s.id]!) - area)).toBeLessThanOrEqual(1e-6 * area + 1e-6);
    }
  });

  it('the cross-section width is continuous across breakpoints', () => {
    const p = profiles['8a']!;
    for (let i = 0; i + 1 < p.sections.length; i++) {
      const s = p.sections[i]!;
      const t = p.sections[i + 1]!;
      const endA = s.spans[0]!;
      const startB = t.spans[0]!;
      expect(endA.loB).toBeCloseTo(startB.loA, 6);
      expect(endA.hiB).toBeCloseTo(startB.hiA, 6);
    }
  });
});

describe('complex segments', () => {
  it('a hole inside the band makes the segment complex', () => {
    // Small column (100 × 100, gap 20 → hole 140 mm) lying inside one band.
    const shapes = buildZone({
      outline: rect(4000, 3000),
      edges: uniform(4),
      obstacles: [
        {
          kind: 'polygon',
          points: [
            { x: 1900, y: 1000 },
            { x: 2000, y: 1000 },
            { x: 2000, y: 1100 },
            { x: 1900, y: 1100 },
          ],
          gap: 20,
        },
      ],
    }).shapes;
    // Band lattice: 1000 − 20 = 980 ≤ hole ≤ 1120; choose y0 = 950 → band [950, 1142] holds it.
    const layout = buildBands(shapes, { theta: 0, stackSide: 'left', y0: 950 }, W);
    const seg = layout.segments.find((s) => s.bandLo === 950 && s.shape.holes.length === 1)!;
    expect(seg).toBeDefined();
    const p = buildProfile(seg, { low: [], high: [] });
    expect(p.complex).toBe(true);
    expect(p.isRect).toBe(false);
    // Through the hole the cross-section has two intervals.
    expect(spansAt(p, 1950)).toHaveLength(2);
    expect(Math.abs(profileArea(p) - shapeArea(seg.shape))).toBeLessThan(1e-6);
  });

  it('a C-shaped segment is complex without any hole', () => {
    const c: Shape = {
      outer: [
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 100 },
        { x: 1000, y: 100 },
        { x: 1000, y: 200 },
        { x: 3000, y: 200 },
        { x: 3000, y: 300 },
        { x: 0, y: 300 },
      ],
      holes: [],
    };
    const p = buildProfile(segmentFrom(c, 0, 300), { low: [], high: [] });
    expect(p.complex).toBe(true);
    expect(spansAt(p, 2000)).toEqual([
      [0, 100],
      [200, 300],
    ]);
    expect(spansAt(p, 500)).toEqual([[0, 300]]);
    expect(profileArea(p)).toBeCloseTo(shapeArea(c), 6);
  });
});

describe('sectionsIn / spansAt', () => {
  const { profiles } = layoutOf(lShape, 10);
  const p = profiles['8a']!;

  it('clips sections to a range and interpolates the ends', () => {
    const s = sectionsIn(p, 1500, 2500);
    expect(s.map((x) => [x.x0, x.x1])).toEqual([
      [1500, 1990],
      [1990, 2500],
    ]);
    expect(s[1]!.spans[0]!.hiA).toBeCloseTo(1490, 6);
  });

  it('a range outside the segment gives nothing', () => {
    expect(sectionsIn(p, 5000, 6000)).toEqual([]);
    expect(spansAt(p, 5000)).toEqual([]);
  });
});

describe('invariants on the reference rooms', () => {
  for (const room of referenceRooms) {
    it(`${room.name}: sections reproduce the segment areas and breaks are sorted`, () => {
      const shapes = buildZone(room.input).shapes;
      for (const c of [
        { theta: 0, y0: 0 },
        { theta: Math.PI / 6, y0: 60 },
      ]) {
        const layout = buildBands(shapes, { ...c, stackSide: 'left' }, W);
        const graph = buildNeighbors(layout);
        for (const s of layout.segments) {
          const p = buildProfile(s, { low: graph.openLow[s.id]!, high: graph.openHigh[s.id]! });
          const area = shapeArea(s.shape);
          expect(Math.abs(profileArea(p) - area)).toBeLessThanOrEqual(1e-6 * area + 1e-6);
          expect(p.breaks).toEqual([...p.breaks].sort((x, y) => x - y));
          expect(p.breaks[0]).toBeCloseTo(s.a, 6);
          expect(p.breaks.at(-1)).toBeCloseTo(s.b, 6);
          if (p.isRect) expect(p.complex).toBe(false);
          if (p.isRect) expect(segmentById(layout, s.id)!.shape.holes).toHaveLength(0);
        }
      }
    });
  }
});
