/**
 * Worker thread of the pool (`execute.ts`): loads the instances once, then answers every
 * `{ id, job }` message with `{ id, row }` (or `{ id, error }`).
 */

import { parentPort, workerData } from 'node:worker_threads';
import { loadInstances } from './instances';
import type { Job } from './protocol';
import { runJob } from './runJob';

const instances = new Map(
  loadInstances((workerData as { root: string }).root).map((i) => [i.id, i]),
);

parentPort!.on('message', (msg: { id: number; job: Job }) => {
  try {
    const instance = instances.get(msg.job.instance);
    if (!instance) throw new Error(`unknown instance ${msg.job.instance}`);
    parentPort!.postMessage({ id: msg.id, row: runJob(msg.job, instance) });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) });
  }
});
