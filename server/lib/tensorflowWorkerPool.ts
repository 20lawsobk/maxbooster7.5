import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';

// Resolve worker path for both dev (tsx/source) and prod (esbuild/dist) environments
function resolveWorkerPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'server/workers/tfWorkerThread.cjs'),
    path.join(cwd, 'dist/workers/tfWorkerThread.cjs'),
    path.join(cwd, 'dist/workers/tfWorkerThread.js'),
  ];
  const { existsSync } = require('fs');
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

interface InferenceRequest {
  id: string;
  modelId: string;
  inputData: number[];
  inputShape: number[];
  resolve: (result: number[]) => void;
  reject: (err: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
}

class TensorFlowWorkerPool {
  private workers: WorkerState[] = [];
  private queue: InferenceRequest[] = [];
  private pendingRequests = new Map<string, InferenceRequest>();
  private initialized = false;
  private readonly poolSize: number;

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? Math.max(1, Math.min(os.cpus().length - 1, 4));
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const workerPath = resolveWorkerPath();

    const startWorker = (index: number): Promise<WorkerState> =>
      new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        const state: WorkerState = { worker, busy: false };

        const timeout = setTimeout(() => reject(new Error(`TF worker ${index} init timeout`)), 15000);

        worker.once('message', (msg: any) => {
          if (msg.ready) {
            clearTimeout(timeout);
            logger.info(`[TFWorkerPool] Worker ${index + 1}/${this.poolSize} ready`);
            resolve(state);
          }
        });

        worker.on('message', (msg: any) => {
          if (msg.ready) return;
          const req = this.pendingRequests.get(msg.id);
          if (!req) return;
          this.pendingRequests.delete(msg.id);
          state.busy = false;

          if (msg.error) {
            req.reject(new Error(msg.error));
          } else {
            req.resolve(msg.result as number[]);
          }

          this.dispatch();
        });

        worker.on('error', (err) => {
          logger.error(`[TFWorkerPool] Worker ${index} error: ${err.message}`);
          clearTimeout(timeout);
          reject(err);
          for (const [id, req] of this.pendingRequests) {
            req.reject(err);
            this.pendingRequests.delete(id);
          }
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            logger.warn(`[TFWorkerPool] Worker ${index} exited with code ${code}`);
          }
        });
      });

    try {
      this.workers = await Promise.all(
        Array.from({ length: this.poolSize }, (_, i) => startWorker(i))
      );
      this.initialized = true;
      logger.info(`✅ [TFWorkerPool] ${this.poolSize} TensorFlow inference worker(s) ready — event loop isolated`);
    } catch (err: any) {
      logger.warn(`[TFWorkerPool] Could not initialize worker pool: ${err.message} — falling back to in-process inference`);
    }
  }

  infer(modelId: string, inputData: number[], inputShape: number[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const req: InferenceRequest = { id, modelId, inputData, inputShape, resolve, reject };
      this.queue.push(req);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;
    const idle = this.workers.find(w => !w.busy);
    if (!idle) return;

    const req = this.queue.shift()!;
    idle.busy = true;
    this.pendingRequests.set(req.id, req);

    idle.worker.postMessage({
      id: req.id,
      type: 'predict',
      modelId: req.modelId,
      inputData: req.inputData,
      inputShape: req.inputShape,
    });
  }

  isReady(): boolean {
    return this.initialized && this.workers.length > 0;
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map(w => w.worker.terminate()));
    this.workers = [];
    this.initialized = false;
  }
}

export const tfWorkerPool = new TensorFlowWorkerPool();

export default tfWorkerPool;
