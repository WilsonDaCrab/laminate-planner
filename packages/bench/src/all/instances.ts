/** Loads the instance files of `instances/` (Node only): id = file stem, group = directory name. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseProject } from '@lp/core';
import type { InstanceInfo } from './protocol';

/** Directory order of the main table: §13.1. Unknown directories follow alphabetically. */
const GROUP_ORDER = ['tiny', 'planted', 'rect', 'lshape', 'slanted', 'obstacles', 'curved'];

const groupRank = (group: string): number => {
  const i = GROUP_ORDER.indexOf(group);
  return i < 0 ? GROUP_ORDER.length : i;
};

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
  const list = files.map((file): InstanceInfo => ({
    id: basename(file, '.json'),
    group: basename(dirname(file)),
    project: parseProject(JSON.parse(readFileSync(file, 'utf8'))),
  }));
  // Stable: by group rank, then by id with numbers compared as numbers (P2 < P10).
  return list.sort(
    (a, b) =>
      groupRank(a.group) - groupRank(b.group) ||
      a.group.localeCompare(b.group) ||
      a.id.localeCompare(b.id, 'en', { numeric: true }),
  );
}
