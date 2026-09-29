import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ARC_TOL,
  arcFromBulge,
  arcPoint,
  arcSegmentArea,
  bulgeFromSagitta,
  bulgeFromSweep,
  discretizeCircle,
  discretizeEdge,
  discretizePolygon,
  radiusFromChordSagitta,
  sweepFromBulge,
} from './arcs';
import { area, signedArea } from './polygon';
import { dist, vec } from './vec';

describe('bulge <-> arc', () => {
  it('a semicircle has bulge 1, centre at the chord midpoint and radius chord/2', () => {
    const arc = arcFromBulge(vec(0, 0), vec(1000, 0), 1);
    expect(arc.center.x).toBeCloseTo(500, 9);
    expect(arc.center.y).toBeCloseTo(0, 9);
    expect(arc.radius).toBeCloseTo(500, 9);
    expect(arc.sweep).toBeCloseTo(Math.PI, 12);
    expect(arc.sagitta).toBeCloseTo(500, 9);
  });

  it('positive bulge bulges to the right of the directed chord', () => {
    // Chord along +x; the right side is -y. The arc midpoint must have y < 0.
    const arc = arcFromBulge(vec(0, 0), vec(1000, 0), 0.5);
    expect(arcPoint(arc, 0.5).y).toBeLessThan(0);
    // Negative bulge mirrors it.
    const neg = arcFromBulge(vec(0, 0), vec(1000, 0), -0.5);
    expect(arcPoint(neg, 0.5).y).toBeGreaterThan(0);
  });

  it('arc endpoints coincide with p0 and p1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.double({ min: -3, max: 3, noNaN: true }).filter((b) => Math.abs(b) > 0.01),
        (x, y, dx, b) => {
          const p0 = vec(x, y);
          const p1 = vec(x + dx, y + dx / 2);
          const arc = arcFromBulge(p0, p1, b);
          return dist(arcPoint(arc, 0), p0) < 1e-6 && dist(arcPoint(arc, 1), p1) < 1e-6;
        },
      ),
    );
  });

  it('bulge <-> sweep round-trips', () => {
    for (const b of [-2, -1, -0.3, 0.1, 0.7, 1, 2.5]) {
      expect(bulgeFromSweep(sweepFromBulge(b))).toBeCloseTo(b, 12);
    }
  });

  it('chord/sagitta helpers agree with arcFromBulge', () => {
    const chord = 1200;
    const sagitta = 200;
    const b = bulgeFromSagitta(chord, sagitta, 1);
    const arc = arcFromBulge(vec(0, 0), vec(chord, 0), b);
    expect(arc.sagitta).toBeCloseTo(sagitta, 9);
    expect(arc.radius).toBeCloseTo(radiusFromChordSagitta(chord, sagitta), 9);
  });
});

describe('discretizeEdge', () => {
  it('straight edges add no points', () => {
    expect(discretizeEdge(vec(0, 0), vec(10, 0), 0)).toEqual([]);
  });

  it('a semicircle of diameter 1000 stays within ARC_TOL of the true arc', () => {
    const p0 = vec(0, 0);
    const p1 = vec(1000, 0);
    const arc = arcFromBulge(p0, p1, 1);
    const pts = [p0, ...discretizeEdge(p0, p1, 1), p1];
    for (const p of pts) expect(Math.abs(dist(p, arc.center) - arc.radius)).toBeLessThan(1e-9);
    // Deviation of each chord midpoint from the arc (the worst case) is ≤ ARC_TOL.
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as { x: number; y: number };
      const b = pts[i + 1] as { x: number; y: number };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(arc.radius - dist(m, arc.center)).toBeLessThanOrEqual(ARC_TOL + 1e-9);
    }
  });

  it('property: polyline stays within ARC_TOL for random radii and sweeps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 50, max: 5000 }),
        fc.double({ min: 0.05, max: 3.5, noNaN: true }),
        fc.boolean(),
        (r, sweep, negative) => {
          const chord = 2 * r * Math.sin(sweep / 2);
          const b = (negative ? -1 : 1) * bulgeFromSweep(sweep);
          const p0 = vec(0, 0);
          const p1 = vec(chord, 0);
          const arc = arcFromBulge(p0, p1, b);
          const pts = [p0, ...discretizeEdge(p0, p1, b), p1];
          if (pts.length - 1 < 2) return false;
          for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i] as { x: number; y: number };
            const c = pts[i + 1] as { x: number; y: number };
            const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
            if (arc.radius - dist(m, arc.center) > ARC_TOL + 1e-6) return false;
          }
          return true;
        },
      ),
    );
  });
});

