import { describe, expect, it } from 'vitest';
import { instanceFiles } from '../layout/fixtures/instances';
import { sample } from '../layout/feasible';
import { parseProject } from '../model/index';
import { createRng } from '../rng/index';
import { buildContext, pieceLabel, piecesForPhases } from './context';

describe('pieceLabel (DOMAIN §10)', () => {
  it('marks start, end and numbered pieces', () => {
    expect(pieceLabel('DZ', '5a', 5, { short: 'start', index: 0 }, 1)).toBe('DZ-05-S');
    expect(pieceLabel('DZ', '5a', 5, { short: 'end', index: 6 }, 1)).toBe('DZ-05-B');
    expect(pieceLabel('DZ', '5a', 5, { short: 'full', index: 2 }, 1)).toBe('DZ-05-03');
    expect(pieceLabel('DZ', '5a', 5, { short: 'free', index: 0 }, 1)).toBe('DZ-05-01');
  });

  it('writes the segment letter only when the band has several segments', () => {
    expect(pieceLabel('DZ', '12b', 12, { short: 'start', index: 0 }, 2)).toBe('DZ-12b-S');
    expect(pieceLabel('DZ', '12b', 12, { short: 'start', index: 0 }, 1)).toBe('DZ-12-S');
  });

  it('falls back to R for an empty room code', () => {
    expect(pieceLabel('', '1a', 1, { short: 'full', index: 0 }, 1)).toBe('R-01-01');
  });
});

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('piece ids on %s', (_id, raw) => {
  it('are unique for random phases', () => {
    const ctx = buildContext(parseProject(raw));
    const rng = createRng(7);
    const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
    const ids = piecesForPhases(ctx, phi).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
