import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EPS, approxEq, circDist, clamp, compare, floorMm, isZero, mod } from './index';

describe('mod', () => {
  it('handles negative arguments', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
  });

  it('always lands in [0, m) for integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 1, max: 2000 }),
        (a, m) => {
          const r = mod(a, m);
          return r >= 0 && r < m;
        },
      ),
    );
  });

  it('always lands in [0, m) for floats, including tiny negatives', () => {
    expect(mod(-1e-20, 5)).toBeLessThan(5);
    expect(mod(-1e-20, 5)).toBeGreaterThanOrEqual(0);
    fc.assert(
      fc.property(
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        fc.double({ min: 0.001, max: 5000, noNaN: true }),
        (a, m) => {
          const r = mod(a, m);
          return r >= 0 && r < m;
        },
      ),
    );
  });
});

describe('circDist', () => {
  it('measures the shorter way round', () => {
    expect(circDist(10, 190, 200)).toBe(20);
    expect(circDist(0, 100, 200)).toBe(100);
    expect(circDist(50, 50, 200)).toBe(0);
  });

  it('is symmetric and at most L/2', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: 1, max: 2400 }),
        (a, b, L) => {
          const d = circDist(a, b, L);
          return d === circDist(b, a, L) && d >= 0 && d <= L / 2;
        },
      ),
    );
  });

  it('is invariant under shifting both points by a period', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2400 }),
        fc.integer({ min: 0, max: 2400 }),
        fc.integer({ min: 1, max: 2400 }),
        (a, b, L) => circDist(a, b, L) === circDist(a + L, b, L),
      ),
    );
  });
});

describe('floorMm', () => {
  it('absorbs float noise just below an integer', () => {
    expect(floorMm(2999.9999999)).toBe(3000);
    expect(floorMm(3000.4)).toBe(3000);
    expect(floorMm(2999.5)).toBe(2999);
  });

  it('keeps whole numbers unchanged', () => {
    fc.assert(fc.property(fc.integer({ min: -100000, max: 100000 }), (n) => floorMm(n) === n));
  });

  it('never exceeds the input by more than EPS', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e5, noNaN: true }), (x) => floorMm(x) <= x + EPS),
    );
  });
});

describe('tolerant comparison', () => {
  it('approxEq / isZero / compare use EPS', () => {
    expect(approxEq(1, 1 + EPS / 2)).toBe(true);
    expect(approxEq(1, 1 + 10 * EPS)).toBe(false);
    expect(isZero(EPS / 2)).toBe(true);
    expect(isZero(0.001)).toBe(false);
    expect(compare(1, 1 + EPS / 2)).toBe(0);
    expect(compare(1, 2)).toBe(-1);
    expect(compare(2, 1)).toBe(1);
  });

  it('clamp bounds the value', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
