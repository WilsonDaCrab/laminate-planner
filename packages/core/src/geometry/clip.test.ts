import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CLIPPER_SCALE,
  difference,
  inflate,
  intersect,
  polygonShape,
  rectShape,
  shapeArea,
  shapesArea,
  union,
  unionPaths,
} from './clip';
import { isSimple, signedArea } from './polygon';
import { vec } from './vec';

const a = rectShape(0, 0, 1000, 1000);
const b = rectShape(500, 500, 1500, 1500);

describe('booleans', () => {
  it('intersection of overlapping squares', () => {
    const r = intersect([a], [b]);
    expect(r).toHaveLength(1);
    expect(shapesArea(r)).toBeCloseTo(500 * 500, 6);
  });

  it('union area = A + B − A∩B', () => {
    expect(shapesArea(union([a], [b]))).toBeCloseTo(2 * 1e6 - 250_000, 6);
  });

  it('difference of a square with a corner square gives an L', () => {
    const r = difference([a], [b]);
    expect(r).toHaveLength(1);
    expect(shapesArea(r)).toBeCloseTo(1e6 - 250_000, 6);
    expect(r[0]?.outer).toHaveLength(6);
  });

  it('a square minus an inner square gives a frame with one hole (PolyTree)', () => {
    const r = difference([rectShape(0, 0, 4000, 3000)], [rectShape(1000, 1000, 2000, 2000)]);
    expect(r).toHaveLength(1);
    expect(r[0]?.holes).toHaveLength(1);
    expect(shapeArea(r[0]!)).toBeCloseTo(12e6 - 1e6, 6);
    // Orientation convention: outer CCW, hole CW.
    expect(signedArea(r[0]!.outer)).toBeGreaterThan(0);
    expect(signedArea(r[0]!.holes[0]!)).toBeLessThan(0);
  });

  it('an island inside a hole becomes its own shape', () => {
    const frame = difference([rectShape(0, 0, 5000, 5000)], [rectShape(500, 500, 4500, 4500)]);
    const island = rectShape(2000, 2000, 3000, 3000);
    const r = union(frame, [island]);
    expect(r).toHaveLength(2);
    expect(shapesArea(r)).toBeCloseTo(25e6 - 16e6 + 1e6, 6);
  });

  it('disjoint intersection is empty', () => {
    expect(intersect([a], [rectShape(5000, 5000, 6000, 6000)])).toEqual([]);
  });

  it('accepts clockwise input (orientation is normalised)', () => {
    const cwSquare = { outer: [...a.outer].reverse(), holes: [] };
    expect(shapesArea(intersect([cwSquare], [b]))).toBeCloseTo(250_000, 6);
  });

  it('property: |A∩B| + |A∪B| = |A| + |B| for random rectangles', () => {
    const rect = fc
      .tuple(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 10, max: 2000 }),
        fc.integer({ min: 10, max: 2000 }),
      )
      .map(([x, y, w, h]) => rectShape(x, y, x + w, y + h));
    fc.assert(
      fc.property(rect, rect, (p, q) => {
        const lhs = shapesArea(intersect([p], [q])) + shapesArea(union([p], [q]));
        return Math.abs(lhs - (shapeArea(p) + shapeArea(q))) < 1e-3;
      }),
    );
  });
});

describe('scaling', () => {
  it('snaps to the 0.01 mm grid and round-trips within half a step', () => {
    const p = polygonShape([
      vec(0.004, 0.006),
      vec(100.123, 0),
      vec(100.123, 50.987),
      vec(0, 50.987),
    ]);
    const r = union([p]);
    expect(r).toHaveLength(1);
    const half = 0.5 / CLIPPER_SCALE + 1e-9;
    for (const q of r[0]!.outer) {
      const near = p.outer.some((o) => Math.abs(o.x - q.x) <= half && Math.abs(o.y - q.y) <= half);
      expect(near).toBe(true);
    }
  });
});

describe('inflate', () => {
  it('miter offset of a rectangle grows every side by delta', () => {
    const r = inflate([rectShape(0, 0, 1000, 500)], 10);
    expect(r).toHaveLength(1);
    expect(shapeArea(r[0]!)).toBeCloseTo(1020 * 520, 3);
  });

  it('negative delta shrinks; too much collapses to nothing', () => {
    expect(shapesArea(inflate([rectShape(0, 0, 1000, 500)], -10))).toBeCloseTo(980 * 480, 3);
    expect(inflate([rectShape(0, 0, 1000, 500)], -300)).toEqual([]);
  });

  it('shrinking a frame grows its hole', () => {
    const frame = difference([rectShape(0, 0, 4000, 3000)], [rectShape(1000, 1000, 2000, 2000)]);
    const r = inflate(frame, -100);
    expect(r[0]?.holes).toHaveLength(1);
    expect(shapeArea(r[0]!)).toBeCloseTo(3800 * 2800 - 1200 * 1200, 3);
  });
});

describe('unionPaths', () => {
  it("cleans a self-intersecting bow-tie with the 'positive' rule", () => {
    const bow = [vec(0, 0), vec(1000, 1000), vec(1000, 0), vec(0, 1000)];
    const r = unionPaths([bow], 'positive');
    // Only the lobe with positive winding survives; each result is a simple polygon.
    expect(r.length).toBeGreaterThanOrEqual(1);
    for (const s of r) expect(isSimple(s.outer)).toBe(true);
    // The bow-tie is two triangles of 250 000 mm² with opposite winding; exactly one survives.
    expect(shapesArea(r)).toBeCloseTo(250_000, 3);
  });
});
