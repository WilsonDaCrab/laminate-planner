/**
 * Seeded PRNG: xoshiro128** (Blackman & Vigna) seeded through splitmix32.
 * The only source of randomness in the core (no Math.random).
 */

const TWO_32 = 4294967296;

export interface Rng {
  /** Next raw 32-bit unsigned integer. */
  nextU32(): number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [a, b], both inclusive, without modulo bias. */
  int(a: number, b: number): number;
  /** Uniformly chosen element; throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(items: T[]): T[];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** One splitmix32 step: advances `state` and returns a well-mixed 32-bit value. */
function splitmix32(state: number): { state: number; value: number } {
  const next = (state + 0x9e3779b9) >>> 0;
  let t = next ^ (next >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return { state: next, value: t >>> 0 };
}

/** Builds a generator from an explicit xoshiro128** state (must not be all zero). */
export function createRngFromState(s0: number, s1: number, s2: number, s3: number): Rng {
  let a = s0 >>> 0;
  let b = s1 >>> 0;
  let c = s2 >>> 0;
  let d = s3 >>> 0;
  if ((a | b | c | d) === 0) throw new Error('xoshiro128** state must not be all zero');

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(b, 5) >>> 0, 7), 9) >>> 0;
    const t = (b << 9) >>> 0;
    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;
    c = (c ^ t) >>> 0;
    d = rotl(d, 11);
    return result;
  };

  const next = (): number => nextU32() / TWO_32;

  const int = (lo: number, hi: number): number => {
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
      throw new RangeError(`int(${lo}, ${hi}): need integers with lo <= hi`);
    }
    const range = hi - lo + 1;
    if (range > TWO_32) throw new RangeError('int: range exceeds 2^32');
    // Rejection sampling: discard the biased tail of the 32-bit space.
    const limit = TWO_32 - (TWO_32 % range);
    let x = nextU32();
    while (x >= limit) x = nextU32();
    return lo + (x % range);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick: empty array');
    return items[int(0, items.length - 1)] as T;
  };

  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  };

  return { nextU32, next, int, pick, shuffle };
}

/** Creates a generator from a 32-bit integer seed (splitmix32 expands it to the 128-bit state). */
export function createRng(seed: number): Rng {
  let sm = splitmix32(seed >>> 0);
  const s0 = sm.value;
  sm = splitmix32(sm.state);
  const s1 = sm.value;
  sm = splitmix32(sm.state);
  const s2 = sm.value;
  sm = splitmix32(sm.state);
  const s3 = sm.value;
  // splitmix32 is a bijection on 32 bits, so four consecutive outputs are all zero only
  // for a vanishingly unlikely seed; fall back to a fixed non-zero state to stay total.
  return createRngFromState(s0 | s1 | s2 | s3 ? s0 : 1, s1, s2, s3);
}

/** Independent stream number `i` derived from `seed` (for parallel runs / repeated experiments). */
export function fork(seed: number, i: number): Rng {
  const base = splitmix32(seed >>> 0).value;
  const salt = Math.imul((i >>> 0) + 1, 0x85ebca6b) >>> 0;
  return createRng(splitmix32((base ^ salt) >>> 0).value);
}
