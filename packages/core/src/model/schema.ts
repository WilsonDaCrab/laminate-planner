/**
 * Project data model (DOMAIN.md §8) as zod schemas; the TypeScript types are the schemas' outputs,
 * so runtime validation and static types cannot drift apart. All lengths are millimetres.
 */

import { z } from 'zod';

const mm = z.number();
const nonNegMm = z.number().nonnegative();
const posMm = z.number().positive();

export const Vec2Schema = z.object({ x: mm, y: mm });

/** Vertex with an optional stable ID (selection, undo, shape groups in the editor). */
export const VertexSchema = Vec2Schema.extend({ id: z.string().optional() });

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** L: visible board length (without tongue). */
  boardLength: posMm,
  /** W: visible board width. */
  boardWidth: posMm,
  boardsPerPack: z.number().int().positive(),
  pricePerPack: nonNegMm.optional(),
});

export const PatternSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('free') }),
  z.object({ kind: z.literal('fixed'), fraction: z.number().gt(0).lt(1) }),
]);

export const RulesSchema = z.object({
  /** k: saw kerf. */
  kerf: nonNegMm.default(3),
  /** L_min: minimum length of a start/end piece. */
  minPieceLength: posMm.default(300),
  /** D: minimum seam stagger between neighbouring rows. */
  minStagger: nonNegMm.default(300),
  /** w_min: minimum width of a ripped strip. */
  minRipWidth: nonNegMm.default(50),
  /** g: default expansion gap along walls. */
  expansionGap: nonNegMm.default(10),
  /** g_min / g_max: tolerances for measurement errors. */
  minGap: nonNegMm.default(7),
  maxGap: nonNegMm.default(14),
  /** "H" pattern: seams of rows two apart should not line up within `distance` (D_H). */
  hPattern: z
    .object({ enabled: z.boolean().default(true), distance: nonNegMm.default(100) })
    .prefault({}),
  pattern: PatternSchema.default({ kind: 'free' }),
  maxRunLength: posMm.optional(),
  maxRunWidth: posMm.optional(),
  reservePercent: nonNegMm.default(2),
});

export const EdgeKindSchema = z.enum(['wall', 'transition', 'stairs', 'fixed', 'doorway']);

export const EdgeSchema = z.object({
  kind: EdgeKindSchema.default('wall'),
  /** Overrides `rules.expansionGap` for this edge. */
  gap: nonNegMm.optional(),
  /**
   * DXF bulge = tan(θ/4) of the arc outline[i] → outline[i+1]. 0/absent = straight; ±1 = semicircle.
   * > 0 runs counter-clockwise and bulges to the right of the directed chord (outwards for a CCW room).
   */
  bulge: z.number().optional(),
});

export const ObstacleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('polygon'),
    id: z.string(),
    label: z.string().optional(),
    points: z.array(VertexSchema).min(3),
    bulges: z.array(z.number()).optional(),
    gap: nonNegMm.optional(),
  }),
  /** Round column: a real hole. */
  z.object({
    kind: z.literal('circle'),
    id: z.string(),
    label: z.string().optional(),
    center: Vec2Schema,
    diameter: posMm,
    gap: nonNegMm.optional(),
  }),
  /** Pipe: only a drilling feature of the pieces, not zone geometry (ADR-008). */
  z.object({
    kind: z.literal('pipe'),
    id: z.string(),
    center: Vec2Schema,
    diameter: posMm,
    gap: nonNegMm.optional(),
  }),
]);

/** Editor metadata (editable shape groups). The core ignores it: geometry is outline + bulge. */
export const WallShapeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'rect',
    'trapezoid',
    'triangle',
    'semicircle',
    'arcSegment',
    'freeform',
    'fillet',
    'chamfer',
  ]),
  params: z.record(z.string(), z.number()),
  vertexIds: z.array(z.string()),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Short code for markings, e.g. "DZ". */
  code: z.string(),
  /** Simple polygon, counter-clockwise (also after arcs are discretised). */
  outline: z.array(VertexSchema).min(3),
  /** edges[i] belongs to outline[i] → outline[i+1]. */
  edges: z.array(EdgeSchema),
  obstacles: z.array(ObstacleSchema).default([]),
  wallShapes: z.array(WallShapeSchema).optional(),
});

export const DoorwaySchema = z.object({
  id: z.string(),
  roomA: z.string(),
  edgeA: z.number().int().nonnegative(),
  /** Distance from the start of the edge to the opening. */
  offsetA: nonNegMm,
  roomB: z.string().optional(),
  edgeB: z.number().int().nonnegative().optional(),
  offsetB: nonNegMm.optional(),
  width: posMm,
  /** How far the floor continues through the opening. */
  depth: nonNegMm,
  /** How far the floor tucks under the door frame on each side. */
  jambUndercut: nonNegMm,
  mode: z.enum(['continuous', 'profile']).default('continuous'),
});

export const LayoutSettingsSchema = z.object({
  /** Direction of the rows in degrees, or 'auto' (chosen by the outer loop). */
  angleDeg: z.union([z.number(), z.literal('auto')]).default('auto'),
  stackSide: z.enum(['left', 'right', 'auto']).default('auto'),
  /** y0: row offset; 'auto' lets the outer loop choose. */
  rowOffset: z.union([mm, z.literal('auto')]).default('auto'),
  mode: z.enum(['precut', 'onsite']).default('precut'),
  trimMargin: nonNegMm.default(0),
  /** 0..1 → λ_H. */
  aesthetics: z.number().min(0).max(1).default(0.5),
  seed: z.number().int().default(1),
  timeLimitMs: posMm.default(3000),
});

export const ProjectMetaSchema = z.object({
  knownOptimum: z.number().int().nonnegative().optional(),
  bestKnown: z.number().int().nonnegative().optional(),
  source: z.enum(['planted', 'manual', 'real']),
});

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  product: ProductSchema,
  rules: RulesSchema.prefault({}),
  rooms: z.array(RoomSchema),
  doorways: z.array(DoorwaySchema).default([]),
  settings: LayoutSettingsSchema.prefault({}),
  meta: ProjectMetaSchema.optional(),
});

export type Vertex = z.output<typeof VertexSchema>;
export type Product = z.output<typeof ProductSchema>;
export type Rules = z.output<typeof RulesSchema>;
export type EdgeKind = z.output<typeof EdgeKindSchema>;
export type EdgeProps = z.output<typeof EdgeSchema>;
export type Obstacle = z.output<typeof ObstacleSchema>;
export type WallShape = z.output<typeof WallShapeSchema>;
export type Room = z.output<typeof RoomSchema>;
export type Doorway = z.output<typeof DoorwaySchema>;
export type LayoutSettings = z.output<typeof LayoutSettingsSchema>;
export type ProjectMeta = z.output<typeof ProjectMetaSchema>;
export type Project = z.output<typeof ProjectSchema>;
