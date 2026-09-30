// Bootstrap of a pool worker: registers the tsx loader, then loads the TypeScript worker.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
