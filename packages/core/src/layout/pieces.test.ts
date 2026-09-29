import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { shapeArea, shapesArea, union, type Shape } from '../geometry/clip';
import { referenceRooms } from '../geometry/fixtures/rooms';
import { bbox } from '../geometry/polygon';
import { buildZone } from '../geometry/zone';
import { measure } from '../num/intervals';
import { buildBands, type Layout, type Segment } from './bands';
import { oraclePieces } from './fixtures/oracle';
import { buildNeighbors, horizontalEdges, type NeighborGraph } from './neighbors';
import {
  describePieces,
  describePiecesFast,
  describePiecesGeneral,
  lengthDeficit,
  meetsMinLength,
  pieceShapes,
  seamsOf,
  type PieceDescriptor,
} from './pieces';
import { buildProfile, buildProfiles, type XProfile } from './xprofile';

const W = 192;
const L = 1285;
const uniform = (n: number, gap = 10) => Array.from({ length: n }, () => ({ gap }));

const lShape = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 1500 },
  { x: 2000, y: 1500 },
  { x: 2000, y: 3000 },
  { x: 0, y: 3000 },
];

/** Segment + profile straight from a shape, with no neighbours (all edges closed unless given). */
function standalone(
  shape: Shape,
  bandLo: number,
  bandHi: number,
  open = { low: [], high: [] } as {
    low: [number, number][];
    high: [number, number][];
  },
) {
  const box = bbox(shape.outer);
  const segment: Segment = {
    id: '1a',
    band: 1,
    index: 0,
    shape,
    a: box.minX,
    b: box.maxX,
    bandLo,
    bandHi,
    yLo: box.minY,
    yHi: box.maxY,
  };
  return { segment, profile: buildProfile(segment, open) };
}

const rectShape = (x0: number, y0: number, x1: number, y1: number): Shape => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});

describe('seamsOf: hand-computed cases (a = 0, b = 4000, L = 1285)', () => {
  it('phase 500 gives seams at 500, 1785, 3070', () => {
    expect(seamsOf(0, 4000, L, 500)).toEqual([500, 1785, 3070]);
  });

  it('a seam at the wall is not a seam (phase 0 → first seam one board in)', () => {
    expect(seamsOf(0, 4000, L, 0)).toEqual([1285, 2570, 3855]);
    expect(seamsOf(0, 4000, L, 3855)).toEqual([1285, 2570, 3855]);
  });

  it('a seam landing exactly on the far wall is dropped, leaving a whole board (e = L)', () => {
    expect(seamsOf(0, 4000, L, 4000)).toEqual([145, 1430, 2715]);
  });

  it('a segment shorter than one board is unsplit when the seam falls outside', () => {
    expect(seamsOf(0, 1000, L, 1000)).toEqual([]);
    expect(seamsOf(0, 1000, L, 500)).toEqual([500]);
  });

  it('respects a non-zero start', () => {
    expect(seamsOf(10, 3990, L, 1300)).toEqual([15, 1300, 2585, 3870]);
  });
});

describe('fast path descriptors', () => {
  const { profile } = standalone(rectShape(0, 0, 4000, 192), 0, 192);

  it('closed rectangle, phase 500: extents 500, 1285, 1285, 930', () => {
    const p = describePiecesFast(profile, L, 500);
    expect(p.map((x) => x.extent)).toEqual([500, 1285, 1285, 930]);
    expect(p.map((x) => x.short)).toEqual(['start', 'full', 'full', 'end']);
    expect(p.every((x) => x.long === 'none' && x.width === 192)).toBe(true);
    expect(p.map((x) => x.lengthLow)).toEqual([500, 1285, 1285, 930]);
  });

  it('a whole board at the end: extent equals L', () => {
    const p = describePiecesFast(profile, L, 4000);
    expect(p.at(-1)?.extent).toBe(1285);
    expect(p.at(-1)?.short).toBe('end');
  });

  it('an unsplit segment is one free piece', () => {
    const { profile: small } = standalone(rectShape(0, 0, 1000, 192), 0, 192);
    const p = describePiecesFast(small, L, 1000);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ short: 'free', extent: 1000, x0: 0, x1: 1000 });
  });

  it('refuses a segment that is not on the fast path', () => {
    const { profile: notRect } = standalone(
      {
        outer: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 100 },
        ],
        holes: [],
      },
      0,
      100,
    );
    expect(() => describePiecesFast(notRect, L, 0)).toThrow();
  });
});

