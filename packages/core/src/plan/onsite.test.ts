import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import type { LongNeeds, ShortNeeds } from '../layout/pieces';
import { parseProject } from '../model/index';
import { createRng } from '../rng/index';
import { buildPlan } from './build';
import { buildContext } from './context';
import { decode, decodeSequential, type DecodePiece } from './decode';
import { decodeOnsite } from './onsite';

const L = 2400;
const W = 192;
const k = 3;
const params = { L, W, kerf: k };

let counter = 0;
const piece = (short: ShortNeeds, long: LongNeeds, extent: number, width = W): DecodePiece => ({
  id: `p${String(counter++).padStart(4, '0')}`,
  short,
  long,
  extent,
  width,
});

describe('decodeSequential', () => {
  it('reuses the left leftover of a start piece for a later end piece', () => {
    // start 1900 leaves 2400 − 1900 − 3 = 497 with the left profile.
    expect(
      decodeSequential([piece('start', 'both', 1900), piece('end', 'both', 497)], params).B,
    ).toBe(1);
    expect(
      decodeSequential([piece('start', 'both', 1900), piece('end', 'both', 498)], params).B,
    ).toBe(2);
  });

  it('reuses the right leftover of an end piece for a later start piece', () => {
    expect(
      decodeSequential([piece('end', 'both', 1900), piece('start', 'both', 497)], params).B,
    ).toBe(1);
  });

  it('keeps the given order: the first piece opens the first board', () => {
    const a = piece('full', 'both', L);
    const b = piece('full', 'both', L);
    const r = decodeSequential([b, a], params);
    expect(r.boards[0]!.placements[0]!.pieceId).toBe(b.id);
  });

  it('does not use a leftover that has no matching profile', () => {
    // Two start pieces cannot share a board: the leftover of the first has no right-end profile.
    expect(
      decodeSequential([piece('start', 'both', 300), piece('start', 'both', 300)], params).B,
    ).toBe(2);
  });
});

describe('onsite never beats pre-cutting on full-width pieces', () => {
  // Provable for the pure full-width class: each board holds at most one end and one start piece,
  // and the pre-cut decoder pairs them maximally (ALGORITHM §4.1).
  const arbPiece = fc
    .record({
      short: fc.constantFrom<ShortNeeds>('start', 'end', 'full'),
      extent: fc.integer({ min: 50, max: L - 50 }),
    })
    .map(({ short, extent }) => piece(short, 'both', short === 'full' ? L : extent));

  it('B_onsite ≥ B_precut for random pieces in random order', () => {
    fc.assert(
      fc.property(fc.array(arbPiece, { minLength: 1, maxLength: 30 }), (pieces) => {
        expect(decodeSequential(pieces, params).B).toBeGreaterThanOrEqual(decode(pieces, params).B);
      }),
      { numRuns: 500 },
    );
  });
});

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('onsite on %s', (_id, raw) => {
  const ctx = buildContext(parseProject(raw));
  const rng = createRng(11);
  const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));

  it('plans in onsite mode with the same board count as decodeOnsite', () => {
    const plan = buildPlan(ctx, phi, { mode: 'onsite' });
    expect(plan.stats.boards).toBe(decodeOnsite(ctx, phi).B);
    expect(plan.boards.reduce((n, b) => n + b.placements.length, 0)).toBe(plan.pieces.length);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(decodeOnsite(ctx, phi))).toBe(JSON.stringify(decodeOnsite(ctx, phi)));
  });
});
