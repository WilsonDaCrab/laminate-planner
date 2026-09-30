import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rowConfigFromSettings } from '../layout/bands';
import { instanceFiles } from '../layout/fixtures/instances';
import { plantedFiles } from '../layout/fixtures/planted';
import { goodY0 } from '../layout/y0';
import { createProject, parseProject } from '../model/index';
import { MoveSet } from '../optimize/moves';
import { PhaseSpace } from '../optimize/phaseSpace';
import { buildContext } from '../plan/context';
import { createRng } from '../rng/index';
import { evaluate } from './evaluate';
import { mod } from '../num/index';
import { createFastEvaluator, makeModL } from './fast';
import { createReferenceEvaluator, type Evaluator } from './evaluator';

const load = (id: string) => {
  const file = [...instanceFiles, ...plantedFiles].find((f) => f.id === id)!;
  const project = parseProject(file.raw);
  const y0 = project.settings.rowOffset === 'auto' ? (goodY0(project) ?? 0) : 0;
  return buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
};

const close = (x: number, y: number) =>
  Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));

/**
 * Fast and reference agree on every field and on the unpaired pieces. The *same* fast evaluator
 * is reused across calls: its incremental state (changed segments, sorted lists, penalty terms)
 * must never make a result depend on the history of evaluations.
 */
function expectSame(fast: Evaluator, ref: Evaluator, phi: readonly number[], label: string): void {
  const f = fast.evaluate(phi);
  const r = ref.evaluate(phi);
  expect(f.B, `${label} B`).toBe(r.B);
  expect(f.feasible, `${label} feasible`).toBe(r.feasible);
  for (const k of ['V', 'H', 'R', 'N', 'f', 'lengthDeficit'] as const) {
    expect(close(f[k], r[k]), `${label} ${k}: ${f[k]} vs ${r[k]}`).toBe(true);
  }
  const plain = (u: ReturnType<Evaluator['unpaired']>) => ({
    ends: { n: u.ends.count, seg: Array.from(u.ends.segment), len: Array.from(u.ends.len) },
    starts: { n: u.starts.count, seg: Array.from(u.starts.segment), len: Array.from(u.starts.len) },
  });
  expect(plain(fast.unpaired()), `${label} unpaired`).toEqual(plain(ref.unpaired()));
}

describe('fast evaluator equals the reference (precut)', () => {
  for (const id of [
    'R1',
    'R2',
    'L1',
    'U1',
    'S1',
    'S2',
    'C1',
    'C2',
    'P1',
    'P2',
    'T1',
    'T2',
    'T3',
    'T4',
  ]) {
    it(`${id}: random phases and phases after moves (property)`, () => {
      const ctx = load(id);
      const space = new PhaseSpace(ctx);
      const moves = new MoveSet(ctx, space);
      const fast = createFastEvaluator(ctx)!;
      expect(fast).toBeDefined();
      const ref = createReferenceEvaluator(ctx, { mode: 'precut' });
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 2 ** 30 }), (seed) => {
          const rng = createRng(seed);
          const phi = Array.from({ length: space.size }, (_, i) => space.sample(i, rng));
          expectSame(fast, ref, phi, `${id} random ${seed}`);
          // A walk of moves (M4 needs the unpaired pieces of the current state), some undone,
          // some replaced by a wholesale new vector: the fast state has to follow all of it.
          for (let n = 0; n < 25; n++) {
            expectSame(fast, ref, phi, `${id} ${seed} state ${n}`);
            const p = moves.propose(phi, rng, rng.next(), ref.unpaired());
            const old = p.changes.map((c) => phi[c.index]!);
            for (const c of p.changes) phi[c.index] = c.value;
            expectSame(fast, ref, phi, `${id} ${seed} after ${p.kind}`);
            const roll = rng.next();
            if (roll < 0.3) {
              p.changes.forEach((c, k) => (phi[c.index] = old[k]!)); // rejected: undo
            } else if (roll < 0.35) {
              for (let i = 0; i < space.size; i++) phi[i] = space.sample(i, rng);
            }
          }
        }),
        { numRuns: 8 },
      );
    });
  }

  it('rejects a phase vector of the wrong length', () => {
    const ctx = load('R1');
    expect(() => createFastEvaluator(ctx)!.evaluate([1, 2])).toThrow(/entries/);
  });

  it('agrees with a custom weight set', () => {
    const ctx = load('R2');
    const weights = {
      lambdaV: 3,
      lambdaH: 0.9,
      lambdaR: 0.5,
      epsilon: 0.1,
      regularityDistance: 120,
    };
    const fast = createFastEvaluator(ctx, { weights })!;
    const space = new PhaseSpace(ctx);
    const rng = createRng(4);
    const phi = Array.from({ length: space.size }, (_, i) => space.sample(i, rng));
    const r = evaluate(ctx, phi, { mode: 'precut', weights });
    const f = fast.evaluate(phi);
    expect(close(f.f, r.f)).toBe(true);
    expect(close(f.R, r.R)).toBe(true);
  });
});

