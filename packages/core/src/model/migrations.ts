import { ProjectError, errorIssue } from './errors';

/** Version written by this build. Bump it together with a new entry in MIGRATIONS. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Upgrades a raw (unvalidated) project document from `from` to `to`. */
export interface Migration {
  from: number;
  to: number;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/** No migrations yet: version 1 is the first schema. */
export const MIGRATIONS: readonly Migration[] = [];

/**
 * Brings a raw document to `target` by applying migrations in order.
 * Throws ProjectError for a missing/invalid version, a newer-than-supported version, or a gap.
 */
export function migrate(
  raw: unknown,
  registry: readonly Migration[] = MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectError([errorIssue('notAnObject', '', 'a project must be a JSON object')]);
  }
  let doc = raw as Record<string, unknown>;
  const declared = doc.schemaVersion;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) {
    throw new ProjectError([
      errorIssue('schemaVersion', 'schemaVersion', 'schemaVersion must be a non-negative integer'),
    ]);
  }
  let version: number = declared;
  if (version > target) {
    throw new ProjectError([
      errorIssue(
        'schemaVersionTooNew',
        'schemaVersion',
        `project version ${version} is newer than the supported version ${target}`,
      ),
    ]);
  }
  while (version < target) {
    const step = registry.find((m) => m.from === version);
    if (!step) {
      throw new ProjectError([
        errorIssue('noMigration', 'schemaVersion', `no migration from version ${version}`),
      ]);
    }
    doc = { ...step.up(doc), schemaVersion: step.to };
    version = step.to;
  }
  return doc;
}
