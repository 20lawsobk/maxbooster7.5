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
//# sourceURL=/workspace/maxbooster7.5/external/pdim/artifacts/api-server/src/workers/lua-pool.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,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QUFRLE9BQU8sRUFBRTtBQUNwQixXQUFHLFNBQVMsS0FBSyxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUM7QUFDckMsZUFBTyxJQUFJLE1BQU0sa0NBQWtDLFVBQVUsSUFBSSxDQUFDO0FBQUEsTUFDcEUsR0FBRyxVQUFVO0FBRWIsU0FBRyxRQUFRLElBQUksSUFBSSxFQUFFLFNBQVMsUUFBUSxNQUFNLENBQUM7QUFDN0MsU0FBRztBQUNILFNBQUcsT0FBTyxZQUFZLEdBQUc7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUEsRUFHQSxJQUFJLFVBQW1CO0FBQ3JCLFdBQU8sS0FBSyxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQUEsRUFDaEQ7QUFBQTtBQUFBLEVBR0EsSUFBSSxvQkFBNEI7QUFDOUIsV0FBTyxLQUFLLFFBQVEsT0FBTyxDQUFDLEtBQUssTUFBTSxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLE1BQU0sV0FBMEI7QUFDOUIsVUFBTSxRQUFRLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxVQUFVLENBQUMsQ0FBQztBQUNqRSxTQUFLLFVBQVUsQ0FBQztBQUNoQixTQUFLLFdBQVc7QUFBQSxFQUNsQjtBQUNGO0FBRU8sTUFBTSxVQUFVLElBQUksUUFBUSIsIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZXMiOlsibHVhLXBvb2wudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMVUEgV09SS0VSIFRIUkVBRCBQT09MXG4gKlxuICogTWFuYWdlcyBhIHBvb2wgb2Ygd29ya2VyIHRocmVhZHMgdGhhdCBleGVjdXRlIEx1YSBzY3JpcHRzIHdpdGhvdXQgYmxvY2tpbmdcbiAqIHRoZSBtYWluIE5vZGUuanMgZXZlbnQgbG9vcC5cbiAqXG4gKiBXaHk6IHdhc21vb24ncyBkb1N0cmluZ1N5bmMoKSBpcyBzeW5jaHJvbm91cyDigJQgaXQgb2NjdXBpZXMgdGhlIGNhbGxpbmdcbiAqIHRocmVhZCB1bnRpbCB0aGUgc2NyaXB0IGZpbmlzaGVzLiAgSW4gdGhlIG1haW4gdGhyZWFkIHRoYXQgbWVhbnMgemVybyBvdGhlclxuICogcmVxdWVzdHMgYXJlIHNlcnZlZCB3aGlsZSBhIEx1YSBzY3JpcHQgcnVucy4gIE1vdmluZyBleGVjdXRpb24gdG8gd29ya2VyXG4gKiB0aHJlYWRzIGdpdmVzIGV2ZXJ5IENQVSBjb3JlIHdvcmsgdG8gZG8gYW5kIGtlZXBzIHRoZSBtYWluIGV2ZW50IGxvb3AgZnJlZVxuICogdG8gYWNjZXB0IGFuZCBkaXNwYXRjaCBuZXcgSFRUUCBjb25uZWN0aW9ucy5cbiAqXG4gKiBDYXZlYXRzOlxuICogICDigKIgcmVkaXMuY2FsbCgpIGluc2lkZSBMdWEgc2NyaXB0cyBpcyBOT1Qgc3VwcG9ydGVkIGluIHdvcmtlciBtb2RlLlxuICogICAgIFNjcmlwdHMgdGhhdCB1c2UgcmVkaXMuY2FsbCgpIGFyZSB0cmFuc3BhcmVudGx5IHJvdXRlZCBiYWNrIHRvIHRoZVxuICogICAgIG1haW4tdGhyZWFkIHJ1bm5lciAoYHN0b3JlLnJ1bkx1YVN5bmMoKWApLlxuICogICDigKIgV29ya2VyIHRocmVhZHMgc2hhcmUgbm8gaGVhcCDigJQgdGhlIGZ1bGwgV2FzbSBiaW5hcnkgaXMgY29tcGlsZWQgb25jZVxuICogICAgIHBlciB3b3JrZXIgKG5vdCBwZXIgc2NyaXB0KS5cbiAqL1xuXG5pbXBvcnQgeyBXb3JrZXIgfSBmcm9tIFwid29ya2VyX3RocmVhZHNcIjtcbmltcG9ydCB7IHJhbmRvbVVVSUQgfSBmcm9tIFwiY3J5cHRvXCI7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSBcInVybFwiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB0eXBlIHsgTHVhUmVxdWVzdCwgTHVhUmVzcG9uc2UgfSBmcm9tIFwiLi9sdWEtd29ya2VyLmpzXCI7XG5cbmNvbnN0IFBPT0xfU0laRSA9IE1hdGgubWluKE51bWJlcihwcm9jZXNzLmVudltcIkxVQV9XT1JLRVJfVEhSRUFEU1wiXSA/PyAyKSwgOCk7XG5jb25zdCBUSU1FT1VUX01TID0gMTBfMDAwOyAvLyBraWxsIEx1YSBzY3JpcHQgaWYgaXQgcnVucyA+IDEwIHNcblxuLy8gUmVzb2x2ZSB0aGUgd29ya2VyIGZpbGUgcGF0aCBpbiBhIHdheSB0aGF0IHdvcmtzIGluIGJvdGg6XG4vLyAgIOKAoiBEZXZlbG9wbWVudCAodHN4IC8gRVNNKTogaW1wb3J0Lm1ldGEudXJsIGlzIGEgcmVhbCBmaWxlIFVSTFxuLy8gICDigKIgUHJvZHVjdGlvbiAoZXNidWlsZCBDSlMgYnVuZGxlKTogaW1wb3J0Lm1ldGEudXJsIGlzIHVuZGVmaW5lZFxuLy8gICAgIOKGkiBwb29sIGlzIHNpbGVudGx5IGRpc2FibGVkOyBFVkFMIGZhbGxzIGJhY2sgdG8gdGhlIG1haW4tdGhyZWFkIHJ1bm5lclxuZnVuY3Rpb24gcmVzb2x2ZVdvcmtlckZpbGUoKTogc3RyaW5nIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgdXJsID0gaW1wb3J0Lm1ldGEudXJsOyAvLyB1bmRlZmluZWQgaW4gZXNidWlsZCBDSlMgb3V0cHV0XG4gICAgaWYgKCF1cmwpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKGZpbGVVUkxUb1BhdGgodXJsKSksIFwibHVhLXdvcmtlci50c1wiKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuY29uc3QgV09SS0VSX0ZJTEU6IHN0cmluZyB8IG51bGwgPSByZXNvbHZlV29ya2VyRmlsZSgpO1xuXG5pbnRlcmZhY2UgUGVuZGluZ0NhbGwge1xuICByZXNvbHZlOiAodjogdW5rbm93bikgPT4gdm9pZDtcbiAgcmVqZWN0OiAoZTogRXJyb3IpID0+IHZvaWQ7XG4gIHRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0Pjtcbn1cblxuaW50ZXJmYWNlIFBvb2xXb3JrZXIge1xuICB3b3JrZXI6IFdvcmtlcjtcbiAgcGVuZGluZzogTWFwPHN0cmluZywgUGVuZGluZ0NhbGw+O1xuICBhY3RpdmU6IG51bWJlcjtcbn1cblxuY2xhc3MgTHVhUG9vbCB7XG4gIHByaXZhdGUgd29ya2VyczogUG9vbFdvcmtlcltdID0gW107XG4gIHByaXZhdGUgX3N0YXJ0ZWQgPSBmYWxzZTtcblxuICBzdGFydCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5fc3RhcnRlZCkgcmV0dXJuO1xuICAgIHRoaXMuX3N0YXJ0ZWQgPSB0cnVlO1xuICAgIGlmICghV09SS0VSX0ZJTEUpIHJldHVybjsgLy8gcHJvZHVjdGlvbiBDSlM6IHBvb2wgZGlzYWJsZWQsIEVWQUwgZmFsbHMgYmFjayB0byBtYWluIHRocmVhZFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgUE9PTF9TSVpFOyBpKyspIHtcbiAgICAgIHRoaXMuX3NwYXduV29ya2VyKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfc3Bhd25Xb3JrZXIoKTogdm9pZCB7XG4gICAgaWYgKCFXT1JLRVJfRklMRSkgcmV0dXJuO1xuICAgIC8vIFBhc3MgLS1pbXBvcnQgdHN4IHNvIHRoZSB3b3JrZXIgdGhyZWFkIGNhbiBsb2FkIC50cyBmaWxlcyBkaXJlY3RseS5cbiAgICBjb25zdCB3b3JrZXIgPSBuZXcgV29ya2VyKFdPUktFUl9GSUxFLCB7IGV4ZWNBcmd2OiBbXCItLWltcG9ydFwiLCBcInRzeFwiXSB9KTtcbiAgICBjb25zdCBwdzogUG9vbFdvcmtlciA9IHsgd29ya2VyLCBwZW5kaW5nOiBuZXcgTWFwKCksIGFjdGl2ZTogMCB9O1xuXG4gICAgd29ya2VyLm9uKFwibWVzc2FnZVwiLCAocmVzOiBMdWFSZXNwb25zZSkgPT4ge1xuICAgICAgY29uc3QgY2FsbCA9IHB3LnBlbmRpbmcuZ2V0KHJlcy5pZCk7XG4gICAgICBpZiAoIWNhbGwpIHJldHVybjtcbiAgICAgIHB3LnBlbmRpbmcuZGVsZXRlKHJlcy5pZCk7XG4gICAgICBwdy5hY3RpdmUgPSBNYXRoLm1heCgwLCBwdy5hY3RpdmUgLSAxKTtcbiAgICAgIGNsZWFyVGltZW91dChjYWxsLnRpbWVyKTtcbiAgICAgIGlmIChyZXMuZXJyb3IpIHtcbiAgICAgICAgY2FsbC5yZWplY3QobmV3IEVycm9yKHJlcy5lcnJvcikpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY2FsbC5yZXNvbHZlKHJlcy5yZXN1bHQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgd29ya2VyLm9uKFwiZXJyb3JcIiwgKGVycikgPT4ge1xuICAgICAgZm9yIChjb25zdCBbLCBjYWxsXSBvZiBwdy5wZW5kaW5nKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChjYWxsLnRpbWVyKTtcbiAgICAgICAgY2FsbC5yZWplY3QoXG4gICAgICAgICAgbmV3IEVycm9yKFxuICAgICAgICAgICAgYEx1YSB3b3JrZXIgZXJyb3I6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWAsXG4gICAgICAgICAgKSxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHB3LnBlbmRpbmcuY2xlYXIoKTtcbiAgICAgIHB3LmFjdGl2ZSA9IDA7XG4gICAgfSk7XG5cbiAgICB3b3JrZXIub24oXCJleGl0XCIsICgpID0+IHtcbiAgICAgIC8vIFJlc3Bhd24gY3Jhc2hlZCB3b3JrZXJzXG4gICAgICBjb25zdCBpZHggPSB0aGlzLndvcmtlcnMuaW5kZXhPZihwdyk7XG4gICAgICBpZiAoaWR4ICE9PSAtMSkge1xuICAgICAgICB0aGlzLndvcmtlcnMuc3BsaWNlKGlkeCwgMSk7XG4gICAgICAgIHRoaXMuX3NwYXduV29ya2VyKCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLndvcmtlcnMucHVzaChwdyk7XG4gIH1cblxuICAvKipcbiAgICogUnVuIGEgTHVhIHNjcmlwdCBpbiB0aGUgcG9vbC4gIFJlamVjdHMgaWYgdGhlIHNjcmlwdCB1c2VzIHJlZGlzLmNhbGwoKVxuICAgKiAodGhlIGNhbGxlciBzaG91bGQgZmFsbCBiYWNrIHRvIHRoZSBtYWluLXRocmVhZCBydW5uZXIgaW4gdGhhdCBjYXNlKS5cbiAgICovXG4gIHJ1bihzY3JpcHQ6IHN0cmluZywga2V5czogc3RyaW5nW10sIGFyZ3Y6IHN0cmluZ1tdKTogUHJvbWlzZTx1bmtub3duPiB7XG4gICAgaWYgKCF0aGlzLl9zdGFydGVkKSB0aGlzLnN0YXJ0KCk7XG5cbiAgICAvLyBQaWNrIHRoZSBsZWFzdC1sb2FkZWQgd29ya2VyXG4gICAgY29uc3QgcHcgPSB0aGlzLndvcmtlcnMucmVkdWNlKFxuICAgICAgKGJlc3QsIHcpID0+ICh3LmFjdGl2ZSA8IGJlc3QuYWN0aXZlID8gdyA6IGJlc3QpLFxuICAgICAgdGhpcy53b3JrZXJzWzBdISxcbiAgICApO1xuXG4gICAgY29uc3QgaWQgPSByYW5kb21VVUlEKCk7XG4gICAgY29uc3QgcmVxOiBMdWFSZXF1ZXN0ID0geyBpZCwgc2NyaXB0LCBrZXlzLCBhcmd2IH07XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2U8dW5rbm93bj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgcHcucGVuZGluZy5kZWxldGUoaWQpO1xuICAgICAgICBwdy5hY3RpdmUgPSBNYXRoLm1heCgwLCBwdy5hY3RpdmUgLSAxKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRVJSIEx1YSBzY3JpcHQgdGltZWQgb3V0IGFmdGVyICR7VElNRU9VVF9NU31tc2ApKTtcbiAgICAgIH0sIFRJTUVPVVRfTVMpO1xuXG4gICAgICBwdy5wZW5kaW5nLnNldChpZCwgeyByZXNvbHZlLCByZWplY3QsIHRpbWVyIH0pO1xuICAgICAgcHcuYWN0aXZlKys7XG4gICAgICBwdy53b3JrZXIucG9zdE1lc3NhZ2UocmVxKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKiBUcnVlIGlmIHRoZSBwb29sIGhhcyBzdGFydGVkIGFuZCB3b3JrZXJzIGFyZSBhbGl2ZS4gKi9cbiAgZ2V0IGlzUmVhZHkoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuX3N0YXJ0ZWQgJiYgdGhpcy53b3JrZXJzLmxlbmd0aCA+IDA7XG4gIH1cblxuICAvKiogQ291bnQgb2Ygc2NyaXB0cyBjdXJyZW50bHkgcnVubmluZyBhY3Jvc3MgYWxsIHdvcmtlcnMuICovXG4gIGdldCBhY3RpdmVDb25jdXJyZW5jeSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLndvcmtlcnMucmVkdWNlKChzdW0sIHcpID0+IHN1bSArIHcuYWN0aXZlLCAwKTtcbiAgfVxuXG4gIGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMud29ya2Vycy5tYXAoKHB3KSA9PiBwdy53b3JrZXIudGVybWluYXRlKCkpKTtcbiAgICB0aGlzLndvcmtlcnMgPSBbXTtcbiAgICB0aGlzLl9zdGFydGVkID0gZmFsc2U7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IGx1YVBvb2wgPSBuZXcgTHVhUG9vbCgpO1xuIl0sImZpbGUiOiIvZXh0ZXJuYWwvcGRpbS9hcnRpZmFjdHMvYXBpLXNlcnZlci9zcmMvd29ya2Vycy9sdWEtcG9vbC50cyJ9
