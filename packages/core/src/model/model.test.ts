import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PRODUCT,
  DEFAULT_RULES,
  DEFAULT_SETTINGS,
  ProjectError,
  checkProjectIntegrity,
  createProject,
  edgeGap,
  loadProject,
  migrate,
  parseProject,
  saveProject,
  type Migration,
} from './index';

/** The example from DOMAIN.md §9 (L-shaped living room). */
const domainExample = () => ({
  schemaVersion: 1,
  name: 'L veida dzīvojamā istaba',
  product: {
    id: 'demo-1285x192',
    name: 'Demo 1285×192',
    boardLength: 1285,
    boardWidth: 192,
    boardsPerPack: 8,
  },
  rules: {
    kerf: 3,
    minPieceLength: 300,
    minStagger: 300,
    minRipWidth: 50,
    expansionGap: 10,
    minGap: 7,
    maxGap: 14,
    hPattern: { enabled: true, distance: 100 },
    pattern: { kind: 'free' },
    reservePercent: 2,
  },
  rooms: [
    {
      id: 'r1',
      name: 'Dzīvojamā',
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
        { kind: 'wall' },
        { kind: 'wall' },
        { kind: 'wall' },
        { kind: 'wall' },
        { kind: 'wall' },
      ],
      obstacles: [{ kind: 'pipe', id: 'p1', center: { x: 5130, y: 1400 }, diameter: 16 }],
    },
  ],
  doorways: [] as Record<string, unknown>[],
  settings: {
    angleDeg: 0,
    stackSide: 'left',
    rowOffset: 'auto',
    mode: 'precut',
    trimMargin: 0,
    aesthetics: 0.5,
    seed: 1,
    timeLimitMs: 3000,
  },
});

function issueCodes(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProjectError) return e.issues.map((i) => i.code);
    throw e;
  }
  return [];
}

