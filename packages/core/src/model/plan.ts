/**
 * Plan output types (DOMAIN §8): the result of the decoder. They live in `model` so that the
 * independent validator can import them without touching `layout`/`plan`.
 */

import type { Mm } from '../num/index';

export interface Point {
  x: Mm;
  y: Mm;
}

export interface BoardRect {
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
}

/** Which short (x) ends of a piece are cut: `start` = right end only, `end` = left end only. */
export type PieceShort = 'start' | 'end' | 'full' | 'free';
/** Which long edges of a piece connect to the neighbouring rows. */
export type PieceLong = 'both' | 'low' | 'high' | 'none';

export type PieceFeature =
  | { kind: 'bevelCut'; side: 'left' | 'right'; lengthLow: Mm; lengthHigh: Mm }
  | { kind: 'notch'; corner: 'lowLeft' | 'lowRight' | 'highLeft' | 'highRight'; dx: Mm; dy: Mm }
  | { kind: 'drill'; x: Mm; y: Mm; diameter: Mm }
  | { kind: 'scribe'; widthAtLeft: Mm; widthAtRight: Mm }
  | {
      kind: 'curveCut';
      side: 'left' | 'right' | 'low' | 'high';
      ordinates: { at: Mm; offset: Mm }[];
      tool: 'jigsaw';
      cutOnSite: boolean;
    };

export interface PlannedPiece {
  id: string;
  roomId: string;
  band: number;
  segmentId: string;
  indexInRow: number;
  short: PieceShort;
  long: PieceLong;
  extent: Mm;
  lengthLow: Mm;
  lengthHigh: Mm;
  width: Mm;
  /** Exact shape in room coordinates. */
  outline: Point[];
  boardId: string;
  /** Placement on the board (board coordinates). */
  boardRect: BoardRect;
  features: PieceFeature[];
}

export interface PlannedBoard {
  id: string;
  placements: { pieceId: string; rect: BoardRect }[];
}

export interface PlanWarning {
  code: string;
  message: string;
  refs: string[];
}

export interface PlanStats {
  boards: number;
  packs: number;
  wastePct: number;
  areaInstalled: number;
  lb0: number;
  lb1: number;
  provenOptimal: boolean;
}

export interface Plan {
  boards: PlannedBoard[];
  pieces: PlannedPiece[];
  stats: PlanStats;
  warnings: PlanWarning[];
}
