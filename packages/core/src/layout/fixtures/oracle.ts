/**
 * Independent oracle for piece-level open edges and the L_min rule, used by tests. It never calls
 * `describePieces`: open lengths come from the exact Clipper piece shapes intersected with the
 * neighbouring segments' actual boundary edges, and extents from the shapes' bounding boxes.
 */

import { bbox } from '../../geometry/polygon';
import { intersectIntervals, measure, normalizeIntervals } from '../../num/intervals';
import { segmentById, type Layout, type Segment } from '../bands';
import { horizontalEdges, MIN_OPEN_LENGTH, type NeighborGraph } from '../neighbors';
import { pieceShapes } from '../pieces';

export interface OraclePiece {
  short: 'start' | 'end' | 'full' | 'free';
  extent: number;
  openLow: number;
  openHigh: number;
}

export function oraclePieces(
  layout: Layout,
  graph: NeighborGraph,
  segment: Segment,
  seams: readonly number[],
): OraclePiece[] {
  const below = normalizeIntervals(
    graph.down[segment.id]!.flatMap((id) => {
      const t = segmentById(layout, id)!;
      return horizontalEdges(t.shape, t.bandHi, 'top');
    }),
  );
  const above = normalizeIntervals(
    graph.up[segment.id]!.flatMap((id) => {
      const t = segmentById(layout, id)!;
      return horizontalEdges(t.shape, t.bandLo, 'bottom');
    }),
  );

  return pieceShapes(segment, seams).map((parts, i) => {
    const bottom = normalizeIntervals(
      parts.flatMap((sh) => horizontalEdges(sh, segment.bandLo, 'bottom')),
    );
    const top = normalizeIntervals(
      parts.flatMap((sh) => horizontalEdges(sh, segment.bandHi, 'top')),
    );
    const box = bbox(parts.flatMap((s) => s.outer));
    return {
      short: seams.length === 0 ? 'free' : i === 0 ? 'start' : i === seams.length ? 'end' : 'full',
      extent: box.maxX - box.minX,
      openLow: measure(intersectIntervals(bottom, below)),
      openHigh: measure(intersectIntervals(top, above)),
    };
  });
}

/** The L_min rule (ADR-012) evaluated on oracle pieces; `tol` absorbs the 0.01 mm grid. */
export function oracleMeetsMinLength(
  pieces: readonly OraclePiece[],
  minLength: number,
  tol: number,
): boolean {
  return pieces.every((p) => {
    if (p.short !== 'start' && p.short !== 'end') return true;
    const lows = p.openLow > MIN_OPEN_LENGTH;
    const highs = p.openHigh > MIN_OPEN_LENGTH;
    if (lows && p.openLow < minLength - tol) return false;
    if (highs && p.openHigh < minLength - tol) return false;
    if (!lows && !highs && p.extent < minLength - tol) return false;
    return true;
  });
}
