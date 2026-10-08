import { describe, expect, it } from 'vitest';
import { mainTableCsv, stats } from './summary';
import type { RawRow } from './runJob';

const row = (over: Partial<RawRow>): RawRow => ({
  key: 'k',
  instance: 'A',
  group: 'rect',
  method: 'sa',
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
  N: 0,
  feasible: true,
  provenOptimal: false,
  mode: 'precut',
  evals: 1000,
  evalsToFinalB: 10,
  ms: 100,
  commit: null,
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
      ],
      new Map([['A', { knownOptimum: null, bestKnown: 11 }]]),
    );
    const [head, a, b, ...rest] = csv.trim().split('\n');
    expect(rest).toEqual([]);
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
    expect(cols).toHaveLength(7 + 5 * 5);
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
      hc_best: '',
      hc_feasible: '',
    });
    expect(b!.startsWith('B,rect,')).toBe(true);
  });
});
