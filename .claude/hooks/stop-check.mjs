#!/usr/bin/env node
// Claude Code Stop hook: keeps Claude from finishing a turn while
// `pnpm typecheck`, `pnpm lint` or `pnpm test` fail.
//
// - Runs only when source files have uncommitted changes (plain Q&A turns stay cheap).
// - Skips silently before F0 (no package.json) and in plan mode.
// - Blocks at most MAX_CONSECUTIVE_BLOCKS times in a row per session, then lets
//   Claude stop and warns the user, so it can never loop forever.
// - Exit code 2 + stderr = "don't stop yet, here is why" (fed back to Claude).

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_CONSECUTIVE_BLOCKS = 3;
const TAIL_LINES = 60;
const CHECKS = ['typecheck', 'lint', 'test'];
const SOURCE_FILE = /\.(ts|tsx|js|mjs|cjs|json)$/;

function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

const input = readInput();
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

if (input.permission_mode === 'plan') process.exit(0);

const pkg = readJson(join(root, 'package.json'));
if (!pkg) process.exit(0); // project not scaffolded yet (before F0)
const checks = CHECKS.filter((name) => pkg.scripts && pkg.scripts[name]);
if (checks.length === 0) process.exit(0);

function hasSourceChanges() {
  const r = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', 'packages', 'apps', 'package.json', 'pnpm-lock.yaml', 'eslint.config.js', 'tsconfig.base.json'],
    { cwd: root, encoding: 'utf8' },
  );
  if (r.error || r.status !== 0) return true; // not a git repo → check anyway
  return r.stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .some((file) => SOURCE_FILE.test(file));
}

if (!hasSourceChanges()) process.exit(0);

const sessionId = String(input.session_id ?? 'default').replace(/[^\w-]/g, '');
const counterFile = join(tmpdir(), `lp-stop-check-${sessionId}.json`);
const blocksSoFar = Number(readJson(counterFile)?.count) || 0;

for (const name of checks) {
  // A single command string with shell:true works for pnpm/pnpm.cmd on every OS.
  // `pnpm -s` is not a silent flag in pnpm 12, so use `pnpm run`.
  const r = spawnSync(`pnpm run ${name}`, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (r.error) {
    // pnpm not available — don't block, just tell the user.
    process.stdout.write(
      JSON.stringify({ systemMessage: `Stop hook: neizdevās palaist "pnpm ${name}" (${r.error.message}).` }),
    );
    process.exit(0);
  }

  if (r.status !== 0) {
    const tail = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-TAIL_LINES).join('\n');
    const attempt = blocksSoFar + 1;

    if (attempt > MAX_CONSECUTIVE_BLOCKS) {
      rmSync(counterFile, { force: true });
      process.stdout.write(
        JSON.stringify({
          systemMessage:
            `Stop hook: "pnpm ${name}" joprojām neizdodas pēc ${MAX_CONSECUTIVE_BLOCKS} mēģinājumiem. ` +
            'Claude drīkst apstāties — pārbaudi kļūdas pats vai dod norādījumus.',
        }),
      );
      process.exit(0);
    }

    writeFileSync(counterFile, JSON.stringify({ count: attempt }));
    process.stderr.write(
      `"pnpm ${name}" neizdodas (mēģinājums ${attempt}/${MAX_CONSECUTIVE_BLOCKS}). ` +
        'Izlabo kļūdas, pirms pabeidz. Nemaini testu gaidītās vērtības tikai tāpēc, lai tie izietu. ' +
        'Ja kļūda nav saistīta ar tavām izmaiņām, paskaidro to lietotājam.\n' +
        `Pēdējās ${TAIL_LINES} izvades rindas:\n${tail}\n`,
    );
    process.exit(2);
  }
}

rmSync(counterFile, { force: true });
process.exit(0);
