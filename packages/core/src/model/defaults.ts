import type { z } from 'zod';
import {
  LayoutSettingsSchema,
  ProductSchema,
  ProjectSchema,
  RulesSchema,
  type Doorway,
  type EdgeProps,
  type LayoutSettings,
  type Product,
  type Project,
  type ProjectMeta,
  type Room,
  type Rules,
} from './schema';

/** Defaults come from the schema itself (DOMAIN §5), so there is a single source of truth. */
export const DEFAULT_RULES: Rules = RulesSchema.parse({});
export const DEFAULT_SETTINGS: LayoutSettings = LayoutSettingsSchema.parse({});

export const DEFAULT_PRODUCT: Product = ProductSchema.parse({
  id: 'demo-1285x192',
  name: 'Demo 1285×192',
  boardLength: 1285,
  boardWidth: 192,
  boardsPerPack: 8,
});

export interface ProjectInit {
  name?: string;
  product?: z.input<typeof ProductSchema>;
  rules?: z.input<typeof RulesSchema>;
  rooms?: Room[];
  doorways?: Doorway[];
  settings?: z.input<typeof LayoutSettingsSchema>;
  meta?: ProjectMeta;
}

/** A complete, valid project from a partial description. */
export function createProject(init: ProjectInit = {}): Project {
  return ProjectSchema.parse({
    schemaVersion: 1,
    name: init.name ?? 'Untitled',
    product: init.product ?? DEFAULT_PRODUCT,
    rules: init.rules ?? {},
    rooms: init.rooms ?? [],
    doorways: init.doorways ?? [],
    settings: init.settings ?? {},
    meta: init.meta,
  });
}

/** Expansion gap of one wall: its own value, or the project default. */
export const edgeGap = (edge: EdgeProps, rules: Rules): number => edge.gap ?? rules.expansionGap;
