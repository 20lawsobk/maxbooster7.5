import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const load = async (entry, plugins = [], suffix = "") => {
  const compiled = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm", plugins });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + suffix).toString("base64")}`);
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test("all-tab account barrier waits for real cleanup acknowledgments and excludes active background locks", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalChannel = globalThis.BroadcastChannel;
  const locks = new Map();
  const request = (name, options, callback) => {
    if (typeof options === "function") { callback = options; options = {}; }
    if (!locks.has(name)) locks.set(name, { active: [], pending: [] });
    const state = locks.get(name);
    return new Promise((resolve, reject) => {
      const item = { mode: options.mode || "exclusive", callback, resolve, reject, signal: options.signal };
      const pump = () => {
        while (state.pending.length) {
          const next = state.pending[0];
          if (state.active.some(a => a.mode === "exclusive") || (next.mode === "exclusive" && state.active.length)) return;
          state.pending.shift();
          if (next.signal?.aborted) { next.reject(Error("aborted")); continue; }
          state.active.push(next);
          Promise.resolve().then(next.callback).then(next.resolve, next.reject).finally(() => {
            state.active.splice(state.active.indexOf(next), 1); pump();
          });
          if (next.mode === "exclusive") return;
        }
      };
      state.pending.push(item);
      options.signal?.addEventListener("abort", () => {
        const index = state.pending.indexOf(item);
        if (index >= 0) { state.pending.splice(index, 1); reject(Error("aborted")); pump(); }
      });
      pump();
    });
  };
  const channels = new Set();
  class Channel {
    constructor(name) { this.name = name; channels.add(this); }
    postMessage(data) {
      for (const other of channels) if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.onmessage?.({ data }));
      }
    }
    close() { channels.delete(this); }
  }
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request } } });
  globalThis.BroadcastChannel = Channel;
  try {
    const first = await load("client/src/lib/offline/accountCoordinator.ts", [], "// first tab");
    const second = await load("client/src/lib/offline/accountCoordinator.ts", [], "// second tab");
    let releaseSecond;
    const secondCleanup = new Promise(resolve => { releaseSecond = resolve; });
    let firstSweeps = 0;
    first.registerAccountCleanup(async () => { firstSweeps++; });
    second.registerAccountCleanup(async () => { await secondCleanup; });
    await Promise.all([first.acquireAccountLease(), second.acquireAccountLease()]);
    let finishWorker;
    const workerDone = new Promise(resolve => { finishWorker = resolve; });
    const worker = request("max-booster-account-session-v1", { mode: "shared" }, () => workerDone);
    await tick();
    let operationRan = false;
    const transition = first.changeAccount(async () => { operationRan = true; return "B"; });
    await tick();
    assert.equal(operationRan, false);
    releaseSecond();
    await tick();
    assert.equal(operationRan, false, "background work still owns a shared lease");
    finishWorker();
    await worker;
    assert.equal(await transition, "B");
    assert.equal(operationRan, true);
    assert.equal(firstSweeps, 2, "sweep again under exclusive lock after background work drains");
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    globalThis.BroadcastChannel = originalChannel;
  }
});

test("account persister cancels old throttled snapshots, restores rightful owner and never restores auth", async () => {
  const values = new Map();
  globalThis.window = new EventTarget();
  globalThis.__boundaryDB = {
    get: async (_store, key) => values.get(key),
    put: async (_store, value, key) => { values.set(key, value); },
    delete: async (_store, key) => { values.delete(key); },
    clear: async () => values.clear(),
  };
  const plugins = [{ name: "no-browser-idb", setup(b) {
    b.onResolve({ filter: /^idb$/ }, () => ({ path: "idb", namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const openDB = async () => globalThis.__boundaryDB;" }));
  } }];
  const compiled = await build({
    stdin: { contents: `export {createAccountPersister} from "./client/src/lib/idbPersister";
      export {setOfflineIdentity,offlineIdentity} from "./client/src/lib/offline/identity";`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm", plugins,
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const setTimeoutOriginal = globalThis.setTimeout;
  const clearTimeoutOriginal = globalThis.clearTimeout;
  const timers = new Set();
  globalThis.setTimeout = fn => { timers.add(fn); return fn; };
  globalThis.clearTimeout = fn => { timers.delete(fn); };
  const snapshot = { timestamp: Date.now(), buster: "mb-account-v4", clientState: { mutations: [],
    queries: [{ queryKey: ["/api/projects"], state: { data: ["A-project"] } },
      { queryKey: ["/api/auth/me"], state: { data: { id: "untrusted" } } }] } };
  try {
    module.setOfflineIdentity("A");
    const a = module.createAccountPersister(module.offlineIdentity());
    a.activate();
    a.persistClient(snapshot);
    const [staleTimer] = timers;
    module.setOfflineIdentity("B");
    assert.equal(timers.size, 0);
    staleTimer();
    await tick();
    assert.equal(values.size, 0);
    const b = module.createAccountPersister(module.offlineIdentity());
    b.activate();
    assert.equal(await b.restoreClient(), undefined);
    module.setOfflineIdentity("A");
    const restored = module.createAccountPersister(module.offlineIdentity());
    restored.activate();
    restored.persistClient(snapshot);
    for (const timer of timers) timer();
    await tick();
    const client = await restored.restoreClient();
    assert.deepEqual(client.clientState.queries.map(q => q.queryKey[0]), ["/api/projects"]);
    restored.dispose();
    b.dispose();
  } finally {
    globalThis.setTimeout = setTimeoutOriginal;
    globalThis.clearTimeout = clearTimeoutOriginal;
    delete globalThis.window;
    delete globalThis.__boundaryDB;
  }
});

test("studio browser persistence isolates owners and resets memory without overwriting another owner's work", async () => {
  const values = new Map([["studio-storage", "legacy-private-work"]]);
  globalThis.window = new EventTarget();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const compiled = await build({
    stdin: { contents: `export {accountLocalStorage,resetWithoutPersistence} from "./client/src/lib/offline/accountLocalStorage";
      export {setOfflineIdentity} from "./client/src/lib/offline/identity";`, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm",
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  try {
    assert.equal(module.accountLocalStorage.getItem("studio-storage"), null);
    module.setOfflineIdentity("A");
    module.accountLocalStorage.setItem("studio-storage", "A-work");
    module.setOfflineIdentity("B");
    assert.equal(module.accountLocalStorage.getItem("studio-storage"), null);
    module.accountLocalStorage.setItem("studio-storage", "B-work");
    module.resetWithoutPersistence(() => module.accountLocalStorage.setItem("studio-storage", "empty-default"));
    assert.equal(module.accountLocalStorage.getItem("studio-storage"), "B-work");
    module.setOfflineIdentity("A");
    assert.equal(module.accountLocalStorage.getItem("studio-storage"), "A-work");
    module.setOfflineIdentity(null);
    assert.equal(module.accountLocalStorage.getItem("studio-storage"), null);
    assert.equal(values.get("studio-storage"), "legacy-private-work");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});