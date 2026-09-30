import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  buildContext,
  buildPlan,
  evaluate,
  goodY0,
  isSaResult,
  lowerBounds,
  shapesArea,
  parseProject,
  resolveY0,
  renderPlanSvg,
  rowConfigFromSettings,
  saveProject,
  runMethod,
  runOuter,
  validatePlan,
  type Method,
  type PlanContext,
  type Project,
  type SaResult,
  type SearchResult,
} from '@lp/core';
import {
  COMPARE_METHODS,
  difficultyCells,
  measureMethod,
  TUNING_CONFIGS,
  tuneOne,
  type MethodStats,
} from './experiments';
import { DEFAULT_MAX_EVALS, runExhaustive } from './exhaustive';
import { generatePlanted, PLANTED_PRESETS } from './generate/planted';
import { allCommand } from './all/cli';
import { writeMeta } from './meta';
import { measure, PERF_SEGMENTS, PERF_TARGET, tallRoom } from './perf';
import { parseRunResult, RESULT_VERSION, type RunResult } from './result';

const METHODS: readonly Method[] = ['b-next', 'b-inst', 'rs', 'hc', 'sa', 'sa-onsite'];
/** Methods of the `baselines` table (SA-onsite is a separate experiment, F6). */
const TABLE_METHODS: readonly Method[] = ['b-next', 'b-inst', 'rs', 'hc', 'sa'];
const DEFAULT_OUT = 'results/f4';
const DEFAULT_ITERS = 2000;

const USAGE = `lp-bench <command>

  run <instance.json> --method b-next|b-inst|rs|hc|sa|sa-onsite [--seed N] [--iters N] [--time ms]
                      [--y0 mm] [--out dir] [--svg]
  validate <result.json>          check a result file with the independent validator
  lb <instance.json> [--y0 mm]    lower bounds LB0, LB1
  generate planted (--preset P1..P6 | --n N --m M --seed S) [--base instance.json] [--out file]
                                  planted staircase room with known optimum
  outer <instance.json> [--iters N] [--time ms] [--topk K] [--maxy0 N] [--rows N] [--seed N] [--out dir] [--svg]
                                  outer loop: direction, starting wall and row offset, SA on the best
  perf [path...] [--evals N] [--rows N]
                                  evaluations per second (reference, typed-array, SA-like) and the
                                  F5 criterion on a rectangular room of --rows (default 60) rows
  planted [path...] [--method sa|hc|rs] [--seeds N] [--iters N]
                                  share of seeds that reach the known optimum of planted instances
  compare [path...] [--seeds N] [--iters N]
                                  RS, HC, SA against B-NEXT and B-INST, mean over seeds (F5 criterion)
  tune [path...] [--seeds N] [--iters N]
                                  SA parameter grid (move probabilities, closure, p0)
  exhaustive [path...] [--step mm] [--seeds N] [--iters N] [--max-evals N] [--out dir] [--write-meta]
                                  full enumeration of φ on a grid (default instances/tiny) against
                                  B-INST (on-site), HC and SA; --seeds 0 skips the heuristics;
                                  --write-meta stores knownOptimum (B = LB1) or bestKnown in the file
  bestknown [path...] [--seeds N] [--iters N] [--write-meta] [--force]
                                  long SA runs (default 10 seeds x 2 000 000 evaluations); --write-meta stores
                                  meta.bestKnown = min(existing, best) (knownOptimum only if B = LB1)
  difficulty [--n 6,10,...,42] [--m N] [--seeds N] [--iters N] [--base instance.json] [--out dir]
                                  difficulty series: planted rooms generated in-process (seed = n), share of
                                  runs at the known optimum per method -> results/f6/difficulty.csv
  all [--quick] [--only main,aesthetics] [--jobs N|auto] [--seeds N] [--iters N] [--out dir] [--instances dir]
                                  every experiment of the protocol (20 seeds x 200 000 evaluations) ->
                                  results/raw/*.jsonl (resumable), summary.csv, tables/; --quick = dry run
  baselines [path...] [--iters N] [--seed N]
                                  table of all methods over instance files or directories
`;

class CliError extends Error {}

const loadInstance = (file: string): Project =>
  parseProject(JSON.parse(readFileSync(file, 'utf8')));

