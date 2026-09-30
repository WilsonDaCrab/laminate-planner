/** All lengths are millimetres. */
export type Mm = number;

/** Absolute tolerance (mm) for float64 comparisons. */
export const EPS = 1e-6;

/**
 * Tolerance (mm) of "a piece fits on a stock". A seam within EPS of a wall is not a seam, so the
 * piece next to it can be longer than L by up to EPS; `fits` must accept that with float noise to
 * spare (ADR-023), hence twice EPS.
 */
export const FIT_EPS = 2 * EPS;

/** Mathematical modulo: result is always in [0, m), also for tiny negative `a`. */
export function mod(a: number, m: number): number {
  const r = ((a % m) + m) % m;
  return r >= m ? 0 : r;
}

/** Circular distance on a circle of circumference `period`: min(d mod L, L - d mod L). */
export function circDist(a: number, b: number, period: number): number {
  const d = mod(a - b, period);
  return Math.min(d, period - d);
}

/** Floors to whole mm; values within EPS below an integer count as that integer. */
export function floorMm(x: number): number {
  return Math.floor(x + EPS);
}

export function approxEq(a: number, b: number, eps: number = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

export function isZero(x: number, eps: number = EPS): boolean {
  return Math.abs(x) <= eps;
}

/** Three-way comparison with tolerance: -1, 0 or 1. */
export function compare(a: number, b: number, eps: number = EPS): -1 | 0 | 1 {
  if (Math.abs(a - b) <= eps) return 0;
  return a < b ? -1 : 1;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
