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
    expect(run('run', instance('rect/R1.json'), '--method', 'sa').code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--method', 'rs', '--iters', 'x').code).toBe(2);
    expect(run('run', instance('rect/R1.json'), '--bogus').code).toBe(2);
    expect(run('nope').code).toBe(2);
  });

  it('rejects malformed result files', () => {
    expect(() => parseRunResult({ version: 99 })).toThrow(/version/);
    expect(() => parseRunResult(null)).toThrow();
  });
});
