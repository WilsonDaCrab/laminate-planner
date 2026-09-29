import type { QuickEval } from '../evaluate/evaluator';
import type { TracePoint } from './types';

const MAX_TRACE = 200;

/** `a` beats `b`: feasible before infeasible, then fewer boards, then lower objective. */
export function better(a: QuickEval, b: QuickEval): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (a.B !== b.B) return a.B < b.B;
  return a.f < b.f;
}

/** Best solution of a run (ALGORITHM §5: the best feasible one, else the best by f) and its trace. */
export class Incumbent {
  phi: number[] | undefined;
  evaluation: QuickEval | undefined;
  private readonly points: TracePoint[] = [];

  /** Offers a candidate (copied when accepted); returns whether it became the best. */
  offer(phi: readonly number[], evaluation: QuickEval, evalNo: number): boolean {
    if (this.evaluation && !better(evaluation, this.evaluation)) return false;
    this.phi = [...phi];
    this.evaluation = evaluation;
    this.points.push({ eval: evalNo, B: evaluation.B });
    return true;
  }

  /** Improvement history thinned to at most MAX_TRACE points (first and last kept). */
  trace(): TracePoint[] {
    const p = this.points;
    if (p.length <= MAX_TRACE) return [...p];
    const step = (p.length - 1) / (MAX_TRACE - 1);
    return Array.from({ length: MAX_TRACE }, (_, i) => p[Math.round(i * step)]!);
  }
}

/** Evaluation and time budget of a run; the clock is read every 256 evaluations. */
export class Budget {
  private readonly t0: number;
  private expired = false;

  constructor(
    private readonly limits: { iters?: number; timeMs?: number; clock?: () => number },
    private readonly defaultIters: number,
  ) {
    if (limits.timeMs !== undefined && !limits.clock) {
      throw new RangeError('Budget: timeMs needs a clock (the core never reads system time)');
    }
    this.t0 = limits.clock ? limits.clock() : 0;
  }

  /** May another evaluation start, given that `evals` are already spent? */
  allows(evals: number): boolean {
    const { iters, timeMs, clock } = this.limits;
    if (evals >= (iters ?? (timeMs !== undefined ? Infinity : this.defaultIters))) return false;
    if (timeMs !== undefined && clock && evals % 256 === 0 && !this.expired) {
      this.expired = clock() - this.t0 >= timeMs;
    }
    return !this.expired;
  }
}
