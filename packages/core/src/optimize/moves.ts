/**
 * Moves on the phase vector φ (ALGORITHM §6). F4 has M1 Reset and M2 Shift (used by HC); F5 adds
 * M3–M5. Every move keeps φ_s inside F_s.
 */

import { project, sample, type Feasible } from '../layout/feasible';
import { mod } from '../num/index';
import type { Rng } from '../rng/index';

/** M1: a uniformly random feasible phase. */
export const resetPhase = (F: Feasible, rng: Rng): number => sample(F, rng);

/** M2: φ + δ with δ ~ U(−Δ, Δ), projected onto F_s. */
export function shiftPhase(F: Feasible, phi: number, delta: number, rng: Rng): number {
  const d = (rng.next() * 2 - 1) * delta;
  return project(F, mod(phi + d, F.L));
}
