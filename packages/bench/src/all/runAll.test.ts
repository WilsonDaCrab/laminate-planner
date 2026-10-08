import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { mainAsync } from '../cli';
import { loadInstances } from './instances';
import type { Preset } from './protocol';
import { rawPath, readRows } from './raw';
import { runAll } from './runAll';

const tmp = mkdtempSync(join(tmpdir(), 'lp-all-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const root = fileURLToPath(new URL('../../../../instances', import.meta.url));

const preset: Preset = { seeds: 2, iters: 100 };

describe('loadInstances', () => {
  const all = loadInstances(root);
  it('orders by group (§13.1) and numerically by id, and finds every group', () => {
    expect(all.length).toBeGreaterThanOrEqual(27);
    expect(all.slice(0, 4).map((i) => i.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
    const ids = all.filter((i) => i.group === 'planted').map((i) => i.id);
    expect(ids).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(new Set(all.map((i) => i.group))).toEqual(
      new Set(['tiny', 'planted', 'rect', 'lshape', 'slanted', 'obstacles', 'curved']),
    );
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
  });
});

// Each test runs a whole matrix (two instances): seconds alone, more under load.
describe('runAll', { timeout: 60_000 }, () => {
  const instances = loadInstances(root).filter((i) => ['T1', 'T2'].includes(i.id));

  it('runs the matrix, writes env, raw rows and the summary, and resumes without rerunning', async () => {
    const dir = join(tmp, 'a');
    const lines: string[] = [];
    const first = await runAll({ instances, preset, dir, log: (l) => lines.push(l) });
    // by hand: 2 instances x (2 + 3·2) = 16
    expect(first).toMatchObject({ total: 16, skipped: 0, ran: 16 });
    expect(lines[0]).toContain('16 runs in the matrix, 0 already done, 16 to run');
    expect(readRows(rawPath(dir))).toHaveLength(16);
    expect(JSON.parse(readFileSync(join(dir, 'env.json'), 'utf8'))).toMatchObject({
      node: process.version,
    });
    const summary = readFileSync(join(dir, 'summary.csv'), 'utf8').trim().split('\n');
    expect(summary).toHaveLength(3); // header + T1 + T2
    const envBefore = readFileSync(join(dir, 'env.json'), 'utf8');
    const second = await runAll({ instances, preset, dir });
    // a pass with nothing to run leaves the description of the producing session alone
    expect(readFileSync(join(dir, 'env.json'), 'utf8')).toBe(envBefore);
    expect(second).toMatchObject({ total: 16, skipped: 16, ran: 0 });
    expect(readRows(rawPath(dir))).toHaveLength(16);
    expect(second.rows).toHaveLength(16);
  });

  it('stamps every row with the commit, warns about rows of other commits, takes meta from the instances', async () => {
    const dir = join(tmp, 'd');
    await runAll({ instances, preset, dir });
    const file = rawPath(dir);
    const rows = readRows(file);
    const commit = rows[0]!.commit;
    expect(rows.every((r) => r.commit === commit)).toBe(true);

    // rows of "another session": same keys, different commit
    writeFileSync(
      file,
      rows.map((r) => `${JSON.stringify({ ...r, commit: 'abcdef0123456789' })}\n`).join(''),
    );
    const lines: string[] = [];
    // the instance files changed meanwhile: bestKnown is read from the instances, not from the rows
    const edited = instances.map((i) => ({
      ...i,
      project: {
        ...i.project,
        meta: { ...i.project.meta, source: 'manual' as const, bestKnown: 4 },
      },
    }));
    await runAll({ instances: edited, preset, dir, log: (l) => lines.push(l) });
    expect(
      lines.some((l) => l.startsWith('WARNING: 16 finished rows come from other commits (abcdef0')),
    ).toBe(true);
    const cols = readFileSync(join(dir, 'summary.csv'), 'utf8').trim().split('\n');
    const head = cols[0]!.split(',');
    const t1 = cols[1]!.split(',');
    expect(t1[head.indexOf('bestKnown')]).toBe('4');
  });

  it('a changed budget is a new matrix: old rows stay in the file but not in the tables', async () => {
    const dir = join(tmp, 'b');
    await runAll({ instances, preset, dir });
    const again = await runAll({ instances, preset: { ...preset, iters: 120 }, dir });
    expect(again).toMatchObject({ skipped: 0, ran: 16 });
    expect(readRows(rawPath(dir))).toHaveLength(32);
    expect(again.rows).toHaveLength(16);
    expect(again.rows.every((r) => r.iters === 120)).toBe(true);
  });

  it('bench all --quick runs through the CLI', async () => {
    const dir = join(tmp, 'c');
    const lines: string[] = [];
    const code = await mainAsync(['all', '--quick', '--out', dir], (l) => lines.push(l));
    expect(code).toBe(0);
    expect(readRows(rawPath(dir))).toHaveLength(16); // quick: 2 instances x (2 + 3·2)
    expect(lines.at(-1)).toContain('16 runs executed');
  });
});
