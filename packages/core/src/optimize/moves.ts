/**
 * Moves on the phase vector φ (ALGORITHM §6). Every move returns the changed entries only and keeps
 * each φ_s inside F_s (through `PhaseSpace.place`, which also keeps rectangular segments on whole
 * millimetres, ADR-013).
 *
 *   M1 Reset  φ_s ← U(F_s)
 *   M2 Shift  φ_s ← proj(φ_s + δ), δ ~ U(−Δ, Δ), Δ = max(20, (L/2)·T/T₀)
 *   M3 Swap   exchange φ_s and φ_t (0.7: t of the same equivalence class, B is unchanged)
 *   M4 Pair   set the start piece of a segment to exactly complete an unpaired end piece (or vice versa)
 *   M5 Block  add one δ to the segments of 2–6 consecutive bands
 */

import type { UnpairedInfo, UnpairedPiece } from '../evaluate/evaluator';
import type { PlanContext } from '../plan/context';
import { mod } from '../num/index';
import type { Rng } from '../rng/index';
import type { PhaseSpace } from './phaseSpace';

export type MoveKind = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
export const MOVE_KINDS: readonly MoveKind[] = ['M1', 'M2', 'M3', 'M4', 'M5'];

export type MoveWeights = Record<MoveKind, number>;
export const DEFAULT_MOVE_WEIGHTS: MoveWeights = { M1: 0.15, M2: 0.3, M3: 0.15, M4: 0.3, M5: 0.1 };

export interface PhaseChange {
  index: number;
  value: number;
}

export interface Proposal {
  /** The move that produced the change (M4 falls back to M2 when it finds no target). */
  kind: MoveKind;
  changes: PhaseChange[];
}

/** Shift amplitude Δ for a temperature ratio T/T₀ ∈ (0, 1] (mm). */
export const shiftAmplitude = (L: number, tRatio: number): number =>
  Math.max(20, (L / 2) * Math.min(1, Math.max(0, tRatio)));

const SAME_CLASS_PROBABILITY = 0.7;
const OWN_START_PROBABILITY = 0.7;
const PAIR_TRIES = 3;
const BLOCK_BANDS: [number, number] = [2, 6];

export class MoveSet {
  private readonly cumulative: { kind: MoveKind; upTo: number }[];
  private readonly C: number;

  constructor(
    private readonly ctx: PlanContext,
    private readonly space: PhaseSpace,
    weights: MoveWeights = DEFAULT_MOVE_WEIGHTS,
  ) {
    let sum = 0;
    this.cumulative = MOVE_KINDS.filter((k) => weights[k] > 0).map((kind) => ({
      kind,
      upTo: (sum += weights[kind]),
    }));
    if (this.cumulative.length === 0) throw new RangeError('MoveSet: all move weights are zero');
    this.C = ctx.L - ctx.project.rules.kerf;
  }

  /** Draws a move and proposes it; `unpaired` (of the current state) enables M4. */
  propose(phi: readonly number[], rng: Rng, tRatio: number, unpaired?: UnpairedInfo): Proposal {
    const u = rng.next() * this.cumulative[this.cumulative.length - 1]!.upTo;
    const kind = this.cumulative.find((c) => u < c.upTo)!.kind;
    return this.make(kind, phi, rng, tRatio, unpaired);
  }

  /** Proposes a given move kind (used by tests and the calibration). */
  make(
    kind: MoveKind,
    phi: readonly number[],
    rng: Rng,
    tRatio: number,
    unpaired?: UnpairedInfo,
  ): Proposal {
    const n = this.space.size;
    switch (kind) {
      case 'M1': {
        const i = rng.int(0, n - 1);
        return { kind, changes: [{ index: i, value: this.space.sample(i, rng) }] };
      }
      case 'M3': {
        const swap = this.swap(phi, rng);
        if (swap) return { kind, changes: swap };
        break;
      }
      case 'M4': {
        const pair = unpaired ? this.pair(rng, unpaired) : undefined;
        if (pair) return { kind, changes: [pair] };
        break;
      }
      case 'M5': {
        const block = this.block(phi, rng, tRatio);
        if (block) return { kind, changes: block };
        break;
      }
      case 'M2':
        break;
    }
    return { kind: 'M2', changes: [this.shift(phi, rng, tRatio)] };
  }

  private shift(phi: readonly number[], rng: Rng, tRatio: number): PhaseChange {
    const i = rng.int(0, this.space.size - 1);
    const delta = (rng.next() * 2 - 1) * shiftAmplitude(this.ctx.L, tRatio);
    return { index: i, value: this.space.place(i, phi[i]! + delta) };
  }

  private swap(phi: readonly number[], rng: Rng): PhaseChange[] | undefined {
    const n = this.space.size;
    if (n < 2) return undefined;
    const s = rng.int(0, n - 1);
    const sameClass = this.space.classes[this.space.classOf[s]!]!;
    let t: number;
    if (sameClass.length > 1 && rng.next() < SAME_CLASS_PROBABILITY) {
      do t = rng.pick(sameClass);
      while (t === s);
    } else {
      t = rng.int(0, n - 2);
      if (t >= s) t++;
    }
    return [
      { index: s, value: this.space.place(s, phi[t]!) },
      { index: t, value: this.space.place(t, phi[s]!) },
    ];
  }

  /** M4: complete an unpaired end e by a start piece C − e, or an unpaired start s by an end piece C − s. */
  private pair(rng: Rng, unpaired: UnpairedInfo): PhaseChange | undefined {
    const { ends, starts } = unpaired;
    if (ends.length === 0 && starts.length === 0) return undefined;
    const fromEnd = ends.length > 0 && (starts.length === 0 || rng.next() < 0.5);
    const source = rng.pick(fromEnd ? ends : starts);
    // Segments whose *opposite* piece is unpaired make the best partners (they also relieve that piece).
    const preferred = fromEnd ? starts : ends;
    const target = this.C - source.len;
    for (let t = 0; t < PAIR_TRIES; t++) {
      const usePreferred = preferred.length > 0 && rng.next() < OWN_START_PROBABILITY;
      const candidate: UnpairedPiece | number = usePreferred
        ? rng.pick(preferred)
        : rng.int(0, this.space.size - 1);
      const index = typeof candidate === 'number' ? candidate : candidate.segment;
      if (index === source.segment) continue;
      const phase = fromEnd
        ? mod(this.space.a[index]! + target, this.ctx.L) // start piece = φ − a
        : mod(this.space.b[index]! - target, this.ctx.L); // end piece = b − last seam
      const value = this.space.exact(index, phase);
      if (value !== undefined) return { index, value };
    }
    return undefined;
  }

  /** M5: one common shift for the segments of 2–6 consecutive bands. */
  private block(phi: readonly number[], rng: Rng, tRatio: number): PhaseChange[] | undefined {
    const bands = this.space.bands;
    if (bands.length < 2) return undefined;
    const count = Math.min(bands.length, rng.int(BLOCK_BANDS[0], BLOCK_BANDS[1]));
    const first = rng.int(0, bands.length - count);
    const delta = (rng.next() * 2 - 1) * shiftAmplitude(this.ctx.L, tRatio);
    const changes: PhaseChange[] = [];
    for (const band of bands.slice(first, first + count)) {
      for (const i of band) changes.push({ index: i, value: this.space.place(i, phi[i]! + delta) });
    }
    return changes;
  }
}