const instanceId = (file: string): string => basename(file, extname(file));

function toMethod(value: string | undefined): Method {
  if (!METHODS.includes(value as Method)) {
    throw new CliError(`--method must be one of ${METHODS.join(', ')}`);
  }
  return value as Method;
}

function toInt(name: string, value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new CliError(`--${name} must be a non-negative integer`);
  return n;
}

/** Instance files under the given paths (directories are searched recursively), sorted. */
function collectInstances(paths: readonly string[]): string[] {
  const out: string[] = [];
  const visit = (p: string): void => {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) visit(join(p, name));
    } else if (p.endsWith('.json')) {
      out.push(p);
    }
  };
  for (const p of paths) visit(p);
  return out;
}

const fixed = (x: number, digits = 1): string => x.toFixed(digits);

interface RecordInput {
  id: string;
  method: RunResult['method'];
  seed: number;
  iters: number | null;
  timeMs: number | null;
  project: Project;
  ctx: PlanContext;
  y0: number;
  result: Omit<SearchResult, 'method'> & { method: SearchResult['method'] | 'exhaustive' };
  ms: number;
}

/** The self-contained JSON of one run: statistics, phases, project and the plan built from them. */
function makeRecord(input: RecordInput): RunResult {
  const { ctx, result } = input;
  const plan = buildPlan(ctx, result.phi, { mode: result.mode });
  const bounds = lowerBounds(ctx);
  const ev = result.evaluation;
  return {
    version: RESULT_VERSION,
    instance: input.id,
    method: input.method,
    seed: input.seed,
    iters: input.iters,
    timeMs: input.timeMs,
    y0: input.y0,
    mode: result.mode,
    phi: result.phi,
    stats: {
      B: ev.B,
      lb0: bounds.lb0,
      lb1: bounds.lb1,
      gap: ev.B - bounds.lb,
      V: ev.V,
      H: ev.H,
      N: ev.N,
      feasible: ev.feasible,
      lengthDeficit: ev.lengthDeficit,
      evals: result.evals,
      ms: input.ms,
      provenOptimal: result.provenOptimal,
      trace: result.trace,
    },
    search: isSaResult(result as SearchResult)
      ? { stats: (result as SaResult).stats, curve: (result as SaResult).curve }
      : undefined,
    project: input.project,
    plan,
  };
}

function runCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      method: { type: 'string' },
      seed: { type: 'string' },
      iters: { type: 'string' },
      time: { type: 'string' },
      y0: { type: 'string' },
      out: { type: 'string' },
      svg: { type: 'boolean' },
    },
  });
  const [file] = positionals;
  if (!file) throw new CliError('run: missing <instance.json>');
  const method = toMethod(values.method);
  const project = loadInstance(file);
  const seed = toInt('seed', values.seed, project.settings.seed)!;
  const iters = toInt('iters', values.iters);
  const timeMs = toInt('time', values.time);
  const y0 = toInt('y0', values.y0);
  const budget = {
    iters: iters ?? (timeMs === undefined ? DEFAULT_ITERS : undefined),
    timeMs,
    clock: () => performance.now(),
  };

  const t0 = performance.now();
  const { ctx, y0: usedY0, result } = runMethod(project, method, { seed, budget, y0 });
  const ms = performance.now() - t0;

  const id = instanceId(file);
  const record = makeRecord({
    id,
    method,
    seed,
    iters: budget.iters ?? null,
    timeMs: timeMs ?? null,
    project,
    ctx,
    y0: usedY0,
    result,
    ms,
  });
  const plan = record.plan;
  const bounds = { lb: Math.max(record.stats.lb0, record.stats.lb1) };
  const ev = result.evaluation;

  const out = values.out ?? DEFAULT_OUT;
  mkdirSync(out, { recursive: true });
  const stem = join(out, `${id}-${method}-s${seed}`);
  writeFileSync(`${stem}.json`, JSON.stringify(record));
  if (values.svg) writeFileSync(`${stem}.svg`, renderPlanSvg(project, plan));

  log(
    `${id} ${method} seed=${seed} y0=${usedY0}: B=${ev.B} LB=${bounds.lb} gap=${record.stats.gap} ` +
      `V=${fixed(ev.V, 2)} feasible=${ev.feasible} evals=${result.evals} ${fixed(ms, 0)} ms` +
      `${result.provenOptimal ? ' OPTIMAL' : ''} -> ${stem}.json${values.svg ? ' + .svg' : ''}`,
  );
  return 0;
}

