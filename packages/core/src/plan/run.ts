/**
 * The one place that decides how labelled pieces become boards, shared by `buildPlan` and
 * `evaluate`: their board counts agree by construction (CLAUDE.md rule 5).
 */

import type { LabelledPiece, PlanContext } from './context';
import { decode, decodeSequential, type DecodeResult } from './decode';
import { layingOrder } from './onsite';

export type DecodeMode = 'precut' | 'onsite';

export function decodeLabelled(
  ctx: PlanContext,
  pieces: readonly LabelledPiece[],
  mode: DecodeMode,
): DecodeResult {
  if (mode === 'onsite') {
    return decodeSequential(
      layingOrder(pieces, ctx).map((p) => p.decode),
      ctx.decodeParams,
    );
  }
  return decode(
    pieces.map((p) => p.decode),
    ctx.decodeParams,
  );
}
