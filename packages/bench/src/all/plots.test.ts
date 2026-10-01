import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { g1Spec, g2Spec, g3Spec, parseCsv, renderSvg, writePlots } from './plots';

const tmp = mkdtempSync(join(tmpdir(), 'lp-plots-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('parseCsv', () => {
  it('reads numbers as numbers, empty cells as null, the rest as text', () => {
    expect(parseCsv('a,b,c\nx,1.5,\ny,2,off\n')).toEqual([
      { a: 'x', b: 1.5, c: null },
      { a: 'y', b: 2, c: 'off' },
    ]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('specs', () => {
  it('G1 draws the representative instances when present, else everything', () => {
    const head = 'instance,method,eval,mean,min,max,seeds';
    const csv = [head, 'P4,sa,1,20,19,21,2', 'P5,sa,1,30,29,31,2', 'R2,sa,1,40,39,41,2'].join('\n');
    const values = (s: unknown) => (s as { data: { values: { instance: string }[] } }).data.values;
    expect(values(g1Spec(parseCsv(csv))).map((r) => r.instance)).toEqual(['P4', 'R2']);
    const other = [head, 'A,sa,1,20,19,21,2', 'B,sa,1,30,29,31,2'].join('\n');
    expect(values(g1Spec(parseCsv(other))).map((r) => r.instance)).toEqual(['A', 'B']);
  });

  it('G3 turns the means into percentages of B-INST', () => {
    const spec = g3Spec(
      parseCsv(
        'instance,method,mean,best,feasible\nA,b-inst,100,100,1/1\nA,sa-onsite,90,90,1/1\nA,sa,95,95,1/1\nB,sa,5,5,1/1\n',
      ),
    );
    const values = (
      spec as { data: { values: { instance: string; method: string; relative: number }[] } }
    ).data.values;
    // B has no B-INST row and is left out; A: (90-100)/100 = -10 %, (95-100)/100 = -5 %
    expect(values).toEqual([
      { instance: 'A', method: 'b-inst', relative: 0 },
      { instance: 'A', method: 'sa-onsite', relative: -10 },
      { instance: 'A', method: 'sa', relative: -5 },
    ]);
  });

  it('G2 puts "off" after the numeric distances', () => {
    const spec = g2Spec(
      parseCsv(
        'instance,variant,distance,runs,feasible,best,mean,std,meanH\nA,Hoff,off,2,2,9,9,0,0\nA,D500,500,2,2,9,9.5,0.7,1\nA,D200,200,2,2,9,9.2,0.4,2\n',
      ),
    );
    const layer = (spec as { spec: { layer: { encoding: { x: { sort: string[] } } }[] } }).spec
      .layer;
    expect(layer[0]!.encoding.x.sort).toEqual(['200', '500', 'off']);
  });
});

describe('rendering', () => {
  it('renders G1–G3 from the tables to SVG files, and skips a table without rows', async () => {
    const dir = join(tmp, 'r');
    mkdirSync(join(dir, 'tables'), { recursive: true });
    const w = (name: string, text: string): void =>
      writeFileSync(join(dir, 'tables', `${name}.csv`), text);
    w(
      'g1_convergence',
      'instance,method,eval,mean,min,max,seeds\nA,sa,1,20,19,21,2\nA,sa,100,15,14,16,2\nB,sa,1,30,29,31,2\nB,sa,100,25,24,26,2\n',
    );
    w(
      'g2_aesthetics',
      'instance,variant,distance,runs,feasible,best,mean,std,meanH\nA,D200,200,2,2,9,9.2,0.4,2\nA,Hoff,off,2,2,9,9,0,0\n',
    );
    w('g3_precut', 'instance,method,mean,best,feasible\n'); // header only
    const written = await writePlots(dir);
    expect(written.map((f) => f.replace(/\\/g, '/').split('/').pop())).toEqual([
      'G1.svg',
      'G2.svg',
    ]);
    for (const f of written) expect(readFileSync(f, 'utf8')).toContain('<svg');
    expect(existsSync(join(dir, 'plots', 'G3.svg'))).toBe(false);
  });

  it('a spec of inline data renders to a non-trivial SVG', async () => {
    const svg = await renderSvg(
      g3Spec(parseCsv('instance,method,mean,best,feasible\nA,b-inst,10,10,1/1\nA,sa,9,9,1/1\n')),
    );
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.length).toBeGreaterThan(1000);
  });
});
