/**
 * Validator result types and tolerances. The validator recomputes everything from geometry and
 * the model only (CLAUDE.md rule 4): it imports nothing from layout, plan, evaluate or optimize.
 */

import { CLIPPER_GRID_MM } from '../geometry/clip';

export type ViolationCode =
  | 'coverage' // the pieces do not tile the installable zone
  | 'overlap' // pieces overlap in the room or on a board
  | 'boardBounds' // a placement leaves the board
  | 'kerf' // two placements on a board are closer than the saw kerf
  | 'shapeNotOnBoard' // a piece shape does not lie inside its board rectangle
  | 'orientation' // the board image is rotated or mirrored (boards cannot be turned)
  | 'profile' // a connected edge is not on the matching original board edge
  | 'minLength' // start/end piece shorter than L_min along a connected long edge
  | 'ripWidth' // strip narrower than w_min
  | 'stagger' // seams of neighbouring rows closer than D
  | 'pipe' // pipe hole missing, misplaced or without a pipe
  | 'count'; // statistics or bookkeeping inconsistent

export interface Violation {
  code: ViolationCode;
  message: string;
  /** Piece, segment or board ids involved. */
  refs: string[];
}

export interface ValidationResult {
  /** Number of boards the plan uses (distinct board ids with placements). */
  boards: number;
  violations: Violation[];
}

/** Clipper snaps shapes to a 0.01 mm grid, so geometric comparisons allow one grid step. */
export const GRID_TOL = CLIPPER_GRID_MM;
/** Two edges lie on the same line when their offsets differ by at most this (mm). */
export const LINE_TOL = 2 * CLIPPER_GRID_MM;
/** Shared boundaries shorter than this are clipping noise, not a connection (mm). */
export const SHARED_MIN = 2 * CLIPPER_GRID_MM;
