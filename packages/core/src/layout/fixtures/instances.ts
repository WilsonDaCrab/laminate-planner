/**
 * The JSON test rooms of `instances/` (ALGORITHM §13.1), imported as data so that tests need no
 * file-system access (the core has no Node types). New instances are added here.
 */

import C1 from '../../../../../instances/curved/C1.json';
import C2 from '../../../../../instances/curved/C2.json';
import C3 from '../../../../../instances/curved/C3.json';
import R3 from '../../../../../instances/rect/R3.json';
import R4 from '../../../../../instances/rect/R4.json';
import L2 from '../../../../../instances/lshape/L2.json';
import L3 from '../../../../../instances/lshape/L3.json';
import S3 from '../../../../../instances/slanted/S3.json';
import S4 from '../../../../../instances/slanted/S4.json';
import O1 from '../../../../../instances/obstacles/O1.json';
import O2 from '../../../../../instances/obstacles/O2.json';
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
  group: 'rect' | 'lshape' | 'slanted' | 'curved' | 'obstacles' | 'tiny';
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
  { id: 'C3', group: 'curved', raw: C3 },
  { id: 'R3', group: 'rect', raw: R3 },
  { id: 'R4', group: 'rect', raw: R4 },
  { id: 'L2', group: 'lshape', raw: L2 },
  { id: 'L3', group: 'lshape', raw: L3 },
  { id: 'S3', group: 'slanted', raw: S3 },
  { id: 'S4', group: 'slanted', raw: S4 },
  { id: 'O1', group: 'obstacles', raw: O1 },
  { id: 'O2', group: 'obstacles', raw: O2 },
  { id: 'T1', group: 'tiny', raw: T1 },
  { id: 'T2', group: 'tiny', raw: T2 },
  { id: 'T3', group: 'tiny', raw: T3 },
  { id: 'T4', group: 'tiny', raw: T4 },
];
