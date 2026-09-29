/**
 * Sequential ("on site") decoder (ALGORITHM §4.5): models laying without pre-cutting, where an
 * offcut can only be used by a row laid later. Basis of the B-INST baseline (F4); comparing
 * `precut` and `onsite` shows what pre-cutting saves.
 */

import type { PlanContext } from './context';
import { piecesForPhases, type LabelledPiece } from './context';
import { decodeSequential, type DecodeResult } from './decode';

/**
 * Laying order: band ascending, segments left to right inside a band, pieces left to right inside
 * a segment. `layout.segments` is already in band/x order, so this is a stable sort by that key.
 */
export function layingOrder(pieces: readonly LabelledPiece[], ctx: PlanContext): LabelledPiece[] {
  const segmentRank = new Map(ctx.layout.segments.map((s, i) => [s.id, i]));
  return [...pieces].sort(
    (p, q) =>
      p.band - q.band ||
      segmentRank.get(p.segmentId)! - segmentRank.get(q.segmentId)! ||
      p.descriptor.index - q.descriptor.index,
  );
}

/** Board count and boards of the sequential decoder for the phase vector `phi`. */
export function decodeOnsite(ctx: PlanContext, phi: readonly number[]): DecodeResult {
  const ordered = layingOrder(piecesForPhases(ctx, phi), ctx);
  return decodeSequential(
    ordered.map((p) => p.decode),
    ctx.decodeParams,
  );
}
