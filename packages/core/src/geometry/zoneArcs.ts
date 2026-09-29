/**
 * Recovers which zone edges come from an outline arc (ALGORITHM §2.1). Clipper drops the
 * `sourceEdge` bookkeeping of `discretizePolygon`, so it is rebuilt geometrically: an edge belongs
 * to arc edge i when both endpoints and the midpoint lie on the circle concentric with that arc at
 * radius r ∓ g (inward offset by the wall gap), within tolerance, and inside the arc's angular span.
 */

import { mod, type Mm } from '../num/index';
import { arcFromBulge, ARC_TOL, type Arc } from './arcs';
import type { Shape } from './clip';
import type { Vec2 } from './vec';

/** Per shape: for every ring edge the index of the outline arc edge it lies on, or null. */
export interface EdgeSources {
  outer: (number | null)[];
  holes: (number | null)[][];
}

interface OffsetArc {
  index: number;
  arc: Arc;
  /** Radius of the inward-offset curve. */
  radius: Mm;
}

/** Endpoint/midpoint tolerance: polyline error of the source plus that of the offset ring. */
const ON_ARC_TOL = 2 * ARC_TOL;

function offsetArcs(
  outline: readonly Vec2[],
  edges: readonly { gap: Mm; bulge?: number }[],
): OffsetArc[] {
  const out: OffsetArc[] = [];
  const n = outline.length;
  edges.forEach((e, index) => {
    const bulge = e.bulge ?? 0;
    if (bulge === 0) return;
    const arc = arcFromBulge(outline[index] as Vec2, outline[(index + 1) % n] as Vec2, bulge);
    // CCW room: bulge > 0 bulges outwards, so the interior lies inside the circle (r − g).
    const radius = bulge > 0 ? arc.radius - e.gap : arc.radius + e.gap;
    if (radius > 0) out.push({ index, arc, radius });
  });
  return out;
}

function onCircle(p: Vec2, oa: OffsetArc): boolean {
  return Math.abs(Math.hypot(p.x - oa.arc.center.x, p.y - oa.arc.center.y) - oa.radius) <= ON_ARC_TOL;
}

function insideSpan(p: Vec2, oa: OffsetArc): boolean {
  const { arc } = oa;
  const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
  const t = arc.sweep > 0 ? angle - arc.startAngle : arc.startAngle - angle;
  const slack = ON_ARC_TOL / oa.radius;
  const along = mod(t + slack, 2 * Math.PI) - slack;
  return along <= Math.abs(arc.sweep) + slack;
}

function classifyRing(ring: readonly Vec2[], arcs: readonly OffsetArc[]): (number | null)[] {
  const n = ring.length;
  return ring.map((p, k) => {
    const q = ring[(k + 1) % n] as Vec2;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    for (const oa of arcs) {
      if (
        onCircle(p, oa) &&
        onCircle(q, oa) &&
        onCircle(mid, oa) &&
        insideSpan(p, oa) &&
        insideSpan(q, oa)
      ) {
        return oa.index;
      }
    }
    return null;
  });
}

export function recoverArcEdges(
  shapes: readonly Shape[],
  outline: readonly Vec2[],
  edges: readonly { gap: Mm; bulge?: number }[],
): EdgeSources[] {
  const arcs = offsetArcs(outline, edges);
  return shapes.map((s) => ({
    outer: arcs.length ? classifyRing(s.outer, arcs) : s.outer.map(() => null),
    holes: s.holes.map((h) => (arcs.length ? classifyRing(h, arcs) : h.map(() => null))),
  }));
}
