/**
 * PARALLEL BLOCK COMPRESSOR
 *
 * Honest naming note: this is real CPU-core parallelism via Node
 * `worker_threads`, sized from the host's actual CPU/memory capacity via
 * the shared `computeWorkerSizing()` convention (server/computeSizing.ts) —
 * the same source cluster.ts and the MaxCore supervisor use. It is not a
 * GPU: there is no GPU in this container, and nothing here claims one.
 * What it genuinely provides is the thing "GPU-parallel" was really asking
 * for — splitting one large object into independent blocks and compressing
 * them across every available CPU core instead of one, which is a real
 * throughput win on this host's real hardware.
 *
 * Used only for inputs above BLOCK_PARALLEL_THRESHOLD; smaller payloads go
 * through the single-shot codec path (better ratio, no thread-dispatch
 * overhead, and access to real trained zstd dictionaries — the worker path
 * intentionally uses plain Brotli per block, see blockCompressor.cjs, to
 * keep the worker dependency-free).
 */
import { Worker } from "worker_threads";
import path from "path";
import { existsSync } from "fs";
import { randomBytes } from "crypto";
import { logger } from "../../../logger.js";
import { computeWorkerSizing } from "../../../computeSizing.js";

export const BLOCK_PARALLEL_THRESHOLD = 16 * 1024 * 1024; // 16 MB
const TARGET_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MB per block
const MAX_QUEUE_DEPTH = 200;
const INIT_TIMEOUT_MS = 15000;
const PER_BLOCK_TIMEOUT_MS = 60000;

function resolveWorkerPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "server/workers/blockCompressor.cjs"),
    path.join(cwd, "dist/workers/blockCompressor.cjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

interface PendingJob {
  resolve: (buf: Buffer) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
}

class ParallelBlockCompressorPool {
  private workers: WorkerState[] = [];
  private queue: Array<{
    type: "compress" | "decompress";
    data: Buffer;
    resolve: (buf: Buffer) => void;
    reject: (err: Error) => void;
  }> = [];
  private pending = new Map<string, PendingJob>();
  private initPromise: Promise<void> | null = null;
  private available = false;

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    const workerPath = resolveWorkerPath();
    if (!existsSync(workerPath)) {
      logger.warn(
        "[ParallelBlockCompressor] Worker file not found — block-parallel compression disabled, falling back to single-shot codec path",
      );
      return;
    }

    const { workerCount } = computeWorkerSizing({
      memPerWorkerGB: 0.25,
      maxWorkers: 8,
    });
    const poolSize = Math.max(1, workerCount);

    const startWorker = (index: number): Promise<WorkerState> =>
      new Promise((resolve, reject) => {
        const worker = new Worker(workerPath);
        const state: WorkerState = { worker, busy: false };

        const timeout = setTimeout(
          () => reject(new Error(`Block compressor worker ${index} init timeout`)),
          INIT_TIMEOUT_MS,
        );

        worker.once("message", (msg: Record<string, unknown>) => {
          if (msg?.ready) {
            clearTimeout(timeout);
            resolve(state);
          }
        });

        worker.on("message", (msg: { id?: string; result?: Buffer; error?: string }) => {
          if ((msg as any)?.ready) return;
          const job = msg.id ? this.pending.get(msg.id) : undefined;
          if (!job) return;
          clearTimeout(job.timeout);
          this.pending.delete(msg.id!);
          state.busy = false;
          if (msg.error) job.reject(new Error(msg.error));
          else job.resolve(Buffer.from(msg.result as unknown as Uint8Array));
          this.dispatch();
        });

        worker.on("error", (err: Error) => {
          clearTimeout(timeout);
          reject(err);
          for (const [id, job] of this.pending) {
            clearTimeout(job.timeout);
            job.reject(err);
            this.pending.delete(id);
          }
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            logger.warn(`[ParallelBlockCompressor] Worker ${index} exited with code ${code}`);
          }
        });
      });

    try {
      this.workers = await Promise.all(
        Array.from({ length: poolSize }, (_, i) => startWorker(i)),
      );
      this.available = true;
      logger.info(
        `[ParallelBlockCompressor] ${poolSize} worker(s) ready for CPU-core-parallel block compression`,
      );
    } catch (err) {
      logger.warn(
        `[ParallelBlockCompressor] Could not initialize worker pool: ${(err as Error).message} — falling back to single-shot codec path`,
      );
      this.available = false;
    }
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;
    const idleWorker = this.workers.find((w) => !w.busy);
    if (!idleWorker) return;

    const job = this.queue.shift()!;
    idleWorker.busy = true;
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;

    const timeout = setTimeout(() => {
      this.pending.delete(id);
      idleWorker.busy = false;
      job.reject(new Error(`Block ${job.type} timed out after ${PER_BLOCK_TIMEOUT_MS}ms`));
      this.dispatch();
    }, PER_BLOCK_TIMEOUT_MS);

    this.pending.set(id, { resolve: job.resolve, reject: job.reject, timeout });
    idleWorker.worker.postMessage({ id, type: job.type, data: job.data });
  }

  private runJob(type: "compress" | "decompress", data: Buffer): Promise<Buffer> {
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      return Promise.reject(
        new Error(
          `Block compressor queue full (${this.queue.length}/${MAX_QUEUE_DEPTH})`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ type, data, resolve, reject });
      this.dispatch();
    });
  }

  /** True once the pool has finished attempting init and workers came up. */
  async isAvailable(): Promise<boolean> {
    await this.ensureInitialized();
    return this.available;
  }

  /** Splits data into fixed-size blocks and compresses each in parallel.
   *  Returns the compressed blocks and their original (pre-compression)
   *  sizes so the caller can build the container header's block map. */
  async compressBlocks(
    data: Buffer,
  ): Promise<{ blocks: Buffer[]; blockSizes: number[] }> {
    await this.ensureInitialized();
    if (!this.available) {
      throw new Error("Block compressor pool not available");
    }

    const blockSizes: number[] = [];
    const rawBlocks: Buffer[] = [];
    for (let offset = 0; offset < data.length; offset += TARGET_BLOCK_SIZE) {
      const block = data.subarray(offset, Math.min(offset + TARGET_BLOCK_SIZE, data.length));
      rawBlocks.push(block);
      blockSizes.push(block.length);
    }

    const blocks = await Promise.all(rawBlocks.map((b) => this.runJob("compress", b)));
    return { blocks, blockSizes };
  }

  /** Reverses compressBlocks: given the compressed blocks, decompresses
   *  each in parallel and concatenates back into the original buffer. */
  async decompressBlocks(blocks: Buffer[]): Promise<Buffer> {
    await this.ensureInitialized();
    if (!this.available) {
      throw new Error("Block compressor pool not available");
    }
    const decompressed = await Promise.all(
      blocks.map((b) => this.runJob("decompress", b)),
    );
    return Buffer.concat(decompressed);
  }
}

export const parallelBlockCompressor = new ParallelBlockCompressorPool();
