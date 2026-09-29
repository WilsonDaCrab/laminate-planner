/**
 * Rows (bands) and segments (ALGORITHM §2.2–2.3). In the row frame rows run along +x and stack
 * along +y; band j is B_j = ℝ × [β_j, β_j + W] with boundaries on the lattice y0 + k·W. A segment
 * is a connected component of Z ∩ B_j.
 */

import { CLIPPER_GRID_MM, intersect, rectShape, shapeArea, type Shape } from '../geometry/clip';
import {
  degToRad,
  roomToRow,
  transformShape,
  type Affine,
  type StackSide,
} from '../geometry/frames';
import { bbox } from '../geometry/polygon';
import { EPS, type Mm } from '../num/index';
import type { LayoutSettings } from '../model/schema';

export interface RowConfig {
  /** Row direction in the room frame (radians); the zone is rotated by −θ. */
  theta: number;
  stackSide: StackSide;
  /** Row offset y0 (row frame); snapped to the Clipper grid so that band edges are exact. */
  y0: Mm;
}

export interface Band {
  /** 1-based number counted from the starting wall. */
  j: number;
  lo: Mm;
  hi: Mm;
  segmentIds: string[];
}

export interface Segment {
  /** Band number followed by a letter in x order: '1a', '1b', '2a', … */
  id: string;
  band: number;
  /** 0-based position among the segments of the band, left to right. */
  index: number;
  /** Row-frame shape (outer CCW, holes CW). */
  shape: Shape;
  /** Projection onto the x axis. */
  a: Mm;
  b: Mm;
  bandLo: Mm;
  bandHi: Mm;
  /** Vertical extent of the shape itself (inside the band). */
  yLo: Mm;
  yHi: Mm;
}

export interface Layout {
  cfg: RowConfig;
  /** Board width W the bands were cut with. */
  W: Mm;
  /** Room → row frame. */
  frame: Affine;
  yMin: Mm;
  yMax: Mm;
  bands: Band[];
  segments: Segment[];
}

/** Segments smaller than this (mm²) are numerical slivers from clipping, not geometry. */
const MIN_SEGMENT_AREA = 1e-3;

/**
 * Row configuration from project settings. 'auto' values are resolved by the outer loop (F5);
 * until then they fall back to the given values (default: θ = 0, stack left, y0 = 0).
 */
export function rowConfigFromSettings(
  settings: Pick<LayoutSettings, 'angleDeg' | 'stackSide' | 'rowOffset'>,
  fallback: { angleDeg?: number; stackSide?: StackSide; rowOffset?: Mm } = {},
): RowConfig {
  const angleDeg = settings.angleDeg === 'auto' ? (fallback.angleDeg ?? 0) : settings.angleDeg;
  const stackSide =
    settings.stackSide === 'auto' ? (fallback.stackSide ?? 'left') : settings.stackSide;
  const y0 = settings.rowOffset === 'auto' ? (fallback.rowOffset ?? 0) : settings.rowOffset;
  return { theta: degToRad(angleDeg), stackSide, y0 };
}

/** 0 → 'a', 25 → 'z', 26 → 'aa', … */
function letters(index: number): string {
  let s = '';
  let n = index;
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Cuts the zone (room frame) into bands and segments for the given row configuration. */
export function buildBands(zoneShapes: readonly Shape[], cfg: RowConfig, W: Mm): Layout {
  if (!(W > 0)) throw new RangeError('buildBands: board width W must be positive');
  const frame = roomToRow(cfg.theta, cfg.stackSide);
  const shapes = zoneShapes.map((s) => transformShape(frame, s));
  const y0 = Math.round(cfg.y0 / CLIPPER_GRID_MM) * CLIPPER_GRID_MM;
  const layout: Layout = {
    cfg: { ...cfg, y0 },
    W,
    frame,
    yMin: 0,
    yMax: 0,
    bands: [],
    segments: [],
  };
  const points = shapes.flatMap((s) => s.outer);
  if (points.length === 0) return layout;

  const box = bbox(points);
  layout.yMin = box.minY;
  layout.yMax = box.maxY;
  const kFirst = Math.floor((box.minY - y0 + EPS) / W);
  const kLast = Math.ceil((box.maxY - y0 - EPS) / W) - 1;

  for (let k = kFirst; k <= kLast; k++) {
    const lo = y0 + k * W;
    const hi = lo + W;
    const parts = intersect(shapes, [rectShape(box.minX - 1, lo, box.maxX + 1, hi)])
      .filter((s) => shapeArea(s) > MIN_SEGMENT_AREA)
      .map((shape) => ({ shape, box: bbox(shape.outer) }))
      .sort((p, q) => p.box.minX - q.box.minX);
    if (parts.length === 0) continue;

    const j = k - kFirst + 1;
    const band: Band = { j, lo, hi, segmentIds: [] };
    parts.forEach(({ shape, box: sb }, index) => {
      const id = `${j}${letters(index)}`;
      band.segmentIds.push(id);
      layout.segments.push({
        id,
        band: j,
        index,
        shape,
        a: sb.minX,
        b: sb.maxX,
        bandLo: lo,
        bandHi: hi,
        yLo: sb.minY,
        yHi: sb.maxY,
      });
    });
    layout.bands.push(band);
  }
  return layout;
}

export const segmentById = (layout: Layout, id: string): Segment | undefined =>
  layout.segments.find((s) => s.id === id);
