/**
 * Zone input of a room, rebuilt here on purpose: the validator must not share the mapping with
 * the planner (`layout/roomZone`), otherwise a mistake there would be invisible. A test outside
 * `validate/` checks that both agree.
 */

import type { ZoneInput, ZoneObstacle } from '../geometry/zone';
import type { Project, Room } from '../model/index';

export function zoneInputOf(project: Project, room: Room): ZoneInput {
  const rules = project.rules;
  const obstacles: ZoneObstacle[] = [];
  for (const o of room.obstacles) {
    const gap = o.gap ?? rules.expansionGap;
    if (o.kind === 'polygon') {
      obstacles.push({
        kind: 'polygon',
        points: o.points.map(({ x, y }) => ({ x, y })),
        bulges: o.bulges,
        gap,
      });
    } else if (o.kind === 'circle') {
      obstacles.push({ kind: 'circle', center: { ...o.center }, diameter: o.diameter, gap });
    }
    // Pipes are drill marks, not zone geometry.
  }

  const doorways: NonNullable<ZoneInput['doorways']> = [];
  for (const d of project.doorways) {
    const base = { width: d.width, depth: d.depth, jambUndercut: d.jambUndercut };
    if (d.roomA === room.id) doorways.push({ ...base, edge: d.edgeA, offset: d.offsetA });
    if (d.roomB === room.id && d.edgeB !== undefined && d.offsetB !== undefined) {
      doorways.push({ ...base, edge: d.edgeB, offset: d.offsetB });
    }
  }

  return {
    outline: room.outline.map(({ x, y }) => ({ x, y })),
    edges: room.edges.map((e) => ({ gap: e.gap ?? rules.expansionGap, bulge: e.bulge })),
    obstacles,
    doorways,
  };
}
