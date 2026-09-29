import { describe, expect, it } from 'vitest';
import { rectShape, type Shape } from '../geometry/clip';
import { referenceRooms } from '../geometry/fixtures/rooms';
import { buildZone } from '../geometry/zone';
import { measure, type Interval } from '../num/intervals';
import { buildBands, segmentById, type Layout } from './bands';
import { buildNeighbors, horizontalEdges, MIN_OPEN_LENGTH, type NeighborGraph } from './neighbors';

const W = 192;
const uniform = (n: number, gap = 10) => Array.from({ length: n }, () => ({ gap }));
const zoneOf = (outline: { x: number; y: number }[]): Shape[] =>
  buildZone({ outline, edges: uniform(outline.length) }).shapes;

describe('horizontalEdges', () => {
  const square: Shape = {
    outer: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
    holes: [],
  };

  it('bottom edges run towards +x, top edges towards −x', () => {
    expect(horizontalEdges(square, 0, 'bottom')).toEqual([[0, 10]]);
    expect(horizontalEdges(square, 5, 'top')).toEqual([[0, 10]]);
    expect(horizontalEdges(square, 0, 'top')).toEqual([]);
    expect(horizontalEdges(square, 5, 'bottom')).toEqual([]);
    expect(horizontalEdges(square, 2, 'bottom')).toEqual([]);
  });
});

describe('open-edge noise threshold', () => {
  const cfg = { theta: 0, stackSide: 'left' as const, y0: 0 };
  // Row 1 is [0, 1000] × [0, 192]; row 2 starts at x = `from` on the shared line y = 192.
  const linked = (from: number): boolean => {
    const layout = buildBands(
      [rectShape(0, 0, 1000, 192), rectShape(from, 192, 2000, 384)],
      cfg,
      W,
    );
    return buildNeighbors(layout).links.length > 0;
  };

  it('an overlap of a hundredth of a millimetre (grid noise) is not a connection', () => {
    expect(MIN_OPEN_LENGTH).toBeCloseTo(0.02, 12);
    expect(linked(999.99)).toBe(false);
  });

  it('a real overlap of 0.05 mm is', () => {
    expect(linked(999.95)).toBe(true);
    expect(linked(500)).toBe(true);
  });
});

describe('rectangle: a stack of rows', () => {
  const zone = zoneOf([
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 3000 },
    { x: 0, y: 3000 },
  ]);
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);
  const graph = buildNeighbors(layout);
  const n = layout.segments.length; // 2980 / 192 → 16 rows

  it('every row touches the next over the whole width', () => {
    expect(n).toBe(16);
    expect(graph.links).toHaveLength(n - 1);
    for (const link of graph.links) {
      expect(link.intervals).toEqual([[10, 3990]]);
    }
  });

  it('the first bottom edge and the last top edge are closed', () => {
    expect(graph.openLow['1a']).toEqual([]);
    expect(graph.openHigh[`${n}a`]).toEqual([]);
    expect(graph.openLow['2a']).toEqual([[10, 3990]]);
    expect(graph.openHigh['1a']).toEqual([[10, 3990]]);
  });

  it('second-order pairs are the rows two apart', () => {
    expect(graph.secondOrder).toHaveLength(n - 2);
    expect(graph.secondOrder[0]).toEqual({ lower: '1a', upper: '3a', via: ['2a'] });
  });
});

describe('L-shaped room', () => {
  const zone = zoneOf([
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 1500 },
    { x: 2000, y: 1500 },
    { x: 2000, y: 3000 },
    { x: 0, y: 3000 },
  ]);

  it('step inside a band: the L-shaped row joins the wide row below and the narrow one above', () => {
    const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);
    const graph = buildNeighbors(layout);
    const link = (lo: string, up: string) =>
      graph.links.find((l) => l.lower === lo && l.upper === up)?.intervals;
    expect(link('7a', '8a')).toEqual([[10, 3990]]);
    expect(link('8a', '9a')).toEqual([[10, 1990]]);
    expect(link('9a', '10a')).toEqual([[10, 1990]]);
    // The L row has the wide bottom edge open, but only [10, 1990] of its top edge.
    expect(graph.openLow['8a']).toEqual([[10, 3990]]);
    expect(graph.openHigh['8a']).toEqual([[10, 1990]]);
  });

  it('step exactly on a band boundary: the wide row has a closed part on top (wall)', () => {
    // Lattice contains y = 1490, the level of the inner corner of the zone.
    const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 1490 }, W);
    const graph = buildNeighbors(layout);
    const wide = layout.segments.find((s) => Math.abs(s.yHi - 1490) < 1e-6 && s.b > 3000)!;
    expect(wide).toBeDefined();
    const upper = graph.up[wide.id]!;
    expect(upper).toHaveLength(1);
    expect(graph.openHigh[wide.id]).toEqual([[10, 1990]]);
    // Its top edge measures 3980 in total; only 1980 of it is open, the rest is a wall.
    expect(measure(horizontalEdges(wide.shape, wide.bandHi, 'top'))).toBeCloseTo(3980, 6);
    expect(measure(graph.openHigh[wide.id]!)).toBeCloseTo(1980, 6);
  });
});

