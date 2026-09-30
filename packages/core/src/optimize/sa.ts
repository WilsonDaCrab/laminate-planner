/**
 * Simulated annealing on the phase vector (ALGORITHM §7). The objective is `f = B + λ_V·V + λ_H·H
 * + ε·N` from the evaluator; the best feasible solution (V = 0, L_min met) is kept separately and
 * the search stops as soon as B reaches the lower bound (proven optimum).
 */

import { lowerBounds } from '../bounds/bounds';
import { createEvaluator, type Evaluator, type UnpairedInfo } from '../evaluate/evaluator';
import type { PlanContext } from '../plan/context';
import type { DecodeMode } from '../plan/run';
import type { Rng } from '../rng/index';
import { runBInst } from './baselines/sequentialRuns';
import { Budget, Incumbent } from './incumbent';
import {
  DEFAULT_MOVE_WEIGHTS,
  DEFAULT_PAIRING,
  MOVE_KINDS,
  MoveSet,
  type MoveKind,
  type MoveWeights,
  type PairingOptions,
  type PhaseChange,
} from './moves';
import { PhaseSpace } from './phaseSpace';
import type { SearchResult } from './types';

export interface SaConfig {
  /** Probability of accepting the median uphill move (not raising V) at the start (calibration target). */
  p0?: number;
  /** Probability of accepting +1 board at the end. */
  pEnd?: number;
  /** Number of objective evaluations, calibration included (deterministic budget). */
  iters?: number;
  /** Wall-clock limit (ms); needs `clock`. Not deterministic. */
  timeMs?: number;
  clock?: () => number;
  weights?: MoveWeights;
  /** How M4 chooses its source and partner (default: `DEFAULT_PAIRING`). */
  pairing?: PairingOptions;
  /** Restart from the best solution at T₀/2 after 25 % of the budget without a new best. */
  reheat?: boolean;
  /** Decoder for B; default: the project's mode (`onsite` gives SA-onsite). */
  mode?: DecodeMode;
  /** Objective evaluator; default: the typed-array one for `precut`, else the reference. */
  evaluator?: Evaluator;
  /** Start of the search; default: the B-INST phases. */
  start?: readonly number[];
  calibrationSamples?: number;
  /** Points of the recorded trajectory. */
  curvePoints?: number;
}

export interface MoveStat {
  proposed: number;
  accepted: number;
  /** Accepted moves that lowered f. */
  downhill: number;
  /** Moves that produced a new best solution. */
  newBest: number;
}

export interface SaStats {
  iterations: number;
  calibrationEvals: number;
  acceptRate: number;
  /** Evaluation number at which the final best solution appeared. */
  evalsToBest: number;
  msToBest: number | undefined;
  T0: number;
  Tend: number;
  reheats: number;
  byMove: Record<MoveKind, MoveStat>;
}

export interface CurvePoint {
  eval: number;
  best: number;
  current: number;
}

export interface SaResult extends SearchResult {
  method: 'sa' | 'sa-onsite';
  stats: SaStats;
  curve: CurvePoint[];
}

export const SA_DEFAULT_ITERS = 200_000;
const CHECK_EVERY = 256;
const REHEAT_FRACTION = 0.25;

const emptyStat = (): MoveStat => ({ proposed: 0, accepted: 0, downhill: 0, newBest: 0 });

/** Applies the changes to `phi` in place and returns what is needed to undo them. */
function apply(phi: number[], changes: readonly PhaseChange[]): number[] {
  const old = changes.map((c) => phi[c.index]!);
  for (const c of changes) phi[c.index] = c.value;
  return old;
}

function undo(phi: number[], changes: readonly PhaseChange[], old: readonly number[]): void {
  for (let k = changes.length - 1; k >= 0; k--) phi[changes[k]!.index] = old[k]!;
}

const MIN_CALIBRATION_STEPS = 10;

