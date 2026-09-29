/**
 * Plan constructor (ALGORITHM §4.4): seam phases φ → concrete cutting plan. Runs the decoder core,
 * then attaches exact shapes (room and board coordinates), markers, statistics and warnings.
 */

import { shapeArea, shapesArea, type Shape } from '../geometry/clip';
import { applyAll, invert } from '../geometry/frames';
import type { Vec2 } from '../geometry/vec';
import { pieceShapes, lengthDeficit } from '../layout/pieces';
import type { PiecePart, Plan, PlanWarning, PlannedBoard, PlannedPiece } from '../model/plan';
import { lowerBounds } from '../bounds/bounds';
import { decode, decodeSequential } from './decode';
import { layingOrder } from './onsite';
import { pipeDrills, shapeFeatures, type PipeDrill } from './features';
import { piecesForPhases, seamsFor, type LabelledPiece, type PlanContext } from './context';

export interface BuildPlanOptions {
  /** Precomputed lower bounds (they do not depend on φ); computed from the context if omitted. */
  bounds?: { lb0: number; lb1: number };
  /** Decoder: global pairing (`precut`) or sequential laying (`onsite`). Default: project setting. */
  mode?: 'precut' | 'onsite';
}

const boardId = (index: number): string => `D${String(index + 1).padStart(2, '0')}`;

/** Row-frame x/y → board coordinates for a piece placed at `rect` (see the reference rules below). */
function toBoard(
  p: Vec2,
  rect: { x: number; y: number },
  x0: number,
  yRef: number,
): { x: number; y: number } {
  return { x: rect.x + (p.x - x0), y: rect.y + (p.y - yRef) };
}

