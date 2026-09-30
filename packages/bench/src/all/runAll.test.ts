import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

const preset: Preset = {
  seeds: 2,
  iters: 100,
  aestheticsInstances: ['T1'],
  aestheticsDistances: [200, null],
};

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

describe('runAll', () => {
  const instances = loadInstances(root).filter((i) => ['T1', 'T2'].includes(i.id));

  it('runs the matrix, writes env, raw rows and tables, and resumes without rerunning', async () => {
    const dir = join(tmp, 'a');
    const lines: string[] = [];
    const first = await runAll({ instances, preset, dir, log: (l) => lines.push(l) });
    // by hand: main 2 instances x (2 + 4·2) = 20; aesthetics T1 x 2 variants x 2 seeds = 4
    expect(first).toMatchObject({ total: 24, skipped: 0, ran: 24 });
    expect(lines[0]).toContain('24 runs in the matrix, 0 already done, 24 to run');
    expect(readRows(rawPath(dir, 'main'))).toHaveLength(20);
    expect(readRows(rawPath(dir, 'aesthetics'))).toHaveLength(4);
    expect(JSON.parse(readFileSync(join(dir, 'env.json'), 'utf8'))).toMatchObject({
      node: process.version,
    });
    const summary = readFileSync(join(dir, 'summary.csv'), 'utf8').trim().split('\n');
    expect(summary).toHaveLength(3); // header + T1 + T2
    for (const f of ['g1_convergence', 'g2_aesthetics', 'g3_precut']) {
      expect(existsSync(join(dir, 'tables', `${f}.csv`))).toBe(true);
    }

    for (const g of ['G1', 'G2', 'G3']) {
      expect(readFileSync(join(dir, 'plots', `${g}.svg`), 'utf8')).toContain('<svg');
    }

    const second = await runAll({ instances, preset, dir });
    expect(second).toMatchObject({ total: 24, skipped: 24, ran: 0 });
    expect(readRows(rawPath(dir, 'main'))).toHaveLength(20);
    expect(second.rows).toHaveLength(24);
  });

  it('a changed budget is a new matrix: old rows stay in the file but not in the tables', async () => {
    const dir = join(tmp, 'b');
    await runAll({ instances, preset, dir, only: ['main'] });
    const again = await runAll({
      instances,
      preset: { ...preset, iters: 120 },
      dir,
      only: ['main'],
    });
    expect(again).toMatchObject({ skipped: 0, ran: 20 });
    expect(readRows(rawPath(dir, 'main'))).toHaveLength(40);
    expect(again.rows).toHaveLength(20);
    expect(again.rows.every((r) => r.iters === 120)).toBe(true);
  });

  it('bench all --quick --only main runs through the CLI and rejects unknown experiments', async () => {
    const dir = join(tmp, 'c');
    const lines: string[] = [];
    const code = await mainAsync(['all', '--quick', '--only', 'main', '--out', dir], (l) =>
      lines.push(l),
    );
    expect(code).toBe(0);
    expect(readRows(rawPath(dir, 'main'))).toHaveLength(20); // quick: 2 instances x (2 + 4·2)
    expect(lines.at(-1)).toContain('20 runs executed');
    expect(await mainAsync(['all', '--only', 'nope'], () => undefined)).toBe(2);
  });
});
