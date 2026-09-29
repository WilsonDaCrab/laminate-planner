/**
 * The evaluation interface the optimisers program against. `createReferenceEvaluator` wraps the
 * object-based `evaluate` (the reference of ALGORITHM §14: simple and obviously correct); the
 * typed-array evaluator (`fast.ts`) implements the same interface and must agree with it.
 */

import { piecesForPhases, type PlanContext } from '../plan/context';
import { evaluate, type EvaluateOptions, type Evaluation } from './evaluate';

export type QuickEval = Pick<
  Evaluation,
  'B' | 'V' | 'H' | 'R' | 'N' | 'f' | 'feasible' | 'lengthDeficit'
>;

/** An unpaired start or end piece of stage A (whole-width class): its segment and x extent. */
export interface UnpairedPiece {
  /** Index into `layout.segments`. */
  segment: number;
  len: number;
}

export interface UnpairedInfo {
  ends: UnpairedPiece[];
  starts: UnpairedPiece[];
}

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
      if (!last) return { ends: [], starts: [] };
      const index = new Map(ctx.layout.segments.map((s, i) => [s.id, i]));
      const segmentOf = new Map(
        piecesForPhases(ctx, last.phi).map((p) => [p.id, index.get(p.segmentId)!]),
      );
      const convert = (items: readonly { id: string; len: number }[]): UnpairedPiece[] =>
        items.map((it) => ({ segment: segmentOf.get(it.id)!, len: it.len }));
      return {
        ends: convert(last.evaluation.decode.unpairedEnds),
        starts: convert(last.evaluation.decode.unpairedStarts),
      };
    },
  };
}
