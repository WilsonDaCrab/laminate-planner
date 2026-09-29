/**
 * Reference rooms for geometry tests (F1). Each carries a hand-computed installable-zone area.
 * All lengths mm. Outlines are counter-clockwise.
 *
 * Rectilinear rooms with a uniform gap g and no collapsing features obey
 *   A′ = A − g·P + 4g²   (convex corners +g², reflex corners −g², convex − reflex = 4)
 * and the same result follows from decomposing the offset polygon into rectangles; both are
 * shown where practical.
 */

import { vec } from '../vec';
import type { ZoneInput } from '../zone';

export interface ReferenceRoom {
  name: string;
  input: ZoneInput;
  /** Hand-computed area of the installable zone (mm²). */
  expectedArea: number;
  /** Allowed absolute error (mm²): 0.5 for straight walls, an ARC_TOL bound for arcs. */
  tolerance: number;
  hasArcs: boolean;
  /**
   * Walls with an irrational direction: offset vertices are snapped to the 0.01 mm Clipper grid,
   * so the area error is bounded by perimeter × 0.005 mm instead of 0.5 mm² (see ADR-011).
   */
  gridBound?: boolean;
  /** Expected number of holes in the single result shape. */
  holes: number;
}

const edges = (n: number, gap: number) => Array.from({ length: n }, () => ({ gap }));

const G = 10;

export const rectangle: ReferenceRoom = {
  name: 'rectangle 4000×3000',
  input: {
    outline: [vec(0, 0), vec(4000, 0), vec(4000, 3000), vec(0, 3000)],
    edges: edges(4, G),
  },
  // (4000 − 2·10)(3000 − 2·10)
  expectedArea: 3980 * 2980,
  tolerance: 0.5,
  hasArcs: false,
  holes: 0,
};

export const lShape: ReferenceRoom = {
  name: 'L shape',
  input: {
    outline: [
      vec(0, 0),
      vec(4000, 0),
      vec(4000, 1500),
      vec(2000, 1500),
      vec(2000, 3000),
      vec(0, 3000),
    ],
    edges: edges(6, G),
  },
  // Offset polygon (10,10) (3990,10) (3990,1490) (1990,1490) (1990,2990) (10,2990):
  // lower block 3980 × 1480 + upper block 1980 × 1500.
  expectedArea: 3980 * 1480 + 1980 * 1500,
  tolerance: 0.5,
  hasArcs: false,
  holes: 0,
};

export const uShape: ReferenceRoom = {
  name: 'U shape',
  input: {
    outline: [
      vec(0, 0),
      vec(6000, 0),
      vec(6000, 4000),
      vec(4000, 4000),
      vec(4000, 1500),
      vec(2000, 1500),
      vec(2000, 4000),
      vec(0, 4000),
    ],
    edges: edges(8, G),
  },
  // A = 24 000 000 − 2000·2500 = 19 000 000, P = 25 000: A − 10·25 000 + 4·100 = 18 750 400.
  // Check by blocks: base 5980 × 1480 + two arms 1980 × 2500 each.
  expectedArea: 5980 * 1480 + 2 * (1980 * 2500),
  tolerance: 0.5,
  hasArcs: false,
  holes: 0,
};

export const trapezoid: ReferenceRoom = {
  name: 'trapezoid 5000/3000 × 3000',
  input: {
    outline: [vec(0, 0), vec(5000, 0), vec(4000, 3000), vec(1000, 3000)],
    edges: edges(4, G),
  },
  // A = 12 000 000; legs √(1000² + 3000²) = 3162.2777, P = 14 324.5553.
  // Σ cot(α/2): base angles (tan α = 3) 1.38742589, top angles 0.72075922 → Σ = 4.21637022.
  // A′ = A − g·P + g²·Σ = 12 000 000 − 143 245.5532 + 421.6370.
  expectedArea: 11_857_176.0838,
  // Perimeter 14 324.56 mm × 0.005 mm (half a grid step) = 71.6 mm²; observed deviation ≈ 5.5 mm².
  tolerance: 14_324.5553 * 0.005,
  hasArcs: false,
  gridBound: true,
  holes: 0,
};

export const parallelogram: ReferenceRoom = {
  name: 'parallelogram',
  input: {
    outline: [vec(0, 0), vec(4000, 0), vec(5500, 2000), vec(1500, 2000)],
    edges: edges(4, G),
  },
  // A = 4000·2000 = 8 000 000; sides 4000, 2500 → P = 13 000; cos α = 0.6, sin α = 0.8,
  // cot(α/2) = 2, cot((π − α)/2) = 0.5 → Σ = 5. A′ = 8 000 000 − 130 000 + 500.
  expectedArea: 7_870_500,
  tolerance: 0.5,
  hasArcs: false,
  holes: 0,
};

export const bayWindow: ReferenceRoom = {
  name: 'rectangular bay window',
  input: {
    outline: [
      vec(0, 0),
      vec(4000, 0),
      vec(4000, 750),
      vec(4600, 750),
      vec(4600, 2250),
      vec(4000, 2250),
      vec(4000, 3000),
      vec(0, 3000),
    ],
    edges: edges(8, G),
  },
  // A = 12 000 000 + 600·1500, P = 15 200: A − 152 000 + 400.
  expectedArea: 12_900_000 - 152_000 + 400,
  tolerance: 0.5,
  hasArcs: false,
  holes: 0,
};

export const squareColumn: ReferenceRoom = {
  name: 'room with a square column (gap 20)',
  input: {
    outline: [vec(0, 0), vec(4000, 0), vec(4000, 3000), vec(0, 3000)],
    edges: edges(4, G),
    obstacles: [
      {
        kind: 'polygon',
        points: [vec(1800, 1300), vec(2200, 1300), vec(2200, 1700), vec(1800, 1700)],
        gap: 20,
      },
    ],
  },
  // Column 400 × 400 grows to 440 × 440.
  expectedArea: 3980 * 2980 - 440 * 440,
  tolerance: 0.5,
  hasArcs: false,
  holes: 1,
};

/** Tolerance for an arc of length `s`: the polygon deviates from the arc by at most ARC_TOL. */
const arcTol = (s: number) => 0.5 * s + 50;

export const semicircleBayAndColumn: ReferenceRoom = {
  name: 'semicircular bay (r = 1500) and round column ⌀400',
  input: {
    outline: [vec(0, 0), vec(4000, 0), vec(4000, 3000), vec(0, 3000)],
    edges: [{ gap: G }, { gap: G, bulge: 1 }, { gap: G }, { gap: G }],
    obstacles: [{ kind: 'circle', center: vec(1500, 1500), diameter: 400, gap: 20 }],
  },
  // Rectangle x ∈ [10, 4000], y ∈ [10, 2990] + semicircle of radius 1490 − column circle r = 220.
  expectedArea: 3990 * 2980 + (Math.PI * 1490 * 1490) / 2 - Math.PI * 220 * 220,
  // Arc length π·1490 for the bay, plus ~0.2 % of the column area for its circumscribed polygon.
  tolerance: arcTol(Math.PI * 1490) + 0.002 * Math.PI * 220 * 220,
  hasArcs: true,
  holes: 1,
};

export const referenceRooms: ReferenceRoom[] = [
  rectangle,
  lShape,
  uShape,
  trapezoid,
  parallelogram,
  bayWindow,
  squareColumn,
  semicircleBayAndColumn,
];
