/**
 * The JSON test rooms of `instances/` (ALGORITHM §13.1), imported as data so that tests need no
 * file-system access (the core has no Node types). New instances are added here.
 */

import C1 from '../../../../../instances/curved/C1.json';
import C2 from '../../../../../instances/curved/C2.json';
import L1 from '../../../../../instances/lshape/L1.json';
import U1 from '../../../../../instances/lshape/U1.json';
import R1 from '../../../../../instances/rect/R1.json';
import R2 from '../../../../../instances/rect/R2.json';
import S1 from '../../../../../instances/slanted/S1.json';
import S2 from '../../../../../instances/slanted/S2.json';
import T1 from '../../../../../instances/tiny/T1.json';
import T2 from '../../../../../instances/tiny/T2.json';
import T3 from '../../../../../instances/tiny/T3.json';
import T4 from '../../../../../instances/tiny/T4.json';

export interface InstanceFile {
  id: string;
  group: 'rect' | 'lshape' | 'slanted' | 'curved' | 'tiny';
  /** Raw JSON as stored in the file (untrusted: pass through `parseProject`). */
  raw: unknown;
}

export const instanceFiles: InstanceFile[] = [
  { id: 'R1', group: 'rect', raw: R1 },
  { id: 'R2', group: 'rect', raw: R2 },
  { id: 'L1', group: 'lshape', raw: L1 },
  { id: 'U1', group: 'lshape', raw: U1 },
  { id: 'S1', group: 'slanted', raw: S1 },
  { id: 'S2', group: 'slanted', raw: S2 },
  { id: 'C1', group: 'curved', raw: C1 },
  { id: 'C2', group: 'curved', raw: C2 },
  { id: 'T1', group: 'tiny', raw: T1 },
  { id: 'T2', group: 'tiny', raw: T2 },
  { id: 'T3', group: 'tiny', raw: T3 },
  { id: 'T4', group: 'tiny', raw: T4 },
];
