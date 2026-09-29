import type { z } from 'zod';
import { ProjectError, errorIssue, type ModelIssue } from './errors';
import { checkProjectIntegrity } from './integrity';
import { migrate, type Migration, MIGRATIONS } from './migrations';
import { ProjectSchema, type Project } from './schema';

const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (acc, seg) =>
      typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg),
    '',
  );

function schemaIssues(error: z.ZodError): ModelIssue[] {
  return error.issues.map((i) => errorIssue('schema', formatPath(i.path), i.message));
}

/**
 * Turns an untrusted document into a Project: migrate → validate (defaults are filled in)
 * → integrity checks. Throws ProjectError listing every problem found in the failing stage.
 */
export function parseProject(raw: unknown, registry: readonly Migration[] = MIGRATIONS): Project {
  const doc = migrate(raw, registry);
  const parsed = ProjectSchema.safeParse(doc);
  if (!parsed.success) throw new ProjectError(schemaIssues(parsed.error));
  const errors = checkProjectIntegrity(parsed.data).filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new ProjectError(errors);
  return parsed.data;
}

/** Parses JSON text into a Project (see parseProject). */
export function loadProject(json: string, registry: readonly Migration[] = MIGRATIONS): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new ProjectError([errorIssue('invalidJson', '', `not valid JSON: ${detail}`)]);
  }
  return parseProject(raw, registry);
}

/** Canonical JSON text: schema key order, 2-space indent, trailing newline. */
export function saveProject(project: Project): string {
  return `${JSON.stringify(ProjectSchema.parse(project), null, 2)}\n`;
}
