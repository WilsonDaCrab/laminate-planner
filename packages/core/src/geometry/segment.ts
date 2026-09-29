import { EPS } from '../num/index';
import { cross, dot, sub, type Vec2 } from './vec';

export type SegmentIntersection =
  | { kind: 'none' }
  | { kind: 'point'; point: Vec2; t: number; u: number }
  /** Collinear segments sharing a stretch [from, to] (from may equal to for a touching end). */
  | { kind: 'overlap'; from: Vec2; to: Vec2 };

/**
 * Intersection of segments p→p2 and q→q2. For a single crossing `t` and `u` are the
 * parameters along the first and second segment. Endpoint touches count as intersections.
 */
export function segmentIntersection(p: Vec2, p2: Vec2, q: Vec2, q2: Vec2): SegmentIntersection {
  const r = sub(p2, p);
  const s = sub(q2, q);
  const qp = sub(q, p);
  const rxs = cross(r, s);
  const rLen2 = dot(r, r);
  const sLen2 = dot(s, s);
  // Scale the tolerance by the segment lengths so that it works in mm regardless of size.
  const parallelTol = EPS * Math.sqrt(rLen2 * sLen2);

  // Degenerate (zero-length) segments are points: test them against the other segment directly,
  // because the cross-product tests below say nothing when a direction vector is zero.
  if (rLen2 === 0 || sLen2 === 0) {
    if (rLen2 === 0 && sLen2 === 0) {
      return qp.x * qp.x + qp.y * qp.y <= EPS * EPS
        ? { kind: 'overlap', from: p, to: p }
        : { kind: 'none' };
    }
    const [pt, a, b] = rLen2 === 0 ? [p, q, q2] : [q, p, p2];
    return pointSegmentDist(pt, a, b) <= EPS
      ? { kind: 'overlap', from: pt, to: pt }
      : { kind: 'none' };
  }

  if (Math.abs(rxs) <= parallelTol) {
    if (Math.abs(cross(qp, r)) > EPS * Math.sqrt(rLen2)) return { kind: 'none' }; // parallel, apart
    // Collinear: project q, q2 onto p→p2.
    const [a, a2, b, b2] = [p, p2, q, q2];
    const d = sub(a2, a);
    const dLen2 = dot(d, d);
    const tb = dot(sub(b, a), d) / dLen2;
    const tb2 = dot(sub(b2, a), d) / dLen2;
    const lo = Math.max(0, Math.min(tb, tb2));
    const hi = Math.min(1, Math.max(tb, tb2));
    const tol = EPS / Math.sqrt(dLen2);
    if (lo > hi + tol) return { kind: 'none' };
    const at = (t: number): Vec2 => ({ x: a.x + d.x * t, y: a.y + d.y * t });
    return { kind: 'overlap', from: at(lo), to: at(Math.max(lo, hi)) };
  }

  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;
  const tolT = EPS / Math.sqrt(rLen2);
  const tolU = EPS / Math.sqrt(sLen2);
  if (t < -tolT || t > 1 + tolT || u < -tolU || u > 1 + tolU) return { kind: 'none' };
  return { kind: 'point', point: { x: p.x + r.x * t, y: p.y + r.y * t }, t, u };
}

/** Shortest distance from point `p` to segment a→b. */
export function pointSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
}
