/**
 * From seam phase to pieces (ALGORITHM §3). A segment with phase φ has seams x = φ + m·L; the
 * pieces between them are described by `PieceDescriptor`s that the decoder pairs and cuts.
 */

import { intersect, rectShape, type Shape } from '../geometry/clip';
import { EPS, mod, type Mm } from '../num/index';
import { overlapMeasure } from '../num/intervals';
import type { Segment } from './bands';
import { sectionsIn, type XProfile } from './xprofile';

/** Which short (x) ends of a piece are cut: `start` = right end only, `end` = left end only. */
export type ShortNeeds = 'start' | 'end' | 'full' | 'free';
/** Which long edges of a piece connect to the neighbouring rows. */
export type LongNeeds = 'both' | 'low' | 'high' | 'none';

export interface PieceDescriptor {
  /** Position in the row, 0-based, left to right. */
  index: number;
  x0: Mm;
  x1: Mm;
  /** x extent ℓ (used for pairing). */
  extent: Mm;
  short: ShortNeeds;
  long: LongNeeds;
  /** Width the piece must have (ALGORITHM §3.2). */
  width: Mm;
  /** Length of the piece boundary on y = bandLo / y = bandHi (differs for slanted cuts). */
  lengthLow: Mm;
  lengthHigh: Mm;
  /** Measure of the open bottom/top edge inside the piece. */
  openLow: Mm;
  openHigh: Mm;
}

/**
 * Interior seams of the segment [a, b] for phase φ, ascending. A seam that coincides with a
 * wall is not a seam (the piece there is a whole board without a cut).
 */
export function seamsOf(a: Mm, b: Mm, L: Mm, phi: number): Mm[] {
  const r = mod(phi - a, L);
  const first = a + (r > EPS ? r : L);
  const seams: Mm[] = [];
  for (let x = first; x < b - EPS; x += L) seams.push(x);
  return seams;
}

function shortOf(index: number, seamCount: number): ShortNeeds {
  if (seamCount === 0) return 'free';
  if (index === 0) return 'start';
  if (index === seamCount) return 'end';
  return 'full';
}

function longOf(openLow: number, openHigh: number): LongNeeds {
  if (openLow > EPS && openHigh > EPS) return 'both';
  if (openLow > EPS) return 'low';
  if (openHigh > EPS) return 'high';
  return 'none';
}

const boundaries = (a: Mm, b: Mm, seams: readonly Mm[]): Mm[] => [a, ...seams, b];

/**
 * Fast path for rectangular segments (§3.3): every piece has the segment's constant cross-section,
 * so the descriptors follow from the segment alone. Requires `profile.isRect`.
 */
export function describePiecesFast(profile: XProfile, L: Mm, phi: number): PieceDescriptor[] {
  if (!profile.isRect)
    throw new RangeError('describePiecesFast needs a fast-path (isRect) profile');
  const { a, b, yLo, yHi, bandLo, bandHi } = profile;
  const seams = seamsOf(a, b, L, phi);
  const xs = boundaries(a, b, seams);
  const lowOpen = profile.openLow.length > 0;
  const highOpen = profile.openHigh.length > 0;
  const long = longOf(lowOpen ? 1 : 0, highOpen ? 1 : 0);
  const width =
    long === 'both'
      ? bandHi - bandLo
      : long === 'low'
        ? yHi - bandLo
        : long === 'high'
          ? bandHi - yLo
          : yHi - yLo;
  const onLow = Math.abs(yLo - bandLo) <= EPS;
  const onHigh = Math.abs(yHi - bandHi) <= EPS;

  return xs.slice(0, -1).map((x0, index) => {
    const x1 = xs[index + 1]!;
    const extent = x1 - x0;
    return {
      index,
      x0,
      x1,
      extent,
      short: shortOf(index, seams.length),
      long,
      width,
      lengthLow: onLow ? extent : 0,
      lengthHigh: onHigh ? extent : 0,
      openLow: lowOpen ? extent : 0,
      openHigh: highOpen ? extent : 0,
    };
  });
}

