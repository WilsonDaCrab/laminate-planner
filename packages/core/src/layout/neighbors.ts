/**
 * Open edges and the neighbour graph (ALGORITHM §2.4). Where the top edge of a segment s (band j)
 * and the bottom edge of a segment t (band j + 1) coincide over an x interval I_st, the pieces
 * there are joined to the neighbouring row. The rest of the boundary is closed (wall, obstacle).
 */

import type { Shape } from '../geometry/clip';
import { EPS } from '../num/index';
import { intersectIntervals, normalizeIntervals, type Interval } from '../num/intervals';
import type { Layout, Segment } from './bands';

export interface NeighborLink {
  lower: string;
  upper: string;
  /** I_st: x intervals where the top of `lower` meets the bottom of `upper`. */
  intervals: Interval[];
}

export interface SecondOrderPair {
  lower: string;
  upper: string;
  /** Segments in the band between them that connect both (shared for the H pattern penalty). */
  via: string[];
}

export interface NeighborGraph {
  links: NeighborLink[];
  /** O_s^low: open part of the bottom edge of each segment. */
  openLow: Record<string, Interval[]>;
  /** O_s^high: open part of the top edge of each segment. */
  openHigh: Record<string, Interval[]>;
  /** Segments of the next band that touch s (its upper neighbours). */
  up: Record<string, string[]>;
  down: Record<string, string[]>;
  /** Pairs two bands apart connected through a common neighbour (rows whose seams interact). */
  secondOrder: SecondOrderPair[];
}

/**
 * x intervals of the horizontal boundary edges of a shape lying on y. With interior on the left of
 * every directed edge (outer CCW, holes CW), a bottom edge runs towards +x and a top edge towards −x.
 */
export function horizontalEdges(shape: Shape, y: number, side: 'bottom' | 'top'): Interval[] {
  const out: Interval[] = [];
  for (const ring of [shape.outer, ...shape.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (Math.abs(a.y - y) > EPS || Math.abs(b.y - y) > EPS) continue;
      if (side === 'bottom' && b.x - a.x > EPS) out.push([a.x, b.x]);
      if (side === 'top' && a.x - b.x > EPS) out.push([b.x, a.x]);
    }
  }
  return normalizeIntervals(out);
}

const topEdges = (s: Segment): Interval[] => horizontalEdges(s.shape, s.bandHi, 'top');
const bottomEdges = (s: Segment): Interval[] => horizontalEdges(s.shape, s.bandLo, 'bottom');

/** Neighbour graph of a layout. */
export function buildNeighbors(layout: Layout): NeighborGraph {
  const graph: NeighborGraph = {
    links: [],
    openLow: {},
    openHigh: {},
    up: {},
    down: {},
    secondOrder: [],
  };
  for (const s of layout.segments) {
    graph.openLow[s.id] = [];
    graph.openHigh[s.id] = [];
    graph.up[s.id] = [];
    graph.down[s.id] = [];
  }

  const tops = new Map(layout.segments.map((s) => [s.id, topEdges(s)]));
  const bottoms = new Map(layout.segments.map((s) => [s.id, bottomEdges(s)]));

  for (const s of layout.segments) {
    for (const t of layout.segments) {
      if (t.band !== s.band + 1) continue;
      const overlap = intersectIntervals(tops.get(s.id)!, bottoms.get(t.id)!, {
        minLength: EPS,
      });
      if (overlap.length === 0) continue;
      graph.links.push({ lower: s.id, upper: t.id, intervals: overlap });
      graph.up[s.id]!.push(t.id);
      graph.down[t.id]!.push(s.id);
      graph.openHigh[s.id] = normalizeIntervals([...graph.openHigh[s.id]!, ...overlap]);
      graph.openLow[t.id] = normalizeIntervals([...graph.openLow[t.id]!, ...overlap]);
    }
  }

  for (const s of layout.segments) {
    const pairs = new Map<string, string[]>();
    for (const t of graph.up[s.id]!) {
      for (const u of graph.up[t]!) pairs.set(u, [...(pairs.get(u) ?? []), t]);
    }
    for (const [u, via] of pairs) graph.secondOrder.push({ lower: s.id, upper: u, via });
  }
  return graph;
}