function validateCommand(args: string[], log: (line: string) => void): number {
  const [file] = args;
  if (!file) throw new CliError('validate: missing <result.json>');
  const r = parseRunResult(JSON.parse(readFileSync(file, 'utf8')));
  const check = validatePlan(r.project, r.plan);
  const boardsAgree = check.boards === r.stats.B;
  log(
    `${r.instance} ${r.method}: validator boards=${check.boards} (result B=${r.stats.B}), ` +
      `violations=${check.violations.length}`,
  );
  if (!boardsAgree) log('  board count disagrees with the result statistics');
  for (const v of check.violations.slice(0, 20)) log(`  [${v.code}] ${v.message}`);
  if (check.violations.length > 20) log(`  ... and ${check.violations.length - 20} more`);
  if (check.violations.length > 0 && r.stats.V === 0) log('  note: V = 0 but violations found');
  return check.violations.length === 0 && boardsAgree ? 0 : 1;
}

function lbCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { y0: { type: 'string' } },
  });
  const [file] = positionals;
  if (!file) throw new CliError('lb: missing <instance.json>');
  const project = loadInstance(file);
  const y0 = toInt('y0', values.y0) ?? goodY0(project) ?? 0;
  const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
  const b = lowerBounds(ctx);
  log(
    `${instanceId(file)} y0=${y0} segments=${ctx.layout.segments.length} ` +
      `LB0=${b.lb0} LB1=${b.lb1} LB=${b.lb}`,
  );
  return 0;
}

function baselinesCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { iters: { type: 'string' }, seed: { type: 'string' } },
  });
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances']);
  if (files.length === 0) throw new CliError('baselines: no instance files found');
  const iters = toInt('iters', values.iters, DEFAULT_ITERS)!;
  const seed = toInt('seed', values.seed, 1)!;

  log(
    ['instance', 'segs', 'LB', 'B-NEXT', 'B-INST', 'B-INST/pc', 'RS', 'HC', 'SA', 'ms']
      .map(pad)
      .join(' '),
  );
  let bad = 0;
  for (const file of files) {
    try {
      const project = loadInstance(file);
      const t0 = performance.now();
      const cells: string[] = [];
      let segs = 0;
      let lb = 0;
      const B: Partial<Record<Method, number>> = {};
      for (const m of TABLE_METHODS) {
        const { ctx, result } = runMethod(project, m, { seed, budget: { iters } });
        segs = ctx.layout.segments.length;
        lb = lowerBounds(ctx).lb;
        B[m] = result.evaluation.B;
        const plan = buildPlan(ctx, result.phi, { mode: result.mode });
        const v = validatePlan(project, plan);
        const other = v.violations.some((x) => x.code !== 'stagger');
        const disagree = v.boards !== result.evaluation.B;
        const mark = other || disagree ? '!' : result.evaluation.feasible ? '' : '*';
        if (other || disagree) bad++;
        cells.push(`${result.evaluation.B}${mark}`);
        if (m === 'b-inst') {
          // The same phases under the pre-cut decoder: what RS and HC (project mode) compare to.
          cells.push(String(evaluate(ctx, result.phi, { mode: 'precut' }).B));
        }
      }
      const flag = B['b-inst']! > B['b-next']! ? '  <- B-INST > B-NEXT' : '';
      log(
        [instanceId(file), String(segs), String(lb), ...cells, fixed(performance.now() - t0, 0)]
          .map(pad)
          .join(' ') + flag,
      );
    } catch (e) {
      bad++;
      log(`${instanceId(file)}: error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(
    'B-NEXT, B-INST: on-site decoder; B-INST/pc: same phases, pre-cut decoder; RS, HC, SA: project mode (pre-cut).',
  );
  log(
    '* = seam offset not satisfied (V > 0), ! = validator found another violation or board count.',
  );
  return bad === 0 ? 0 : 1;
}

const pad = (s: string): string => s.padEnd(10);

function outerCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      seed: { type: 'string' },
      iters: { type: 'string' },
      time: { type: 'string' },
      topk: { type: 'string' },
      maxy0: { type: 'string' },
      rows: { type: 'string' },
      out: { type: 'string' },
      svg: { type: 'boolean' },
    },
  });
  const [file] = positionals;
  if (!file) throw new CliError('outer: missing <instance.json>');
  const project = loadInstance(file);
  const seed = toInt('seed', values.seed, project.settings.seed)!;
  const timeMs = toInt('time', values.time);
  const iters = toInt('iters', values.iters, timeMs === undefined ? 30_000 : undefined);
  const show = toInt('rows', values.rows, 12)!;
  const t0 = performance.now();
  const outer = runOuter(project, {
    seed,
    budget: { iters, timeMs, clock: () => performance.now() },
    topK: toInt('topk', values.topk, 3),
    maxY0: toInt('maxy0', values.maxy0, 24),
  });
  const ms = performance.now() - t0;

  log(
    ['angle', 'side', 'y0', 'segs', 'LB', 'B-INST', 'SA', 'note'].map(pad).join(' ') +
      `   (${outer.table.length} configurations screened, best ${show} shown)`,
  );
  for (const r of outer.table.slice(0, show)) {
    const note = [
      r.sa?.provenOptimal ? 'optimal' : '',
      r.sa && !r.sa.feasible ? 'V>0' : '',
      r.relaxed ? 'w_min violated' : '',
    ]
      .filter(Boolean)
      .join(' ');
    log(
      [
        `${r.angleDeg.toFixed(1)}`,
        r.stackSide,
        String(r.y0),
        String(r.segments),
        String(r.lb),
        String(r.bInst),
        r.sa ? String(r.sa.B) : '-',
        note,
      ]
        .map(pad)
        .join(' '),
    );
  }

  // The result is stored with the chosen row configuration fixed, so that it validates by itself.
  const { row, ctx, result } = outer.best;
  const fixedProject: Project = {
    ...project,
    settings: {
      ...project.settings,
      angleDeg: row.angleDeg,
      stackSide: row.stackSide,
      rowOffset: row.y0,
    },
  };
  const id = instanceId(file);
  const record = makeRecord({
    id,
    method: 'outer',
    seed,
    iters: iters ?? null,
    timeMs: timeMs ?? null,
    project: fixedProject,
    ctx,
    y0: row.y0,
    result,
    ms,
  });
  const dir = values.out ?? DEFAULT_OUT;
  mkdirSync(dir, { recursive: true });
  const stem = join(dir, `${id}-outer-s${seed}`);
  writeFileSync(`${stem}.json`, JSON.stringify(record));
  if (values.svg) writeFileSync(`${stem}.svg`, renderPlanSvg(fixedProject, record.plan));
  log(
    `best: angle ${row.angleDeg.toFixed(1)}° ${row.stackSide} y0=${row.y0}: B=${result.evaluation.B} ` +
      `LB=${row.lb} B-INST=${row.bInst} feasible=${result.evaluation.feasible} ${fixed(ms, 0)} ms ` +
      `-> ${stem}.json${values.svg ? ' + .svg' : ''}`,
  );
  return 0;
}

function generateCommand(args: string[], log: (line: string) => void): number {
  const [kind, ...rest] = args;
  if (kind !== 'planted') throw new CliError('generate: only "planted" is available');
  const { values } = parseArgs({
    args: rest,
    options: {
      preset: { type: 'string' },
      n: { type: 'string' },
      m: { type: 'string' },
      seed: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const base = loadInstance(values.base ?? 'instances/rect/R1.json');
  let params;
  if (values.preset) {
    params = PLANTED_PRESETS[values.preset];
    if (!params)
      throw new CliError(`--preset must be one of ${Object.keys(PLANTED_PRESETS).join(', ')}`);
    params = { ...params, name: values.preset };
  } else {
    params = {
      n: toInt('n', values.n) ?? NaN,
      m: toInt('m', values.m, 2)!,
      seed: toInt('seed', values.seed, 1)!,
    };
    if (!Number.isInteger(params.n)) throw new CliError('generate planted: --n or --preset needed');
  }
  const project = generatePlanted(base, params);
  const json = saveProject(project);
  const out = values.out ?? (values.preset ? `instances/planted/${values.preset}.json` : undefined);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, json);
  } else {
    log(json);
  }
  log(`planted n=${params.n} knownOptimum=${project.meta!.knownOptimum}${out ? ` -> ${out}` : ''}`);
  return 0;
}

function perfCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { evals: { type: 'string' }, rows: { type: 'string' } },
  });
  const evals = toInt('evals', values.evals, 100_000)!;
  const rows = toInt('rows', values.rows, PERF_SEGMENTS)!;
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances']);
  const clock = () => performance.now();
  const table = files.map((f) => measure(instanceId(f), loadInstance(f), evals, clock));
  const base = loadInstance('instances/rect/R1.json');
  const tall = measure(`tall-${rows}`, tallRoom(base, rows), evals, clock);
  log(
    ['room', 'segs', 'reference', 'fast full', 'fast SA', 'SA iter.', 'speed-up']
      .map(pad)
      .join(' '),
  );
  for (const r of [...table, tall]) {
    log(
      [
        r.name,
        String(r.segments),
        String(Math.round(r.reference)),
        String(Math.round(r.fastFull)),
        String(Math.round(r.fastSa)),
        String(Math.round(r.saIteration)),
        `${(r.fastSa / r.reference).toFixed(0)}x`,
      ]
        .map(pad)
        .join(' '),
    );
  }
  log(
    'evaluations per second. fast full: random vectors (no reuse); fast SA: the evaluator alone on a replay of recorded moves M1-M5 (30 % accepted); SA iter.: a whole SA iteration incl. generating the move',
  );
  const ok = tall.fastSa >= PERF_TARGET && tall.segments >= PERF_SEGMENTS;
  log(
    `criterion: >= ${PERF_TARGET}/s at ${PERF_SEGMENTS} segments: ${tall.segments} segments, ` +
      `${Math.round(tall.fastSa)}/s -> ${ok ? 'MET' : 'NOT MET'}`,
  );
  return ok ? 0 : 1;
}

function plantedCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { method: { type: 'string' }, seeds: { type: 'string' }, iters: { type: 'string' } },
  });
  const method = toMethod(values.method ?? 'sa');
  const seeds = toInt('seeds', values.seeds, 20)!;
  const iters = toInt('iters', values.iters, 200_000)!;
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances/planted']);
  if (files.length === 0) throw new CliError('planted: no instance files found');
  log(
    ['instance', 'optimum', 'found', 'share', 'best B', 'mean B', 'mean ms'].map(pad).join(' ') +
      `   (${method}, ${seeds} seeds, ${iters} evaluations)`,
  );
  let worst = 1;
  for (const file of files) {
    const project = loadInstance(file);
    const optimum = project.meta?.knownOptimum;
    if (optimum === undefined) throw new CliError(`${file}: no meta.knownOptimum`);
    let found = 0;
    let sum = 0;
    let best = Infinity;
    let ms = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const t0 = performance.now();
      const { result } = runMethod(project, method, { seed, budget: { iters } });
      ms += performance.now() - t0;
      const b = result.evaluation.B;
      sum += b;
      best = Math.min(best, b);
      if (result.evaluation.feasible && b === optimum) found++;
    }
    worst = Math.min(worst, found / seeds);
    log(
      [
        instanceId(file),
        String(optimum),
        `${found}/${seeds}`,
        `${((100 * found) / seeds).toFixed(0)} %`,
        String(best),
        fixed(sum / seeds, 2),
        fixed(ms / seeds, 0),
      ]
        .map(pad)
        .join(' '),
    );
  }
  log(
    `criterion: optimum in >= 90 % of the seeds on every instance: ${worst >= 0.9 ? 'MET' : 'NOT MET'}`,
  );
  return 0;
}

function compareCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { seeds: { type: 'string' }, iters: { type: 'string' } },
  });
  const seeds = toInt('seeds', values.seeds, 5)!;
  const iters = toInt('iters', values.iters, 20_000)!;
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances']);
  if (files.length === 0) throw new CliError('compare: no instance files found');
  log(
    ['instance', 'LB', ...COMPARE_METHODS.map((m) => m.toUpperCase()), 'SA <= all?']
      .map(pad)
      .join(' ') +
      `   (mean B of feasible runs over ${seeds} seeds, ${iters} evaluations; * = not all runs feasible, - = none)`,
  );
  let lost = 0;
  for (const file of files) {
    const project = loadInstance(file);
    const lb = lowerBounds(runMethod(project, 'b-inst').ctx).lb;
    const stats = COMPARE_METHODS.map((m) => measureMethod(project, m, seeds, iters));
    const cell = (s: MethodStats): string =>
      s.meanB === undefined ? '-' : `${fixed(s.meanB, 2)}${s.feasibleShare < 1 ? '*' : ''}`;
    const sa = stats.find((s) => s.method === 'sa')!;
    const others = stats.filter((s) => s.method !== 'sa' && s.meanB !== undefined);
    const beaten = others.filter((s) => sa.meanB === undefined || s.meanB! < sa.meanB - 1e-9);
    // SA must be feasible in every run: a mean over the feasible runs alone hides the failures.
    const incomplete = sa.feasibleShare < 1;
    if (beaten.length > 0 || incomplete) lost++;
    log(
      [
        instanceId(file),
        String(lb),
        ...stats.map(cell),
        beaten.length === 0 && !incomplete
          ? 'yes'
          : `NO (${[...beaten.map((s) => s.method), ...(incomplete ? ['sa infeasible'] : [])].join(', ')})`,
      ]
        .map(pad)
        .join(' '),
    );
  }
  log(
    `criterion: SA <= every baseline on every instance: ${lost === 0 ? 'MET' : `NOT MET (${lost} instances)`}`,
  );
  return lost === 0 ? 0 : 1;
}

const EXHAUSTIVE_DEFAULT_STEP = 5;
const EXHAUSTIVE_DEFAULT_ITERS = 200_000;

function exhaustiveCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      step: { type: 'string' },
      seeds: { type: 'string' },
      iters: { type: 'string' },
      'max-evals': { type: 'string' },
      out: { type: 'string' },
      'write-meta': { type: 'boolean' },
    },
  });
  const step = toInt('step', values.step, EXHAUSTIVE_DEFAULT_STEP)!;
  if (step < 1) throw new CliError('--step must be at least 1');
  const seeds = toInt('seeds', values.seeds, 5)!;
  const iters = toInt('iters', values.iters, EXHAUSTIVE_DEFAULT_ITERS)!;
  const maxEvals = toInt('max-evals', values['max-evals'], DEFAULT_MAX_EVALS)!;
  const out = values.out ?? 'results/f6';
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances/tiny']);
  if (files.length === 0) throw new CliError('exhaustive: no instance files found');
  const heuristics: readonly Method[] = seeds > 0 ? ['b-inst', 'hc', 'sa'] : [];
  log(
    [
      'instance',
      'segs',
      'LB',
      'EXH',
      'ties',
      'evals',
      'ms',
      'proven',
      ...heuristics.map((m) => m.toUpperCase()),
    ]
      .map(pad)
      .join(' ') +
      `   (grid step ${step} mm; B-INST is on-site, the rest precut; mean B over ${seeds} seeds, ${iters} evaluations)`,
  );
  mkdirSync(join(out, 'exhaustive'), { recursive: true });
  for (const file of files) {
    const project = loadInstance(file);
    const y0 = resolveY0(project);
    const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
    const t0 = performance.now();
    const r = runExhaustive(ctx, { step, maxEvals });
    const ms = performance.now() - t0;
    const id = instanceId(file);
    const record = makeRecord({
      id,
      method: 'exhaustive',
      seed: 0,
      iters: null,
      timeMs: null,
      project,
      ctx,
      y0,
      result: {
        method: 'exhaustive',
        phi: r.phi,
        mode: r.mode,
        evaluation: r.evaluation,
        evals: r.evals,
        provenOptimal: r.provenOptimal,
        trace: [],
      },
      ms,
    });
    writeFileSync(join(out, 'exhaustive', `${id}-step${step}.json`), JSON.stringify(record));
    const cells = heuristics.map((m) => {
      const s = measureMethod(project, m, seeds, iters);
      return s.meanB === undefined ? '-' : `${fixed(s.meanB, 2)}${s.feasibleShare < 1 ? '*' : ''}`;
    });
    const meta = values['write-meta']
      ? writeMeta(file, r.evaluation.B, r.provenOptimal)
      : undefined;
    log(
      [
        id,
        String(ctx.layout.segments.length),
        String(r.lb),
        r.evaluation.feasible ? String(r.evaluation.B) : `${r.evaluation.B}!`,
        String(r.ties),
        String(r.evals),
        fixed(ms, 0),
        r.provenOptimal ? 'yes' : 'no',
        ...cells,
      ]
        .map(pad)
        .join(' ') + (meta ? `   -> ${meta}` : ''),
    );
  }
  return 0;
}

const BESTKNOWN_DEFAULT_SEEDS = 10;
const BESTKNOWN_DEFAULT_ITERS = 2_000_000;

function bestknownCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      seeds: { type: 'string' },
      iters: { type: 'string' },
      'write-meta': { type: 'boolean' },
      force: { type: 'boolean' },
    },
  });
  const seeds = toInt('seeds', values.seeds, BESTKNOWN_DEFAULT_SEEDS)!;
  const iters = toInt('iters', values.iters, BESTKNOWN_DEFAULT_ITERS)!;
  if (seeds < 1) throw new CliError('--seeds must be at least 1');
  const files = collectInstances(positionals.length > 0 ? positionals : ['instances']);
  if (files.length === 0) throw new CliError('bestknown: no instance files found');
  log(
    ['instance', 'LB', 'known', 'SA best', 'SA mean', 'ms'].map(pad).join(' ') +
      `   (SA, ${seeds} seeds x ${iters} evaluations; instances with knownOptimum are skipped unless --force)`,
  );
  for (const file of files) {
    const project = loadInstance(file);
    const id = instanceId(file);
    if (project.meta?.knownOptimum !== undefined && !values.force) {
      log([id, '-', `opt ${project.meta.knownOptimum}`, 'skipped'].map(pad).join(' '));
      continue;
    }
    const lb = lowerBounds(runMethod(project, 'b-inst').ctx).lb;
    const t0 = performance.now();
    const s = measureMethod(project, 'sa', seeds, iters);
    const ms = performance.now() - t0;
    if (s.best === undefined) {
      log([id, String(lb), '-', 'no feasible run'].map(pad).join(' '));
      continue;
    }
    const meta = values['write-meta'] ? writeMeta(file, s.best, s.best === lb) : undefined;
    log(
      [
        id,
        String(lb),
        project.meta?.bestKnown === undefined ? '-' : String(project.meta.bestKnown),
        String(s.best),
        fixed(s.meanB!, 2),
        fixed(ms, 0),
      ]
        .map(pad)
        .join(' ') + (meta ? `   -> ${meta}` : ''),
    );
  }
  return 0;
}

const DIFFICULTY_METHODS: readonly Method[] = ['b-inst', 'rs', 'hc', 'sa'];

function difficultyCommand(args: string[], log: (line: string) => void): number {
  const { values } = parseArgs({
    args,
    options: {
      n: { type: 'string' },
      m: { type: 'string' },
      seeds: { type: 'string' },
      iters: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const ns = (values.n ?? '6,10,14,18,22,26,30,34,38,42').split(',').map((x) => Number(x.trim()));
  if (ns.some((n) => !Number.isInteger(n) || n < 6)) throw new CliError('--n: list of integers');
  const m = toInt('m', values.m, 3)!;
  const seeds = toInt('seeds', values.seeds, 20)!;
  const iters = toInt('iters', values.iters, 200_000)!;
  if (seeds < 1) throw new CliError('--seeds must be at least 1');
  const base = loadInstance(values.base ?? 'instances/rect/R1.json');
  const out = values.out ?? 'results/f6';
  log(
    ['n', 'm2', 'segs', 'optimum', ...DIFFICULTY_METHODS.map((x) => x.toUpperCase())]
      .map(pad)
      .join(' ') +
      `   (found/runs at the planted optimum; ${seeds} seeds, ${iters} evaluations; generator seed = n)`,
  );
  const csv = ['n,areaM2,segments,optimum,method,runs,found,feasible,share,meanB,meanGap,meanMs'];
  for (const n of ns) {
    // Deterministic: the generator seed is n, so the series is reproducible without files.
    const project = generatePlanted(base, { n, m, seed: n });
    const optimum = project.meta!.knownOptimum!;
    const ctx = buildContext(project, rowConfigFromSettings(project.settings));
    const { zone } = ctx;
    const area = shapesArea(zone.shapes) / 1e6;
    const cells = difficultyCells(project, DIFFICULTY_METHODS, seeds, iters);
    for (const c of cells) {
      csv.push(
        [
          n,
          area.toFixed(2),
          ctx.layout.segments.length,
          optimum,
          c.method,
          c.runs,
          c.found,
          c.feasible,
          (c.found / c.runs).toFixed(3),
          c.meanB === undefined ? '' : c.meanB.toFixed(3),
          c.meanB === undefined ? '' : (c.meanB - optimum).toFixed(3),
          c.meanMs.toFixed(0),
        ].join(','),
      );
    }
    log(
      [
        String(n),
        fixed(area, 1),
        String(ctx.layout.segments.length),
        String(optimum),
        ...cells.map(
          (c) =>
            `${c.found}/${c.runs} (${c.meanB === undefined ? '-' : fixed(c.meanB - optimum, 2)})`,
        ),
      ]
        .map(pad)
        .join(' '),
    );
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'difficulty.csv'), `${csv.join('\n')}\n`);
  log(`-> ${join(out, 'difficulty.csv')} (cell: found/runs (mean B - optimum))`);
  return 0;
}

const TUNE_DEFAULT = [
  'instances/planted/P1.json',
  'instances/planted/P2.json',
  'instances/planted/P3.json',
  'instances/rect/R2.json',
  'instances/lshape/L1.json',
  'instances/slanted/S1.json',
];

function tuneCommand(args: string[], log: (line: string) => void): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { seeds: { type: 'string' }, iters: { type: 'string' } },
  });
  const seeds = toInt('seeds', values.seeds, 5)!;
  const iters = toInt('iters', values.iters, 50_000)!;
  const files = positionals.length > 0 ? collectInstances(positionals) : TUNE_DEFAULT;
  const projects = files.map((f) => ({ id: instanceId(f), project: loadInstance(f) }));
  log(
    ['configuration', ...projects.map((p) => p.id)].map((c) => c.padEnd(22)).join(' ') +
      `   (mean B [runs that hit the known optimum], ${seeds} seeds, ${iters} evaluations)`,
  );
  for (const config of TUNING_CONFIGS) {
    const cells = projects.map(({ project }) => {
      const cell = tuneOne(project, config, seeds, iters);
      return project.meta?.knownOptimum === undefined
        ? fixed(cell.meanB, 2)
        : `${fixed(cell.meanB, 2)} [${cell.found}/${cell.runs}]`;
    });
    log([config.name, ...cells].map((c) => c.padEnd(22)).join(' '));
  }
  return 0;
}

/** Runs a command line (without `node script`); returns the exit code. */
export function main(argv: string[], log: (line: string) => void = console.log): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'run':
        return runCommand(rest, log);
      case 'validate':
        return validateCommand(rest, log);
      case 'lb':
        return lbCommand(rest, log);
      case 'generate':
        return generateCommand(rest, log);
      case 'perf':
        return perfCommand(rest, log);
      case 'planted':
        return plantedCommand(rest, log);
      case 'outer':
        return outerCommand(rest, log);
      case 'compare':
        return compareCommand(rest, log);
      case 'tune':
        return tuneCommand(rest, log);
      case 'exhaustive':
        return exhaustiveCommand(rest, log);
      case 'difficulty':
        return difficultyCommand(rest, log);
      case 'bestknown':
        return bestknownCommand(rest, log);
      case 'baselines':
        return baselinesCommand(rest, log);
      default:
        log(USAGE);
        return command === undefined || command === 'help' ? 0 : 2;
    }
  } catch (e) {
    // Usage, I/O, parse and model errors: exit 2, so that 1 stays "the plan has violations".
    log(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

/** Like `main`, plus the asynchronous commands (`all`). */
export async function mainAsync(
  argv: string[],
  log: (line: string) => void = console.log,
): Promise<number> {
  if (argv[0] !== 'all') return main(argv, log);
  try {
    return await allCommand(argv.slice(1), log);
  } catch (e) {
    log(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}
