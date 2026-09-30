/**
 * Ways to execute a list of jobs, both delivering every finished row to `onRow` on the calling
 * thread (so a single writer appends to the JSONL files):
 *  - `executeSequential`: in this thread (tests, `--jobs 1`; the wall times are the cleanest);
 *  - `executePool`: `threads` worker threads fed from one queue (results are identical per seed,
 *    the wall times are noisier because the runs share the machine).
 */

import { Worker } from 'node:worker_threads';
import type { InstanceInfo, Job } from './protocol';
import { runJob, type RawRow } from './runJob';

export type Execute = (
  jobs: readonly Job[],
  instances: readonly InstanceInfo[],
  onRow: (row: RawRow) => void,
) => Promise<void>;

export const executeSequential: Execute = async (jobs, instances, onRow) => {
  const byId = new Map(instances.map((i) => [i.id, i]));
  for (const job of jobs) {
    const instance = byId.get(job.instance);
    if (!instance) throw new Error(`unknown instance ${job.instance}`);
    onRow(runJob(job, instance));
  }
};

/** `root` is the directory the workers load the instances from (workers cannot share objects). */
export function executePool(threads: number, root: string): Execute {
  return async (jobs, _instances, onRow) => {
    if (jobs.length === 0) return;
    const count = Math.max(1, Math.min(threads, jobs.length));
    const workers = Array.from(
      { length: count },
      () => new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { root } }),
    );
    let next = 0;
    let open = count;
    let finished = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const feed = (w: Worker): void => {
          if (next >= jobs.length) {
            if (--open === 0) {
              finished = true;
              resolve();
            }
            return;
          }
          const id = next++;
          w.postMessage({ id, job: jobs[id] });
        };
        for (const w of workers) {
          w.on('message', (msg: { id: number; row?: RawRow; error?: string }) => {
            if (msg.error !== undefined || !msg.row) {
              reject(new Error(`job ${msg.id} failed: ${msg.error}`));
              return;
            }
            onRow(msg.row);
            feed(w);
          });
          w.on('error', reject);
          // A worker that ends without a message or an error (process.exit, out of memory)
          // would leave the queue waiting for ever.
          w.on('exit', (code) => {
            if (!finished)
              reject(new Error(`a worker exited with code ${code} before the queue was done`));
          });
          feed(w);
        }
      });
    } finally {
      await Promise.all(workers.map((w) => w.terminate()));
    }
  };
}
