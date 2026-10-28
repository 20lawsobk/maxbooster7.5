__vite_ssr_exportName__("luaPool", () => { try { return luaPool } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("worker_threads", {"importedNames":["Worker"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("crypto", {"importedNames":["randomUUID"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("url", {"importedNames":["fileURLToPath"]});
const __vite_ssr_import_3__ = await __vite_ssr_import__("path", {"importedNames":["default"]});
"use strict";




const POOL_SIZE = Math.min(Number(process.env["LUA_WORKER_THREADS"] ?? 2), 8);
const TIMEOUT_MS = 1e4;
function resolveWorkerFile() {
  try {
    const url = __vite_ssr_import_meta__.url;
    if (!url) return null;
    return __vite_ssr_import_3__.default.join(__vite_ssr_import_3__.default.dirname((0,__vite_ssr_import_2__.fileURLToPath)(url)), "lua-worker.ts");
  } catch {
    return null;
  }
}
const WORKER_FILE = resolveWorkerFile();
class LuaPool {
  workers = [];
  _started = false;
  start() {
    if (this._started) return;
    this._started = true;
    if (!WORKER_FILE) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      this._spawnWorker();
    }
  }
  _spawnWorker() {
    if (!WORKER_FILE) return;
    const worker = new __vite_ssr_import_0__.Worker(WORKER_FILE, { execArgv: ["--import", "tsx"] });
    const pw = { worker, pending: /* @__PURE__ */ new Map(), active: 0 };
    worker.on("message", (res) => {
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
            `Lua worker error: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      };
      pw.pending.clear();
      pw.active = 0;
    });
    worker.on("exit", () => {
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
  run(script, keys, argv) {
    if (!this._started) this.start();
    const pw = this.workers.reduce(
      (best, w) => w.active < best.active ? w : best,
      this.workers[0]
    );
    const id = (0,__vite_ssr_import_1__.randomUUID)();
    const req = { id, script, keys, argv };
    return new Promise((resolve, reject) => {
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
  get isReady() {
    return this._started && this.workers.length > 0;
  }
  /** Count of scripts currently running across all workers. */
  get activeConcurrency() {
    return this.workers.reduce((sum, w) => sum + w.active, 0);
  }
  async shutdown() {
    await Promise.all(this.workers.map((pw) => pw.worker.terminate()));
    this.workers = [];
    this._started = false;
  }
}
const luaPool = new LuaPool();
