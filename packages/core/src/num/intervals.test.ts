import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  complementIntervals,
  intersectIntervals,
  measure,
  normalizeIntervals,
  overlapMeasure,
  unionIntervals,
  type Interval,
} from './intervals';

const rawIntervals = fc
  .array(
    fc
      .tuple(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 40 }))
      .map(([lo, len]): Interval => [lo, lo + len]),
    { maxLength: 8 },
  )
  .map((a) => normalizeIntervals(a));

describe('normalizeIntervals', () => {
  it('sorts and merges overlapping and touching intervals', () => {
    expect(
      normalizeIntervals([
        [5, 9],
        [0, 2],
        [2, 4],
        [8, 12],
      ]),
    ).toEqual([
      [0, 4],
      [5, 12],
    ]);
  });

  it('drops reversed intervals, keeps points, and can drop short ones', () => {
    expect(normalizeIntervals([[3, 1]])).toEqual([]);
    expect(normalizeIntervals([[3, 3]])).toEqual([[3, 3]]);
    expect(normalizeIntervals([[3, 3.0000001]], { minLength: 0.5 })).toEqual([]);
  });

  it('is idempotent (property)', () => {
    fc.assert(
      fc.property(rawIntervals, (a) => JSON.stringify(normalizeIntervals(a)) === JSON.stringify(a)),
    );
  });
});

describe('set operations', () => {
  it('intersection of simple sets', () => {
    expect(
      intersectIntervals(
        [
          [0, 10],
          [20, 30],
        ],
        [
          [5, 25],
          [28, 40],
        ],
      ),
    ).toEqual([
      [5, 10],
      [20, 25],
      [28, 30],
    ]);
  });

  it('touching intervals intersect in a point', () => {
    expect(intersectIntervals([[0, 5]], [[5, 9]])).toEqual([[5, 5]]);
  });

  it('|A ∪ B| + |A ∩ B| = |A| + |B| (property)', () => {
    fc.assert(
      fc.property(rawIntervals, rawIntervals, (a, b) => {
        const lhs = measure(unionIntervals(a, b)) + measure(intersectIntervals(a, b));
        return Math.abs(lhs - (measure(a) + measure(b))) < 1e-9;
      }),
    );
  });

  it('A ∩ complement(A) has measure 0 and |A| + |complement| = range (property)', () => {
    fc.assert(
      fc.property(rawIntervals, (a) => {
        const c = complementIntervals(a, 0, 260);
        const inside = overlapMeasure(a, 0, 260);
        return (
          measure(intersectIntervals(a, c)) === 0 && Math.abs(inside + measure(c) - 260) < 1e-9
        );
      }),
    );
  });

  it('overlapMeasure clips to the window', () => {
    expect(
      overlapMeasure(
        [
          [0, 10],
          [20, 30],
        ],
        5,
        25,
      ),
    ).toBe(10);
  });

  it('complement of an empty set is the whole range', () => {
    expect(complementIntervals([], 0, 10)).toEqual([[0, 10]]);
  });
});
