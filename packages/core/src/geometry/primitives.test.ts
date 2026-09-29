import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  area,
  bbox,
  ensureCCW,
  isSimple,
  locatePoint,
  orientation,
  pointInPolygon,
  signedArea,
} from './polygon';
import { pointSegmentDist, segmentIntersection } from './segment';
import { cross, dist, len, lerp, normalize, perp, rot, vec } from './vec';

const square = [vec(0, 0), vec(4000, 0), vec(4000, 3000), vec(0, 3000)];
const lShape = [
  vec(0, 0),
  vec(4000, 0),
  vec(4000, 1500),
  vec(2000, 1500),
  vec(2000, 3000),
  vec(0, 3000),
];

describe('vec', () => {
  it('basic operations', () => {
    expect(len(vec(3, 4))).toBe(5);
    expect(dist(vec(0, 0), vec(3, 4))).toBe(5);
    expect(cross(vec(1, 0), vec(0, 1))).toBe(1);
    expect(perp(vec(1, 0))).toEqual({ x: -0, y: 1 });
    expect(lerp(vec(0, 0), vec(10, 20), 0.5)).toEqual({ x: 5, y: 10 });
    expect(normalize(vec(0, 0))).toEqual({ x: 0, y: 0 });
    expect(len(normalize(vec(7, 24)))).toBeCloseTo(1, 12);
  });

  it('rot by 90° maps x to y', () => {
    const r = rot(vec(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });
});

describe('polygon area and orientation', () => {
  it('areas of known shapes', () => {
    expect(area(square)).toBe(12_000_000);
    expect(area(lShape)).toBe(4000 * 1500 + 2000 * 1500);
  });

  it('signed area flips with orientation', () => {
    expect(signedArea(square)).toBe(12_000_000);
    expect(signedArea([...square].reverse())).toBe(-12_000_000);
    expect(orientation(square)).toBe('ccw');
    expect(orientation([...square].reverse())).toBe('cw');
    expect(orientation([vec(0, 0), vec(1, 1), vec(2, 2)])).toBe('degenerate');
  });

  it('ensureCCW returns a CCW copy and does not mutate', () => {
    const cw = [...square].reverse();
    const copy = [...cw];
    expect(signedArea(ensureCCW(cw))).toBeGreaterThan(0);
    expect(cw).toEqual(copy);
  });

  it('bbox', () => {
    expect(bbox(lShape)).toEqual({ minX: 0, minY: 0, maxX: 4000, maxY: 3000 });
  });
});

describe('isSimple', () => {
  it('accepts convex and L polygons', () => {
    expect(isSimple(square)).toBe(true);
    expect(isSimple(lShape)).toBe(true);
  });

  it('rejects a bow-tie', () => {
    expect(isSimple([vec(0, 0), vec(10, 10), vec(10, 0), vec(0, 10)])).toBe(false);
  });

  it('rejects degenerate input', () => {
    expect(isSimple([vec(0, 0), vec(1, 0)])).toBe(false);
    expect(isSimple([vec(0, 0), vec(1, 1), vec(2, 2)])).toBe(false);
    expect(isSimple([vec(0, 0), vec(10, 0), vec(10, 0), vec(10, 10)])).toBe(false);
  });

  it('rejects a spike that folds back over its neighbour', () => {
    expect(isSimple([vec(0, 0), vec(10, 0), vec(5, 0), vec(5, 10)])).toBe(false);
  });
});

describe('locatePoint', () => {
  it('inside, outside, boundary', () => {
    expect(locatePoint(vec(100, 100), square)).toBe('inside');
    expect(locatePoint(vec(-1, 100), square)).toBe('outside');
    expect(locatePoint(vec(0, 100), square)).toBe('boundary');
    expect(locatePoint(vec(4000, 3000), square)).toBe('boundary');
    expect(pointInPolygon(vec(0, 100), square)).toBe(true);
  });

  it('handles the concave notch of the L shape', () => {
    expect(locatePoint(vec(3000, 2000), lShape)).toBe('outside');
    expect(locatePoint(vec(1000, 2000), lShape)).toBe('inside');
    expect(locatePoint(vec(3000, 1500), lShape)).toBe('boundary');
  });

  it('is independent of orientation (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 4500 }),
        fc.integer({ min: -500, max: 3500 }),
        (x, y) => locatePoint(vec(x, y), lShape) === locatePoint(vec(x, y), [...lShape].reverse()),
      ),
    );
  });
});

describe('segmentIntersection', () => {
  it('crossing', () => {
    const r = segmentIntersection(vec(0, 0), vec(10, 10), vec(0, 10), vec(10, 0));
    expect(r.kind).toBe('point');
    if (r.kind === 'point') {
      expect(r.point.x).toBeCloseTo(5, 12);
      expect(r.point.y).toBeCloseTo(5, 12);
    }
  });

  it('T-junction and end-touch count as points', () => {
    expect(segmentIntersection(vec(0, 0), vec(10, 0), vec(5, 0), vec(5, 5)).kind).toBe('point');
    expect(segmentIntersection(vec(0, 0), vec(10, 0), vec(10, 0), vec(10, 5)).kind).toBe('point');
  });

  it('near miss and parallel apart', () => {
    expect(segmentIntersection(vec(0, 0), vec(10, 0), vec(11, -1), vec(11, 1)).kind).toBe('none');
    expect(segmentIntersection(vec(0, 0), vec(10, 0), vec(0, 1), vec(10, 1)).kind).toBe('none');
  });

  it('collinear overlap, touching end, and disjoint', () => {
    const o = segmentIntersection(vec(0, 0), vec(10, 0), vec(5, 0), vec(20, 0));
    expect(o).toEqual({ kind: 'overlap', from: { x: 5, y: 0 }, to: { x: 10, y: 0 } });
    const t = segmentIntersection(vec(0, 0), vec(10, 0), vec(10, 0), vec(20, 0));
    expect(t.kind).toBe('overlap');
    expect(segmentIntersection(vec(0, 0), vec(10, 0), vec(11, 0), vec(20, 0)).kind).toBe('none');
  });

  it('is symmetric in whether an intersection exists (property)', () => {
    const p = fc.record({
      x: fc.integer({ min: -50, max: 50 }),
      y: fc.integer({ min: -50, max: 50 }),
    });
    fc.assert(
      fc.property(p, p, p, p, (a, b, c, d) => {
        const ab = segmentIntersection(a, b, c, d).kind === 'none';
        const ba = segmentIntersection(c, d, a, b).kind === 'none';
        return ab === ba;
      }),
    );
  });
});

describe('pointSegmentDist', () => {
  it('perpendicular, endpoint and degenerate cases', () => {
    expect(pointSegmentDist(vec(5, 3), vec(0, 0), vec(10, 0))).toBe(3);
    expect(pointSegmentDist(vec(13, 4), vec(0, 0), vec(10, 0))).toBe(5);
    expect(pointSegmentDist(vec(3, 4), vec(0, 0), vec(0, 0))).toBe(5);
  });
});
