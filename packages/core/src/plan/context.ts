/**
 * Everything that depends on the room and the row configuration (θ, stack side, y0) but not on
 * the seam phases φ. Built once; the optimiser then evaluates many φ vectors against it.
 */

import type { ZoneResult } from '../geometry/zone';
import { buildBands, rowConfigFromSettings, type Layout, type RowConfig } from '../layout/bands';
import { feasibleSet, type FeasibleResult } from '../layout/feasible';
import { buildNeighbors, type NeighborGraph } from '../layout/neighbors';
import { describePieces, seamsOf, type PieceDescriptor } from '../layout/pieces';
import { buildRoomZone } from '../layout/roomZone';
import { buildProfiles, type XProfile } from '../layout/xprofile';
import type { Project, Room } from '../model/schema';
import type { Mm } from '../num/index';
import type { DecodeParams, DecodePiece } from './decode';

export interface PlanContext {
  project: Project;
  room: Room;
  L: Mm;
  W: Mm;
  cfg: RowConfig;
  zone: ZoneResult;
  layout: Layout;
  graph: NeighborGraph;
  /** By segment id. */
  profiles: Record<string, XProfile>;
  /** By segment id: feasible phases F_s. */
  feasible: Record<string, FeasibleResult>;
  decodeParams: DecodeParams;
}

/** Room, zone, bands, neighbours, profiles and F_s for one row configuration. */
export function buildContext(project: Project, cfg?: RowConfig, roomId?: string): PlanContext {
  const room = roomId ? project.rooms.find((r) => r.id === roomId) : project.rooms[0];
  if (!room) throw new RangeError('buildContext: project has no such room');
  const L = project.product.boardLength;
  const W = project.product.boardWidth;
  const rowCfg = cfg ?? rowConfigFromSettings(project.settings);
  const zone = buildRoomZone(project, room.id);
  const layout = buildBands(zone.shapes, rowCfg, W);
  const graph = buildNeighbors(layout);
  const profiles = buildProfiles(layout.segments, graph);
  const feasible: Record<string, FeasibleResult> = {};
  for (const s of layout.segments) {
    feasible[s.id] = feasibleSet(profiles[s.id]!, L, project.rules.minPieceLength);
  }
  return {
    project,
    room,
    L,
    W,
    cfg: layout.cfg,
    zone,
    layout,
    graph,
    profiles,
    feasible,
    decodeParams: { L, W, kerf: project.rules.kerf },
  };
}

/** A described piece together with its decoder id. */
export interface LabelledPiece {
  id: string;
  segmentId: string;
  band: number;
  descriptor: PieceDescriptor;
  decode: DecodePiece;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Marker: room code, band, segment letter and role: S start, E end, M<n> full, X whole segment. */
function pieceLabel(code: string, segmentId: string, band: number, d: PieceDescriptor): string {
  const letters = segmentId.slice(String(band).length);
  const role =
    d.short === 'start' ? 'S' : d.short === 'end' ? 'E' : d.short === 'full' ? `M${d.index}` : 'X';
  return `${code || 'R'}-${pad2(band)}${letters}-${role}`;
}

/**
 * Pieces of all segments for the phase vector `phi` (parallel to `layout.segments`), in row order.
 * Throws if `phi` has the wrong length.
 */
export function piecesForPhases(ctx: PlanContext, phi: readonly number[]): LabelledPiece[] {
  const { segments } = ctx.layout;
  if (phi.length !== segments.length) {
    throw new RangeError(`phi has ${phi.length} entries for ${segments.length} segments`);
  }
  const out: LabelledPiece[] = [];
  segments.forEach((s, i) => {
    for (const d of describePieces(ctx.profiles[s.id]!, ctx.L, phi[i]!)) {
      const id = pieceLabel(ctx.room.code, s.id, s.band, d);
      out.push({
        id,
        segmentId: s.id,
        band: s.band,
        descriptor: d,
        decode: { id, short: d.short, long: d.long, extent: d.extent, width: d.width },
      });
    }
  });
  return out;
}

/** Seams of a segment for phase φ (for cutting the exact shapes). */
export const seamsFor = (ctx: PlanContext, segmentId: string, phi: number): Mm[] => {
  const p = ctx.profiles[segmentId]!;
  return seamsOf(p.a, p.b, ctx.L, phi);
};
