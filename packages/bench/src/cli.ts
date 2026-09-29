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
  parseProject,
  renderPlanSvg,
  rowConfigFromSettings,
  saveProject,
  runMethod,
  validatePlan,
  type Method,
  type Project,
} from '@lp/core';
import { generatePlanted, PLANTED_PRESETS } from './generate/planted';
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
  generate planted (--preset P1..P4 | --n N --m M --seed S) [--base instance.json] [--out file]
                                  planted staircase room with known optimum
  perf [path...] [--evals N] [--rows N]
                                  evaluations per second (reference, typed-array, SA-like) and the
                                  F5 criterion on a rectangular room of --rows (default 60) rows
  planted [path...] [--method sa|hc|rs] [--seeds N] [--iters N]
                                  share of seeds that reach the known optimum of planted instances
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

  const plan = buildPlan(ctx, result.phi, { mode: result.mode });
  const bounds = lowerBounds(ctx);
  const ev = result.evaluation;
  const id = instanceId(file);
  const record: RunResult = {
    version: RESULT_VERSION,
    instance: id,
    method,
    seed,
    iters: budget.iters ?? null,
    timeMs: timeMs ?? null,
    y0: usedY0,
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
      ms,
      provenOptimal: result.provenOptimal,
      trace: result.trace,
    },
    search: isSaResult(result) ? { stats: result.stats, curve: result.curve } : undefined,
    project,
    plan,
  };

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
