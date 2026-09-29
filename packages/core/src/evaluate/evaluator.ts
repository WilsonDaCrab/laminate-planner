/**
 * The evaluation interface the optimisers program against. `createReferenceEvaluator` wraps the
 * object-based `evaluate` (the reference of ALGORITHM §14: simple and obviously correct); the
 * typed-array evaluator (`fast.ts`) implements the same interface and must agree with it.
 */

import { piecesForPhases, type PlanContext } from '../plan/context';
import { evaluate, type EvaluateOptions, type Evaluation } from './evaluate';
import { createFastEvaluator } from './fast';
import type { DecodeMode } from '../plan/run';

export type QuickEval = Pick<
  Evaluation,
  'B' | 'V' | 'H' | 'R' | 'N' | 'f' | 'feasible' | 'lengthDeficit'
>;

/**
 * Unpaired start or end pieces of stage A (whole-width class), in piece-id order: for each piece
 * its segment (index into `layout.segments`) and its x extent. Parallel arrays, so that the
 * optimisers can keep a snapshot without allocating one object per piece.
 */
export interface UnpairedList {
  count: number;
  segment: ArrayLike<number>;
  len: ArrayLike<number>;
}

export interface UnpairedInfo {
  ends: UnpairedList;
  starts: UnpairedList;
}

export const EMPTY_UNPAIRED: UnpairedInfo = {
  ends: { count: 0, segment: [], len: [] },
  starts: { count: 0, segment: [], len: [] },
};

export interface Evaluator {
  /** Objective of the phase vector (one entry per segment). */
  evaluate(phi: readonly number[]): QuickEval;
  /** Unpaired pieces of the *last* evaluated vector (used by move M4). */
  unpaired(): UnpairedInfo;
}

export function createReferenceEvaluator(ctx: PlanContext, opts: EvaluateOptions = {}): Evaluator {
  let last: { phi: number[]; evaluation: Evaluation } | undefined;
  return {
    evaluate(phi) {
      const evaluation = evaluate(ctx, phi, opts);
      last = { phi: [...phi], evaluation };
      return evaluation;
    },
    unpaired() {
      if (!last) return EMPTY_UNPAIRED;
      const index = new Map(ctx.layout.segments.map((s, i) => [s.id, i]));
      const segmentOf = new Map(
        piecesForPhases(ctx, last.phi).map((p) => [p.id, index.get(p.segmentId)!]),
      );
      const convert = (items: readonly { id: string; len: number }[]): UnpairedList => ({
        count: items.length,
        segment: items.map((it) => segmentOf.get(it.id)!),
        len: items.map((it) => it.len),
      });
      return {
        ends: convert(last.evaluation.decode.unpairedEnds),
        starts: convert(last.evaluation.decode.unpairedStarts),
      };
    },
  };
}

/**
 * The fastest evaluator that is valid for `mode`: the typed-array one for `precut` (when the room is
 * within its scope), otherwise the reference. Both give the same results (tests).
 */
export function createEvaluator(ctx: PlanContext, mode: DecodeMode): Evaluator {
  return (
    (mode === 'precut' ? createFastEvaluator(ctx) : undefined) ??
    createReferenceEvaluator(ctx, { mode })
  );
}
