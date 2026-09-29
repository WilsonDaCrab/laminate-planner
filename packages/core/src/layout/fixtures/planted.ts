/**
 * The planted instances of `instances/planted/` (ALGORITHM §12.2, ADR-015): `meta.knownOptimum`
 * equals LB1, so B = knownOptimum is a proven optimum. Kept apart from `instanceFiles`, whose
 * tests carry hand-computed expectations per room.
 */

import P1 from '../../../../../instances/planted/P1.json';
import P2 from '../../../../../instances/planted/P2.json';
import P3 from '../../../../../instances/planted/P3.json';
import P4 from '../../../../../instances/planted/P4.json';

export interface PlantedFile {
  id: string;
  /** Raw JSON as stored in the file (untrusted: pass through `parseProject`). */
  raw: unknown;
}

export const plantedFiles: PlantedFile[] = [
  { id: 'P1', raw: P1 },
  { id: 'P2', raw: P2 },
  { id: 'P3', raw: P3 },
  { id: 'P4', raw: P4 },
];