describe('general path: L-shaped row, hand-computed', () => {
  // Zone of the L room, y0 = 10: row 8 spans y ∈ [1354, 1546]; the wide part reaches y = 1490 only.
  const zone = buildZone({ outline: lShape, edges: uniform(6) }).shapes;
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);
  const graph = buildNeighbors(layout);
  const profile = buildProfiles(layout.segments, graph)['8a']!;
  const pieces = describePieces(profile, L, 1300); // seams 15, 1300, 2585, 3870

  it('takes the general path and cuts at the expected seams', () => {
    expect(profile.isRect).toBe(false);
    expect(pieces.map((p) => [p.x0, p.x1])).toEqual([
      [10, 15],
      [15, 1300],
      [1300, 2585],
      [2585, 3870],
      [3870, 3990],
    ]);
    expect(pieces.map((p) => p.short)).toEqual(['start', 'full', 'full', 'full', 'end']);
  });

  it('long edges and widths follow the open edges and the step at y = 1490', () => {
    expect(pieces.map((p) => p.long)).toEqual(['both', 'both', 'both', 'low', 'low']);
    // Pieces open on both sides are a full 192 wide; the last two only reach y = 1490 (136 mm).
    expect(pieces.map((p) => p.width)).toEqual(
      [192, 192, 192, 136, 136].map((w) => expect.closeTo(w, 6)),
    );
  });

  it('boundary lengths: the piece across the step has a shorter top edge', () => {
    const across = pieces[2]!; // x ∈ [1300, 2585]; narrow part ends at x = 1990
    expect(across.lengthLow).toBeCloseTo(1285, 6);
    expect(across.lengthHigh).toBeCloseTo(1990 - 1300, 6);
    expect(across.openHigh).toBeCloseTo(690, 6);
    expect(pieces[3]!.lengthHigh).toBe(0);
  });

  it('L_min: a bad phase has a hand-computed deficit, a good phase none', () => {
    // start [10,15]: open 5 low and 5 high → 295 + 295; end [3870,3990]: open 120 low → 180.
    expect(lengthDeficit(pieces, 300)).toBeCloseTo(295 + 295 + 180, 6);
    expect(meetsMinLength(pieces, 300)).toBe(false);
    const good = describePieces(profile, L, 410); // seams 410, 1695, 2980
    expect(good.map((p) => p.extent)).toEqual([400, 1285, 1285, 1010]);
    expect(meetsMinLength(good, 300)).toBe(true);
  });
});

describe('L_min rule for a piece without open edges', () => {
  const { profile } = standalone(rectShape(0, 0, 4000, 192), 0, 192);

  it('such a piece must itself be at least L_min long', () => {
    const p = describePieces(profile, L, 3900); // seams 45, 1330, 2615, 3900
    expect(p.map((x) => x.extent)).toEqual([45, 1285, 1285, 1285, 100]);
    expect(lengthDeficit(p, 300)).toBeCloseTo(255 + 200, 6);
  });

  it('full and free pieces are unconstrained', () => {
    const { profile: small } = standalone(rectShape(0, 0, 100, 192), 0, 192);
    expect(meetsMinLength(describePieces(small, L, 100), 300)).toBe(true);
  });
});

describe('complex segment (C shape)', () => {
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
  const { profile, segment } = standalone(c, 0, 300);

  it('descriptors use the extremes over all intervals of the cross-section', () => {
    expect(profile.complex).toBe(true);
    const p = describePieces(profile, L, 500); // seams 500, 1785
    expect(p.map((x) => x.extent)).toEqual([500, 1285, 1215]);
    expect(p.every((x) => x.long === 'none' && Math.abs(x.width - 300) < 1e-9)).toBe(true);
  });

  it('piece shapes can have several components', () => {
    // Seams at 1100 and 2385: the middle piece [1100, 2385] lies right of the spine (x < 1000),
    // so it consists of the two separate arms. Piece [0, 1100] contains the spine: one component.
    const shapes = pieceShapes(segment, seamsOf(segment.a, segment.b, L, 1100));
    expect(shapes).toHaveLength(3);
    expect(shapes[1]).toHaveLength(2);
    expect(shapes[0]).toHaveLength(1);
    expect(shapes[2]).toHaveLength(2);
  });
});