describe('U-shaped room: rows in the arms stay separate', () => {
  const zone = zoneOf([
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 4000, y: 4000 },
    { x: 4000, y: 1500 },
    { x: 2000, y: 1500 },
    { x: 2000, y: 4000 },
    { x: 0, y: 4000 },
  ]);
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);
  const graph = buildNeighbors(layout);

  it('the U-shaped row joins both arms; each arm joins only its own continuation', () => {
    expect(graph.up['8a']).toEqual(['9a', '9b']);
    expect(graph.openHigh['8a']).toEqual([
      [10, 1990],
      [4010, 5990],
    ]);
    expect(graph.up['9a']).toEqual(['10a']);
    expect(graph.up['9b']).toEqual(['10b']);
    expect(graph.down['9b']).toEqual(['8a']);
  });

  it('second-order pairs from the U row go to both arms two rows up', () => {
    const pairs = graph.secondOrder.filter((p) => p.lower === '8a').map((p) => p.upper);
    expect(pairs.sort()).toEqual(['10a', '10b']);
  });
});

describe('parallelogram: partial overlaps follow the slanted walls', () => {
  // Zone of a parallelogram; its slice at any height is a single x interval computed independently.
  const outline = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 5500, y: 2000 },
    { x: 1500, y: 2000 },
  ];
  const zone = zoneOf(outline);
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 0 }, W);
  const graph = buildNeighbors(layout);

  /** x interval of a convex polygon at height y, from edge crossings. */
  function slice(poly: { x: number; y: number }[], y: number): Interval {
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    return [Math.min(...xs), Math.max(...xs)];
  }

  it('each link equals the zone slice at the shared boundary (±0.02 mm)', () => {
    expect(graph.links.length).toBeGreaterThan(5);
    for (const link of graph.links) {
      const lower = segmentById(layout, link.lower)!;
      expect(link.intervals).toHaveLength(1);
      const [lo, hi] = slice(zone[0]!.outer, lower.bandHi);
      expect(link.intervals[0]![0]).toBeCloseTo(lo, 1);
      expect(link.intervals[0]![1]).toBeCloseTo(hi, 1);
    }
  });
});

describe('invariants on the reference rooms', () => {
  const configs = [
    { theta: 0, y0: 0 },
    { theta: 0, y0: 100 },
    { theta: Math.PI / 6, y0: 40 },
    { theta: Math.PI / 2, y0: 150 },
  ];

  for (const room of referenceRooms) {
    it(`${room.name}: links are consistent and lie inside both segments`, () => {
      const shapes = buildZone(room.input).shapes;
      for (const c of configs) {
        const layout: Layout = buildBands(shapes, { ...c, stackSide: 'left' }, W);
        const graph: NeighborGraph = buildNeighbors(layout);
        for (const link of graph.links) {
          const lower = segmentById(layout, link.lower)!;
          const upper = segmentById(layout, link.upper)!;
          expect(upper.band).toBe(lower.band + 1);
          expect(graph.up[link.lower]).toContain(link.upper);
          expect(graph.down[link.upper]).toContain(link.lower);
          for (const [lo, hi] of link.intervals) {
            expect(lo).toBeGreaterThanOrEqual(Math.max(lower.a, upper.a) - 1e-6);
            expect(hi).toBeLessThanOrEqual(Math.min(lower.b, upper.b) + 1e-6);
            expect(hi - lo).toBeGreaterThan(0);
          }
        }
        for (const s of layout.segments) {
          const fromLinks = graph.links.filter((l) => l.lower === s.id).flatMap((l) => l.intervals);
          expect(measure(graph.openHigh[s.id]!)).toBeCloseTo(measure(fromLinks), 6);
          const top = measure(horizontalEdges(s.shape, s.bandHi, 'top'));
          expect(measure(graph.openHigh[s.id]!)).toBeLessThanOrEqual(top + 1e-6);
          const bottom = measure(horizontalEdges(s.shape, s.bandLo, 'bottom'));
          expect(measure(graph.openLow[s.id]!)).toBeLessThanOrEqual(bottom + 1e-6);
        }
        // Mirror check: every open edge of s is matched by the neighbours' opposite open edges.
        const totalHigh = layout.segments.reduce(
          (sum, s) => sum + measure(graph.openHigh[s.id]!),
          0,
        );
        const totalLow = layout.segments.reduce((sum, s) => sum + measure(graph.openLow[s.id]!), 0);
        expect(totalHigh).toBeCloseTo(totalLow, 6);
      }
    });
  }
});
