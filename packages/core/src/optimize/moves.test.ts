import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createReferenceEvaluator } from '../evaluate/evaluator';
import { evaluate } from '../evaluate/evaluate';
import { contains } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { plantedFiles } from '../layout/fixtures/planted';
import { mod } from '../num/index';
import { parseProject } from '../model/index';
import { rowConfigFromSettings } from '../layout/bands';
import { buildContext } from '../plan/context';
import { createRng } from '../rng/index';
import { goodY0 } from '../layout/y0';
import { DEFAULT_MOVE_WEIGHTS, MOVE_KINDS, MoveSet, shiftAmplitude, type MoveKind } from './moves';
import { PhaseSpace } from './phaseSpace';

const load = (id: string) => {
  const file = [...instanceFiles, ...plantedFiles].find((f) => f.id === id)!;
  const project = parseProject(file.raw);
  const y0 = project.settings.rowOffset === 'auto' ? (goodY0(project) ?? 0) : 0;
  const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
  return { project, ctx, space: new PhaseSpace(ctx) };
};

const randomPhi = (space: PhaseSpace, seed: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: space.size }, (_, i) => space.sample(i, rng));
};

describe('PhaseSpace', () => {
  it('places phases inside F_s and on whole millimetres for rectangular segments', () => {
    const { space } = load('R2');
    const rng = createRng(1);
    for (let n = 0; n < 300; n++) {
      const i = rng.int(0, space.size - 1);
      const v = space.place(i, rng.next() * 3000 - 500);
      expect(contains(space.feasible[i]!, v)).toBe(true);
      if (space.rect[i])
        expect(Math.abs(v - space.a[i]! - Math.round(v - space.a[i]!))).toBeLessThan(1e-9);
    }
  });

  it('groups equal rows of a rectangle into M3 classes with identical F', () => {
    const { space } = load('R1');
    const big = space.classes.filter((c) => c.length > 1);
    expect(big.length).toBeGreaterThan(0);
    for (const c of big) {
      for (const i of c) expect(space.feasible[i]).toEqual(space.feasible[c[0]!]);
    }
    // Every segment is in exactly one class.
    expect(space.classes.flat().sort((p, q) => p - q)).toEqual([...Array(space.size).keys()]);
  });

  it('orders the bands ascending', () => {
    const { space, ctx } = load('U1');
    const bandOf = (i: number) => ctx.layout.segments[i]!.band;
    const seq = space.bands.map((list) => bandOf(list[0]!));
    expect(seq).toEqual([...seq].sort((p, q) => p - q));
  });
});

describe('MoveSet', () => {
  for (const id of ['R1', 'U1', 'S2', 'C2', 'P1']) {
    it(`${id}: every move keeps φ inside F_s (property)`, () => {
      const { ctx, space } = load(id);
      const moves = new MoveSet(ctx, space);
      const evaluator = createReferenceEvaluator(ctx);
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2 ** 30 }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (seed, t) => {
            const rng = createRng(seed);
            const phi = randomPhi(space, seed);
            evaluator.evaluate(phi);
            const unpaired = evaluator.unpaired();
            for (const kind of MOVE_KINDS) {
              const p = moves.make(kind, phi, rng, t, unpaired);
              if (p.changes.length === 0) return false;
              for (const c of p.changes) {
                if (!contains(space.feasible[c.index]!, c.value)) return false;
                if (c.value < 0 || c.value >= ctx.L + 1e-9) return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 25 },
      );
    });
  }

  it('M3 within a class keeps the board count (only the neighbours change)', () => {
    for (const id of ['R1', 'R2']) {
      const { ctx, space } = load(id);
      const moves = new MoveSet(ctx, space);
      let checked = 0;
      for (let seed = 1; seed <= 200 && checked < 30; seed++) {
        const rng = createRng(seed);
        const phi = randomPhi(space, seed);
        const p = moves.make('M3', phi, rng, 0.5);
        if (p.kind !== 'M3' || p.changes.length !== 2) continue;
        const [x, y] = p.changes;
        if (space.classOf[x!.index] !== space.classOf[y!.index]) continue;
        const after = [...phi];
        for (const c of p.changes) after[c.index] = c.value;
        expect(evaluate(ctx, after).B, `${id} seed ${seed}`).toBe(evaluate(ctx, phi).B);
        checked++;
      }
      expect(checked).toBeGreaterThan(5);
    }
  });

  it('M4 sets a piece to exactly complete an unpaired piece (e + s + k = L)', () => {
    const { ctx, space } = load('R2');
    const moves = new MoveSet(ctx, space);
    const evaluator = createReferenceEvaluator(ctx);
    const C = ctx.L - ctx.project.rules.kerf;
    let m4 = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed);
      const phi = randomPhi(space, seed);
      evaluator.evaluate(phi);
      const unpaired = evaluator.unpaired();
      const p = moves.make('M4', phi, rng, 0.5, unpaired);
      if (p.kind !== 'M4') continue;
      m4++;
      const { index, value } = p.changes[0]!;
      const start = mod(value - space.a[index]!, ctx.L);
      const end = mod(space.b[index]! - value, ctx.L);
      const completesEnd = unpaired.ends.some((e) => Math.abs(e.len + start - C) < 1e-6);
      const completesStart = unpaired.starts.some((s) => Math.abs(s.len + end - C) < 1e-6);
      expect(completesEnd || completesStart, `seed ${seed}`).toBe(true);
    }
    expect(m4).toBeGreaterThan(10);
  });

  it('M4 falls back to M2 without unpaired pieces', () => {
    const { ctx, space } = load('R1');
    const p = new MoveSet(ctx, space).make('M4', randomPhi(space, 1), createRng(1), 0.5);
    expect(p.kind).toBe('M2');
    expect(p.changes).toHaveLength(1);
  });

  it('M5 moves 2–6 consecutive bands', () => {
    const { ctx, space } = load('R2');
    const moves = new MoveSet(ctx, space);
    const bandOf = (i: number) => ctx.layout.segments[i]!.band;
    for (let seed = 1; seed <= 50; seed++) {
      const p = moves.make('M5', randomPhi(space, seed), createRng(seed), 0.5);
      expect(p.kind).toBe('M5');
      const bands = [...new Set(p.changes.map((c) => bandOf(c.index)))].sort((x, y) => x - y);
      expect(bands.length).toBeGreaterThanOrEqual(2);
      expect(bands.length).toBeLessThanOrEqual(6);
      expect(bands[bands.length - 1]! - bands[0]!).toBe(bands.length - 1);
    }
  });

  it('honours the weights', () => {
    const { ctx, space } = load('R1');
    const only = (kind: MoveKind) =>
      new MoveSet(ctx, space, { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0, [kind]: 1 });
    const rng = createRng(3);
    const phi = randomPhi(space, 3);
    for (let n = 0; n < 20; n++) expect(only('M1').propose(phi, rng, 0.5).kind).toBe('M1');
    expect(() => new MoveSet(ctx, space, { M1: 0, M2: 0, M3: 0, M4: 0, M5: 0 })).toThrow(/zero/);
    expect(Object.values(DEFAULT_MOVE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('shift amplitude shrinks with the temperature but stays at least 20 mm', () => {
    expect(shiftAmplitude(1285, 1)).toBeCloseTo(642.5);
    expect(shiftAmplitude(1285, 0.5)).toBeCloseTo(321.25);
    expect(shiftAmplitude(1285, 0)).toBe(20);
  });
});
