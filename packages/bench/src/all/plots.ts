/**
 * Plots G1–G3 (ALGORITHM §13.3) as SVG, from the CSV tables of `summary.ts`, with Vega-Lite
 * compiled and rendered by Vega in Node (no canvas, no browser): `results/plots/G1.svg` …
 *
 * The specs are plain data built from rows; the CSV is parsed here (our tables have no quoted
 * fields). A plot whose table has no rows is skipped, not drawn empty.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vega from 'vega';
import { compile, type TopLevelSpec } from 'vega-lite';

export type Table = Record<string, string | number | null>[];

export function parseCsv(text: string): Table {
  const [head, ...lines] = text.trim().split('\n');
  if (!head) return [];
  const cols = head.split(',');
  return lines
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const cells = line.split(',');
      return Object.fromEntries(
        cols.map((c, i) => {
          const v = cells[i] ?? '';
          return [c, v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v];
        }),
      );
    });
}

const COMMON = { background: 'white', config: { font: 'sans-serif' } } as const;

/** G1: best B so far against the evaluations (log axis): mean line, min–max band, per instance. */
export function g1Spec(rows: Table): TopLevelSpec {
  return {
    ...COMMON,
    title: 'G1 Convergence of SA: best B so far (mean, min–max over the seeds)',
    data: { values: rows },
    facet: { field: 'instance', type: 'nominal', title: null },
    columns: 4,
    resolve: { scale: { y: 'independent' } },
    spec: {
      width: 170,
      height: 120,
      layer: [
        {
          mark: { type: 'area', opacity: 0.25 },
          encoding: {
            x: {
              field: 'eval',
              type: 'quantitative',
              scale: { type: 'log' },
              title: 'evaluations',
            },
            y: {
              field: 'min',
              type: 'quantitative',
              scale: { zero: false },
              title: 'B',
              axis: { format: '.2~f' },
            },
            y2: { field: 'max' },
          },
        },
        {
          mark: { type: 'line' },
          encoding: {
            x: { field: 'eval', type: 'quantitative', scale: { type: 'log' } },
            y: {
              field: 'mean',
              type: 'quantitative',
              scale: { zero: false },
              axis: { format: '.2~f' },
            },
          },
        },
      ],
    },
  };
}

/** G2: mean B (±1 deviation) against the seam-offset distance D; "off" is the last column. */
export function g2Spec(rows: Table): TopLevelSpec {
  const order = [...new Set(rows.map((r) => String(r.distance)))].sort((a, b) =>
    a === 'off' ? 1 : b === 'off' ? -1 : Number(a) - Number(b),
  );
  const data = rows.map((r) => ({
    ...r,
    distance: String(r.distance),
    lo: Number(r.mean) - Number(r.std ?? 0),
    hi: Number(r.mean) + Number(r.std ?? 0),
  }));
  return {
    ...COMMON,
    title: 'G2 Cost of the H-pattern: mean B against the seam-offset distance D (mm)',
    data: { values: data },
    facet: { field: 'instance', type: 'nominal', title: null },
    columns: 4,
    resolve: { scale: { y: 'independent' } },
    spec: {
      width: 170,
      height: 120,
      layer: [
        {
          mark: { type: 'errorbar' },
          encoding: {
            x: {
              field: 'distance',
              type: 'ordinal',
              sort: order,
              title: 'D (mm)',
              axis: { labelAngle: 0 },
            },
            y: {
              field: 'lo',
              type: 'quantitative',
              scale: { zero: false },
              title: 'B',
              axis: { format: '.2~f' },
            },
            y2: { field: 'hi' },
          },
        },
        {
          mark: { type: 'line', point: true },
          encoding: {
            x: { field: 'distance', type: 'ordinal', sort: order },
            y: {
              field: 'mean',
              type: 'quantitative',
              scale: { zero: false },
              axis: { format: '.2~f' },
            },
          },
        },
      ],
    },
  };
}

/** G3: B of B-INST, SA-onsite and SA per instance, as a percentage of B-INST (negative = better). */
export function g3Spec(rows: Table): TopLevelSpec {
  const base = new Map(
    rows.filter((r) => r.method === 'b-inst').map((r) => [r.instance, Number(r.mean)]),
  );
  const data = rows
    .filter((r) => r.mean !== null && base.has(r.instance))
    .map((r) => ({
      instance: r.instance,
      method: r.method,
      relative: (100 * (Number(r.mean) - base.get(r.instance)!)) / base.get(r.instance)!,
    }));
  const instances = [...new Set(data.map((d) => String(d.instance)))];
  return {
    ...COMMON,
    title: 'G3 Value of cutting in advance: mean B relative to B-INST (%, on-site)',
    data: { values: data },
    width: Math.max(300, instances.length * 26),
    height: 240,
    mark: 'bar',
    encoding: {
      x: {
        field: 'instance',
        type: 'nominal',
        sort: instances,
        title: null,
        axis: { labelAngle: -90 },
      },
      xOffset: { field: 'method' },
      y: {
        field: 'relative',
        type: 'quantitative',
        title: 'B vs B-INST (%)',
        axis: { format: '.1~f' },
      },
      color: {
        field: 'method',
        type: 'nominal',
        sort: ['b-inst', 'sa-onsite', 'sa'],
        title: 'method',
      },
    },
  };
}

export async function renderSvg(spec: TopLevelSpec): Promise<string> {
  const view = new vega.View(vega.parse(compile(spec).spec), { renderer: 'none' });
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

const PLOTS = [
  { file: 'G1', table: 'g1_convergence', spec: g1Spec },
  { file: 'G2', table: 'g2_aesthetics', spec: g2Spec },
  { file: 'G3', table: 'g3_precut', spec: g3Spec },
] as const;

/** Reads `<dir>/tables/*.csv`, writes `<dir>/plots/G1|G2|G3.svg`; returns the files written. */
export async function writePlots(dir: string): Promise<string[]> {
  const written: string[] = [];
  mkdirSync(join(dir, 'plots'), { recursive: true });
  for (const p of PLOTS) {
    const src = join(dir, 'tables', `${p.table}.csv`);
    if (!existsSync(src)) continue;
    const rows = parseCsv(readFileSync(src, 'utf8'));
    if (rows.length === 0) continue;
    const out = join(dir, 'plots', `${p.file}.svg`);
    writeFileSync(out, await renderSvg(p.spec(rows)));
    written.push(out);
  }
  return written;
}
