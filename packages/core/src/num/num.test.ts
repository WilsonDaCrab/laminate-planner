import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mod } from './index';

describe('mod', () => {
  it('handles negative arguments', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
  });

  it('always lands in [0, m)', () => {
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
});
