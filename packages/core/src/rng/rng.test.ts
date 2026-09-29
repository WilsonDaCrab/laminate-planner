import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRng, createRngFromState, fork } from './index';

function take(n: number, f: () => number): number[] {
  return Array.from({ length: n }, f);
}

describe('xoshiro128**', () => {
  it('matches hand-computed reference outputs for state {1,2,3,4}', () => {
    // Worked by hand from the reference algorithm (result = rotl(s1·5, 7)·9, then the state update):
    //   1st: rotl(10, 7)·9 = 11520       2nd: rotl(0, 7)·9 = 0
    //   3rd: rotl(5145, 7)·9 = 5927040   4th: rotl(61475, 7)·9 = 70819200
    const r = createRngFromState(1, 2, 3, 4);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      11520, 0, 5927040, 70819200,
    ]);
  });

  it('rejects the all-zero state', () => {
    expect(() => createRngFromState(0, 0, 0, 0)).toThrow();
  });
});

describe('determinism', () => {
  it('same seed gives the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(take(100, a.nextU32)).toEqual(take(100, b.nextU32));
  });

  it('different seeds give different sequences', () => {
    expect(take(8, createRng(1).nextU32)).not.toEqual(take(8, createRng(2).nextU32));
  });

  it('is stable across releases (regression values for seed 1)', () => {
    // Self-generated regression values: they guard against accidental algorithm changes.
    const r = createRng(1);
    expect(take(4, r.nextU32)).toMatchInlineSnapshot(`
      [
        393288148,
        2174103013,
        3814759091,
        2092745082,
      ]
    `);
  });

  it('fork(seed, i) streams differ from each other and are reproducible', () => {
    const a0 = take(8, fork(7, 0).nextU32);
    const a1 = take(8, fork(7, 1).nextU32);
    expect(a0).not.toEqual(a1);
    expect(take(8, fork(7, 0).nextU32)).toEqual(a0);
  });
});

describe('next', () => {
  it('stays in [0, 1)', () => {
    const r = createRng(3);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('is roughly uniform (mean near 0.5)', () => {
    const r = createRng(11);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });
});

describe('int', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    const r = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = r.int(-2, 3);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThanOrEqual(3);
      seen.add(x);
    }
    expect([...seen].sort((p, q) => p - q)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it('int(a, a) is a', () => {
    expect(createRng(9).int(7, 7)).toBe(7);
  });

  it('is roughly uniform over a small range', () => {
    const r = createRng(21);
    const n = 60000;
    const c = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const k = r.int(0, 5);
      c[k] = (c[k] ?? 0) + 1;
    }
    for (const v of c) expect(Math.abs(v / n - 1 / 6)).toBeLessThan(0.01);
  });

  it('rejects invalid ranges', () => {
    const r = createRng(1);
    expect(() => r.int(3, 2)).toThrow();
    expect(() => r.int(0.5, 2)).toThrow();
  });

  it('property: always within [a, b]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (seed, a, span) => {
          const x = createRng(seed).int(a, a + span);
          return x >= a && x <= a + span;
        },
      ),
    );
  });
});

describe('pick and shuffle', () => {
  it('pick returns an element and throws on empty', () => {
    const r = createRng(2);
    expect([10, 20, 30]).toContain(r.pick([10, 20, 30]));
    expect(() => r.pick([])).toThrow();
  });

  it('shuffle is a permutation (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), fc.integer(), (arr, seed) => {
        const copy = [...arr];
        const out = createRng(seed).shuffle(copy);
        return (
          out === copy &&
          [...out].sort((p, q) => p - q).join() === [...arr].sort((p, q) => p - q).join()
        );
      }),
    );
  });

  it('shuffle is deterministic per seed', () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(createRng(4).shuffle([...base])).toEqual(createRng(4).shuffle([...base]));
  });
});
