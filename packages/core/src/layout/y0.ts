/**
 * A row offset y0 for which every horizontal wall leaves strips of at least w_min on both sides
 * (or lies on a band boundary). The planner itself does not filter y0 (that is the outer loop of
 * F5), so plans built at an arbitrary y0 can legitimately break w_min; baselines and tests use
 * this first-fit scan instead.
 */

import { transformShape, roomToRow, type StackSide } from '../geometry/frames';
import { CLIPPER_SCALE, type Shape } from '../geometry/clip';
import type { Project } from '../model/index';
import { buildBands, rowConfigFromSettings } from './bands';
import { buildRoomZone } from './roomZone';

/** Returns undefined when no offset works (a very narrow room). */
export function goodY0(project: Project, roomId?: string): number | undefined {
  const W = project.product.boardWidth;
  const wMin = project.rules.minRipWidth;
  const zone = buildRoomZone(project, roomId ?? project.rooms[0]!.id);
  const base = rowConfigFromSettings(project.settings);
  for (let y0 = 0; y0 < W; y0 += 1) {
    const layout = buildBands(zone.shapes, { ...base, y0 }, W);
    const ok = layout.segments.every((s) =>
      [s.shape.outer, ...s.shape.holes].every((ring) =>
        ring.every((a, k) => {
          const b = ring[(k + 1) % ring.length]!;
          if (Math.abs(a.y - b.y) > 1e-6) return true;
          const r = (((a.y - layout.cfg.y0) % W) + W) % W;
          return r < 0.02 || W - r < 0.02 || (r >= wMin && W - r >= wMin);
        }),
      ),
    );
    if (ok) return y0;
  }
  return undefined;
}

/** Tolerance (mm) below which an edge lies on a band line (as in `goodY0`). */
const ON_LINE = 0.02;

/**
 * For every whole-mm row offset y0 ∈ [0, W): the number of walls running along the rows that leave
 * a strip narrower than w_min (and do not lie on a band line). Analytic: the horizontal edges of the
 * zone in the row frame decide, no bands are built (equal to scanning `buildBands`, see tests).
 */
export function y0Violations(
  project: Project,
  cfg: { theta: number; stackSide: StackSide },
  roomId?: string,
  zone?: { shapes: readonly Shape[] },
): number[] {
  const W = project.product.boardWidth;
  const wMin = project.rules.minRipWidth;
  const shapes = (zone ?? buildRoomZone(project, roomId ?? project.rooms[0]!.id)).shapes;
  const frame = roomToRow(cfg.theta, cfg.stackSide);
  const heights: number[] = [];
  for (const shape of shapes) {
    const t = transformShape(frame, shape);
    for (const ring of [t.outer, ...t.holes]) {
      ring.forEach((a, k) => {
        const b = ring[(k + 1) % ring.length]!;
        // Heights on the Clipper grid, as `buildBands` sees them (a wall exactly w_min from a band
        // line must not fail on rounding noise).
        if (Math.abs(a.y - b.y) <= 1e-6)
          heights.push(Math.round(a.y * CLIPPER_SCALE) / CLIPPER_SCALE);
      });
    }
  }
  return Array.from({ length: W }, (_, y0) =>
    heights.reduce((count, h) => {
      const r = (((h - y0) % W) + W) % W;
      const ok = r < ON_LINE || W - r < ON_LINE || (r >= wMin && W - r >= wMin);
      return ok ? count : count + 1;
    }, 0),
  );
}

/** The offsets without any violation (ALGORITHM §8 step 2, the strict filter). */
export function validY0s(
  project: Project,
  cfg: { theta: number; stackSide: StackSide },
  roomId?: string,
  zone?: { shapes: readonly Shape[] },
): number[] {
  return y0Violations(project, cfg, roomId, zone).flatMap((v, y0) => (v === 0 ? [y0] : []));
}
