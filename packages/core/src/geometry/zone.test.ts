import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ARC_TOL } from './arcs';
import { intersect, polygonShape, shapeArea, shapesArea, type Shape } from './clip';
import { area, isSimple, locatePoint } from './polygon';
import { vec, type Vec2 } from './vec';
import { buildZone, type ZoneInput } from './zone';

const rectOutline = (w: number, h: number): Vec2[] => [vec(0, 0), vec(w, 0), vec(w, h), vec(0, h)];
const uniform = (n: number, gap: number) => Array.from({ length: n }, () => ({ gap }));

function totalArea(shapes: Shape[]): number {
  return shapesArea(shapes);
}

describe('rectangle', () => {
  it('uniform gap 10 gives (w−20)(h−20)', () => {
    const r = buildZone({ outline: rectOutline(4000, 3000), edges: uniform(4, 10) });
    expect(r.warnings).toEqual([]);
    expect(r.shapes).toHaveLength(1);
    expect(totalArea(r.shapes)).toBeCloseTo(3980 * 2980, 3);
  });

  it('per-edge gaps: left wall 15, others 10', () => {
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: [{ gap: 10 }, { gap: 10 }, { gap: 10 }, { gap: 15 }],
    });
    // edge 3 is the left wall (0,3000) → (0,0)
    expect(totalArea(r.shapes)).toBeCloseTo((4000 - 10 - 15) * 2980, 3);
  });

  it('rejects a clockwise outline and mismatched edges', () => {
    expect(() =>
      buildZone({ outline: rectOutline(10, 10).reverse(), edges: uniform(4, 1) }),
    ).toThrow();
    expect(() => buildZone({ outline: rectOutline(10, 10), edges: uniform(3, 1) })).toThrow();
  });
});

describe('L shape', () => {
  const outline = [
    vec(0, 0),
    vec(4000, 0),
    vec(4000, 1500),
    vec(2000, 1500),
    vec(2000, 3000),
    vec(0, 3000),
  ];

  it('gap 10: hand-computed area 8 860 400 (3980×1480 + 1980×1500)', () => {
    const r = buildZone({ outline, edges: uniform(6, 10) });
    expect(r.shapes).toHaveLength(1);
    expect(totalArea(r.shapes)).toBeCloseTo(3980 * 1480 + 1980 * 1500, 3);
    expect(isSimple(r.shapes[0]!.outer)).toBe(true);
  });
});

describe('convex polygons: A′ = A − g·P + g²·Σ tan(τ/2)', () => {
  const offsetArea = (poly: Vec2[], g: number): { area: number; perimeter: number } => {
    let perimeter = 0;
    let tanSum = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[(i + n - 1) % n]!;
      const b = poly[i]!;
      const c = poly[(i + 1) % n]!;
      perimeter += Math.hypot(c.x - b.x, c.y - b.y);
      const turn = Math.atan2(
        (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
        (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
      );
      tanSum += Math.tan(turn / 2);
    }
    return { area: area(poly) - g * perimeter + g * g * tanSum, perimeter };
  };

  // Offset vertices are snapped to the 0.01 mm Clipper grid, so the area error is bounded by
  // perimeter × 0.005 mm (see ADR-011).
  it('trapezoid 5000/3000 wide, 3000 high, gap 12', () => {
    const outline = [vec(0, 0), vec(5000, 0), vec(4000, 3000), vec(1000, 3000)];
    const r = buildZone({ outline, edges: uniform(4, 12) });
    const expected = offsetArea(outline, 12);
    expect(r.warnings).toEqual([]);
    expect(Math.abs(totalArea(r.shapes) - expected.area)).toBeLessThan(expected.perimeter * 0.005);
  });

  it('parallelogram, gap 10', () => {
    const outline = [vec(0, 0), vec(4000, 0), vec(5500, 2000), vec(1500, 2000)];
    const r = buildZone({ outline, edges: uniform(4, 10) });
    const expected = offsetArea(outline, 10);
    expect(Math.abs(totalArea(r.shapes) - expected.area)).toBeLessThan(expected.perimeter * 0.005);
  });
});

describe('obstacles', () => {
  it('square column 400×400 with gap 20 leaves a hole of 440×440', () => {
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      obstacles: [
        {
          kind: 'polygon',
          points: [vec(1800, 1300), vec(2200, 1300), vec(2200, 1700), vec(1800, 1700)],
          gap: 20,
        },
      ],
    });
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0]!.holes).toHaveLength(1);
    expect(totalArea(r.shapes)).toBeCloseTo(3980 * 2980 - 440 * 440, 2);
  });

  it('clockwise obstacle polygons are accepted', () => {
    const cw = [vec(1800, 1700), vec(2200, 1700), vec(2200, 1300), vec(1800, 1300)];
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      obstacles: [{ kind: 'polygon', points: cw, gap: 20 }],
    });
    expect(totalArea(r.shapes)).toBeCloseTo(3980 * 2980 - 440 * 440, 2);
  });

  it('round column ⌀400 with gap 20: hole contains the r = 220 circle, area within 1 %', () => {
    const center = vec(2000, 1500);
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      obstacles: [{ kind: 'circle', center, diameter: 400, gap: 20 }],
    });
    const hole = r.shapes[0]!.holes[0]!;
    for (let k = 0; k < 360; k += 5) {
      const a = (k * Math.PI) / 180;
      const p = vec(center.x + 220 * Math.cos(a), center.y + 220 * Math.sin(a));
      expect(locatePoint(p, hole)).not.toBe('outside');
    }
    const holeArea = 3980 * 2980 - totalArea(r.shapes);
    expect(Math.abs(holeArea / (Math.PI * 220 * 220) - 1)).toBeLessThan(0.01);
  });

  it('an obstacle that touches the wall splits or notches the zone without holes', () => {
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      obstacles: [
        {
          kind: 'polygon',
          points: [vec(-100, 1000), vec(300, 1000), vec(300, 1400), vec(-100, 1400)],
          gap: 0,
        },
      ],
    });
    expect(r.shapes).toHaveLength(1);
    expect(r.shapes[0]!.holes).toHaveLength(0);
    expect(totalArea(r.shapes)).toBeCloseTo(3980 * 2980 - 290 * 400, 2);
  });
});

