/** Loads the instance files of `instances/` (Node only): id = file stem, group = directory name. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { parseProject, type Project } from '@lp/core';
import type { InstanceInfo } from './protocol';

/** Directory order of the main table: §13.1. Unknown directories follow alphabetically. */
const GROUP_ORDER = ['tiny', 'planted', 'rect', 'lshape', 'slanted', 'obstacles', 'curved'];

const groupRank = (group: string): number => {
  const i = GROUP_ORDER.indexOf(group);
  return i < 0 ? GROUP_ORDER.length : i;
};

/** Content hash without `meta`: `bestknown` rewrites `meta` and must not invalidate finished runs. */
export const instanceHash = (project: Project): string =>
  createHash('sha1')
    .update(JSON.stringify({ ...project, meta: undefined }))
    .digest('hex')
    .slice(0, 10);

export function loadInstances(root: string): InstanceInfo[] {
  const files: string[] = [];
  const visit = (p: string): void => {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) visit(join(p, name));
    } else if (p.endsWith('.json')) {
      files.push(p);
    }
  };
  visit(root);
  const list = files.map((file): InstanceInfo => {
    const project = parseProject(JSON.parse(readFileSync(file, 'utf8')));
    return {
      id: basename(file, '.json'),
      group: basename(dirname(file)),
      project,
      hash: instanceHash(project),
    };
  });
  // Stable: by group rank, then by id with numbers compared as numbers (P2 < P10).
  return list.sort(
    (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      a.group.localeCompare(b.group) ||
      a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
}
