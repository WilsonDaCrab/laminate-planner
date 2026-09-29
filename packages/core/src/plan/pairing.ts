/**
 * Maximum pairing of end pieces with start pieces (ALGORITHM §4.1). An end piece `e` (left part of
 * a board) and a start piece `s` (right part) can come from one board when e + s ≤ C, C = L − k.
 */

import { EPS } from '../num/index';

export interface Item {
  /** Stable identifier; ties in length are broken by it so that results are deterministic. */
  id: string;
  len: number;
}

export interface Pair {
  end: Item;
  start: Item;
}

const byLenThenId = (p: Item, q: Item): number =>
  p.len - q.len || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);

/**
 * Greedy two-pointer pairing: E longest first, S shortest first. Each e takes the shortest unused s
 * if it fits; if the shortest does not fit, no s does. The neighbour sets of the e's are nested
 * prefixes of sorted S, so the result is a maximum matching. O(n log n).
 */
export function maxPairs(E: readonly Item[], S: readonly Item[], C: number): Pair[] {
  const ends = [...E].sort((p, q) => byLenThenId(q, p));
  const starts = [...S].sort(byLenThenId);
  const pairs: Pair[] = [];
  let j = 0;
  for (const end of ends) {
    const start = starts[j];
    if (start !== undefined && end.len + start.len <= C + EPS) {
      pairs.push({ end, start });
      j++;
    }
  }
  return pairs;
}
