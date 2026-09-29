import { describe, expect, it } from 'vitest';
import { rectShape, shapesArea, type Shape } from '../geometry/clip';
import { signedArea } from '../geometry/polygon';
import { buildZone } from '../geometry/zone';
import { createProject } from '../model/defaults';
import type { Room } from '../model/schema';
import { mod } from '../num/index';
import { buildBands, rowConfigFromSettings, segmentById } from './bands';
import { buildRoomZone, roomToZoneInput } from './roomZone';

const W = 192;

const uniform = (n: number, gap = 10) => Array.from({ length: n }, () => ({ gap }));

function rectZone(w: number, h: number): Shape[] {
  const outline = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  return buildZone({ outline, edges: uniform(4) }).shapes;
}

/** Independent computation of the row heights of a rectangle of height H starting at yMin. */
function expectedRowHeights(y0: number, yMin: number, H: number): number[] {
  let first = mod(y0 - yMin, W);
  if (first === 0) first = W;
  if (first >= H) return [H];
  const n = 1 + Math.ceil((H - first) / W);
  const last = H - first - (n - 2) * W;
  return [first, ...Array.from({ length: n - 2 }, () => W), last];
}

describe('rectangle 4000×3000, W = 192, every y0 = 0…191', () => {
  const zone = rectZone(4000, 3000); // 3980 × 2980, y ∈ [10, 2990]

  it('segment count and row widths match the independent formula', () => {
    for (let y0 = 0; y0 < W; y0++) {
      const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0 }, W);
      const expected = expectedRowHeights(y0, 10, 2980);
      expect(layout.segments, `y0 = ${y0}`).toHaveLength(expected.length);
      const heights = layout.segments.map((s) => s.yHi - s.yLo);
      heights.forEach((h, i) => expect(h, `y0 = ${y0}, row ${i + 1}`).toBeCloseTo(expected[i]!, 6));
      for (const s of layout.segments) {
        expect(s.a).toBeCloseTo(10, 6);
        expect(s.b).toBeCloseTo(3990, 6);
      }
      expect(layout.segments.map((s) => s.id)).toEqual(expected.map((_, i) => `${i + 1}a`));
    }
  });

  it('rows are contiguous and their heights add up to the zone height', () => {
    for (const y0 of [0, 1, 37, 100, 191]) {
      const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0 }, W);
      let y = 10;
      for (const s of layout.segments) {
        expect(s.yLo).toBeCloseTo(y, 6);
        y = s.yHi;
      }
      expect(y).toBeCloseTo(2990, 6);
      expect(shapesArea(layout.segments.map((s) => s.shape))).toBeCloseTo(3980 * 2980, 3);
    }
  });

  it('shifting y0 by one board width changes nothing', () => {
    const a = buildBands(zone, { theta: 0, stackSide: 'left', y0: 30 }, W);
    const b = buildBands(zone, { theta: 0, stackSide: 'left', y0: 30 + W }, W);
    expect(b.segments.map((s) => [s.id, s.yLo, s.yHi])).toEqual(
      a.segments.map((s) => [s.id, s.yLo, s.yHi]),
    );
  });

  it('a row offset that is not on the Clipper grid is snapped to it', () => {
    const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 12.3456 }, W);
    expect(layout.cfg.y0).toBeCloseTo(12.35, 9);
    for (const band of layout.bands) {
      expect(Math.abs(band.lo * 100 - Math.round(band.lo * 100))).toBeLessThan(1e-6);
    }
  });
});