describe('parseProject', () => {
  it('accepts the DOMAIN §9 example', () => {
    const p = parseProject(domainExample());
    expect(p.rooms[0]?.outline).toHaveLength(6);
    expect(p.settings.angleDeg).toBe(0);
    expect(p.settings.rowOffset).toBe('auto');
    expect(p.rooms[0]?.obstacles[0]?.kind).toBe('pipe');
  });

  it('fills in defaults for missing optional parts (values from DOMAIN §5)', () => {
    const doc = domainExample();
    const minimal = { schemaVersion: 1, name: 'x', product: doc.product, rooms: [] };
    const p = parseProject(minimal);
    expect(p.rules.kerf).toBe(3);
    expect(p.rules.minPieceLength).toBe(300);
    expect(p.rules.minStagger).toBe(300);
    expect(p.rules.minRipWidth).toBe(50);
    expect(p.rules.expansionGap).toBe(10);
    expect(p.rules.minGap).toBe(7);
    expect(p.rules.maxGap).toBe(14);
    expect(p.rules.hPattern).toEqual({ enabled: true, distance: 100 });
    expect(p.rules.pattern).toEqual({ kind: 'free' });
    expect(p.rules.reservePercent).toBe(2);
    expect(p.settings.mode).toBe('precut');
    expect(p.doorways).toEqual([]);
    expect(p.rules).toEqual(DEFAULT_RULES);
    expect(p.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('edges default to kind "wall"', () => {
    const doc = domainExample();
    doc.rooms[0]!.edges = doc.rooms[0]!.edges.map(() => ({}) as { kind: string });
    expect(parseProject(doc).rooms[0]?.edges.every((e) => e.kind === 'wall')).toBe(true);
  });

  it('createProject builds a valid project from defaults', () => {
    const p = createProject();
    expect(p.product).toEqual(DEFAULT_PRODUCT);
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => parseProject(p)).not.toThrow();
  });
});

describe('rejection', () => {
  it('a clockwise outline', () => {
    const doc = domainExample();
    doc.rooms[0]!.outline.reverse();
    expect(issueCodes(() => parseProject(doc))).toContain('outlineNotCCW');
  });

  it('edges that do not match the outline', () => {
    const doc = domainExample();
    doc.rooms[0]!.edges.pop();
    expect(issueCodes(() => parseProject(doc))).toContain('edgesMismatch');
  });

  it('a self-intersecting outline', () => {
    const doc = domainExample();
    doc.rooms[0]!.outline = [
      { x: 0, y: 0 },
      { x: 1000, y: 1000 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
    ];
    doc.rooms[0]!.edges = doc.rooms[0]!.edges.slice(0, 4);
    const codes = issueCodes(() => parseProject(doc));
    expect(codes.some((c) => c === 'outlineNotSimple' || c === 'outlineNotCCW')).toBe(true);
  });

  it('coinciding consecutive vertices', () => {
    const doc = domainExample();
    doc.rooms[0]!.outline[1] = { x: 0, y: 0 };
    expect(issueCodes(() => parseProject(doc))).toContain('zeroLengthEdge');
  });

  it('parameters outside the DOMAIN §5 ranges', () => {
    const doc = domainExample();
    doc.rules.minPieceLength = 700; // > L/2 = 642.5
    doc.rules.minStagger = 700; // ≥ L/2
    doc.rules.minRipWidth = 100; // ≥ W/2 = 96
    doc.rules.expansionGap = 20; // > g_max
    const codes = issueCodes(() => parseProject(doc));
    expect(codes).toEqual(
      expect.arrayContaining(['minPieceLength', 'minStagger', 'minRipWidth', 'gapOrder']),
    );
  });

  it('wrong field types report their path', () => {
    const doc = domainExample() as unknown as Record<string, unknown>;
    (doc.product as Record<string, unknown>).boardLength = 'long';
    try {
      parseProject(doc);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectError);
      expect((e as ProjectError).issues.some((i) => i.path === 'product.boardLength')).toBe(true);
    }
  });

  it('duplicate ids and doorways with unknown rooms or ranges', () => {
    const doc = domainExample();
    doc.rooms.push({ ...doc.rooms[0]! });
    expect(issueCodes(() => parseProject(doc))).toContain('duplicateId');

    const doc2 = domainExample() as ReturnType<typeof domainExample> & { doorways: unknown[] };
    doc2.doorways = [
      { id: 'd1', roomA: 'nope', edgeA: 0, offsetA: 0, width: 800, depth: 100, jambUndercut: 20 },
    ];
    expect(issueCodes(() => parseProject(doc2))).toContain('doorwayRoom');

    doc2.doorways = [
      { id: 'd1', roomA: 'r1', edgeA: 0, offsetA: 4900, width: 800, depth: 100, jambUndercut: 20 },
    ];
    expect(issueCodes(() => parseProject(doc2))).toContain('doorwayRange');
  });

  it('a doorway on an arc edge', () => {
    const doc = domainExample() as ReturnType<typeof domainExample> & { doorways: unknown[] };
    (doc.rooms[0]!.edges[0] as Record<string, unknown>).bulge = 0.2;
    doc.doorways = [
      { id: 'd1', roomA: 'r1', edgeA: 0, offsetA: 100, width: 800, depth: 100, jambUndercut: 20 },
    ];
    expect(issueCodes(() => parseProject(doc))).toContain('doorwayOnArc');
  });

  it('a doorway joining an edge to itself, and doorways that overlap on one edge', () => {
    const door = (id: string, offsetA: number, extra: Record<string, unknown> = {}) => ({
      id,
      roomA: 'r1',
      edgeA: 0,
      offsetA,
      width: 800,
      depth: 100,
      jambUndercut: 20,
      ...extra,
    });
    const doc = domainExample() as ReturnType<typeof domainExample> & { doorways: unknown[] };

    doc.doorways = [door('d1', 100, { roomB: 'r1', edgeB: 0, offsetB: 2000 })];
    expect(issueCodes(() => parseProject(doc))).toContain('doorwaySameEdge');

    doc.doorways = [door('d1', 100), door('d2', 800)]; // [100, 900] and [800, 1600] overlap
    expect(issueCodes(() => parseProject(doc))).toContain('doorwayOverlap');

    doc.doorways = [door('d1', 100), door('d2', 900)]; // touching ends are fine
    expect(issueCodes(() => parseProject(doc))).not.toContain('doorwayOverlap');
  });

  it('invalid JSON text and non-object documents', () => {
    expect(issueCodes(() => loadProject('{ nope'))).toContain('invalidJson');
    expect(issueCodes(() => parseProject([]))).toContain('notAnObject');
    expect(issueCodes(() => parseProject(null))).toContain('notAnObject');
  });

  it('checkProjectIntegrity reports without throwing', () => {
    const p = parseProject(domainExample());
    expect(checkProjectIntegrity(p)).toEqual([]);
  });
});

describe('migrations', () => {
  const v0toV1: Migration = {
    from: 0,
    to: 1,
    up: (raw) => {
      const { title, ...rest } = raw as { title?: string };
      return { ...rest, name: title ?? 'Untitled' };
    },
  };

  it('upgrades an old document through the registry', () => {
    const old = { ...domainExample(), schemaVersion: 0, title: 'Vecais nosaukums' } as Record<
      string,
      unknown
    >;
    delete old.name;
    const p = parseProject(old, [v0toV1]);
    expect(p.name).toBe('Vecais nosaukums');
    expect(p.schemaVersion).toBe(1);
  });

  it('leaves the input untouched', () => {
    const old = { ...domainExample(), schemaVersion: 0, title: 't' };
    const copy = JSON.stringify(old);
    migrate(old, [v0toV1]);
    expect(JSON.stringify(old)).toBe(copy);
  });

  it('refuses a newer version, a missing version and a gap in the chain', () => {
    expect(issueCodes(() => parseProject({ ...domainExample(), schemaVersion: 2 }))).toContain(
      'schemaVersionTooNew',
    );
    const noVersion = domainExample() as Record<string, unknown>;
    delete noVersion.schemaVersion;
    expect(issueCodes(() => parseProject(noVersion))).toContain('schemaVersion');
    expect(issueCodes(() => parseProject({ ...domainExample(), schemaVersion: 0 }))).toContain(
      'noMigration',
    );
  });

  it('supports multi-step chains', () => {
    const steps: Migration[] = [
      { from: 0, to: 1, up: (r) => ({ ...r, trail: 'a' }) },
      { from: 1, to: 2, up: (r) => ({ ...r, trail: `${String(r.trail)}b` }) },
    ];
    const out = migrate({ schemaVersion: 0 }, steps, 2);
    expect(out).toEqual({ schemaVersion: 2, trail: 'ab' });
  });
});

describe('saveProject / loadProject', () => {
  it('round-trips and is idempotent', () => {
    const p = parseProject(domainExample());
    const text = saveProject(p);
    const again = loadProject(text);
    expect(again).toEqual(p);
    expect(saveProject(again)).toBe(text);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('writes keys in schema order regardless of input order', () => {
    const doc = domainExample() as Record<string, unknown>;
    const shuffled = Object.fromEntries(Object.entries(doc).reverse());
    expect(saveProject(parseProject(shuffled))).toBe(saveProject(parseProject(doc)));
  });
});

describe('edgeGap', () => {
  it('uses the edge value, else the project default', () => {
    expect(edgeGap({ kind: 'wall' }, DEFAULT_RULES)).toBe(10);
    expect(edgeGap({ kind: 'wall', gap: 14 }, DEFAULT_RULES)).toBe(14);
    expect(edgeGap({ kind: 'wall', gap: 0 }, DEFAULT_RULES)).toBe(0);
  });
});
