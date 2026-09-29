/** Absolute tolerance (mm) for float64 comparisons. */
export const EPS = 1e-9;

/** Mathematical modulo: result is always in [0, m). */
export function mod(a: number, m: number): number {
  return ((a % m) + m) % m;
}