/** Random rectilinear "histogram" rooms (as in the F3 integration test): narrow bars give free pieces (stage C). */
const histogramRoom = fc
  .array(
    fc.record({
      w: fc.integer({ min: 500, max: 1800 }),
      h: fc.integer({ min: 1000, max: 2600 }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((bars) => {
    const heights: number[] = [];
    for (const b of bars) heights.push(heights.at(-1) === b.h ? b.h + 50 : b.h);
    const total = bars.reduce((s, b) => s + b.w, 0);
    const pts = [
      { x: 0, y: 0 },
      { x: total, y: 0 },
    ];
    let right = total;
    for (let i = bars.length - 1; i >= 0; i--) {
      pts.push({ x: right, y: heights[i]! }, { x: (right -= bars[i]!.w), y: heights[i]! });
    }
    return pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length]!;
      const b = pts[(i + 1) % pts.length]!;
      return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
    });
  });

const products = [
  { id: 'a', name: 'a', boardLength: 1285, boardWidth: 192, boardsPerPack: 8 },
  { id: 'b', name: 'b', boardLength: 1000, boardWidth: 150, boardsPerPack: 8 },
  { id: 'c', name: 'c', boardLength: 2200, boardWidth: 240, boardsPerPack: 6 },
];

describe('fast evaluator on random rectilinear rooms (free pieces, strips, stage C)', () => {
  it('follows the reference through walks of moves', () => {
    let freePieces = 0;
    fc.assert(
      fc.property(
        histogramRoom,
        fc.constantFrom(...products),
        fc.integer({ min: 0, max: 150 }),
        fc.integer({ min: 1, max: 100000 }),
        (outline, product, y0, seed) => {
          const project = createProject({
            product,
            rules: {
              kerf: product.boardLength === 1000 ? 2 : 3,
              minPieceLength: 250,
              minStagger: 250,
            },
            rooms: [
              {
                id: 'r1',
                name: 'Random',
                code: 'X',
                outline,
                edges: outline.map(() => ({ kind: 'wall' as const })),
                obstacles: [],
              },
            ],
            settings: { angleDeg: 0, stackSide: 'left', rowOffset: y0 },
          });
          const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
          const space = new PhaseSpace(ctx);
          const moves = new MoveSet(ctx, space);
          const fast = createFastEvaluator(ctx)!;
          const ref = createReferenceEvaluator(ctx, { mode: 'precut' });
          const rng = createRng(seed);
          const phi = Array.from({ length: space.size }, (_, i) => space.sample(i, rng));
          for (let n = 0; n < 12; n++) {
            expectSame(fast, ref, phi, `room seed ${seed} state ${n}`);
            const dec = evaluate(ctx, phi, { mode: 'precut' }).decode;
            if (dec.BC > 0) freePieces++;
            const p = moves.propose(phi, rng, rng.next(), ref.unpaired());
            const old = p.changes.map((c) => phi[c.index]!);
            for (const c of p.changes) phi[c.index] = c.value;
            expectSame(fast, ref, phi, `room seed ${seed} after ${p.kind}`);
            if (rng.next() < 0.3) p.changes.forEach((c, k) => (phi[c.index] = old[k]!));
          }
        },
      ),
      { numRuns: 60 },
    );
    // The property is only meaningful if stage C really ran.
    expect(freePieces).toBeGreaterThan(20);
  }, 30_000); // 60 random rooms: ~5 s alone, more when several test runs share the CPU
});

describe('makeModL', () => {
  const Ls = [1285, 1, 7, 1000, 2 ** 29 + 3, 1285.5];

  it('is bit for bit mod(x, L) on phases, differences, multiples of L and huge values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Ls),
        fc.oneof(
          fc.double({ min: -5e4, max: 5e4, noNaN: true }),
          fc.integer({ min: -2_000_000, max: 2_000_000 }),
          fc
            .tuple(fc.integer({ min: -3000, max: 3000 }), fc.constantFrom(-1e-9, 0, 1e-9, 0.5))
            .map(([m, e]) => m * 1285 + e),
          fc.double({ min: -(2 ** 45), max: 2 ** 45, noNaN: true }),
          fc.constantFrom(0, -0, 1285, -1285, 2570, 1284.9999999999998, -1284.9999999999998),
        ),
        (L, x) => {
          const modL = makeModL(L);
          expect(Object.is(modL(x), mod(x, L)), `L=${L} x=${x}`).toBe(true);
        },
      ),
      { numRuns: 20_000 },
    );
  });

  it('agrees with mod at multiples of L and their neighbours for every tested L', () => {
    for (const L of Ls) {
      const modL = makeModL(L);
      for (const m of [-1e6, -3, -2, -1, 0, 1, 2, 3, 1e6]) {
        for (const d of [-1e-9, 0, 1e-9]) {
          const x = m * L + d;
          expect(Object.is(modL(x), mod(x, L)), `L=${L} x=${x}`).toBe(true);
        }
      }
    }
  });
});
