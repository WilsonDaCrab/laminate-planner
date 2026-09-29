// Writes an SVG plan for every test room to results/f3/<ID>.svg, for checking by eye (F3).
// Run: pnpm -F @lp/bench render-samples
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  buildBands,
  buildContext,
  buildPlan,
  buildRoomZone,
  createRng,
  parseProject,
  renderPlanSvg,
  rowConfigFromSettings,
  sample,
  validatePlan,
  type Project,
} from '@lp/core';

const root = new URL('../../../', import.meta.url);
const rooms: [group: string, id: string][] = [
  ['rect', 'R1'],
  ['rect', 'R2'],
  ['lshape', 'L1'],
  ['lshape', 'U1'],
  ['slanted', 'S1'],
  ['slanted', 'S2'],
  ['curved', 'C1'],
  ['curved', 'C2'],
];

/** First row offset whose strips beside horizontal walls are all at least w_min wide. */
function goodY0(project: Project): number {
  const W = project.product.boardWidth;
  const zone = buildRoomZone(project, project.rooms[0]!.id);
  const base = rowConfigFromSettings(project.settings);
  for (let y0 = 0; y0 < W; y0++) {
    const layout = buildBands(zone.shapes, { ...base, y0 }, W);
    const ok = layout.segments.every((s) =>
      [s.shape.outer, ...s.shape.holes].every((ring) =>
        ring.every((a, k) => {
          const b = ring[(k + 1) % ring.length]!;
          if (Math.abs(a.y - b.y) > 1e-6) return true;
          const r = (((a.y - layout.cfg.y0) % W) + W) % W;
          return (
            r < 0.02 ||
            W - r < 0.02 ||
            (r >= project.rules.minRipWidth && W - r >= project.rules.minRipWidth)
          );
        }),
      ),
    );
    if (ok) return y0;
  }
  return 0;
}

const out = new URL('results/f3/', root);
mkdirSync(out, { recursive: true });

for (const [group, id] of rooms) {
  const project = parseProject(
    JSON.parse(readFileSync(new URL(`instances/${group}/${id}.json`, root), 'utf8')),
  );
  const y0 = goodY0(project);
  const ctx = buildContext(project, { ...rowConfigFromSettings(project.settings), y0 });
  const rng = createRng(project.settings.seed);
  const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
  const plan = buildPlan(ctx, phi);
  const check = validatePlan(project, plan);
  writeFileSync(new URL(`${id}.svg`, out), renderPlanSvg(project, plan));
  const kinds = [...new Set(check.violations.map((v) => v.code))].join(',') || '-';
  console.log(
    `${id}: y0=${y0} boards=${plan.stats.boards} lb=${Math.max(plan.stats.lb0, plan.stats.lb1)} violations=${kinds}`,
  );
}
