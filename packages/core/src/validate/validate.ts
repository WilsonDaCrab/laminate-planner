/**
 * Independent plan validator (ALGORITHM §11). It re-derives the zone from the project and every
 * relation between pieces from their exact shapes; it shares no code with the planner, so a
 * mistake in the decoder cannot hide here. Board count = boards that hold pieces.
 */

import type { Plan, Project } from '../model/index';
import { checkBoards, checkCounts, checkCoverage, geometryChecks } from './checks';
import type { ValidationResult } from './types';

export function validatePlan(project: Project, plan: Plan): ValidationResult {
  const violations = [
    ...checkCounts(project, plan),
    ...checkBoards(project, plan),
    ...checkCoverage(project, plan),
    ...geometryChecks(project, plan),
  ];
  const boards = plan.boards.filter((b) => b.placements.length > 0).length;
  return { boards, violations };
}