describe('arcs', () => {
  const analyticBound = (arcLength: number) => ARC_TOL * arcLength + 50;

  it('semicircular bay (bulge +1 on the right wall) matches the analytic area within ARC_TOL', () => {
    const input: ZoneInput = {
      outline: rectOutline(4000, 3000),
      edges: [{ gap: 10 }, { gap: 10, bulge: 1 }, { gap: 10 }, { gap: 10 }],
    };
    const r = buildZone(input);
    // Rectangle x ∈ [10, 4000], y ∈ [10, 2990] plus a semicircle of radius 1490 (arc offset inwards).
    const analytic = 3990 * 2980 + (Math.PI * 1490 * 1490) / 2;
    expect(r.shapes).toHaveLength(1);
    expect(Math.abs(totalArea(r.shapes) - analytic)).toBeLessThan(analyticBound(Math.PI * 1490));
  });

  it('semicircular niche (bulge −1) matches the analytic area within ARC_TOL', () => {
    const input: ZoneInput = {
      outline: rectOutline(4000, 3000),
      edges: [{ gap: 10 }, { gap: 10, bulge: -1 }, { gap: 10 }, { gap: 10 }],
    };
    const r = buildZone(input);
    // The niche keeps the floor 10 mm away from the arc: a half disk of radius R = 1510 around
    // (4000, 1500) is removed, but only inside the strip |y − 1500| ≤ a = 1490 (walls at y = 10, 2990):
    //   ∫_{−a}^{a} √(R² − t²) dt = a·√(R² − a²) + R²·asin(a / R).
    const R = 1510;
    const a = 1490;
    const removed = a * Math.sqrt(R * R - a * a) + R * R * Math.asin(a / R);
    const analytic = 3990 * 2980 - removed;
    expect(Math.abs(totalArea(r.shapes) - analytic)).toBeLessThan(
      analyticBound(2 * R * Math.asin(a / R)),
    );
  });
});

describe('doorways', () => {
  it('extends the zone through and under the frame: 940 × (depth 100 + gap 10)', () => {
    const base = buildZone({ outline: rectOutline(4000, 3000), edges: uniform(4, 10) });
    const r = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      doorways: [{ edge: 0, offset: 1000, width: 900, depth: 100, jambUndercut: 20 }],
    });
    expect(r.warnings).toEqual([]);
    expect(r.shapes).toHaveLength(1);
    expect(totalArea(r.shapes) - totalArea(base.shapes)).toBeCloseTo(940 * 110, 2);
  });

  it('warns for a doorway on an arc or outside the edge', () => {
    const arc = buildZone({
      outline: rectOutline(4000, 3000),
      edges: [{ gap: 10 }, { gap: 10, bulge: 0.5 }, { gap: 10 }, { gap: 10 }],
      doorways: [{ edge: 1, offset: 100, width: 900, depth: 100, jambUndercut: 20 }],
    });
    expect(arc.warnings.some((w) => w.code === 'doorwayOnArc')).toBe(true);
    const out = buildZone({
      outline: rectOutline(4000, 3000),
      edges: uniform(4, 10),
      doorways: [{ edge: 0, offset: 3700, width: 900, depth: 100, jambUndercut: 20 }],
    });
    expect(out.warnings.some((w) => w.code === 'doorwayOutOfRange')).toBe(true);
  });
});