/** Every segment (with profile) of the reference rooms under a few row configurations. */
function corpus() {
  const items: { segment: Segment; profile: XProfile; layout: Layout; graph: NeighborGraph }[] = [];
  for (const room of referenceRooms) {
    const shapes = buildZone(room.input).shapes;
    for (const c of [
      { theta: 0, y0: 0 },
      { theta: 0, y0: 77 },
      { theta: Math.PI / 6, y0: 40 },
    ]) {
      const layout = buildBands(shapes, { ...c, stackSide: 'left' }, W);
      const graph = buildNeighbors(layout);
      const profiles = buildProfiles(layout.segments, graph);
      for (const segment of layout.segments)
        items.push({ segment, profile: profiles[segment.id]!, layout, graph });
    }
  }
  return items;
}

const items = corpus();
const phase = fc.double({ min: 0, max: L - 1e-6, noNaN: true });
const itemIndex = fc.integer({ min: 0, max: items.length - 1 });

const same = (p: PieceDescriptor, q: PieceDescriptor): boolean =>
  p.index === q.index &&
  p.short === q.short &&
  p.long === q.long &&
  (
    ['x0', 'x1', 'extent', 'width', 'lengthLow', 'lengthHigh', 'openLow', 'openHigh'] as const
  ).every((k) => Math.abs(p[k] - q[k]) < 1e-6);

describe('properties over the reference rooms', () => {
  it('the corpus contains fast-path, slanted and complex segments', () => {
    expect(items.length).toBeGreaterThan(100);
    expect(items.some((i) => i.profile.isRect)).toBe(true);
    expect(items.some((i) => !i.profile.isRect)).toBe(true);
    expect(items.some((i) => i.profile.complex)).toBe(true);
  });

  it('Σ extent = b − a and pieces tile [a, b] without gaps', () => {
    fc.assert(
      fc.property(itemIndex, phase, (i, phi) => {
        const { profile } = items[i]!;
        const pieces = describePieces(profile, L, phi);
        const total = pieces.reduce((s, p) => s + p.extent, 0);
        const contiguous = pieces.every(
          (p, k) => k === 0 || Math.abs(p.x0 - pieces[k - 1]!.x1) < 1e-9,
        );
        return (
          Math.abs(total - (profile.b - profile.a)) < 1e-6 &&
          contiguous &&
          pieces.every((p) => p.extent <= L + 1e-6 && p.extent > 0)
        );
      }),
      { numRuns: 500 },
    );
  });

  it('fast and general paths give identical descriptors for rectangle segments', () => {
    const rects = items.filter((i) => i.profile.isRect);
    expect(rects.length).toBeGreaterThan(20);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: rects.length - 1 }), phase, (i, phi) => {
        const { profile } = rects[i]!;
        const fast = describePiecesFast(profile, L, phi);
        const general = describePiecesGeneral(profile, L, phi);
        return fast.length === general.length && fast.every((p, k) => same(p, general[k]!));
      }),
      { numRuns: 500 },
    );
  });

  it('descriptors agree with the exact (Clipper) piece shapes: extent, width and boundary lengths', () => {
    fc.assert(
      fc.property(itemIndex, phase, (i, phi) => {
        const { segment, profile } = items[i]!;
        const seams = seamsOf(segment.a, segment.b, L, phi);
        const pieces = describePieces(profile, L, phi);
        const shapes = pieceShapes(segment, seams);
        if (shapes.length !== pieces.length) return false;
        return pieces.every((p, k) => {
          const parts = shapes[k]!;
          if (parts.length === 0) return false;
          const box = bbox(parts.flatMap((s) => s.outer));
          const low = parts.reduce(
            (s, sh) => s + measure(horizontalEdges(sh, segment.bandLo, 'bottom')),
            0,
          );
          const high = parts.reduce(
            (s, sh) => s + measure(horizontalEdges(sh, segment.bandHi, 'top')),
            0,
          );
          // Seams are snapped to the 0.01 mm Clipper grid: compare within 0.05 mm.
          const tol = 0.05;
          const widthRef =
            p.long === 'both'
              ? segment.bandHi - segment.bandLo
              : p.long === 'low'
                ? box.maxY - segment.bandLo
                : p.long === 'high'
                  ? segment.bandHi - box.minY
                  : box.maxY - box.minY;
          return (
            Math.abs(box.maxX - box.minX - p.extent) < tol &&
            Math.abs(widthRef - p.width) < tol &&
            Math.abs(low - p.lengthLow) < tol &&
            Math.abs(high - p.lengthHigh) < tol
          );
        });
      }),
      { numRuns: 300 },
    );
  });

  it('piece shapes tile the segment: areas add up to the segment area and the union equals it', () => {
    fc.assert(
      fc.property(itemIndex, phase, (i, phi) => {
        const { segment } = items[i]!;
        const seams = seamsOf(segment.a, segment.b, L, phi);
        const parts = pieceShapes(segment, seams).flat();
        const sum = shapesArea(parts);
        const area = shapeArea(segment.shape);
        const merged = shapesArea(union(parts));
        // Sum = union proves the pieces do not overlap; union = segment proves they cover it.
        // Seams cut slanted edges at points that Clipper snaps to its 0.01 mm grid; one snapped
        // vertex moves the area by at most 0.005 mm × the adjacent piece length (≤ L). Every seam
        // crosses the boundary at least twice. Axis-parallel shapes have no such error.
        const slanted = [segment.shape.outer, ...segment.shape.holes].some((ring) =>
          ring.some((p, k) => {
            const q = ring[(k + 1) % ring.length]!;
            return Math.abs(q.x - p.x) > 1e-9 && Math.abs(q.y - p.y) > 1e-9;
          }),
        );
        const tol = 0.02 + 1e-7 * area + (slanted ? 0.005 * L * 2 * seams.length : 0);
        return Math.abs(sum - area) < tol && Math.abs(merged - area) < tol;
      }),
      { numRuns: 300 },
    );
  });
});

