import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { maxPairs, type Item } from './pairing';

const items = (prefix: string, lens: number[]): Item[] =>
  lens.map((len, i) => ({ id: `${prefix}${i}`, len }));

/** Brute force: size of the largest matching, by trying every assignment of s to e (or none). */
function bruteForce(E: number[], S: number[], C: number): number {
  const used = new Array<boolean>(S.length).fill(false);
  const go = (i: number): number => {
    if (i === E.length) return 0;
    let best = go(i + 1);
    for (let j = 0; j < S.length; j++) {
      if (!used[j] && E[i]! + S[j]! <= C) {
        used[j] = true;
        best = Math.max(best, 1 + go(i + 1));
        used[j] = false;
      }
    }
    return best;
  };
  return go(0);
}

describe('maxPairs', () => {
  it('is empty for empty sides', () => {
    expect(maxPairs([], items('s', [100]), 500)).toEqual([]);
    expect(maxPairs(items('e', [100]), [], 500)).toEqual([]);
  });

  it('accepts e + s = C exactly and rejects C + 1', () => {
    expect(maxPairs(items('e', [300]), items('s', [200]), 500)).toHaveLength(1);
    expect(maxPairs(items('e', [301]), items('s', [200]), 500)).toHaveLength(0);
  });

  it('uses the longest e first (hand example)', () => {
    // C = 10: e = {9, 5}, s = {1, 5}. Longest e=9 takes s=1, e=5 takes s=5 → 2 pairs.
    const pairs = maxPairs(items('e', [9, 5]), items('s', [5, 1]), 10);
    expect(pairs.map((p) => [p.end.len, p.start.len])).toEqual([
      [9, 1],
      [5, 5],
    ]);
  });

  it('each item is used at most once and every pair fits', () => {
    const pairs = maxPairs(items('e', [4, 4, 4]), items('s', [1, 1, 9]), 6);
    expect(new Set(pairs.map((p) => p.start.id)).size).toBe(pairs.length);
    expect(new Set(pairs.map((p) => p.end.id)).size).toBe(pairs.length);
    for (const p of pairs) expect(p.end.len + p.start.len).toBeLessThanOrEqual(6);
  });

  it('is deterministic under ties and input order', () => {
    const E = items('e', [5, 5, 5]);
    const S = items('s', [3, 3]);
    const a = maxPairs(E, S, 8).map((p) => `${p.end.id}-${p.start.id}`);
    const b = maxPairs([...E].reverse(), [...S].reverse(), 8).map(
      (p) => `${p.end.id}-${p.start.id}`,
    );
    expect(b).toEqual(a);
  });

  it('matches exhaustive search on random small sets (n ≤ 8)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 60 }), { maxLength: 8 }),
        fc.array(fc.integer({ min: 1, max: 60 }), { maxLength: 8 }),
        fc.integer({ min: 10, max: 100 }),
        (E, S, C) => {
          const pairs = maxPairs(items('e', E), items('s', S), C);
          expect(pairs.length).toBe(bruteForce(E, S, C));
          for (const p of pairs) expect(p.end.len + p.start.len).toBeLessThanOrEqual(C);
        },
      ),
      { numRuns: 500 },
    );
  });
});
