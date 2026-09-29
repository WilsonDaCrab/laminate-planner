import { describe, expect, it } from 'vitest';
import { rowConfigFromSettings } from '../layout/bands';
import { goodY0 } from '../layout/fixtures/rows';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { roomToZoneInput } from '../layout/roomZone';
import { parseProject, type Plan, type Project } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext, type PlanContext } from '../plan/context';
import { createRng } from '../rng/index';
import { validatePlan, type ViolationCode } from './index';
import { zoneInputOf } from './zoneInput';

const project = (id: string): Project => parseProject(instanceFiles.find((f) => f.id === id)!.raw);

const randomPhi = (ctx: PlanContext, seed: number): number[] => {
  const rng = createRng(seed);
  return ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
};

/** Deep copy of plain data (the core has no structuredClone typings). */
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const codes = (p: Project, plan: Plan): ViolationCode[] => [
  ...new Set(validatePlan(p, plan).violations.map((x) => x.code)),
];

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))('valid plans on %s', (_id, raw) => {
  const p = parseProject(raw);
  const ctx = buildContext(p, { ...rowConfigFromSettings(p.settings), y0: goodY0(p)! });

  it('report no violations except seam offsets', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const plan = buildPlan(ctx, randomPhi(ctx, seed));
      const found = validatePlan(p, plan).violations.filter((x) => x.code !== 'stagger');
      expect(found, `seed ${seed}`).toEqual([]);
    }
  });

  it('count the boards of the plan', () => {
    const plan = buildPlan(ctx, randomPhi(ctx, 3));
    expect(validatePlan(p, plan).boards).toBe(plan.boards.length);
  });

  it('agree with the planner on the zone input', () => {
    const room = p.rooms[0]!;
    expect(zoneInputOf(p, room)).toEqual(roomToZoneInput(room, p.rules, p.doorways));
  });
});

describe('each violation code is detected', () => {
  const p = project('R1');
  const ctx = buildContext(p);
  const base = () => clone(buildPlan(ctx, randomPhi(ctx, 5)));

  const move = (plan: Plan, pieceId: string, dx: number, dy: number): void => {
    const piece = plan.pieces.find((q) => q.id === pieceId)!;
    piece.boardRect = { ...piece.boardRect, x: piece.boardRect.x + dx, y: piece.boardRect.y + dy };
    const board = plan.boards.find((b) => b.id === piece.boardId)!;
    board.placements.find((q) => q.pieceId === pieceId)!.rect = piece.boardRect;
  };

  it('count: statistics disagree with the boards', () => {
    const plan = base();
    plan.stats.boards += 1;
    expect(codes(p, plan)).toContain('count');
  });

  it('count: a piece missing from its board', () => {
    const plan = base();
    plan.boards[0]!.placements.pop();
    expect(codes(p, plan)).toContain('count');
  });

  it('boardBounds: a placement leaves the board', () => {
    const plan = base();
    const first = plan.pieces[0]!;
    move(plan, first.id, -first.boardRect.x - 5, 0);
    expect(codes(p, plan)).toContain('boardBounds');
  });

  it('overlap / kerf: two pieces on one board too close', () => {
    const plan = base();
    const board = plan.boards.find((b) => b.placements.length >= 2)!;
    const [a, b] = board.placements as [(typeof board.placements)[0], (typeof board.placements)[0]];
    move(plan, b.pieceId, a.rect.x - b.rect.x, a.rect.y - b.rect.y); // onto the first piece
    expect(codes(p, plan)).toContain('overlap');
    const plan2 = base();
    const board2 = plan2.boards.find((bd) => bd.placements.length >= 2)!;
    const [c, d] = board2.placements as [
      (typeof board2.placements)[0],
      (typeof board2.placements)[0],
    ];
    // Slide `d` to touch `c` along x with no room for the kerf.
    const left = c.rect.x <= d.rect.x ? c : d;
    const right = left === c ? d : c;
    move(
      plan2,
      right.pieceId,
      left.rect.x + left.rect.w - right.rect.x,
      left.rect.y - right.rect.y,
    );
    expect(codes(p, plan2)).toContain('kerf');
  });

  it('shapeNotOnBoard: the shape is moved off its rectangle', () => {
    const plan = base();
    plan.pieces[0]!.parts[0]!.boardOutline = plan.pieces[0]!.parts[0]!.boardOutline.map((q) => ({
      x: q.x + 50,
      y: q.y,
    }));
    expect(codes(p, plan)).toContain('shapeNotOnBoard');
  });

  it('orientation: the shape is mirrored on the board', () => {
    const plan = base();
    const part = plan.pieces[0]!.parts[0]!;
    part.boardOutline = part.boardOutline.map((q) => ({ x: -q.x, y: q.y }));
    expect(codes(p, plan)).toContain('orientation');
  });

  it('profile: a connected end is not on an original board edge', () => {
    const plan = base();
    const start = plan.pieces.find((q) => q.short === 'start' && q.long === 'both')!;
    // A start piece must hug the right end of the board; pull it away.
    move(plan, start.id, -1, 0);
    expect(codes(p, plan)).toContain('profile');
  });

  it('coverage: a piece is dropped', () => {
    const plan = base();
    const dropped = plan.pieces.pop()!;
    for (const b of plan.boards)
      b.placements = b.placements.filter((q) => q.pieceId !== dropped.id);
    expect(codes(p, plan)).toContain('coverage');
  });

  it('minLength: a start piece shorter than L_min', () => {
    const seg = ctx.layout.segments.find(
      (s) => ctx.profiles[s.id]!.isRect && s.b - s.a > 2 * ctx.L,
    )!;
    const phi = randomPhi(ctx, 5);
    // A seam 50 mm from the left wall leaves a 50 mm start piece.
    phi[ctx.layout.segments.indexOf(seg)] = (seg.a + 50) % ctx.L;
    expect(codes(p, buildPlan(ctx, phi))).toContain('minLength');
  });

  it('ripWidth: a strip narrower than w_min', () => {
    const strict: Project = { ...p, rules: { ...p.rules, minRipWidth: 190 } };
    const c = buildContext(strict, { ...rowConfigFromSettings(strict.settings), y0: 100 });
    const plan = buildPlan(c, randomPhi(c, 1));
    expect(plan.pieces.some((q) => q.width < 190)).toBe(true);
    expect(codes(strict, plan)).toContain('ripWidth');
  });

  it('stagger: equal seam phases in neighbouring rows', () => {
    const plan = buildPlan(ctx, new Array<number>(ctx.layout.segments.length).fill(0));
    expect(codes(p, plan)).toContain('stagger');
  });
});

describe('pipe checks (room L1 has a pipe)', () => {
  const p = project('L1');
  const ctx = buildContext(p);
  const base = () => clone(buildPlan(ctx, randomPhi(ctx, 2)));

  it('accepts the drill hole the planner made', () => {
    expect(codes(p, base())).not.toContain('pipe');
  });

  it('pipe: a missing drill hole', () => {
    const plan = base();
    for (const q of plan.pieces) q.features = q.features.filter((f) => f.kind !== 'drill');
    expect(codes(p, plan)).toContain('pipe');
  });

  it('pipe: a misplaced drill hole', () => {
    const plan = base();
    for (const q of plan.pieces) {
      for (const f of q.features) if (f.kind === 'drill') f.x += 10;
    }
    expect(codes(p, plan)).toContain('pipe');
  });
});
