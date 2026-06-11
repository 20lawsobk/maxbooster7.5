import { Worker } from "worker_threads";
import path from "path";
import os from "os";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import { logger } from "../logger.js";

// Resolve worker path for both dev (tsx/source) and prod (esbuild/dist) environments
function resolveWorkerPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "server/workers/tfWorkerThread.cjs"),
    path.join(cwd, "dist/workers/tfWorkerThread.cjs"),
    path.join(cwd, "dist/workers/tfWorkerThread.js"),
  ];
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

// Worker pool sizing for @tensorflow/tfjs (pure-JS CPU backend).
// Unlike tfjs-node (which needed ~2.5 GB/worker for native ops), the pure-JS
// backend uses ~150-300 MB per worker.  We cap at 2 workers at startup:
//   • No trained models exist at cold-start ("idle until models are trained").
//   • CPU-bound JS inference doesn't scale linearly beyond 2 workers on the
//     same core set — additional workers just thrash the event loop.
//   • Keeps startup memory lean; the pool can be enlarged at runtime if needed.
const DEFAULT_POOL_SIZE = Math.min(2, Math.max(1, os.cpus().length - 2));

// Reject inference requests when the pending queue exceeds this depth.
// Prevents unbounded memory growth under sustained AI load.
const MAX_QUEUE_DEPTH = 500;

class TensorFlowWorkerPool {
  private workers: WorkerState[] = [];
  private queue: InferenceRequest[] = [];
  private pendingRequests = new Map<string, InferenceRequest>();
  private initialized = false;
  private readonly poolSize: number;

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? DEFAULT_POOL_SIZE;
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const workerPath = resolveWorkerPath();

    // Guard: if the worker file doesn't exist at any candidate path, skip gracefully.
    // Without this guard, all poolSize worker threads are spawned and each fails with
    // "Cannot find module" — the first rejection collapses Promise.all but the
    // remaining N-1 rejections become UnhandledPromiseRejections that crash the
    // cluster worker process (Node.js 18+, exit code 1).
    if (!existsSync(workerPath)) {
      logger.warn(
        `[TFWorkerPool] Worker file not found (checked: server/workers, dist/workers) — falling back to in-process inference`,
      );
      return;
    }

    const startWorker = (index: number): Promise<WorkerState> =>
      new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        const state: WorkerState = { worker, busy: false };

        const timeout = setTimeout(
          () => reject(new Error(`TF worker ${index} init timeout`)),
          15000,
        );

        worker.once("message", (msg: Record<string, unknown>) => {
          if (msg.ready) {
            clearTimeout(timeout);
            logger.info(
              `[TFWorkerPool] Worker ${index + 1}/${this.poolSize} ready`,
            );
            resolve(state);
          }
        });

        worker.on("message", (msg: Record<string, unknown>) => {
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

        worker.on("error", (err) => {
          logger.warn(`[TFWorkerPool] Worker ${index} error: ${err.message}`);
          clearTimeout(timeout);
          reject(err);
          for (const [id, req] of this.pendingRequests) {
            req.reject(err);
            this.pendingRequests.delete(id);
          }
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            logger.warn(
              `[TFWorkerPool] Worker ${index} exited with code ${code}`,
            );
          }
        });
      });

    try {
      this.workers = await Promise.all(
        Array.from({ length: this.poolSize }, (_, i) => startWorker(i)),
      );
      this.initialized = true;
      logger.info(
        `✅ [TFWorkerPool] ${this.poolSize} TensorFlow inference worker(s) ready — event loop isolated`,
      );
    } catch (err) {
      logger.warn(
        `[TFWorkerPool] Could not initialize worker pool: ${err.message} — falling back to in-process inference`,
      );
    }
  }

  /**
   * Load a model into every worker in the pool. Each worker independently
   * deserializes the weights from disk so inference runs fully in-thread.
   */
  loadModel(modelId: string, modelPath: string): Promise<void> {
    if (!this.initialized || this.workers.length === 0) {
      return Promise.reject(
        new Error("[TFWorkerPool] Pool not initialized — cannot load model"),
      );
    }

    return new Promise<void>((resolve, reject) => {
      const id = `load-${Date.now()}-${randomBytes(4).toString("hex")}`;
      let settled = 0;
      let failed = 0;
      const total = this.workers.length;

      const onResponse = (msg: Record<string, unknown>) => {
        if (msg.type !== "load" || msg.modelId !== modelId || msg.id !== id)
          return;

        if (msg.error) {
          failed++;
          logger.warn(
            `[TFWorkerPool] Worker failed to load model ${modelId}: ${msg.error}`,
          );
        } else {
          logger.info(`[TFWorkerPool] Worker loaded model ${modelId}`);
        }

        settled++;
        if (settled === total) {
          this.workers.forEach((ws) => ws.worker.off("message", onResponse));
          if (failed === total) {
            reject(new Error(`All workers failed to load model ${modelId}`));
          } else {
            resolve();
          }
        }
      };

      this.workers.forEach((ws) => {
        ws.worker.on("message", onResponse);
        ws.worker.postMessage({ id, type: "load", modelId, modelPath });
      });
    });
  }

  /**
   * Load all models that have a filePath persisted in the MLModelRegistry.
   * Called once after pool initialization so workers can serve real inference.
   */
  async loadAllModels(registry: {
    listModels: (
      f?: Record<string, unknown>,
    ) => Promise<Array<{ id: string; filePath?: string }>>;
  }): Promise<void> {
    let models: Array<{ id: string; filePath?: string }> = [];
    try {
      models = await registry.listModels();
    } catch (err) {
      logger.warn(
        `[TFWorkerPool] Could not list models from registry: ${err.message}`,
      );
      return;
    }

    const withPath = models.filter((m) => m.filePath);
    if (withPath.length === 0) {
      logger.info(
        "[TFWorkerPool] No persisted models found in registry — workers idle until models are trained",
      );
      return;
    }

    logger.info(
      `[TFWorkerPool] Loading ${withPath.length} model(s) into worker pool…`,
    );
    const results = await Promise.allSettled(
      withPath.map((m) => this.loadModel(m.id, `${m.filePath}/model.json`)),
    );

    const loaded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    logger.info(
      `✅ [TFWorkerPool] Models loaded into workers — success: ${loaded}, failed: ${failed}`,
    );
  }

  infer(
    modelId: string,
    inputData: number[],
    inputShape: number[],
  ): Promise<number[]> {
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      return Promise.reject(
        new Error(
          `TF inference queue full (depth=${this.queue.length}/${MAX_QUEUE_DEPTH}). ` +
            `Server is under heavy AI load — retry after a brief pause.`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
      const req: InferenceRequest = {
        id,
        modelId,
        inputData,
        inputShape,
        resolve,
        reject,
      };
      this.queue.push(req);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;
    const idle = this.workers.find((w) => !w.busy);
    if (!idle) return;

    const req = this.queue.shift()!;
    idle.busy = true;
    this.pendingRequests.set(req.id, req);

    idle.worker.postMessage({
      id: req.id,
      type: "predict",
      modelId: req.modelId,
      inputData: req.inputData,
      inputShape: req.inputShape,
    });
  }

  isReady(): boolean {
    return this.initialized && this.workers.length > 0;
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
    this.workers = [];
    this.initialized = false;
  }
}

export const tfWorkerPool = new TensorFlowWorkerPool();

export default tfWorkerPool;