describe('discretizePolygon', () => {
  // 2000 x 1000 rectangle with a semicircular bay (outward) on the right side (edge 1).
  const outline = [vec(0, 0), vec(2000, 0), vec(2000, 1000), vec(0, 1000)];

  it('keeps original vertices and tags every output edge with its source edge', () => {
    const d = discretizePolygon(outline, [0, 1, 0, 0]);
    expect(d.points.length).toBeGreaterThan(4);
    expect(d.sourceEdge.length).toBe(d.points.length);
    expect(d.fromArc.length).toBe(d.points.length);
    expect(d.sourceEdge.filter((e) => e === 1).length).toBeGreaterThanOrEqual(2);
    expect(d.fromArc.filter(Boolean).length).toBe(d.sourceEdge.filter((e) => e === 1).length);
    expect(d.sourceEdge[0]).toBe(0);
    expect(d.sourceEdge.at(-1)).toBe(3);
    for (const o of outline) expect(d.points.some((p) => dist(p, o) < 1e-9)).toBe(true);
  });

  it('bay (bulge > 0 on a CCW outline) adds area; niche (bulge < 0) removes area', () => {
    const base = area(outline);
    const r = 500;
    const bay = discretizePolygon(outline, [0, 1, 0, 0]);
    const niche = discretizePolygon(outline, [0, -1, 0, 0]);
    // Analytical: semicircle segment area = π r² / 2.
    const analytic = (Math.PI * r * r) / 2;
    const arc = arcFromBulge(vec(2000, 0), vec(2000, 1000), 1);
    expect(arcSegmentArea(arc)).toBeCloseTo(analytic, 6);
    expect(signedArea(bay.points)).toBeGreaterThan(base);
    expect(signedArea(niche.points)).toBeLessThan(base);
    // Polygon under-approximates a convex bulge; relative error is bounded by ARC_TOL / r.
    const err = Math.abs(signedArea(bay.points) - (base + analytic));
    expect(err / analytic).toBeLessThan((ARC_TOL / r) * 1.5);
    const errN = Math.abs(signedArea(niche.points) - (base - analytic));
    expect(errN / analytic).toBeLessThan((ARC_TOL / r) * 1.5);
  });
});

describe('discretizeCircle', () => {
  it('has at least 8 vertices, is CCW, and is within ARC_TOL of the circle', () => {
    const c = vec(100, 200);
    const pts = discretizeCircle(c, 400);
    expect(pts.length).toBeGreaterThanOrEqual(8);
    expect(signedArea(pts)).toBeGreaterThan(0);
    for (const p of pts) expect(dist(p, c)).toBeCloseTo(200, 9);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as { x: number; y: number };
      const b = pts[(i + 1) % pts.length] as { x: number; y: number };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(200 - dist(m, c)).toBeLessThanOrEqual(ARC_TOL + 1e-9);
    }
  });

  it('uses 8 vertices for a small circle', () => {
    expect(discretizeCircle(vec(0, 0), 4).length).toBe(8);
  });

  it('circumscribed mode contains the true circle', () => {
    const c = vec(0, 0);
    const pts = discretizeCircle(c, 400, 'circumscribed');
    expect(area(pts)).toBeGreaterThan(Math.PI * 200 * 200);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as { x: number; y: number };
      const b = pts[(i + 1) % pts.length] as { x: number; y: number };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(dist(m, c)).toBeGreaterThanOrEqual(200 - 1e-9);
    }
  });
});