describe('degenerate input', () => {
  it('a very sharp corner is bevelled with a warning and the zone stays simple', () => {
    // Thin wedge: the corner at (4000, 0) has an interior angle of about 1.4°.
    const outline = [vec(0, 0), vec(4000, 0), vec(0, 100)];
    const r = buildZone({ outline, edges: uniform(3, 10) });
    expect(r.warnings.some((w) => w.code === 'sharpCorner')).toBe(true);
    for (const s of r.shapes) expect(isSimple(s.outer)).toBe(true);
    // Inward offset of a triangle is a similar triangle with inradius r − g, so the exact area is
    // A·((r − g)/r)². The convex mitre tip must survive (it is the exact offset), not be truncated.
    const c = Math.hypot(4000, 100);
    const inradius = 200_000 / ((4000 + 100 + c) / 2);
    const exact = 200_000 * ((inradius - 10) / inradius) ** 2;
    expect(r.shapes).toHaveLength(1);
    expect(Math.abs(totalArea(r.shapes) - exact)).toBeLessThan((4000 + 100 + c) * 0.005);
  });

  it('reports the interior angle of a sharp convex corner (< 30°)', () => {
    const r = buildZone({
      outline: [vec(0, 0), vec(4000, 0), vec(0, 100)],
      edges: uniform(3, 10),
    });
    const w = r.warnings.find((x) => x.code === 'sharpCorner');
    expect(w && w.code === 'sharpCorner' ? w.angleDeg : NaN).toBeCloseTo(1.43, 1);
  });

  it('rejects duplicate vertices (zero-length edges)', () => {
    expect(() =>
      buildZone({
        outline: [vec(0, 0), vec(100, 0), vec(100, 0), vec(100, 100), vec(0, 100)],
        edges: uniform(5, 5),
      }),
    ).toThrow(/zero length/);
  });

  it('a strip narrower than twice the gap collapses to an empty zone with a warning', () => {
    const r = buildZone({ outline: rectOutline(4000, 15), edges: uniform(4, 10) });
    expect(r.shapes).toEqual([]);
    expect(r.warnings).toContainEqual({ code: 'emptyZone' });
  });
});

/** Random simple rectilinear "histogram" polygons: bars of random width/height on a common baseline. */
const histogram = fc
  .array(
    fc.record({
      w: fc.integer({ min: 200, max: 1500 }),
      h: fc.integer({ min: 300, max: 3000 }),
    }),
    { minLength: 1, maxLength: 7 },
  )
  .map((bars) => {
    // Neighbouring bars must differ in height, otherwise they would merge into collinear edges.
    const heights: number[] = [];
    for (const b of bars) heights.push(heights.at(-1) === b.h ? b.h + 50 : b.h);
    const pts: Vec2[] = [vec(0, 0)];
    let x = 0;
    bars.forEach((b) => (x += b.w));
    pts.push(vec(x, 0));
    let right = x;
    for (let i = bars.length - 1; i >= 0; i--) {
      const h = heights[i]!;
      pts.push(vec(right, h));
      right -= bars[i]!.w;
      pts.push(vec(right, h));
    }
    // Drop vertices that are collinear duplicates (equal consecutive heights merged above).
    return pts.filter((p, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length]!;
      const next = pts[(i + 1) % pts.length]!;
      const cr = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
      return Math.abs(cr) > 1e-9;
    });
  });

describe('property: random rectilinear rooms', () => {
  it('Z ⊂ P, Z is simple, and area(Z) = A − g·P + 4g² (exact for uniform gap)', () => {
    fc.assert(
      fc.property(histogram, fc.integer({ min: 1, max: 40 }), (outline, g) => {
        if (!isSimple(outline)) return true; // generator artefact, not what we test
        const perimeter = outline.reduce((s, p, i) => {
          const q = outline[(i + 1) % outline.length]!;
          return s + Math.hypot(q.x - p.x, q.y - p.y);
        }, 0);
        const r = buildZone({ outline, edges: uniform(outline.length, g) });
        const z = totalArea(r.shapes);
        const inside = shapesArea(intersect(r.shapes, [polygonShape(outline)]));
        return (
          r.shapes.every((s) => s.holes.length === 0 && isSimple(s.outer)) &&
          z <= area(outline) &&
          Math.abs(inside - z) < 0.5 &&
          Math.abs(z - (area(outline) - g * perimeter + 4 * g * g)) < 0.5
        );
      }),
      { numRuns: 200 },
    );
  });
});

describe('shape helper sanity', () => {
  it('shapeArea of a plain polygon shape equals its polygon area', () => {
    const s = polygonShape(rectOutline(100, 50));
    expect(shapeArea(s)).toBe(5000);
  });
});
