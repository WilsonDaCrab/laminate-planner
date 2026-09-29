import { describe, expect, it } from 'vitest';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { parseProject, type Plan, type PlannedBoard } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext } from '../plan/context';
import { createRng } from '../rng/index';
import { buildBoardSheet, buildCutList } from './cutlist';

const dims = { L: 1285, W: 192 };
const k = 3;

const board = (id: string, ...rects: [string, number, number, number, number][]): PlannedBoard => ({
  id,
  placements: rects.map(([pieceId, x, y, w, h]) => ({ pieceId, rect: { x, y, w, h } })),
});

describe('DOMAIN §10 examples', () => {
  it('D07: crosscut at 743, 743 + 3 + 539 = 1285, no offcut', () => {
    const sheet = buildBoardSheet(
      board('D07', ['DZ-05-B', 0, 0, 743, 192], ['DZ-11-S', 746, 0, 539, 192]),
      dims,
      k,
    );
    expect(sheet.steps).toHaveLength(1);
    expect(sheet.steps[0]).toMatchObject({ kind: 'cross', at: 743 });
    expect(sheet.pieces.map((p) => [p.pieceId, p.length, p.width])).toEqual([
      ['DZ-05-B', 743, 192],
      ['DZ-11-S', 539, 192],
    ]);
    expect(sheet.offcuts).toEqual([]);
    expect(743 + k + 539).toBe(dims.L);
  });

  it('D15: rip at 84 gives strips 84 and 105, 84 + 3 + 105 = 192', () => {
    const sheet = buildBoardSheet(
      board('D15', ['DZ-24-01', 0, 0, 1285, 84], ['DZ-01-01', 0, 87, 1285, 105]),
      dims,
      k,
    );
    expect(sheet.steps).toEqual([expect.objectContaining({ kind: 'rip', at: 84 })]);
    expect(sheet.pieces.map((p) => p.width).sort((a, b) => a - b)).toEqual([84, 105]);
    expect(84 + k + 105).toBe(dims.W);
  });
});

describe('cutting order and rounding', () => {
  it('rips come before the crosscuts of a strip', () => {
    const sheet = buildBoardSheet(
      board('D01', ['a', 0, 0, 500, 84], ['b', 503, 0, 700, 84], ['c', 0, 87, 1285, 105]),
      dims,
      k,
    );
    expect(sheet.steps[0]!.kind).toBe('rip');
    expect(sheet.steps.slice(1).every((s) => s.kind === 'cross')).toBe(true);
  });

  it('rounds every dimension down and never exceeds the space', () => {
    const sheet = buildBoardSheet(
      board('D02', ['e', 0, 0, 743.9, 192], ['s', 746.9, 0, 538.1, 192]),
      dims,
      k,
    );
    expect(sheet.steps[0]!.at).toBe(743);
    const [e, s] = sheet.pieces;
    expect(e!.length).toBe(743);
    expect(s!.length).toBe(538);
    for (const p of sheet.pieces) expect(p.length).toBeLessThanOrEqual(p.space.length);
    expect(e!.length + k + s!.length).toBeLessThanOrEqual(dims.L);
  });

  it('cuts waste off a single short piece and reports the offcut', () => {
    const sheet = buildBoardSheet(board('D03', ['x', 0, 0, 300, 192]), dims, k);
    expect(sheet.steps).toEqual([expect.objectContaining({ kind: 'cross', at: 300 })]);
    expect(sheet.offcuts).toHaveLength(1);
    expect(sheet.offcuts[0]!.w).toBeCloseTo(dims.L - 300 - k, 9);
  });

  it('a leftover piece beside another (crosscut, then rips) is still one guillotine', () => {
    // 700 wide full-height piece, then a stack of two strips in the remaining 582 mm.
    const sheet = buildBoardSheet(
      board('D04', ['a', 0, 0, 700, 192], ['b', 703, 0, 582, 90], ['c', 703, 93, 582, 99]),
      dims,
      k,
    );
    expect(sheet.pieces).toHaveLength(3);
    expect(sheet.steps.map((s) => s.kind)).toEqual(['cross', 'rip']);
  });

  it('a gap slightly wider than the kerf gives no negative cut and exact piece lengths', () => {
    // Regression: gap 4.5 mm with a 3 mm kerf left a 1.5 mm sliver; the cut used to go negative.
    const sheet = buildBoardSheet(
      board('D06', ['a', 0, 0, 500, 192], ['b', 504.5, 0, 780.5, 192]),
      dims,
      k,
    );
    for (const step of sheet.steps) expect(step.at).toBeGreaterThanOrEqual(0);
    const lengths = Object.fromEntries(sheet.pieces.map((p) => [p.pieceId, p.length]));
    expect(lengths).toEqual({ a: 500, b: 780 });
    for (const p of sheet.pieces) expect(p.length).toBeLessThanOrEqual(p.space.length);
  });

  it('rejects overlapping placements', () => {
    expect(() =>
      buildBoardSheet(board('D05', ['a', 0, 0, 800, 192], ['b', 400, 0, 800, 192]), dims, k),
    ).toThrow(RangeError);
  });
});

