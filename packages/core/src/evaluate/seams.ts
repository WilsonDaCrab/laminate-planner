/**
 * Seam-offset penalties (ALGORITHM §5). Two seams of neighbouring rows conflict when they are
 * closer than D along the row; the penalty of a pair is (D − |x − x′|) / D.
 */

import { circDist, type Mm } from '../num/index';

/**
 * General (reference) path: all seam pairs of two rows whose seams lie in the interval [lo, hi]
 * widened by D and are closer than D.
 */
export function seamPenalty(
  seamsA: readonly Mm[],
  seamsB: readonly Mm[],
  lo: Mm,
  hi: Mm,
  D: Mm,
): number {
  if (!(D > 0)) return 0;
  const from = lo - D;
  const to = hi + D;
  let sum = 0;
  for (const x of seamsA) {
    if (x < from || x > to) continue;
    for (const y of seamsB) {
      if (y < from || y > to) continue;
      const d = Math.abs(x - y);
      if (d < D) sum += (D - d) / D;
    }
  }
  return sum;
}

/** Can the fast path replace the general one? One long interval, rectangles on both sides. */
export const fastPathApplies = (
  intervals: readonly (readonly [number, number])[],
  L: Mm,
  D: Mm,
): boolean => intervals.length === 1 && intervals[0]![1] - intervals[0]![0] >= L + D;

/**
 * Fast path for a long shared interval: V = ⌈|I| / L⌉ · max(0, D − circDist(φ_a, φ_b)) / D.
 * Its zero set is exactly `circDist ≥ D` (the values differ from the general path by the number
 * of seam pairs at the ends of the interval).
 */
export function seamPenaltyFast(length: Mm, L: Mm, phiA: number, phiB: number, D: Mm): number {
  if (!(D > 0)) return 0;
  return Math.ceil(length / L) * (Math.max(0, D - circDist(phiA, phiB, L)) / D);
}
