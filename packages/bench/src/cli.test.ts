import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from './cli';
import { parseRunResult } from './result';

const instance = (rel: string): string =>
  fileURLToPath(new URL(`../../../instances/${rel}`, import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'lp-bench-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function run(...argv: string[]): { code: number; out: string } {
  const lines: string[] = [];
  const code = main(argv, (l) => lines.push(l));
  return { code, out: lines.join('\n') };
}

describe('bench CLI', () => {
  for (const method of ['b-next', 'b-inst', 'rs', 'hc']) {
    it(`run ${method} → validate round-trip`, () => {
      const r = run(
        'run',
        instance('rect/R1.json'),
        '--method',
        method,
        '--iters',
        '150',
        '--out',
        tmp,
        '--svg',
      );
      expect(r.code).toBe(0);
      const stem = join(tmp, `R1-${method}-s1`);
      expect(existsSync(`${stem}.svg`)).toBe(true);
      expect(readFileSync(`${stem}.svg`, 'utf8')).toContain('<svg');

      const result = parseRunResult(JSON.parse(readFileSync(`${stem}.json`, 'utf8')));
      expect(result.stats.B).toBeGreaterThanOrEqual(Math.max(result.stats.lb0, result.stats.lb1));
      expect(result.plan.boards.length).toBe(result.stats.B);

      const v = run('validate', `${stem}.json`);
      // A result with V > 0 may legitimately report seam-offset violations.
      if (result.stats.V === 0) expect(v.code).toBe(0);
      expect(v.out).toContain(`validator boards=${result.stats.B}`);
    });
  }

  it('validate fails on a tampered plan', () => {
    run('run', instance('rect/R1.json'), '--method', 'b-inst', '--out', tmp);
    const file = join(tmp, 'R1-b-inst-s1.json');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    raw.plan.pieces.pop();
    writeFileSync(file, JSON.stringify(raw));
    expect(run('validate', file).code).toBe(1);
  });

  it('lb prints the bounds', () => {
    const r = run('lb', instance('rect/R1.json'));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/LB0=\d+ LB1=\d+ LB=\d+/);
  });

  it('baselines prints one row per instance', () => {
    const r = run('baselines', instance('rect'), '--iters', '50');
    expect(r.out).toContain('R1');
    expect(r.out).toContain('R2');
  });

  it('reports argument errors with exit code 2', () => {
    expect(run('run', instance('rect/R1.json')).code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--method', 'annealing').code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--method', 'rs', '--iters', 'x').code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--bogus').code).toBe(2);
    expect(run('nope').code).toBe(2);
  });

  it('maps I/O, parse and budget errors to exit code 2 (1 means plan violations)', () => {
    const bad = join(tmp, 'bad.json');
    writeFileSync(bad, '{ not json');
    expect(run('run', join(tmp, 'missing.json'), '--method', 'rs').code).toBe(2);
    expect(run('run', bad, '--method', 'rs').code).toBe(2);
    expect(run('validate', bad).code).toBe(2);
    expect(run('validate', join(tmp, 'missing.json')).code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--method', 'rs', '--iters', '0').code).toBe(2);
    expect(run('lb', bad).code).toBe(2);
  });

  it('rejects malformed result files', () => {
    expect(() => parseRunResult({ version: 99 })).toThrow(/version/);
    expect(() => parseRunResult(null)).toThrow();
  });

  it('exhaustive writes a record that validates, and refuses an oversized grid', () => {
    const project = JSON.parse(readFileSync(instance('rect/R1.json'), 'utf8'));
    project.rooms[0].outline = [
      { x: 0, y: 0 },
      { x: 3100, y: 0 },
      { x: 3100, y: 404 },
      { x: 0, y: 404 },
    ];
    const small = join(tmp, 'small.json');
    writeFileSync(small, JSON.stringify(project));

    const r = run('exhaustive', small, '--step', '20', '--seeds', '0', '--out', tmp);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/small\s+2\s+\d+\s+\d+\s+\d+/);
    const file = join(tmp, 'exhaustive', 'small-step20.json');
    const result = parseRunResult(JSON.parse(readFileSync(file, 'utf8')));
    expect(result.method).toBe('exhaustive');
    expect(run('validate', file).code).toBe(0);

    const big = run(
      'exhaustive',
      small,
      '--step',
      '1',
      '--max-evals',
      '1000',
      '--seeds',
      '0',
      '--out',
      tmp,
    );
    expect(big.code).toBe(2);
    expect(big.out).toContain('larger --step');
  });
});

describe('bench difficulty', () => {
  it('generates planted rooms in-process and writes a CSV with found/runs per method', () => {
    const out = join(tmp, 'difficulty');
    const lines: string[] = [];
    const code = main(
      ['difficulty', '--n', '6,10', '--seeds', '2', '--iters', '300', '--out', out],
      (l) => lines.push(l),
    );
    expect(code).toBe(0);
    const rows = readFileSync(join(out, 'difficulty.csv'), 'utf8').trim().split('\n');
    expect(rows[0]).toBe(
      'n,areaM2,segments,optimum,method,runs,found,feasible,share,meanB,meanGap,meanMs',
    );
    // 2 rooms x 4 methods; B-INST is deterministic (1 run), the others run once per seed.
    expect(rows).toHaveLength(1 + 2 * 4);
    const cells = rows.slice(1).map((r) => r.split(','));
    expect(cells.filter((c) => c[4] === 'b-inst').every((c) => c[5] === '1')).toBe(true);
    expect(cells.filter((c) => c[4] === 'sa').every((c) => c[5] === '2')).toBe(true);
    expect(cells.map((c) => c[2])).toEqual(['6', '6', '6', '6', '10', '10', '10', '10']);
    // The planted optimum is B* = LB1, so no method can beat it.
    expect(cells.every((c) => Number(c[10]) >= -1e-9)).toBe(true);
  }, 30_000);

  it('rejects a bad n list', () => {
    expect(main(['difficulty', '--n', '4'], () => undefined)).toBe(2);
  });
});
