/**
 * Sequential baselines B-INST and B-NEXT (ALGORITHM §9). A simulation with offcut stacks walks the
 * segments in laying order and picks each phase; it only chooses φ. The board count of the result
 * is always measured by the real decoder, so a simulation error can never yield a wrong B.
 *
 *   stackS — offcuts with the right (factory) end: a start piece of at most that length
 *   stackE — offcuts with the left (factory) end: an end piece of at most that length
 */

import { seamPenalty } from '../../evaluate/seams';
import { contains, project as projectPhase } from '../../layout/feasible';
import { seamsOf } from '../../layout/pieces';
import type { PlanContext } from '../../plan/context';
import { EPS, mod } from '../../num/index';

export type SequentialPolicy = 'inst' | 'next';

/** Offcuts shorter than this (mm) are not worth keeping. */
const MIN_OFFCUT = 1;

export function sequentialPhases(ctx: PlanContext, policy: SequentialPolicy): number[] {
  const { L, layout, graph, profiles, feasible } = ctx;
  const k = ctx.project.rules.kerf;
  const D = ctx.project.rules.minStagger;

  const phaseById = new Map<string, number>();
  const seamsById = new Map<string, number[]>();
  const linksBelow = new Map<string, typeof graph.links>();
  for (const link of graph.links) {
    const list = linksBelow.get(link.upper) ?? [];
    list.push(link);
    linksBelow.set(link.upper, list);
  }

  /** Feasible for L_min and staggered by D against every row below that is already decided. */
  const acceptable = (id: string, phi: number): boolean => {
    if (!contains(feasible[id]!.feasible, phi)) return false;
    const p = profiles[id]!;
    const mine = seamsOf(p.a, p.b, L, phi);
    for (const link of linksBelow.get(id) ?? []) {
      const other = seamsById.get(link.lower);
      if (!other) continue;
      for (const [lo, hi] of link.intervals) {
        if (seamPenalty(mine, other, lo, hi, D) > EPS) return false;
      }
    }
    return true;
  };

  let stackS: number[] = [];
  const stackE: number[] = [];
  const pushS = (len: number): void => {
    if (len < MIN_OFFCUT) return;
    if (policy === 'next') stackS = [len];
    else stackS.push(len);
  };
  const pushE = (len: number): void => {
    if (policy === 'inst' && len >= MIN_OFFCUT) stackE.push(len);
  };

  const result: number[] = [];
  for (const seg of layout.segments) {
    const id = seg.id;
    const p = profiles[id]!;
    const F = feasible[id]!.feasible;

    // Start piece: the longest offcut whose length gives an acceptable phase, else a new board.
    let phi: number | undefined;
    let usedOffcut = -1;
    const order = stackS.map((len, i) => ({ len, i })).sort((x, y) => y.len - x.len || x.i - y.i);
    for (const { len, i } of order) {
      const cand = mod(p.a + len, L);
      if (acceptable(id, cand)) {
        phi = cand;
        usedOffcut = i;
        break;
      }
    }
    if (phi !== undefined) {
      stackS.splice(usedOffcut, 1);
    } else {
      // New board: whole board, then thirds, then a 1 mm scan; its left part goes to stackE.
      let start: number | undefined;
      for (const s of [L, (2 * L) / 3, L / 3]) {
        if (acceptable(id, mod(p.a + s, L))) {
          start = s;
          break;
        }
      }
      for (let s = Math.floor(L); start === undefined && s >= 1; s--) {
        if (acceptable(id, mod(p.a + s, L))) start = s;
      }
      if (start === undefined) {
        // Nothing meets both rules: keep L_min (the objective then reports the stagger).
        phi = projectPhase(F, p.a);
        const sl = mod(phi - p.a, L);
        pushE(L - (sl > EPS ? sl : L) - k);
      } else {
        phi = mod(p.a + start, L);
        pushE(L - start - k);
      }
    }

    phaseById.set(id, phi);
    const seams = seamsOf(p.a, p.b, L, phi);
    seamsById.set(id, seams);
    result.push(phi);

    // End piece: best fit from stackE (smallest offcut that is long enough), else a new board.
    if (seams.length > 0) {
      const e = p.b - seams[seams.length - 1]!;
      let best = -1;
      for (let i = 0; i < stackE.length; i++) {
        const len = stackE[i]!;
        if (len + EPS >= e && (best < 0 || len < stackE[best]!)) best = i;
      }
      if (best >= 0) stackE.splice(best, 1);
      else pushS(L - e - k);
    }
  }
  return result;
}
