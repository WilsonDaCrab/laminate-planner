/**
 * Model-level integrity checks: parameter ranges (DOMAIN §5) and structural consistency of rooms
 * and doorways. This is NOT the independent plan validator (`core/validate`, F3); it only judges
 * whether a project description is usable.
 */

import { discretizePolygon } from '../geometry/arcs';
import { isSimple, signedArea } from '../geometry/polygon';
import { dist } from '../geometry/vec';
import { EPS } from '../num/index';
import { errorIssue, type ModelIssue } from './errors';
import type { Project, Room } from './schema';

function checkRules(p: Project, issues: ModelIssue[]): void {
  const { rules, product } = p;
  const L = product.boardLength;
  const W = product.boardWidth;
  if (rules.minPieceLength > L / 2) {
    issues.push(
      errorIssue('minPieceLength', 'rules.minPieceLength', `L_min must be ≤ L/2 (${L / 2} mm)`),
    );
  }
  if (rules.minStagger >= L / 2) {
    issues.push(errorIssue('minStagger', 'rules.minStagger', `D must be < L/2 (${L / 2} mm)`));
  }
  if (rules.minRipWidth >= W / 2) {
    issues.push(
      errorIssue('minRipWidth', 'rules.minRipWidth', `w_min must be < W/2 (${W / 2} mm)`),
    );
  }
  if (rules.minGap > rules.expansionGap || rules.expansionGap > rules.maxGap) {
    issues.push(
      errorIssue(
        'gapOrder',
        'rules.expansionGap',
        'need g_min ≤ g ≤ g_max (minGap ≤ expansionGap ≤ maxGap)',
      ),
    );
  }
}

function checkRoom(room: Room, ri: number, issues: ModelIssue[]): void {
  const at = `rooms[${ri}]`;
  const n = room.outline.length;

  if (room.edges.length !== n) {
    issues.push(
      errorIssue(
        'edgesMismatch',
        `${at}.edges`,
        `edges (${room.edges.length}) must match outline vertices (${n})`,
      ),
    );
    return; // the remaining checks index edges by outline position
  }
  for (let i = 0; i < n; i++) {
    const a = room.outline[i]!;
    const b = room.outline[(i + 1) % n]!;
    if (dist(a, b) <= EPS) {
      issues.push(
        errorIssue('zeroLengthEdge', `${at}.outline[${i}]`, 'consecutive vertices coincide'),
      );
      return;
    }
  }
  if (signedArea(room.outline) <= 0) {
    issues.push(errorIssue('outlineNotCCW', `${at}.outline`, 'outline must be counter-clockwise'));
    return;
  }
  const flat = discretizePolygon(
    room.outline,
    room.edges.map((e) => e.bulge),
  );
  if (!isSimple(flat.points)) {
    issues.push(
      errorIssue(
        'outlineNotSimple',
        `${at}.outline`,
        'outline (with arcs) must be a simple polygon',
      ),
    );
  }

  const seen = new Set<string>();
  room.obstacles.forEach((o, oi) => {
    if (seen.has(o.id)) {
      issues.push(
        errorIssue('duplicateId', `${at}.obstacles[${oi}].id`, `duplicate obstacle id "${o.id}"`),
      );
    }
    seen.add(o.id);
    if (o.kind === 'polygon' && o.bulges && o.bulges.length > o.points.length) {
      issues.push(
        errorIssue(
          'bulgesMismatch',
          `${at}.obstacles[${oi}].bulges`,
          'more bulges than polygon edges',
        ),
      );
    }
  });
}

function checkDoorways(p: Project, issues: ModelIssue[]): void {
  const rooms = new Map(p.rooms.map((r) => [r.id, r]));
  const seen = new Set<string>();
  p.doorways.forEach((d, di) => {
    const at = `doorways[${di}]`;
    if (seen.has(d.id))
      issues.push(errorIssue('duplicateId', `${at}.id`, `duplicate doorway id "${d.id}"`));
    seen.add(d.id);

    const sides: [string, number | undefined, number | undefined][] = [
      [d.roomA, d.edgeA, d.offsetA],
    ];
    if (d.roomB !== undefined) sides.push([d.roomB, d.edgeB, d.offsetB]);
    for (const [roomId, edge, offset] of sides) {
      const room = rooms.get(roomId);
      if (!room) {
        issues.push(errorIssue('doorwayRoom', at, `unknown room "${roomId}"`));
        continue;
      }
      if (edge === undefined || offset === undefined || edge >= room.outline.length) {
        issues.push(
          errorIssue('doorwayEdge', at, `edge ${edge ?? '?'} does not exist in room "${roomId}"`),
        );
        continue;
      }
      if ((room.edges[edge]?.bulge ?? 0) !== 0) {
        issues.push(errorIssue('doorwayOnArc', at, 'a doorway must lie on a straight edge'));
        continue;
      }
      const a = room.outline[edge]!;
      const b = room.outline[(edge + 1) % room.outline.length]!;
      if (offset + d.width > dist(a, b) + EPS) {
        issues.push(
          errorIssue('doorwayRange', at, 'the opening extends beyond the end of its edge'),
        );
      }
    }
  });
}

/** All problems of a project; errors make it unusable, warnings are advisory. */
export function checkProjectIntegrity(p: Project): ModelIssue[] {
  const issues: ModelIssue[] = [];
  checkRules(p, issues);
  const ids = new Set<string>();
  p.rooms.forEach((room, ri) => {
    if (ids.has(room.id)) {
      issues.push(errorIssue('duplicateId', `rooms[${ri}].id`, `duplicate room id "${room.id}"`));
    }
    ids.add(room.id);
    checkRoom(room, ri, issues);
  });
  checkDoorways(p, issues);
  return issues;
}