describe('U-shaped room: one band, several segments', () => {
  // 6000 × 4000 with a notch 2000 wide and 2500 deep open to the top (y from 1500 to 4000).
  const outline = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 4000, y: 4000 },
    { x: 4000, y: 1500 },
    { x: 2000, y: 1500 },
    { x: 2000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const zone = buildZone({ outline, edges: uniform(8) }).shapes;
  const layout = buildBands(zone, { theta: 0, stackSide: 'left', y0: 10 }, W);

  it('bands entirely inside the arms have two segments, the others one', () => {
    // Zone y ∈ [10, 3990] → 21 bands; arms start at y = 1490, so bands k ≥ 8 (lo ≥ 1546) are split.
    expect(layout.bands).toHaveLength(21);
    expect(layout.bands.filter((b) => b.segmentIds.length === 2)).toHaveLength(13);
    expect(layout.bands.filter((b) => b.segmentIds.length === 1)).toHaveLength(8);
  });

  it('segments of a band are ordered left to right with letter ids', () => {
    const left = segmentById(layout, '9a')!;
    const right = segmentById(layout, '9b')!;
    expect(left.a).toBeCloseTo(10, 6);
    expect(left.b).toBeCloseTo(1990, 6);
    expect(right.a).toBeCloseTo(4010, 6);
    expect(right.b).toBeCloseTo(5990, 6);
    expect(left.index).toBe(0);
    expect(right.index).toBe(1);
  });

  it('the band that straddles the arm base is a single U-shaped segment', () => {
    const u = segmentById(layout, '8a')!;
    expect(u.a).toBeCloseTo(10, 6);
    expect(u.b).toBeCloseTo(5990, 6);
    expect(layout.bands.find((b) => b.j === 8)?.segmentIds).toEqual(['8a']);
  });
});

describe('rotation and mirroring', () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 1500 },
    { x: 2000, y: 1500 },
    { x: 2000, y: 3000 },
    { x: 0, y: 3000 },
  ];
  const zone = buildZone({ outline, edges: uniform(6) }).shapes;
  const zoneArea = shapesArea(zone); // 8 860 400

  for (const stackSide of ['left', 'right'] as const) {
    for (const angle of [0, 30, 45, 90]) {
      it(`θ = ${angle}°, stack ${stackSide}: segments tile the zone`, () => {
        const layout = buildBands(zone, { theta: (angle * Math.PI) / 180, stackSide, y0: 37.5 }, W);
        const total = shapesArea(layout.segments.map((s) => s.shape));
        // Rotated coordinates are snapped to the 0.01 mm Clipper grid: error ≤ 0.01 mm × perimeter.
        const bound = angle % 90 === 0 ? 0.5 : 0.01 * 14_000;
        expect(Math.abs(total - zoneArea)).toBeLessThanOrEqual(bound);
        for (const s of layout.segments) {
          expect(signedArea(s.shape.outer)).toBeGreaterThan(0);
          expect(s.a).toBeLessThanOrEqual(s.b);
          expect(s.yLo).toBeGreaterThanOrEqual(s.bandLo - 1e-6);
          expect(s.yHi).toBeLessThanOrEqual(s.bandHi + 1e-6);
        }
        expect(new Set(layout.segments.map((s) => s.id)).size).toBe(layout.segments.length);
      });
    }
  }
});

describe('edge cases', () => {
  it('an empty zone gives no bands', () => {
    const layout = buildBands([], { theta: 0, stackSide: 'left', y0: 0 }, W);
    expect(layout.bands).toEqual([]);
    expect(layout.segments).toEqual([]);
  });

  it('rejects a non-positive board width', () => {
    expect(() => buildBands([], { theta: 0, stackSide: 'left', y0: 0 }, 0)).toThrow();
  });

  it('a zone thinner than one row gives a single segment as tall as the zone', () => {
    const layout = buildBands(rectZone(3000, 120), { theta: 0, stackSide: 'left', y0: 0 }, W);
    expect(layout.segments).toHaveLength(1);
    expect(layout.segments[0]!.yHi - layout.segments[0]!.yLo).toBeCloseTo(100, 6);
  });

  it('a strip only a hundredth of a millimetre high above a band line is clipping noise, not a row', () => {
    // Zone 1000 × 192.01: the second band [192, 384] would hold a 0.01 mm sliver (10 mm²).
    const layout = buildBands(
      [rectShape(0, 0, 1000, 192.01)],
      { theta: 0, stackSide: 'left', y0: 0 },
      W,
    );
    expect(layout.segments.map((s) => s.id)).toEqual(['1a']);
    // A genuine thin row (0.05 mm = 2.5 grid steps) is kept.
    const thin = buildBands(
      [rectShape(0, 0, 1000, 192.05)],
      { theta: 0, stackSide: 'left', y0: 0 },
      W,
    );
    expect(thin.segments.map((s) => s.id)).toEqual(['1a', '2a']);
  });
});

