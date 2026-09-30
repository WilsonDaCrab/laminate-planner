/** The machine and the code a result set comes from (ALGORITHM §13.2: CPU, Node version, commit). */

import { execFileSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';

export interface EnvInfo {
  cpu: string;
  cores: number;
  memoryGB: number;
  node: string;
  platform: string;
  /** `git rev-parse HEAD`, or null outside a repository. */
  commit: string | null;
  /** Uncommitted changes in the working tree when the run started. */
  dirty: boolean | null;
  startedAt: string;
}

const git = (...args: string[]): string | null => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

export function readEnv(now: Date = new Date()): EnvInfo {
  const status = git('status', '--porcelain');
  return {
    cpu: cpus()[0]?.model.trim() ?? 'unknown',
    cores: cpus().length,
    memoryGB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    commit: git('rev-parse', 'HEAD'),
    dirty: status === null ? null : status.length > 0,
    startedAt: now.toISOString(),
  };
}
