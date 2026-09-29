/**
 * Plan as SVG text (room outline + pieces + markers). Pure string building, no DOM, so it runs in
 * the browser, a worker and Node alike. Pieces cut from the same board share a colour, which
 * shows the pairs at a glance. Room coordinates have y up; the SVG is flipped so that the picture
 * matches the drawing. Arcs are discretised here for display only (the project keeps them exact).
 */

import { discretizePolygon } from '../geometry/arcs';
import type { Plan, PlannedPiece, Point, Project } from '../model/index';

export interface RenderOptions {
  /** Width of the SVG element in pixels (height follows the aspect ratio). Default 1200. */
  widthPx?: number;
  /** Write the piece markers. Default true. */
  labels?: boolean;
  /** Margin around the room, mm. Default 200. */
  margin?: number;
}

const escapeXml = (s: string): string =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Colour of the n-th board: hues spread by the golden angle so neighbours differ. */
const boardColour = (n: number): string => `hsl(${Math.round((n * 137.508) % 360)} 55% 78%)`;

const fmt = (n: number): string => {
  if (!Number.isFinite(n)) throw new RangeError('renderPlanSvg: non-finite coordinate');
  return String(Math.round(n * 100) / 100);
};

export function renderPlanSvg(project: Project, plan: Plan, opts: RenderOptions = {}): string {
  const room = project.rooms.find((r) => r.id === plan.pieces[0]?.roomId) ?? project.rooms[0];
  if (!room) throw new RangeError('renderPlanSvg: project has no room');
  const margin = opts.margin ?? 200;
  const widthPx = opts.widthPx ?? 1200;
  const showLabels = opts.labels ?? true;

  const outline = discretizePolygon(
    room.outline,
    room.edges.map((e) => e.bulge),
  ).points;
  const points: Point[] = [
    ...outline,
    ...plan.pieces.flatMap((p) => p.parts.flatMap((q) => q.outline)),
  ];
  const minX = Math.min(...points.map((p) => p.x)) - margin;
  const maxX = Math.max(...points.map((p) => p.x)) + margin;
  const minY = Math.min(...points.map((p) => p.y)) - margin;
  const maxY = Math.max(...points.map((p) => p.y)) + margin;
  const w = maxX - minX;
  const h = maxY - minY;

  const X = (x: number): string => fmt(x - minX);
  const Y = (y: number): string => fmt(maxY - y);
  const ring = (r: readonly Point[]): string =>
    r.length ? `M${r.map((p) => `${X(p.x)} ${Y(p.y)}`).join('L')}Z` : '';

  const boardIndex = new Map(plan.boards.map((b, i) => [b.id, i]));
  const fontSize = Math.max(20, project.product.boardWidth * 0.28);

  const pieceSvg = (p: PlannedPiece): string => {
    const d = p.parts
      .map((part) => [ring(part.outline), ...part.holes.map(ring)].join(''))
      .join('');
    const colour = boardColour(boardIndex.get(p.boardId) ?? 0);
    const box = p.outline;
    const cx = box.length
      ? (Math.min(...box.map((q) => q.x)) + Math.max(...box.map((q) => q.x))) / 2
      : 0;
    const cy = box.length
      ? (Math.min(...box.map((q) => q.y)) + Math.max(...box.map((q) => q.y))) / 2
      : 0;
    const label =
      showLabels && box.length
        ? `<text x="${X(cx)}" y="${Y(cy)}" font-size="${fmt(fontSize)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(p.id)}</text>`
        : '';
    return (
      `<g data-piece="${escapeXml(p.id)}" data-board="${escapeXml(p.boardId)}">` +
      `<path d="${d}" fill="${colour}" fill-rule="evenodd" stroke="#333" stroke-width="2"/>` +
      `<title>${escapeXml(`${p.id} · ${p.boardId}`)}</title>${label}</g>`
    );
  };

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${widthPx}" height="${fmt((widthPx * h) / w)}" font-family="sans-serif">`,
    `<rect width="${fmt(w)}" height="${fmt(h)}" fill="#fff"/>`,
    `<path d="${ring(outline)}" fill="none" stroke="#000" stroke-width="6" stroke-dasharray="40 20"/>`,
    ...plan.pieces.map(pieceSvg),
    '</svg>',
  ].join('\n');
}
