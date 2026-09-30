import { readFileSync, renameSync, writeFileSync } from 'node:fs';

/** Records a result (exhaustive or long SA run) in the instance's `meta`: knownOptimum only when proven (B = LB, the larger of LB0 and LB1). */
export function writeMeta(file: string, B: number, proven: boolean): string {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { meta?: Record<string, unknown> };
  const meta = raw.meta ?? { source: 'manual' };
  if (proven) {
    if (typeof meta.knownOptimum === 'number' && meta.knownOptimum !== B) {
      throw new Error(
        `${file}: meta.knownOptimum ${meta.knownOptimum} contradicts proven B = ${B}`,
      );
    }
    meta.knownOptimum = B;
  }
  const previous = typeof meta.bestKnown === 'number' ? meta.bestKnown : Infinity;
  meta.bestKnown = Math.min(previous, B);
  // Canonical key order of the model schema (a saved project must reproduce the file).
  const { knownOptimum, bestKnown, source, ...rest } = meta;
  raw.meta = { knownOptimum, bestKnown, source, ...rest };
  // Write-then-rename: a reader (`bench all` loads the instances) never sees a half-written file.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`);
  renameSync(tmp, file);
  return proven ? `knownOptimum=${B}` : `bestKnown=${meta.bestKnown}`;
}