export function runSa(ctx: PlanContext, rng: Rng, cfg: SaConfig = {}): SaResult {
  const p0 = cfg.p0 ?? 0.8;
  const pEnd = cfg.pEnd ?? 0.001;
  const timed = cfg.timeMs !== undefined;
  if (timed && !cfg.clock) throw new RangeError('runSa: timeMs needs a clock');
  const mode = cfg.mode ?? ctx.project.settings.mode;
  const evaluator = cfg.evaluator ?? createEvaluator(ctx, mode);
  const space = new PhaseSpace(ctx);
  const weights = cfg.weights ?? DEFAULT_MOVE_WEIGHTS;
  const moves = new MoveSet(ctx, space, weights, cfg.pairing ?? DEFAULT_PAIRING);
  const usesPairing = weights.M4 > 0;
  const lb = lowerBounds(ctx).lb;
  const total = cfg.iters ?? (timed ? undefined : SA_DEFAULT_ITERS);
  const budget = new Budget(
    { iters: total, timeMs: cfg.timeMs, clock: cfg.clock },
    SA_DEFAULT_ITERS,
  );
  const clock = cfg.clock;
  const t0Clock = clock ? clock() : 0;

  const best = new Incumbent();
  const byMove = Object.fromEntries(MOVE_KINDS.map((k) => [k, emptyStat()])) as Record<
    MoveKind,
    MoveStat
  >;

  // Start: B-INST phases are feasible by construction (ALGORITHM §7).
  const phi = [...(cfg.start ?? runBInst(ctx, mode).phi)];
  let cur = evaluator.evaluate(phi);
  let evals = 1;
  let unpaired: UnpairedInfo | undefined = usesPairing ? evaluator.unpaired() : undefined;
  best.offer(phi, cur, evals);
  let proven = cur.feasible && cur.B === lb;
  let msToBest: number | undefined = clock ? clock() - t0Clock : undefined;
  let evalsToBest = evals;

  // Calibration: uphill Δ of random moves from the start (none accepted), T₀ = −median(Δ⁺)/ln p₀.
  // Moves that raise V are left out: their λ_V·V penalty is not a board-count step and inflates T₀
  // by an order of magnitude (L1 at p₀ = 0.8: T₀ ≈ 27); they are the fallback only.
  const samples = cfg.calibrationSamples ?? 200;
  const uphill: number[] = [];
  const uphillAll: number[] = [];
  let calibrationEvals = 0;
  for (let n = 0; n < samples && !proven && budget.allows(evals); n++) {
    const proposal = moves.propose(phi, rng, 1, unpaired);
    const old = apply(phi, proposal.changes);
    const ev = evaluator.evaluate(phi);
    evals++;
    calibrationEvals++;
    if (ev.f > cur.f) {
      uphillAll.push(ev.f - cur.f);
      if (ev.V <= cur.V) uphill.push(ev.f - cur.f);
    }
    // A calibration move may already beat the start; offer it before undoing (φ is its vector).
    if (best.offer(phi, ev, evals)) {
      evalsToBest = evals;
      msToBest = clock ? clock() - t0Clock : undefined;
      if (ev.feasible && ev.B === lb) proven = true;
    }
    undo(phi, proposal.changes, old);
  }
  // The evaluator's "last evaluated" state is a calibration move, not the start.
  if (calibrationEvals > 0 && budget.allows(evals)) {
    cur = evaluator.evaluate(phi);
    evals++;
    calibrationEvals++;
    unpaired = usesPairing ? evaluator.unpaired() : undefined;
  }
  const Tend = 1 / Math.log(1 / pEnd);
  const steps = uphill.length >= MIN_CALIBRATION_STEPS ? uphill : uphillAll;
  steps.sort((a, b) => a - b);
  const median = steps.length > 0 ? steps[steps.length >> 1]! : 0;
  const T0 = Math.max(median > 0 ? -median / Math.log(p0) : 1, Tend);

  const curve: CurvePoint[] = [];
  const points = cfg.curvePoints ?? 200;
  const step = total ? Math.max(1, Math.floor(total / points)) : 500;
  const sample = (): void => {
    curve.push({ eval: evals, best: best.evaluation!.f, current: cur.f });
  };
  sample();

  let tau = 0;
  let tauBase = 0;
  let T0eff = T0;
  let sinceBest = 0;
  let reheats = 0;
  let accepted = 0;
  let iterations = 0;
  const progress = (): number => {
    if (timed) return Math.min(1, (clock!() - t0Clock) / cfg.timeMs!);
    return Math.min(1, evals / total!);
  };

  while (!proven && budget.allows(evals)) {
    // The clock is read every CHECK_EVERY iterations; iteration budgets need no clock.
    if (!timed || iterations % CHECK_EVERY === 0) tau = progress();
    const local = tauBase >= 1 ? 1 : (tau - tauBase) / (1 - tauBase);
    const T = T0eff * Math.pow(Tend / T0eff, Math.min(1, Math.max(0, local)));

    const proposal = moves.propose(phi, rng, T / T0, unpaired);
    const stat = byMove[proposal.kind];
    stat.proposed++;
    const old = apply(phi, proposal.changes);
    const ev = evaluator.evaluate(phi);
    evals++;
    iterations++;
    const delta = ev.f - cur.f;

    if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
      cur = ev;
      accepted++;
      stat.accepted++;
      if (delta < 0) stat.downhill++;
      if (usesPairing) unpaired = evaluator.unpaired();
      if (best.offer(phi, ev, evals)) {
        stat.newBest++;
        evalsToBest = evals;
        msToBest = clock ? clock() - t0Clock : undefined;
        sinceBest = 0;
        if (ev.feasible && ev.B === lb) proven = true;
      }
    } else {
      undo(phi, proposal.changes, old);
    }
    sinceBest++;
    if (evals % step === 0) sample();

    if (cfg.reheat && total && budget.allows(evals) && sinceBest > REHEAT_FRACTION * total && tau < 0.95) {
      // Continue from the best solution with a lower T₀ (ALGORITHM §7, optional).
      phi.splice(0, phi.length, ...best.phi!);
      cur = evaluator.evaluate(phi);
      evals++;
      if (usesPairing) unpaired = evaluator.unpaired();
      T0eff = Math.max(T0 / 2, Tend);
      tauBase = tau;
      sinceBest = 0;
      reheats++;
    }
  }
  sample();

  return {
    method: mode === 'onsite' ? 'sa-onsite' : 'sa',
    phi: best.phi!,
    mode,
    evaluation: best.evaluation!,
    evals,
    provenOptimal: proven,
    trace: best.trace(),
    stats: {
      iterations,
      calibrationEvals,
      acceptRate: iterations > 0 ? accepted / iterations : 0,
      evalsToBest,
      msToBest,
      T0,
      Tend,
      reheats,
      byMove,
    },
    curve,
  };
}

/** Narrows a search result to an SA result (statistics and trajectory present). */
export const isSaResult = (r: SearchResult): r is SaResult =>
  r.method === 'sa' || r.method === 'sa-onsite';
