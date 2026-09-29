/** Bridges the project model to geometry-level zone input (`geometry/zone`). */

import { buildZone, type ZoneInput, type ZoneObstacle, type ZoneResult } from '../geometry/zone';
import { edgeGap } from '../model/defaults';
import type { Doorway, Project, Room, Rules } from '../model/schema';

/**
 * Zone input of one room. Pipes are not zone geometry (ADR-008) and are left out; obstacle gaps
 * default to the project's expansion gap; doorways are attached to the rooms on either side.
 */
export function roomToZoneInput(
  room: Room,
  rules: Rules,
  doorways: readonly Doorway[] = [],
): ZoneInput {
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
  }

  const zoneDoorways: NonNullable<ZoneInput['doorways']> = [];
  for (const d of doorways) {
    const base = { width: d.width, depth: d.depth, jambUndercut: d.jambUndercut };
    if (d.roomA === room.id) zoneDoorways.push({ ...base, edge: d.edgeA, offset: d.offsetA });
    if (d.roomB === room.id && d.edgeB !== undefined && d.offsetB !== undefined) {
      zoneDoorways.push({ ...base, edge: d.edgeB, offset: d.offsetB });
    }
  }

  return {
    outline: room.outline.map(({ x, y }) => ({ x, y })),
    edges: room.edges.map((e) => ({ gap: edgeGap(e, rules), bulge: e.bulge })),
    obstacles,
    doorways: zoneDoorways,
  };
}

/** Installable zone of a room of the project. */
export function buildRoomZone(project: Project, roomId: string): ZoneResult {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) throw new RangeError(`buildRoomZone: unknown room "${roomId}"`);
  return buildZone(roomToZoneInput(room, project.rules, project.doorways));
}
