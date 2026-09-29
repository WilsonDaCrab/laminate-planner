import { EPS } from '../num/index';
import { pointSegmentDist, segmentIntersection } from './segment';
import type { Vec2 } from './vec';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Shoelace area; > 0 for counter-clockwise, < 0 for clockwise. */
export function signedArea(poly: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % poly.length] as Vec2;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const area = (poly: readonly Vec2[]): number => Math.abs(signedArea(poly));

export function orientation(poly: readonly Vec2[]): 'ccw' | 'cw' | 'degenerate' {
  const a = signedArea(poly);
  if (Math.abs(a) <= EPS) return 'degenerate';
  return a > 0 ? 'ccw' : 'cw';
}

/** Returns the polygon in counter-clockwise order (a reversed copy if it was clockwise). */
export function ensureCCW(poly: readonly Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
}

export function bbox(points: readonly Vec2[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export type PointLocation = 'inside' | 'outside' | 'boundary';

/** Point in polygon (any orientation); points within EPS of an edge are 'boundary'. */
export function locatePoint(p: Vec2, poly: readonly Vec2[]): PointLocation {
  const n = poly.length;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const b = poly[(i + 1) % n] as Vec2;
    if (pointSegmentDist(p, a, b) <= EPS) return 'boundary';
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

/** True for points strictly inside or on the boundary. */
export const pointInPolygon = (p: Vec2, poly: readonly Vec2[]): boolean =>
  locatePoint(p, poly) !== 'outside';

/**
 * A polygon is simple when it has ≥ 3 vertices, non-zero area, no repeated vertices and
 * no two edges intersect except adjacent edges at their shared vertex.
 */
export function isSimple(poly: readonly Vec2[]): boolean {
  const n = poly.length;
  if (n < 3 || Math.abs(signedArea(poly)) <= EPS) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    for (let j = i + 1; j < n; j++) {
      const b = poly[j] as Vec2;
      if (Math.hypot(a.x - b.x, a.y - b.y) <= EPS) return false;
    }
  }
  for (let i = 0; i < n; i++) {
    const a = poly[i] as Vec2;
    const a2 = poly[(i + 1) % n] as Vec2;
    for (let j = i + 1; j < n; j++) {
      const b = poly[j] as Vec2;
      const b2 = poly[(j + 1) % n] as Vec2;
      const adjacentNext = j === i + 1;
      const adjacentWrap = i === 0 && j === n - 1;
      const hit = segmentIntersection(a, a2, b, b2);
      if (hit.kind === 'none') continue;
      if (adjacentNext || adjacentWrap) {
        // Neighbours may only touch at the shared vertex (no folding back over each other).
        if (
          hit.kind === 'overlap' &&
          Math.hypot(hit.from.x - hit.to.x, hit.from.y - hit.to.y) > EPS
        ) {
          return false;
        }
        continue;
      }
      return false;
    }
  }
  return true;
}
