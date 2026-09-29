/**
 * Objective f(φ) = B + λ_V·V + λ_H·H + λ_R·R + ε·N (ALGORITHM §5). B comes from the same decoder
 * as `buildPlan` (`decodeLabelled`), so the board counts agree by construction.
 */

import { lengthDeficit, seamsOf } from '../layout/pieces';
import type { LayoutSettings, Rules } from '../model/schema';
import { circDist, mod } from '../num/index';
import { piecesForPhases, type PlanContext } from '../plan/context';
import type { DecodeResult } from '../plan/decode';
import { decodeLabelled, type DecodeMode } from '../plan/run';
import { fastPathApplies, seamPenalty, seamPenaltyFast } from './seams';

export interface EvalWeights {
  lambdaV: number;
  lambdaH: number;
  lambdaR: number;
  epsilon: number;
  /** D_R: distance below which equal seam steps of three rows are penalised (R term). */
  regularityDistance: number;
}

export function defaultWeights(
  _rules: Rules,
  settings: Pick<LayoutSettings, 'aesthetics'>,
): EvalWeights {
  return {
    lambdaV: 2,
    lambdaH: 0.6 * settings.aesthetics,
    lambdaR: 0,
    epsilon: 0.2,
    regularityDistance: 100,
  };
}

export interface Evaluation {
  B: number;
  /** Seam offset violations (0 = valid). */
  V: number;
  /** "H" pattern penalty (rows j and j+2). */
  H: number;
  /** Regularity penalty (three consecutive rows). */
  R: number;
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

/** H: the same for rows two apart (through a shared neighbour), with distance D_H. */
export function patternPenalty(ctx: PlanContext, phi: readonly number[]): number {
  const { enabled, distance } = ctx.project.rules.hPattern;
  if (!enabled) return 0;
  const { seams } = seamData(ctx, phi);
  let H = 0;
  for (const pair of ctx.graph.secondOrder) {
    const s = ctx.profiles[pair.lower]!;
    const u = ctx.profiles[pair.upper]!;
    const lo = Math.max(s.a, u.a);
    const hi = Math.min(s.b, u.b);
    if (hi <= lo) continue;
    H += seamPenalty(seams[pair.lower]!, seams[pair.upper]!, lo, hi, distance);
  }
  return H;
}

/** R: consecutive rows with (almost) equal seam steps make a visible diagonal. */
export function regularityPenalty(
  ctx: PlanContext,
  phi: readonly number[],
  distanceR: number,
): number {
  const { phase } = seamData(ctx, phi);
  const { L } = ctx;
  const longLink = (lower: string, upper: string): boolean =>
    ctx.graph.links.some(
      (l) => l.lower === lower && l.upper === upper && l.intervals.some(([lo, hi]) => hi - lo >= L),
    );
  let R = 0;
  for (const link of ctx.graph.links) {
    if (!longLink(link.lower, link.upper)) continue;
    for (const next of ctx.graph.up[link.upper] ?? []) {
      if (!longLink(link.upper, next)) continue;
      const d1 = mod(phase[link.upper]! - phase[link.lower]!, L);
      const d2 = mod(phase[next]! - phase[link.upper]!, L);
      const dist = circDist(d1, d2, L);
      if (dist < distanceR) R += (distanceR - dist) / distanceR;
    }
  }
  return R;
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
  const w = opts.weights ?? defaultWeights(project.rules, project.settings);
  const mode = opts.mode ?? project.settings.mode;
  const labelled = piecesForPhases(ctx, phi);
  const decoded = decodeLabelled(ctx, labelled, mode);

  const V = seamViolation(ctx, phi, opts.fast ?? true);
  const H = patternPenalty(ctx, phi);
  const R = w.lambdaR > 0 ? regularityPenalty(ctx, phi, w.regularityDistance) : 0;
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
    H,
    R,
    N,
    f: decoded.B + w.lambdaV * V + w.lambdaH * H + w.lambdaR * R + w.epsilon * N,
    feasible: V === 0 && deficit <= 0,
    lengthDeficit: deficit,
    decode: decoded,
  };
}
