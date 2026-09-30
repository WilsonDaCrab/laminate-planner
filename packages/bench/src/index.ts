import { mainAsync } from './cli';

// `pnpm -F @lp/bench` runs in the package directory; paths on the command line are relative to
// where the user invoked pnpm.
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD);
process.exitCode = await mainAsync(process.argv.slice(2));
