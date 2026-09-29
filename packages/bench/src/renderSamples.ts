// Writes an SVG plan for every test room to results/f3/<ID>.svg, for checking by eye (F3).
// Run: pnpm -F @lp/bench render-samples
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  buildContext,
  buildPlan,
  createRng,
  goodY0,
  parseProject,
  renderPlanSvg,
  rowConfigFromSettings,
  sample,
  validatePlan,
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

const out = new URL('results/f3/', root);
mkdirSync(out, { recursive: true });

for (const [group, id] of rooms) {
  const project = parseProject(
    JSON.parse(readFileSync(new URL(`instances/${group}/${id}.json`, root), 'utf8')),
  );
  const y0 = goodY0(project) ?? 0;
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