describe('open edges of pieces against an independent oracle', () => {
  it('openLow / openHigh / extent agree with Clipper piece shapes ∩ the neighbours’ real edges', () => {
    fc.assert(
      fc.property(itemIndex, phase, (i, phi) => {
        const { segment, profile, layout, graph } = items[i]!;
        const seams = seamsOf(segment.a, segment.b, L, phi);
        const pieces = describePieces(profile, L, phi);
        const oracle = oraclePieces(layout, graph, segment, seams);
        // Seams are snapped to the 0.01 mm Clipper grid: compare within 0.05 mm.
        return (
          oracle.length === pieces.length &&
          pieces.every(
            (p, k) =>
              p.short === oracle[k]!.short &&
              Math.abs(p.extent - oracle[k]!.extent) < 0.05 &&
              Math.abs(p.openLow - oracle[k]!.openLow) < 0.05 &&
              Math.abs(p.openHigh - oracle[k]!.openHigh) < 0.05,
          )
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe('open-edge noise threshold', () => {
  it('an open edge of a hundredth of a millimetre does not demand L_min', () => {
    // 3000 × 192 rectangle whose bottom edge is "open" for only 0.01 mm (grid-snapping noise).
    const { profile } = standalone(rectShape(0, 0, 3000, 192), 0, 192, {
      low: [[0, 0.01]],
      high: [],
    });
    expect(profile.isRect).toBe(false); // partial open edge → general path
    const pieces = describePieces(profile, L, 100); // start piece [0, 100]
    expect(pieces[0]!.short).toBe('start');
    expect(pieces[0]!.openLow).toBeCloseTo(0.01, 9);
    expect(pieces[0]!.long).toBe('none');
    // Without the threshold this sliver would be an open edge needing 300 mm; it is no real open
    // edge, so the piece itself must be ≥ 300 mm: phase 100 is short; phase 500 (seams 500, 1785,
    // pieces 500 | 1285 | 1215) is fine at both ends.
    expect(lengthDeficit(pieces, 300)).toBeGreaterThan(0);
    expect(lengthDeficit(describePieces(profile, L, 500), 300)).toBe(0);
  });

  it('a real open edge of 0.05 mm still counts', () => {
    const { profile } = standalone(rectShape(0, 0, 3000, 192), 0, 192, {
      low: [[0, 0.05]],
      high: [],
    });
    expect(describePieces(profile, L, 400)[0]!.long).toBe('low');
  });
});
