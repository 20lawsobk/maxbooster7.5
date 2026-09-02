/**
 * LUA WORKER THREAD POOL
 *
 * Manages a pool of worker threads that execute Lua scripts without blocking
 * the main Node.js event loop.
 *
 * Why: wasmoon's doStringSync() is synchronous — it occupies the calling
 * thread until the script finishes.  In the main thread that means zero other
 * requests are served while a Lua script runs.  Moving execution to worker
 * threads gives every CPU core work to do and keeps the main event loop free
 * to accept and dispatch new HTTP connections.
 *
 * Caveats:
 *   • redis.call() inside Lua scripts is NOT supported in worker mode.
 *     Scripts that use redis.call() are transparently routed back to the
 *     main-thread runner (`store.runLuaSync()`).
 *   • Worker threads share no heap — the full Wasm binary is compiled once
 *     per worker (not per script).
 */

import { Worker } from "worker_threads";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import type { LuaRequest, LuaResponse } from "./lua-worker.js";

const POOL_SIZE = Math.min(Number(process.env["LUA_WORKER_THREADS"] ?? 2), 8);
const TIMEOUT_MS = 10_000; // kill Lua script if it runs > 10 s

// Resolve the worker file path in a way that works in both:
//   • Development (tsx / ESM): import.meta.url is a real file URL
//   • Production (esbuild CJS bundle): import.meta.url is undefined
//     → pool is silently disabled; EVAL falls back to the main-thread runner
function resolveWorkerFile(): string | null {
  try {
    const url = import.meta.url; // undefined in esbuild CJS output
    if (!url) return null;
    return path.join(path.dirname(fileURLToPath(url)), "lua-worker.ts");
  } catch {
    return null;
  }
}

const WORKER_FILE: string | null = resolveWorkerFile();

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PoolWorker {
  worker: Worker;
  pending: Map<string, PendingCall>;
  active: number;
}

class LuaPool {
  private workers: PoolWorker[] = [];
  private _started = false;

  start(): void {
    if (this._started) return;
    this._started = true;
    if (!WORKER_FILE) return; // production CJS: pool disabled, EVAL falls back to main thread
    for (let i = 0; i < POOL_SIZE; i++) {
      this._spawnWorker();
    }
  }

  private _spawnWorker(): void {
    if (!WORKER_FILE) return;
    // Pass --import tsx so the worker thread can load .ts files directly.
    const worker = new Worker(WORKER_FILE, { execArgv: ["--import", "tsx"] });
    const pw: PoolWorker = { worker, pending: new Map(), active: 0 };

    worker.on("message", (res: LuaResponse) => {
      const call = pw.pending.get(res.id);
      if (!call) return;
      pw.pending.delete(res.id);
      pw.active = Math.max(0, pw.active - 1);
      clearTimeout(call.timer);
      if (res.error) {
        call.reject(new Error(res.error));
      } else {
        call.resolve(res.result);
      }
    });

    worker.on("error", (err) => {
      for (const [, call] of pw.pending) {
        clearTimeout(call.timer);
        call.reject(
          new Error(
            `Lua worker error: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
      pw.pending.clear();
      pw.active = 0;
    });

    worker.on("exit", (code) => {
      // Respawn crashed workers
      const idx = this.workers.indexOf(pw);
      if (idx !== -1) {
        this.workers.splice(idx, 1);
        this._spawnWorker();
      }
    });

    this.workers.push(pw);
  }

  /**
   * Run a Lua script in the pool.  Rejects if the script uses redis.call()
   * (the caller should fall back to the main-thread runner in that case).
   */
  run(script: string, keys: string[], argv: string[]): Promise<unknown> {
    if (!this._started) this.start();

    // Pick the least-loaded worker
    const pw = this.workers.reduce(
      (best, w) => (w.active < best.active ? w : best),
      this.workers[0]!,
    );

    const id = randomUUID();
    const req: LuaRequest = { id, script, keys, argv };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pw.pending.delete(id);
        pw.active = Math.max(0, pw.active - 1);
        reject(new Error(`ERR Lua script timed out after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      pw.pending.set(id, { resolve, reject, timer });
      pw.active++;
      pw.worker.postMessage(req);
    });
  }

  /** True if the pool has started and workers are alive. */
  get isReady(): boolean {
    return this._started && this.workers.length > 0;
  }

  /** Count of scripts currently running across all workers. */
  get activeConcurrency(): number {
    return this.workers.reduce((sum, w) => sum + w.active, 0);
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((pw) => pw.worker.terminate()));
    this.workers = [];
    this._started = false;
  }
}

export const luaPool = new LuaPool();
