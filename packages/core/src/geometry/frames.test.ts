import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  apply,
  applyAll,
  applyToPolygon,
  compose,
  degToRad,
  flipsOrientation,
  handedness,
  invert,
  roomToRow,
  rowToBoard,
  type StackSide,
} from './frames';
import { signedArea } from './polygon';
import { dist, vec } from './vec';

const coord = fc.double({ min: -20000, max: 20000, noNaN: true });
const point = fc.record({ x: coord, y: coord });
const angle = fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true });
const side = fc.constantFrom<StackSide>('left', 'right');

describe('roomToRow', () => {
  it('θ = 0, stackSide left is the identity', () => {
    const p = apply(roomToRow(0, 'left'), vec(123, -45));
    expect(p.x).toBeCloseTo(123, 12);
    expect(p.y).toBeCloseTo(-45, 12);
  });

  it('rotates by −θ: a vector along θ becomes a vector along +x', () => {
    const theta = degToRad(30);
    const v = vec(Math.cos(theta) * 1000, Math.sin(theta) * 1000);
    const r = apply(roomToRow(theta, 'left'), v);
    expect(r.x).toBeCloseTo(1000, 9);
    expect(r.y).toBeCloseTo(0, 9);
  });

  it("stackSide 'right' mirrors about the x axis", () => {
    const l = apply(roomToRow(degToRad(20), 'left'), vec(500, 700));
    const r = apply(roomToRow(degToRad(20), 'right'), vec(500, 700));
    expect(r.x).toBeCloseTo(l.x, 9);
    expect(r.y).toBeCloseTo(-l.y, 9);
    expect(flipsOrientation(roomToRow(0, 'right'))).toBe(true);
    expect(flipsOrientation(roomToRow(0, 'left'))).toBe(false);
    expect(handedness(roomToRow(0, 'right'))).toBe(-1);
  });
});

describe('round trips', () => {
  it('room → row → room is exact to < 1e-6 mm (property)', () => {
    fc.assert(
      fc.property(angle, side, point, (theta, s, p) => {
        const m = roomToRow(theta, s);
        const back = apply(invert(m), apply(m, p));
        return dist(back, p) < 1e-6;
      }),
    );
  });

  it('room → row → board → row → room is exact to < 1e-6 mm (property)', () => {
    fc.assert(
      fc.property(angle, side, coord, coord, point, (theta, s, x0, y0, p) => {
        const m = compose(rowToBoard(x0, y0), roomToRow(theta, s));
        const back = apply(invert(m), apply(m, p));
        return dist(back, p) < 1e-6;
      }),
    );
  });

  it('rigid maps preserve distances (property)', () => {
    fc.assert(
      fc.property(angle, side, point, point, (theta, s, p, q) => {
        const m = roomToRow(theta, s);
        return Math.abs(dist(apply(m, p), apply(m, q)) - dist(p, q)) < 1e-6;
      }),
    );
  });

  it('invert(invert(m)) equals m', () => {
    const m = compose(rowToBoard(10, 20), roomToRow(0.7, 'right'));
    const mm = invert(invert(m));
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) expect(mm[k]).toBeCloseTo(m[k], 9);
  });
});

describe('rowToBoard', () => {
  it('translates the board corner to the origin', () => {
    const p = apply(rowToBoard(1000, 192), vec(1000, 192));
    expect(p).toEqual({ x: 0, y: 0 });
    expect(apply(rowToBoard(1000, 192), vec(1000 + 1285, 192 + 192))).toEqual({ x: 1285, y: 192 });
  });
});

describe('applyToPolygon', () => {
  const rect = [vec(0, 0), vec(4000, 0), vec(4000, 3000), vec(0, 3000)];

  it('keeps counter-clockwise orientation and area, also under a mirror', () => {
    for (const s of ['left', 'right'] as const) {
      const out = applyToPolygon(roomToRow(degToRad(17), s), rect);
      expect(signedArea(out)).toBeCloseTo(12_000_000, 3);
    }
  });

  it('applyAll keeps order', () => {
    const out = applyAll(roomToRow(0, 'right'), rect);
    expect(out[2]).toEqual({ x: 4000, y: -3000 });
  });
});
