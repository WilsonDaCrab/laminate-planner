/**
 * x-profile of a segment (ALGORITHM §2.5): the vertical cross-sections of the segment as piecewise
 * linear functions of x. Between two consecutive vertex abscissas every cross-section is a set of
 * y intervals whose ends are straight lines, so widths and boundary lengths of any x range follow
 * without geometry operations.
 */

import { EPS } from '../num/index';
import type { Interval } from '../num/intervals';
import type { Segment } from './bands';
import type { NeighborGraph } from './neighbors';

/** One y interval of a cross-section: lower and upper boundary at both ends of the section. */
export interface Span {
  loA: number;
  loB: number;
  hiA: number;
  hiB: number;
}

/** Cross-sections between consecutive breakpoints x0 < x1 (linear in x inside). */
export interface Section {
  x0: number;
  x1: number;
  spans: Span[];
}

export interface XProfile {
  segmentId: string;
  a: number;
  b: number;
  bandLo: number;
  bandHi: number;
  /** Vertical extent of the segment shape. */
  yLo: number;
  yHi: number;
  /** Sorted distinct x of all vertices. */
  breaks: number[];
  sections: Section[];
  /** O_s^low / O_s^high: open parts of the boundary at y = bandLo / bandHi. */
  openLow: Interval[];
  openHigh: Interval[];
  /** The shape is an axis-aligned rectangle. */
  isRectShape: boolean;
  /**
   * Fast-path segment: an axis-aligned rectangle whose open edges are open along their whole
   * length or not at all (ALGORITHM §2.5).
   */
  isRect: boolean;
  /** Some vertical cross-section has more than one interval (hole, C shape). */
  complex: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function distinctSorted(values: number[]): number[] {
  const sorted = [...values].sort((p, q) => p - q);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1]! > EPS) out.push(v);
  }
  return out;
}

function buildSections(rings: { x: number; y: number }[][], breaks: number[]): Section[] {
  const sections: Section[] = [];
  for (let k = 0; k + 1 < breaks.length; k++) {
    const x0 = breaks[k]!;
    const x1 = breaks[k + 1]!;
    const xm = (x0 + x1) / 2;
    const crossing: { yA: number; yB: number; yM: number }[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        if (Math.abs(q.x - p.x) <= EPS) continue; // vertical edge
        const [l, r] = p.x < q.x ? [p, q] : [q, p];
        if (!(l.x < xm && xm < r.x)) continue;
        const at = (x: number): number => lerp(l.y, r.y, (x - l.x) / (r.x - l.x));
        crossing.push({ yA: at(x0), yB: at(x1), yM: at(xm) });
      }
    }
    crossing.sort((p, q) => p.yM - q.yM);
    const spans: Span[] = [];
    // Even–odd pairing: the region lies between crossings 0–1, 2–3, …
    for (let i = 0; i + 1 < crossing.length; i += 2) {
      const lo = crossing[i]!;
      const hi = crossing[i + 1]!;
      spans.push({ loA: lo.yA, loB: lo.yB, hiA: hi.yA, hiB: hi.yB });
    }
    if (spans.length > 0) sections.push({ x0, x1, spans });
  }
  return sections;
}

const covers = (open: readonly Interval[], a: number, b: number): boolean =>
  open.length === 1 && open[0]![0] <= a + EPS && open[0]![1] >= b - EPS;

/** Profile of one segment, given its open edges (from the neighbour graph). */
export function buildProfile(
  segment: Segment,
  open: { low: Interval[]; high: Interval[] },
): XProfile {
  const rings = [segment.shape.outer, ...segment.shape.holes];
  const breaks = distinctSorted(rings.flatMap((r) => r.map((p) => p.x)));
  const sections = buildSections(rings, breaks);
  const complex = sections.some((s) => s.spans.length > 1);

  const { a, b, yLo, yHi } = segment;
  const flat = (v: number, ref: number): boolean => Math.abs(v - ref) <= EPS;
  const isRectShape =
    segment.shape.holes.length === 0 &&
    sections.length > 0 &&
    sections.every(
      (s) =>
        s.spans.length === 1 &&
        flat(s.spans[0]!.loA, yLo) &&
        flat(s.spans[0]!.loB, yLo) &&
        flat(s.spans[0]!.hiA, yHi) &&
        flat(s.spans[0]!.hiB, yHi),
    );
  const openLowFull = open.low.length === 0 || covers(open.low, a, b);
  const openHighFull = open.high.length === 0 || covers(open.high, a, b);

  return {
    segmentId: segment.id,
    a,
    b,
    bandLo: segment.bandLo,
    bandHi: segment.bandHi,
    yLo,
    yHi,
    breaks,
    sections,
    openLow: open.low,
    openHigh: open.high,
    isRectShape,
    isRect: isRectShape && openLowFull && openHighFull,
    complex,
  };
}

/** Profiles of all segments of a layout. */
export function buildProfiles(
  segments: readonly Segment[],
  graph: NeighborGraph,
): Record<string, XProfile> {
  const out: Record<string, XProfile> = {};
  for (const s of segments) {
    out[s.id] = buildProfile(s, {
      low: graph.openLow[s.id] ?? [],
      high: graph.openHigh[s.id] ?? [],
    });
  }
  return out;
}

/** Sections restricted to [x0, x1] (ends interpolated); empty if the range misses the segment. */
export function sectionsIn(profile: XProfile, x0: number, x1: number): Section[] {
  const out: Section[] = [];
  for (const s of profile.sections) {
    const lo = Math.max(s.x0, x0);
    const hi = Math.min(s.x1, x1);
    if (hi - lo <= EPS) continue;
    const ta = (lo - s.x0) / (s.x1 - s.x0);
    const tb = (hi - s.x0) / (s.x1 - s.x0);
    out.push({
      x0: lo,
      x1: hi,
      spans: s.spans.map((p) => ({
        loA: lerp(p.loA, p.loB, ta),
        loB: lerp(p.loA, p.loB, tb),
        hiA: lerp(p.hiA, p.hiB, ta),
        hiB: lerp(p.hiA, p.hiB, tb),
      })),
    });
  }
  return out;
}

/** Cross-section at x as y intervals (at a breakpoint, the section to its right is used). */
export function spansAt(profile: XProfile, x: number): Interval[] {
  const s =
    profile.sections.find((sec) => x >= sec.x0 - EPS && x < sec.x1) ??
    profile.sections.find((sec) => Math.abs(x - sec.x1) <= EPS);
  if (!s) return [];
  const t = (x - s.x0) / (s.x1 - s.x0);
  return s.spans.map((p): Interval => [lerp(p.loA, p.loB, t), lerp(p.hiA, p.hiB, t)]);
}

/** ∫ (upper − lower) dx over the profile: the segment area recovered from the sections. */
export function profileArea(profile: XProfile): number {
  return profile.sections.reduce(
    (sum, s) =>
      sum +
      s.spans.reduce((a, p) => a + ((p.hiA - p.loA + (p.hiB - p.loB)) / 2) * (s.x1 - s.x0), 0),
    0,
  );
}