describe('stops and laying order', () => {
  it('groups equal crosscut settings across boards, longest first', () => {
    const plan = {
      boards: [
        board('D07', ['p1', 0, 0, 743, 192], ['p2', 746, 0, 539, 192]),
        board('D12', ['p3', 0, 0, 743, 192], ['p4', 746, 0, 539, 192]),
        board('D19', ['p5', 0, 0, 900, 192], ['p6', 903, 0, 382, 192]),
      ],
      pieces: [],
    } as unknown as Plan;
    const list = buildCutList(plan, dims, { kerf: k });
    expect(list.crossStops).toEqual([
      { length: 900, boards: ['D19'] },
      { length: 743, boards: ['D07', 'D12'] },
    ]);
    expect(list.ripStops).toEqual([]);
  });
});

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('cut lists on %s', (_id, raw) => {
  const project = parseProject(raw);
  const ctx = buildContext(project);
  const rng = createRng(21);
  const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
  const plan = buildPlan(ctx, phi);
  const list = buildCutList(plan, { L: ctx.L, W: ctx.W }, project.rules);

  it('has a sheet per board with every piece exactly once, all sizes whole and never too long', () => {
    expect(list.sheets).toHaveLength(plan.boards.length);
    const seen = new Set<string>();
    for (const sheet of list.sheets) {
      const board = plan.boards.find((b) => b.id === sheet.boardId)!;
      expect(sheet.pieces).toHaveLength(board.placements.length);
      for (const p of sheet.pieces) {
        expect(seen.has(p.pieceId)).toBe(false);
        seen.add(p.pieceId);
        const rect = board.placements.find((q) => q.pieceId === p.pieceId)!.rect;
        expect(Number.isInteger(p.length) && Number.isInteger(p.width)).toBe(true);
        expect(p.length).toBeLessThanOrEqual(rect.w);
        expect(p.width).toBeLessThanOrEqual(rect.h);
        expect(p.length).toBeLessThanOrEqual(p.space.length);
        expect(p.width).toBeLessThanOrEqual(p.space.width);
      }
      for (const step of sheet.steps) {
        expect(Number.isInteger(step.at)).toBe(true);
        expect(step.at).toBeGreaterThanOrEqual(0);
        const size = step.kind === 'cross' ? step.region.w : step.region.h;
        expect(step.at).toBeLessThanOrEqual(size);
      }
    }
    expect(seen.size).toBe(plan.pieces.length);
  });

  it('lists every piece once in laying order, rows ascending', () => {
    const ids = list.laying.flatMap((r) => r.pieces.map((p) => p.id));
    expect(new Set(ids).size).toBe(plan.pieces.length);
    const bands = list.laying.map((r) => r.band);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildCutList(plan, { L: ctx.L, W: ctx.W }, project.rules))).toBe(
      JSON.stringify(list),
    );
  });
});
