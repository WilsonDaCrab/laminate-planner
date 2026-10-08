/**
 * Objective f(φ) = B + λ_V·V + ε·N (ALGORITHM §5). B comes from the same decoder
 * as `buildPlan` (`decodeLabelled`), so the board counts agree by construction.
 */

import { lengthDeficit, seamsOf } from '../layout/pieces';
import { piecesForPhases, type PlanContext } from '../plan/context';
import type { DecodeResult } from '../plan/decode';
import { decodeLabelled, type DecodeMode } from '../plan/run';
import { fastPathApplies, seamPenalty, seamPenaltyFast } from './seams';

export interface EvalWeights {
  lambdaV: number;
  epsilon: number;
}

export function defaultWeights(): EvalWeights {
  return { lambdaV: 2, epsilon: 0.2 };
}

export interface Evaluation {
  B: number;
  /** Seam offset violations (0 = valid). */
  V: number;
  /** Closeness to the next pairing, in [0, 1]. */
  N: number;
  f: number;
  /** V = 0 and every start/end piece meets L_min. */
  feasible: boolean;
  /** Total L_min shortfall (mm). */
  lengthDeficit: number;
  decode: DecodeResult;
}

export interface EvaluateOptions {
  weights?: EvalWeights;
  mode?: DecodeMode;
  /** Use the closed-form V for long shared intervals (default true). */
  fast?: boolean;
}

interface SeamData {
  seams: Record<string, number[]>;
  phase: Record<string, number>;
}

function seamData(ctx: PlanContext, phi: readonly number[]): SeamData {
  const seams: Record<string, number[]> = {};
  const phase: Record<string, number> = {};
  ctx.layout.segments.forEach((s, i) => {
    const p = ctx.profiles[s.id]!;
    seams[s.id] = seamsOf(p.a, p.b, ctx.L, phi[i]!);
    phase[s.id] = phi[i]!;
  });
  return { seams, phase };
}

/** V: penalties of neighbouring rows over the shared intervals I_st. */
export function seamViolation(ctx: PlanContext, phi: readonly number[], fast = true): number {
  const D = ctx.project.rules.minStagger;
  const { seams, phase } = seamData(ctx, phi);
  let V = 0;
  for (const link of ctx.graph.links) {
    const useFast =
      fast &&
      fastPathApplies(link.intervals, ctx.L, D) &&
      ctx.profiles[link.lower]!.isRect &&
      ctx.profiles[link.upper]!.isRect;
    if (useFast) {
      const [lo, hi] = link.intervals[0]!;
      V += seamPenaltyFast(hi - lo, ctx.L, phase[link.lower]!, phase[link.upper]!, D);
    } else {
      for (const [lo, hi] of link.intervals) {
        V += seamPenalty(seams[link.lower]!, seams[link.upper]!, lo, hi, D);
      }
    }
  }
  return V;
}

/** N: how close the shortest unpaired end and start pieces are to forming a pair. */
export function nextPairCloseness(decoded: DecodeResult, L: number, kerf: number): number {
  if (decoded.unpairedEnds.length === 0 || decoded.unpairedStarts.length === 0) return 0;
  const e = Math.min(...decoded.unpairedEnds.map((i) => i.len));
  const s = Math.min(...decoded.unpairedStarts.map((i) => i.len));
  const n = (e + s + kerf - L) / L;
  return Math.min(1, Math.max(0, n));
}

export function evaluate(
  ctx: PlanContext,
  phi: readonly number[],
  opts: EvaluateOptions = {},
): Evaluation {
  const { project } = ctx;
  const w = opts.weights ?? defaultWeights();
  const mode = opts.mode ?? project.settings.mode;
  const labelled = piecesForPhases(ctx, phi);
  const decoded = decodeLabelled(ctx, labelled, mode);

  const V = seamViolation(ctx, phi, opts.fast ?? true);
  const N = nextPairCloseness(decoded, ctx.L, project.rules.kerf);

  const minLen = project.rules.minPieceLength;
  let deficit = 0;
  for (const s of ctx.layout.segments) {
    deficit += lengthDeficit(
      labelled.filter((p) => p.segmentId === s.id).map((p) => p.descriptor),
      minLen,
    );
  }

  return {
    B: decoded.B,
    V,
    N,
    f: decoded.B + w.lambdaV * V + w.epsilon * N,
    feasible: V === 0 && deficit <= 0,
    lengthDeficit: deficit,
    decode: decoded,
  };
}
