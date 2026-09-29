import { describe, expect, it } from 'vitest';
import { sample } from '../layout/feasible';
import { instanceFiles } from '../layout/fixtures/instances';
import { parseProject } from '../model/index';
import { buildPlan } from '../plan/build';
import { buildContext } from '../plan/context';
import { createRng } from '../rng/index';
import { renderPlanSvg } from './svg';

describe.each(instanceFiles.map((f) => [f.id, f.raw] as const))(
  'renderPlanSvg on %s',
  (_id, raw) => {
    const project = parseProject(raw);
    const ctx = buildContext(project);
    const rng = createRng(4);
    const phi = ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng));
    const plan = buildPlan(ctx, phi);
    const svg = renderPlanSvg(project, plan);

    it('is a well-formed document with every piece marker', () => {
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      for (const p of plan.pieces) expect(svg).toContain(`data-piece="${p.id}"`);
      const count = (re: RegExp) => (svg.match(re) ?? []).length;
      expect(count(/<g /g)).toBe(count(/<\/g>/g));
      expect(count(/<text /g)).toBe(count(/<\/text>/g));
    });

    it('has no undefined or NaN values', () => {
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    });

    it('gives pieces of one board the same colour and different boards mostly different ones', () => {
      const colourOf = (id: string) =>
        new RegExp(`data-piece="${id}"[^>]*>\\s*<path[^>]*fill="([^"]+)"`).exec(svg)![1]!;
      const byBoard = new Map<string, Set<string>>();
      for (const p of plan.pieces) {
        byBoard.set(p.boardId, (byBoard.get(p.boardId) ?? new Set()).add(colourOf(p.id)));
      }
      for (const colours of byBoard.values()) expect(colours.size).toBe(1);
      expect(new Set([...byBoard.values()].map((s) => [...s][0])).size).toBeGreaterThan(1);
    });

    it('can omit the markers', () => {
      expect(renderPlanSvg(project, plan, { labels: false })).not.toContain('<text ');
    });
  },
);

describe('escaping', () => {
  it('escapes markup in piece ids', () => {
    const project = parseProject(instanceFiles[0]!.raw);
    const ctx = buildContext(project);
    const rng = createRng(1);
    const plan = buildPlan(
      ctx,
      ctx.layout.segments.map((s) => sample(ctx.feasible[s.id]!.feasible, rng)),
    );
    plan.pieces[0]!.id = 'A<B>&"C';
    const svg = renderPlanSvg(project, plan);
    expect(svg).toContain('A&lt;B&gt;&amp;&quot;C');
    expect(svg).not.toContain('A<B>');
  });
});