describe('rowConfigFromSettings', () => {
  it("uses numeric values and falls back for 'auto'", () => {
    const set = { angleDeg: 90, stackSide: 'right', rowOffset: 40 } as const;
    expect(rowConfigFromSettings(set)).toEqual({ theta: Math.PI / 2, stackSide: 'right', y0: 40 });
    const auto = { angleDeg: 'auto', stackSide: 'auto', rowOffset: 'auto' } as const;
    expect(rowConfigFromSettings(auto)).toEqual({ theta: 0, stackSide: 'left', y0: 0 });
    expect(
      rowConfigFromSettings(auto, { angleDeg: 180, stackSide: 'right', rowOffset: 7 }),
    ).toEqual({
      theta: Math.PI,
      stackSide: 'right',
      y0: 7,
    });
  });
});

describe('roomToZoneInput / buildRoomZone', () => {
  const room: Room = {
    id: 'r1',
    name: 'L',
    code: 'DZ',
    outline: [
      { x: 0, y: 0 },
      { x: 5200, y: 0 },
      { x: 5200, y: 3100 },
      { x: 3000, y: 3100 },
      { x: 3000, y: 4600 },
      { x: 0, y: 4600 },
    ],
    edges: [
      { kind: 'wall' },
      { kind: 'wall', gap: 14 },
      { kind: 'wall' },
      { kind: 'wall' },
      { kind: 'wall' },
      { kind: 'wall' },
    ],
    obstacles: [
      { kind: 'pipe', id: 'p1', center: { x: 5130, y: 1400 }, diameter: 16 },
      { kind: 'circle', id: 'c1', center: { x: 1000, y: 1000 }, diameter: 400 },
      {
        kind: 'polygon',
        id: 'b1',
        points: [
          { x: 100, y: 3000 },
          { x: 500, y: 3000 },
          { x: 500, y: 3400 },
        ],
        gap: 25,
      },
    ],
  };

  it('resolves gaps, drops pipes and keeps other obstacles', () => {
    const project = createProject({ rooms: [room] });
    const input = roomToZoneInput(room, project.rules);
    expect(input.edges.map((e) => e.gap)).toEqual([10, 14, 10, 10, 10, 10]);
    expect(input.obstacles).toHaveLength(2);
    expect(input.obstacles?.[0]).toMatchObject({ kind: 'circle', gap: 10 });
    expect(input.obstacles?.[1]).toMatchObject({ kind: 'polygon', gap: 25 });
  });

  it('attaches doorways to both rooms they connect', () => {
    const project = createProject({ rooms: [room] });
    const input = roomToZoneInput(room, project.rules, [
      {
        id: 'd1',
        roomA: 'other',
        edgeA: 1,
        offsetA: 50,
        roomB: 'r1',
        edgeB: 0,
        offsetB: 900,
        width: 800,
        depth: 100,
        jambUndercut: 20,
        mode: 'continuous',
      },
    ]);
    expect(input.doorways).toEqual([
      { edge: 0, offset: 900, width: 800, depth: 100, jambUndercut: 20 },
    ]);
  });

  it('the DOMAIN §9 L-room has the hand-computed zone area A − g·P + 4g² (pipe ignored)', () => {
    const plain: Room = {
      ...room,
      edges: room.edges.map(() => ({ kind: 'wall' as const })),
      obstacles: [room.obstacles[0]!],
    };
    const project = createProject({ rooms: [plain] });
    const zone = buildRoomZone(project, 'r1');
    // A = 5200·3100 + 3000·1500 = 20 620 000, P = 19 600.
    expect(shapesArea(zone.shapes)).toBeCloseTo(20_620_000 - 10 * 19_600 + 4 * 100, 2);
    expect(zone.warnings).toEqual([]);
  });

  it('unknown room id throws', () => {
    expect(() => buildRoomZone(createProject(), 'nope')).toThrow(/unknown room/);
  });
});
