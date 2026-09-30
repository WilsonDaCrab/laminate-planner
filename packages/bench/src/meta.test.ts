import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject, saveProject } from '@lp/core';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from './cli';
import { writeMeta } from './meta';

const tmp = mkdtempSync(join(tmpdir(), 'lp-meta-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const source = readFileSync(
  fileURLToPath(new URL('../../../instances/rect/R1.json', import.meta.url)),
  'utf8',
);
const fresh = (name: string): string => {
  const file = join(tmp, name);
  writeFileSync(file, source);
  return file;
};
const metaOf = (file: string) => parseProject(JSON.parse(readFileSync(file, 'utf8'))).meta;

describe('writeMeta', () => {
  it('keeps the minimum bestKnown, writes knownOptimum only when proven, stays canonical', () => {
    const file = fresh('a.json');
    expect(writeMeta(file, 50, false)).toBe('bestKnown=50');
    expect(writeMeta(file, 52, false)).toBe('bestKnown=50');
    expect(metaOf(file)).toEqual({ bestKnown: 50, source: 'manual' });
    expect(writeMeta(file, 49, true)).toBe('knownOptimum=49');
    expect(metaOf(file)).toEqual({ knownOptimum: 49, bestKnown: 49, source: 'manual' });
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    expect(readFileSync(file, 'utf8')).toBe(saveProject(parseProject(raw)));
  });

  it('refuses a proven value that contradicts the stored optimum', () => {
    const file = fresh('b.json');
    writeMeta(file, 49, true);
    expect(() => writeMeta(file, 48, true)).toThrow(/contradicts/);
  });
});

describe('bench bestknown', () => {
  it('writes bestKnown into the file, skips instances with a knownOptimum unless --force', () => {
    const file = fresh('c.json');
    const lines: string[] = [];
    const log = (l: string): void => void lines.push(l);
    expect(main(['bestknown', file, '--seeds', '1', '--iters', '300', '--write-meta'], log)).toBe(
      0,
    );
    const best = metaOf(file)?.bestKnown;
    expect(best).toBeGreaterThan(0);
    expect(lines.some((l) => /-> (knownOptimum|bestKnown)=/.test(l))).toBe(true);

    writeMeta(file, best!, true);
    lines.length = 0;
    main(['bestknown', file, '--seeds', '1', '--iters', '300'], log);
    expect(lines.join('\n')).toContain('skipped');
  });
});
