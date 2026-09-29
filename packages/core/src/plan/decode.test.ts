import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LongNeeds, ShortNeeds } from '../layout/pieces';
import { EPS } from '../num/index';
import { decode, type DecodePiece, type DecodeResult, type Rect } from './decode';

const L = 2400;
const W = 192;
const k = 3;
const params = { L, W, kerf: k };

let counter = 0;
const piece = (
  short: ShortNeeds,
  long: LongNeeds,
  extent: number,
  width = long === 'both' ? W : 100,
): DecodePiece => ({ id: `p${String(counter++).padStart(4, '0')}`, short, long, extent, width });

const boardsOf = (pieces: DecodePiece[]) => decode(pieces, params);

describe('stage A (full-width pieces)', () => {
  it('a full piece is one board', () => {
    expect(boardsOf([piece('full', 'both', L)]).B).toBe(1);
  });

  it('pairs an end and a start piece when e + s + k ≤ L', () => {
    expect(boardsOf([piece('end', 'both', 1000), piece('start', 'both', 1400 - k)]).B).toBe(1);
    expect(boardsOf([piece('end', 'both', 1000), piece('start', 'both', 1400 - k + 1)]).B).toBe(2);
  });

  it('reuses the leftover of an unpaired start piece for a free piece', () => {
    // start 1900 leaves 2400 − 1900 − 3 = 497 with the left profile and both long edges.
    const r = boardsOf([piece('start', 'both', 1900), piece('free', 'both', 497)]);
    expect(r.B).toBe(1);
    expect(boardsOf([piece('start', 'both', 1900), piece('free', 'both', 498)]).B).toBe(2);
  });

  it('reports the unpaired lists after stage A', () => {
    const r = boardsOf([piece('end', 'both', 2000), piece('start', 'both', 2000)]);
    expect(r.B).toBe(2);
    expect(r.unpairedEnds).toHaveLength(1);
    expect(r.unpairedStarts).toHaveLength(1);
  });
});

describe('stage B (strips)', () => {
  it('a low and a high strip share a board when wl + wh + k ≤ W', () => {
    expect(boardsOf([piece('full', 'low', L, 50), piece('full', 'high', L, 139)]).B).toBe(1);
    expect(boardsOf([piece('full', 'low', L, 50), piece('full', 'high', L, 140)]).B).toBe(2);
  });

  it('a free piece needing the low profile uses the strip leftover above nothing', () => {
    // First-row strip (high) 60 wide leaves 192 − 60 − 3 = 129 with the low profile.
    const r = boardsOf([piece('full', 'high', L, 60), piece('free', 'low', 800, 129)]);
    expect(r.B).toBe(1);
    expect(boardsOf([piece('full', 'high', L, 60), piece('free', 'low', 800, 130)]).B).toBe(2);
  });
});

describe('stage C', () => {
  it('best fit picks the smallest sufficient leftover', () => {
    const r = boardsOf([
      piece('start', 'both', 1900), // leftover 497
      piece('start', 'both', 1500), // leftover 897
      piece('free', 'both', 480),
    ]);
    expect(r.B).toBe(2);
    const small = r.boards.find((bd) => bd.placements.length === 2)!;
    // The free piece went next to the 1900 start piece (the smaller leftover).
    expect(small.placements.some((p) => p.rect.w === 1900)).toBe(true);
  });

  it('throws for a piece that cannot fit on a board', () => {
    expect(() => boardsOf([piece('free', 'both', L + 1)])).toThrow(RangeError);
  });

  it('is deterministic under input order', () => {
    const ps = [
      piece('start', 'both', 700),
      piece('end', 'both', 900),
      piece('free', 'low', 300, 80),
      piece('full', 'high', L, 40),
    ];
    const a = JSON.stringify(boardsOf(ps).boards);
    const b = JSON.stringify(boardsOf([...ps].reverse()).boards);
    expect(b).toBe(a);
  });
});

function checkLayout(pieces: DecodePiece[], r: DecodeResult): void {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const seen = new Set<string>();
  for (const bd of r.boards) {
    const rects: { id: string; rect: Rect }[] = bd.placements.map((p) => ({
      id: p.pieceId,
      rect: p.rect,
    }));
    for (const { id, rect } of rects) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      const p = byId.get(id)!;
      expect(rect.x).toBeGreaterThanOrEqual(-EPS);
      expect(rect.y).toBeGreaterThanOrEqual(-EPS);
      expect(rect.x + rect.w).toBeLessThanOrEqual(L + EPS);
      expect(rect.y + rect.h).toBeLessThanOrEqual(W + EPS);
      expect(rect.w).toBeGreaterThanOrEqual(p.extent - EPS);
      expect(rect.h).toBeGreaterThanOrEqual(p.width - EPS);
      // Needed profiles sit on the original board edges.
      if (p.short === 'end' || p.short === 'full') expect(rect.x).toBeLessThanOrEqual(EPS);
      if (p.short === 'start' || p.short === 'full') {
        expect(rect.x + rect.w).toBeGreaterThanOrEqual(L - EPS);
      }
      if (p.long === 'low' || p.long === 'both') expect(rect.y).toBeLessThanOrEqual(EPS);
      if (p.long === 'high' || p.long === 'both') {
        expect(rect.y + rect.h).toBeGreaterThanOrEqual(W - EPS);
      }
    }
    // Kerf between any two placements on a board, along x or y.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!.rect;
        const c = rects[j]!.rect;
        const gapX = Math.max(c.x - (a.x + a.w), a.x - (c.x + c.w));
        const gapY = Math.max(c.y - (a.y + a.h), a.y - (c.y + c.h));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(k - EPS);
      }
    }
  }
  expect(seen.size).toBe(pieces.length);
  expect(r.B).toBe(r.boards.length);
  expect(r.BA + r.BB + r.BC).toBe(r.B);
}

const arbPiece = fc
  .record({
    short: fc.constantFrom<ShortNeeds>('start', 'end', 'full', 'free'),
    long: fc.constantFrom<LongNeeds>('both', 'low', 'high', 'none'),
    extent: fc.integer({ min: 50, max: L }),
    width: fc.integer({ min: 30, max: W }),
  })
  .map(({ short, long, extent, width }) =>
    piece(short, long, short === 'full' ? L : extent, long === 'both' ? W : width),
  );

describe('decoder invariants (random pieces)', () => {
  it('places every piece once, inside a board, with kerf and profiles respected', () => {
    fc.assert(
      fc.property(fc.array(arbPiece, { minLength: 1, maxLength: 25 }), (pieces) => {
        checkLayout(pieces, decode(pieces, params));
      }),
      { numRuns: 300 },
    );
  });

  it('does not need more boards than one per piece', () => {
    fc.assert(
      fc.property(fc.array(arbPiece, { minLength: 1, maxLength: 25 }), (pieces) => {
        expect(decode(pieces, params).B).toBeLessThanOrEqual(pieces.length);
      }),
      { numRuns: 200 },
    );
  });
});