export function buildPlan(
  ctx: PlanContext,
  phi: readonly number[],
  opts: BuildPlanOptions = {},
): Plan {
  const { L, W, project, layout } = ctx;
  const labelled = piecesForPhases(ctx, phi);
  const mode = opts.mode ?? project.settings.mode;
  const decoded =
    mode === 'onsite'
      ? decodeSequential(
          layingOrder(labelled, ctx).map((p) => p.decode),
          ctx.decodeParams,
        )
      : decode(
          labelled.map((p) => p.decode),
          ctx.decodeParams,
        );
  const placement = new Map<
    string,
    { board: number; rect: PlannedBoard['placements'][0]['rect'] }
  >();
  for (const bd of decoded.boards) {
    for (const pl of bd.placements) placement.set(pl.pieceId, { board: bd.index, rect: pl.rect });
  }

  const warnings: PlanWarning[] = [];
  const toRoom = invert(layout.frame);
  const segmentIndex = new Map(layout.segments.map((s, i) => [s.id, i]));
  const shapesBySegment = new Map<string, Shape[][]>();
  const shapesOf = (piece: LabelledPiece): Shape[] => {
    let per = shapesBySegment.get(piece.segmentId);
    if (!per) {
      const segment = layout.segments[segmentIndex.get(piece.segmentId)!]!;
      const seams = seamsFor(ctx, piece.segmentId, phi[segmentIndex.get(piece.segmentId)!]!);
      per = pieceShapes(segment, seams);
      shapesBySegment.set(piece.segmentId, per);
    }
    return per[piece.descriptor.index] ?? [];
  };

  const drillsByPipe = new Map<string, PipeDrill[]>();
  const pieces: PlannedPiece[] = labelled.map((lp) => {
    const d = lp.descriptor;
    const pl = placement.get(lp.id)!;
    const shapes = [...shapesOf(lp)].sort((p, q) => shapeArea(q) - shapeArea(p));
    const segment = layout.segments[segmentIndex.get(lp.segmentId)!]!;
    const minY = shapes.length ? Math.min(...shapes.flatMap((s) => s.outer.map((p) => p.y))) : 0;
    // y in the row frame that maps to rect.y: pieces anchored to the low edge start at the band
    // floor; high pieces are as tall as `width` below the band ceiling; the rest start at their min.
    const yRef =
      d.long === 'high' ? segment.bandHi - d.width : d.long === 'none' ? minY : segment.bandLo;
    const parts: PiecePart[] = shapes.map((s) => ({
      outline: applyAll(toRoom, s.outer),
      holes: s.holes.map((h) => applyAll(toRoom, h)),
      boardOutline: s.outer.map((p) => toBoard(p, pl.rect, d.x0, yRef)),
    }));
    if (parts.length === 0) {
      warnings.push({
        code: 'emptyPiece',
        message: `Piece ${lp.id} has no area`,
        refs: [lp.id],
      });
    }
    const featureInput = {
      short: d.short,
      long: d.long,
      rect: pl.rect,
      parts,
      toBoard: (p: Vec2) => toBoard(p, pl.rect, d.x0, yRef),
    };
    const drills = pipeDrills(ctx, featureInput);
    for (const dr of drills)
      drillsByPipe.set(dr.pipeId, [...(drillsByPipe.get(dr.pipeId) ?? []), dr]);
    return {
      id: lp.id,
      roomId: ctx.room.id,
      band: lp.band,
      segmentId: lp.segmentId,
      indexInRow: d.index,
      short: d.short,
      long: d.long,
      extent: d.extent,
      lengthLow: d.lengthLow,
      lengthHigh: d.lengthHigh,
      width: d.width,
      outline: parts[0]?.outline ?? [],
      parts,
      boardId: boardId(pl.board),
      boardRect: pl.rect,
      features: [...shapeFeatures(ctx, featureInput), ...drills.map((dr) => dr.feature)],
    };
  });

  for (const o of ctx.room.obstacles) {
    if (o.kind !== 'pipe') continue;
    const hits = drillsByPipe.get(o.id) ?? [];
    if (hits.length === 0) {
      warnings.push({
        code: 'pipeOutsideFloor',
        message: `Pipe ${o.id} is not on the floor`,
        refs: [o.id],
      });
    } else if (hits.length > 1 || !hits[0]!.clear) {
      warnings.push({ code: 'pipeOnSeam', message: `Pipe ${o.id} meets a cut edge`, refs: [o.id] });
    }
  }

  const boards: PlannedBoard[] = decoded.boards.map((bd) => ({
    id: boardId(bd.index),
    placements: bd.placements.map((p) => ({ pieceId: p.pieceId, rect: p.rect })),
  }));

  // Warnings that do not depend on the decoder.
  for (const s of layout.segments) {
    if (ctx.feasible[s.id]!.relaxed) {
      warnings.push({
        code: 'minLengthRelaxed',
        message: `No seam phase satisfies the minimum piece length in segment ${s.id}`,
        refs: [s.id],
      });
    }
  }
  const minLen = project.rules.minPieceLength;
  layout.segments.forEach((s, i) => {
    const deficit = lengthDeficit(
      labelled.filter((p) => p.segmentId === s.id).map((p) => p.descriptor),
      minLen,
    );
    if (deficit > 0 && !ctx.feasible[s.id]!.relaxed) {
      warnings.push({
        code: 'minLength',
        message: `Phase ${phi[i]} of segment ${s.id} breaks the minimum piece length by ${deficit} mm`,
        refs: [s.id],
      });
    }
  });
  for (const w of ctx.zone.warnings) {
    warnings.push({
      code: w.code,
      message: `Zone: ${w.code}`,
      refs: 'edge' in w ? [`edge:${w.edge}`] : [],
    });
  }

  const areaInstalled = shapesArea(ctx.zone.shapes);
  const B = decoded.B;
  const { lb0, lb1 } = opts.bounds ?? lowerBounds(ctx);
  const stats = {
    boards: B,
    packs: Math.ceil(
      (B * (1 + project.rules.reservePercent / 100)) / project.product.boardsPerPack,
    ),
    wastePct: B > 0 ? (1 - areaInstalled / (B * L * W)) * 100 : 0,
    areaInstalled,
    lb0,
    lb1,
    provenOptimal: B > 0 && B === Math.max(lb0, lb1),
  };
  return { boards, pieces, stats, warnings };
}
