/**
 * A row offset y0 for which every horizontal wall leaves strips of at least w_min on both sides
 * (or lies on a band boundary). The planner itself does not filter y0 (that is the outer loop of
 * F5), so plans built at an arbitrary y0 can legitimately break w_min; baselines and tests use
 * this first-fit scan instead.
 */

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
