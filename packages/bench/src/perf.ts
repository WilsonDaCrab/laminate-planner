/**
 * `pnpm bench perf`: evaluations per second of the reference and the typed-array evaluator
 * (ALGORITHM §14, F5 criterion: ≥ 100 000/s at 60 segments).
 *
 * Three workloads per room:
 *  - reference: `evaluate` on random phase vectors;
 *  - fast (full): the fast evaluator on random vectors (every segment changes: no reuse);
 *  - fast (SA): real moves M1–M5 from `MoveSet` applied to one running vector, 70 % of them undone
 *    as a rejected SA move would be. The evaluator alone is timed on a replay of the recorded moves
 *    (the F5 criterion); `saIteration` also includes generating the moves.
 */

import {
  buildContext,
  createFastEvaluator,
  createProject,
  createReferenceEvaluator,
  createRng,
  goodY0,
  MoveSet,
  PhaseSpace,
  rowConfigFromSettings,
  type Project,
} from '@lp/core';

export interface PerfRow {
  name: string;
  segments: number;
  reference: number;
  fastFull: number;
  /** Evaluator alone under the SA change pattern (the F5 criterion). */
  fastSa: number;
  /** A whole SA iteration: move generation, evaluation and acceptance bookkeeping. */
  saIteration: number;
}

export const PERF_TARGET = 100_000;
export const PERF_SEGMENTS = 60;
/** Share of accepted moves in a typical SA run. */
const ACCEPT_RATE = 0.3;

/** A rectangular room of `rows` rows of the product of `base` (≈ rows · W tall). */
export function tallRoom(base: Project, rows: number): Project {
  const W = base.product.boardWidth;
  const height = rows * W - Math.round(W / 2) + 2 * base.rules.expansionGap;
  const room = base.rooms[0]!;
  const outline = [
    { x: 0, y: 0 },
    { x: 3600, y: 0 },
    { x: 3600, y: height },
    { x: 0, y: height },
  ];
  return createProject({
    name: `tall-${rows}`,
    product: base.product,
    rules: base.rules,
    rooms: [
      {
        ...room,
        id: 'r1',
        code: 'T',
        outline,
        edges: outline.map(() => ({ kind: 'wall' as const })),
      },
    ],
    settings: { ...base.settings, angleDeg: 0, stackSide: 'left', rowOffset: 0 },
  });
}

const perSecond = (count: number, ms: number): number => count / (ms / 1000);

/** Repeats per workload; the best rate is reported (timer and machine noise only slow a run down). */
const REPEATS = 3;

export function measure(
  name: string,
  project: Project,
  evals: number,
  clock: () => number,
): PerfRow {
  const base = rowConfigFromSettings(project.settings);
  const y0 = project.settings.rowOffset === 'auto' ? (goodY0(project) ?? base.y0) : base.y0;
  const ctx = buildContext(project, { ...base, y0 });
  const space = new PhaseSpace(ctx);
  const moves = new MoveSet(ctx, space);
  const fast = createFastEvaluator(ctx);
  if (!fast) throw new Error(`${name}: outside the scope of the fast evaluator`);
  const reference = createReferenceEvaluator(ctx, { mode: 'precut' });
  const rng = createRng(1);
  const n = space.size;
  const randomPhi = (): number[] => Array.from({ length: n }, (_, i) => space.sample(i, rng));

  const vectors = Array.from({ length: 200 }, randomPhi);
  const timed = (fn: () => void, count: number, repeats = REPEATS): number => {
    let best = 0;
    for (let r = 0; r < repeats; r++) {
      const t0 = clock();
      fn();
      best = Math.max(best, perSecond(count, clock() - t0));
    }
    return best;
  };

  const refCount = 150;
  const refRate = timed(() => {
    for (let k = 0; k < refCount; k++) reference.evaluate(vectors[k % vectors.length]!);
  }, refCount);

  for (const v of vectors) fast.evaluate(v); // warm-up
  const fullCount = Math.max(evals, 2000);
  const fullRate = timed(() => {
    for (let k = 0; k < fullCount; k++) fast.evaluate(vectors[k % vectors.length]!);
  }, fullCount);

  // SA-like walk. Pass 1 generates the moves as `runSa` would (in place, undone when "rejected",
  // unpaired pieces read after accepted moves) and is timed as a whole: a full SA iteration.
  // Pass 2 replays the recorded changes and times only the evaluator (apply, evaluate, snapshot).
  const phi0 = randomPhi();
  const phi = [...phi0];
  fast.evaluate(phi);
  let unpaired = fast.unpaired();
  const counts: number[] = [];
  const chIdx: number[] = [];
  const chVal: number[] = [];
  const accepted: boolean[] = [];
  const iterationRate = timed(
    () => {
      for (let k = 0; k < evals; k++) {
        const p = moves.propose(phi, rng, 0.5, unpaired);
        const old = p.changes.map((c) => phi[c.index]!);
        counts.push(p.changes.length);
        for (const c of p.changes) {
          chIdx.push(c.index);
          chVal.push(c.value);
          phi[c.index] = c.value;
        }
        fast.evaluate(phi);
        const accept = rng.next() < ACCEPT_RATE;
        accepted.push(accept);
        if (accept) unpaired = fast.unpaired();
        else p.changes.forEach((c, i) => (phi[c.index] = old[i]!));
      }
    },
    evals,
    1,
  ); // stateful and recorded: a single pass

  const saved = new Float64Array(16);
  const evaluatorRate = timed(() => {
    const replay = [...phi0];
    fast.evaluate(replay);
    let at = 0;
    for (let k = 0; k < evals; k++) {
      const c = counts[k]!;
      for (let j = 0; j < c; j++) {
        saved[j] = replay[chIdx[at + j]!]!;
        replay[chIdx[at + j]!] = chVal[at + j]!;
      }
      fast.evaluate(replay);
      if (accepted[k]) fast.unpaired();
      else for (let j = 0; j < c; j++) replay[chIdx[at + j]!] = saved[j]!;
      at += c;
    }
  }, evals);
  return {
    name,
    segments: n,
    reference: refRate,
    fastFull: fullRate,
    fastSa: evaluatorRate,
    saIteration: iterationRate,
  };
}