/** Length of the boundary of the sections lying on the line y = `line`. */
function lengthOnLine(
  sections: ReturnType<typeof sectionsIn>,
  line: number,
  side: 'low' | 'high',
): number {
  let total = 0;
  for (const s of sections) {
    for (const p of s.spans) {
      const [ya, yb] = side === 'low' ? [p.loA, p.loB] : [p.hiA, p.hiB];
      if (Math.abs(ya - line) <= EPS && Math.abs(yb - line) <= EPS) total += s.x1 - s.x0;
    }
  }
  return total;
}

/** General path: any segment, including slanted and complex ones, from the x-profile sections. */
export function describePiecesGeneral(profile: XProfile, L: Mm, phi: number): PieceDescriptor[] {
  const { a, b, bandLo, bandHi } = profile;
  const seams = seamsOf(a, b, L, phi);
  const xs = boundaries(a, b, seams);

  return xs.slice(0, -1).map((x0, index) => {
    const x1 = xs[index + 1]!;
    const sections = sectionsIn(profile, x0, x1);
    const openLow = overlapMeasure(profile.openLow, x0, x1);
    const openHigh = overlapMeasure(profile.openHigh, x0, x1);
    const long = longOf(openLow, openHigh);

    let minLo = Infinity;
    let maxHi = -Infinity;
    for (const s of sections) {
      for (const p of s.spans) {
        minLo = Math.min(minLo, p.loA, p.loB);
        maxHi = Math.max(maxHi, p.hiA, p.hiB);
      }
    }
    const width =
      long === 'both'
        ? bandHi - bandLo
        : long === 'low'
          ? maxHi - bandLo
          : long === 'high'
            ? bandHi - minLo
            : maxHi - minLo;

    return {
      index,
      x0,
      x1,
      extent: x1 - x0,
      short: shortOf(index, seams.length),
      long,
      width,
      lengthLow: lengthOnLine(sections, bandLo, 'low'),
      lengthHigh: lengthOnLine(sections, bandHi, 'high'),
      openLow,
      openHigh,
    };
  });
}

/** Pieces of a segment for phase φ: fast path for rectangles, general path otherwise. */
export function describePieces(profile: XProfile, L: Mm, phi: number): PieceDescriptor[] {
  return profile.isRect
    ? describePiecesFast(profile, L, phi)
    : describePiecesGeneral(profile, L, phi);
}

/**
 * Total shortfall (mm) against the L_min rule. A start/end piece must, along every open long edge,
 * have an open part of at least L_min; a piece with no open edge must itself be ≥ L_min long
 * (ADR-012). Whole boards (`full`) and unsplit segments (`free`) are unconstrained.
 */
export function lengthDeficit(pieces: readonly PieceDescriptor[], minLength: Mm): number {
  let deficit = 0;
  for (const p of pieces) {
    if (p.short !== 'start' && p.short !== 'end') continue;
    const lows = p.openLow > EPS;
    const highs = p.openHigh > EPS;
    // EPS is a threshold (float noise), not part of the amount.
    const short = (have: number): number => (minLength - have > EPS ? minLength - have : 0);
    if (lows) deficit += short(p.openLow);
    if (highs) deficit += short(p.openHigh);
    if (!lows && !highs) deficit += short(p.extent);
  }
  return deficit;
}

export const meetsMinLength = (pieces: readonly PieceDescriptor[], minLength: Mm): boolean =>
  lengthDeficit(pieces, minLength) <= 0;

/**
 * Exact shape of every piece (Clipper strips of the segment shape). A piece of a complex segment
 * can consist of several components. Slower than the descriptors; used for outlines and as the
 * reference in tests.
 */
export function pieceShapes(segment: Segment, seams: readonly Mm[]): Shape[][] {
  const xs = boundaries(segment.a, segment.b, seams);
  return xs.slice(0, -1).map((x0, i) => {
    const strip = rectShape(x0, segment.yLo - 1, xs[i + 1]!, segment.yHi + 1);
    return intersect([segment.shape], [strip]);
  });
}
