import { describe, expect, it } from 'vitest';
import {
  aestheticsCsv,
  bestAt,
  convergenceCsv,
  evalGrid,
  mainTableCsv,
  precutCsv,
  stats,
} from './summary';
import type { RawRow } from './runJob';

const row = (over: Partial<RawRow>): RawRow => ({
  key: 'k',
  experiment: 'main',
  instance: 'A',
  group: 'rect',
  method: 'sa',
  variant: '-',
  seed: 1,
  iters: 1000,
  y0: 0,
  segments: 5,
  zoneM2: 12.5,
  lb0: 9,
  lb1: 10,
  lb: 10,
  B: 11,
  V: 0,
  H: 0,
  N: 0,
  feasible: true,
  provenOptimal: false,
  mode: 'precut',
  evals: 1000,
  evalsToFinalB: 10,
  ms: 100,
  commit: null,
  trace: [],
  ...over,
});

describe('stats', () => {
  it('takes best, mean and sample deviation over the feasible runs only', () => {
    // feasible B = 10, 12, 14: mean 12, sample variance (4 + 0 + 4) / 2 = 4, std 2; the infeasible 5 is ignored
    const s = stats([
      row({ B: 10 }),
      row({ B: 12, ms: 200 }),
      row({ B: 14 }),
      row({ B: 5, feasible: false, ms: 300 }),
    ]);
    expect(s).toMatchObject({ runs: 4, feasible: 3, best: 10, mean: 12, std: 2 });
    expect(s.meanMs).toBe(175); // (100 + 200 + 100 + 300) / 4
  });

  it('has no best or mean without a feasible run, and std 0 for a single run', () => {
    expect(stats([row({ feasible: false })])).toMatchObject({
      feasible: 0,
      best: undefined,
      mean: undefined,
    });
    expect(stats([row({ B: 7 })]).std).toBe(0);
  });
});

describe('mainTableCsv', () => {
  it('has one line per instance and the columns of every method', () => {
    const csv = mainTableCsv(
      [
        row({ method: 'b-inst', B: 13, seed: 1 }),
        row({ method: 'sa', B: 11, seed: 1 }),
        row({ method: 'sa', B: 12, seed: 2 }),
        row({ instance: 'B', method: 'sa', B: 20, lb: 18, segments: 9 }),
        row({ experiment: 'aesthetics', instance: 'Z', variant: 'D300' }),
      ],
      new Map([['A', { knownOptimum: null, bestKnown: 11 }]]),
    );
    const [head, a, b, ...rest] = csv.trim().split('\n');
    expect(rest).toEqual([]); // the aesthetics row belongs to another table
    const cols = head!.split(',');
    expect(cols.slice(0, 7)).toEqual([
      'instance',
      'group',
      'zoneM2',
      'segments',
      'lb',
      'knownOptimum',
      'bestKnown',
    ]);
    expect(cols).toHaveLength(7 + 6 * 5);
    const ra = Object.fromEntries(a!.split(',').map((v, i) => [cols[i], v]));
    expect(ra).toMatchObject({
      instance: 'A',
      zoneM2: '12.500',
      segments: '5',
      lb: '10',
      knownOptimum: '',
      bestKnown: '11',
      b_inst_best: '13',
      sa_best: '11',
      sa_mean: '11.500',
      sa_feasible: '2/2',
      rs_best: '',
      rs_feasible: '',
    });
    expect(b!.startsWith('B,rect,')).toBe(true);
  });
});

describe('convergence', () => {
  it('evalGrid is increasing, starts at 1 and ends at the budget', () => {
    const g = evalGrid(200_000);
    expect(g[0]).toBe(1);
    expect(g[g.length - 1]).toBe(200_000);
    expect(g).toEqual([...g].sort((x, y) => x - y));
    expect(new Set(g).size).toBe(g.length);
  });

  it('bestAt is a step function of the trace', () => {
    const t = [
      { eval: 1, B: 20 },
      { eval: 10, B: 15 },
      { eval: 100, B: 12 },
    ];
    expect([bestAt(t, 1), bestAt(t, 9), bestAt(t, 10), bestAt(t, 5000)]).toEqual([20, 20, 15, 12]);
    expect(bestAt([], 10)).toBeUndefined();
  });

  it('averages the seeds at each grid point', () => {
    const trace1 = [
      { eval: 1, B: 20 },
      { eval: 10, B: 14 },
    ];
    const trace2 = [
      { eval: 1, B: 22 },
      { eval: 10, B: 16 },
    ];
    const csv = convergenceCsv([
      row({ seed: 1, iters: 10, trace: trace1 }),
      row({ seed: 2, iters: 10, trace: trace2 }),
      row({ method: 'hc', trace: [] }),
    ]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('instance,method,eval,mean,min,max,seeds');
    expect(lines[1]).toBe('A,sa,1,21,20,22,2');
    expect(lines[lines.length - 1]).toBe('A,sa,10,15,14,16,2');
  });
});

describe('aesthetics and precut tables', () => {
  it('G2: one line per instance and variant with distance, mean B and mean H', () => {
    const csv = aestheticsCsv([
      row({ experiment: 'aesthetics', variant: 'D300', B: 10, H: 2 }),
      row({ experiment: 'aesthetics', variant: 'D300', B: 12, H: 4, seed: 2 }),
      row({ experiment: 'aesthetics', variant: 'Hoff', B: 9, H: 0 }),
    ]);
    expect(csv.trim().split('\n')).toEqual([
      'instance,variant,distance,runs,feasible,best,mean,std,meanH',
      'A,D300,300,2,2,10,11,1.414,3',
      'A,Hoff,off,1,1,9,9,0,0',
    ]);
  });

  it('G3: B-INST, SA-onsite and SA per instance', () => {
    const csv = precutCsv([
      row({ method: 'b-inst', B: 13 }),
      row({ method: 'sa-onsite', B: 10, mode: 'onsite' }),
      row({ method: 'sa', B: 11 }),
      row({ method: 'rs', B: 15 }),
    ]);
    expect(csv.trim().split('\n')).toEqual([
      'instance,method,mean,best,feasible',
      'A,b-inst,13,13,1/1',
      'A,sa-onsite,10,10,1/1',
      'A,sa,11,11,1/1',
    ]);
  });
});
