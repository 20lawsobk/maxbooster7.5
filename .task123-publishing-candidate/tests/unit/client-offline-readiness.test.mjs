import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { build, transform } from "esbuild";

test("worker never intercepts private GETs; legacy replay and uncoordinated upgrade stay blocked", async () => {
  const events = {};
  const context = {
    self: { location: { hostname: "app.example.com", origin: "https://app.example.com" },
      addEventListener: (name, fn) => { events[name] = fn; } },
    URL, setInterval() {}, console,
  };
  vm.runInNewContext(await fs.readFile("client/public/sw.js", "utf8"), context);
  for (const [method, path] of [["GET", "/api/projects"], ["GET", "/private/image.png"]]) {
    let intercepted = false;
    events.fetch({ request: { url: `https://app.example.com${path}`, method }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
  // A waiting worker cannot be promoted by an uncoordinated old client.
  events.message({ data: { type: "SKIP_WAITING" } });
  events.sync({ tag: "offline-sync", waitUntil() { throw Error("legacy queue replay"); } });
});

test("theme boot agrees with provider default and handles unavailable localStorage", async () => {
  const source = await fs.readFile("client/public/js/theme-init.js", "utf8");
  for (const [saved, darkSystem, expected] of [[null, false, "dark"], ["system", false, "light"], ["light", true, "light"], ["invalid", true, "dark"], ["throws", false, "dark"]]) {
    const classes = new Set(["dark", "light"]);
    vm.runInNewContext(source, {
      localStorage: { getItem() { if (saved === "throws") throw Error("denied"); return saved; } },
      window: { matchMedia() { return { matches: darkSystem }; } },
      document: { documentElement: { classList: {
        remove(...values) { values.forEach(v => classes.delete(v)); },
        add(value) { classes.add(value); },
      } } },
    });
    assert.deepEqual([...classes], [expected]);
  }
});

test("real draft and queue algorithms with an isolated in-memory IDB boundary", async () => {
  const stores = new Map();
  globalThis.window = new EventTarget();
  globalThis.__openOfflineTestDB = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const tables = stores.get(name);
    const table = name => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
    const db = {
      name, close() {},
      async get(store, key) { return structuredClone(table(store).get(key)); },
      async put(store, data) { table(store).set(data.id || data.actionId || data.key, structuredClone(data)); },
      async delete(store, key) { table(store).delete(key); },
      async getAll(store) { return structuredClone([...table(store).values()]); },
      async getAllFromIndex(store, index, value) { return (await db.getAll(store)).filter(row => row[index.replace("by-", "")] === value); },
      transaction(store) { return { store: { getAll: () => db.getAll(store), put: data => db.put(store, data) }, done: Promise.resolve() }; },
    };
    return db;
  };
  const result = await build({
    stdin: { contents: `
      export {draftStorage} from "./client/src/lib/offline/DraftStorage";
      export {offlineQueue} from "./client/src/lib/offline/OfflineQueue";
      export {setOfflineIdentity} from "./client/src/lib/offline/identity";
    `, resolveDir: process.cwd() },
    bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "isolated-boundaries", setup(b) {
      b.onResolve({ filter: /^(idb)$|\/logger$/ }, args => ({ path: args.path, namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "idb"
        ? "export const openDB = (...args) => globalThis.__openOfflineTestDB(...args)"
        : "export const logger = {info(){}, error(){}, warn(){}};" }));
    } }],
  });
  const { draftStorage, offlineQueue, setOfflineIdentity } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  try {
    setOfflineIdentity("A");
    const first = await draftStorage.saveDraft("project", { title: "first" });
    assert.equal(first.version, 1);
    const second = await draftStorage.saveDraft("project", { title: "second" });
    assert.equal(second.createdAt, first.createdAt);
    assert.equal(second.version, 2);
    await draftStorage.saveDraft("expired", {}, { expirationMs: -1 });
    assert.equal((await draftStorage.saveDraft("expired", { recovered: true })).version, 1);
    await draftStorage.deleteDraft("expired");
    assert.equal((await draftStorage.saveDraft("expired", {})).version, 1);
    setOfflineIdentity("B");
    assert.equal(await draftStorage.getDraft("project"), undefined);
    setOfflineIdentity("A");
    assert.equal((await draftStorage.getDraft("project")).data.title, "second");
    const dependency = await offlineQueue.enqueue("edit", {});
    const dependent = await offlineQueue.enqueue("edit", {}, { dependencies: [dependency.id] });
    assert.deepEqual((await offlineQueue.getNextBatch()).map(a => a.id), [dependency.id]);
    assert.equal((await offlineQueue.getNextBatch()).length, 0);
    await offlineQueue.markCompleted(dependency.id);
    assert.deepEqual((await offlineQueue.getNextBatch()).map(a => a.id), [dependent.id]);
    await offlineQueue.updateAction(dependent.id, { leaseExpiresAt: 1 });
    assert.equal((await offlineQueue.getNextBatch()).length, 0);
    assert.match((await offlineQueue.getAction(dependent.id)).error, /Reconciliation required/);
    const retry = await offlineQueue.enqueue("edit", {});
    await offlineQueue.markFailed(retry.id, "rejected");
    assert.equal((await offlineQueue.getNextBatch()).length, 0);
    setOfflineIdentity(null);
    await assert.rejects(draftStorage.getDraft("project"), /Sign in/);
  } finally {
    draftStorage.destroy();
    delete globalThis.__openOfflineTestDB;
    delete globalThis.window;
  }
});

test("preference writes serialize failures and reject a queued write after account change", async () => {
  globalThis.window = new EventTarget();
  const calls = [];
  const gates = [];
  globalThis.__preferenceRequest = (_method, _path, data) => {
    calls.push(data);
    return new Promise((resolve, reject) => gates.push({ resolve, reject }));
  };
  const result = await build({
    stdin: { contents: `export {writePreference} from "./client/src/lib/preferenceWrites";
      export {setOfflineIdentity} from "./client/src/lib/offline/identity";`, resolveDir: process.cwd() },
    bundle: true, format: "esm", platform: "node", write: false,
    plugins: [{ name: "transport", setup(b) {
      b.onResolve({ filter: /\/queryClient$/ }, () => ({ path: "transport", namespace: "mock" }));
      b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export const apiRequest = (...args) => globalThis.__preferenceRequest(...args);" }));
    } }],
  });
  const { writePreference, setOfflineIdentity } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  try {
    setOfflineIdentity("A");
    const first = writePreference("defaultBPM", 121);
    const second = writePreference("autoSave", false);
    const firstRejected = assert.rejects(first, /offline/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    gates[0].reject(Error("offline"));
    await firstRejected;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls[1], { autoSave: false });
    const third = writePreference("theme", "light");
    const thirdRejected = assert.rejects(third, /Account changed/);
    setOfflineIdentity("B");
    const secondRejected = assert.rejects(second, /Account changed/);
    gates[1].resolve({});
    await Promise.all([secondRejected, thirdRejected]);
    assert.equal(calls.length, 2);
  } finally {
    delete globalThis.__preferenceRequest;
    delete globalThis.window;
  }
});

test("changed domain TS/TSX sources parse in isolation", async () => {
  const paths = [
    "components/auth/AuthProvider.tsx", "components/offline/OfflineProvider.tsx",
    "contexts/ThemeContext.tsx", "hooks/useOfflineCache.ts", "hooks/useOfflineCapable.ts",
    "lib/idbPersister.ts", "lib/preferenceWrites.ts", "lib/offline/identity.ts",
    "lib/offline/DraftStorage.ts", "lib/offline/OfflineCache.ts",
    "lib/offline/OfflineQueue.ts", "lib/offline/SyncManager.ts", "pages/Projects.tsx", "pages/Settings.tsx",
    "main.tsx", "components/offline/AccountPersistenceBoundary.tsx",
    "components/offline/WorkerUpdatePrompt.tsx", "components/offline/PendingChangesPanel.tsx",
    "lib/offline/accountCoordinator.ts",
    "lib/offline/operationFingerprint.ts", "lib/offline/accountLocalStorage.ts",
    "lib/offline/studioOfflineLifecycle.ts", "lib/studioLayoutStore.ts", "stores/studioStore.ts",
    "components/ui/theme-toggle.tsx",
  ];
  for (const path of paths) {
    await transform(await fs.readFile(`client/src/${path}`, "utf8"), { loader: path.endsWith("tsx") ? "tsx" : "ts" });
  }
  for (const path of ["server/routes/sync.ts", "server/repositories/clientSyncReceipts.ts"]) {
    await transform(await fs.readFile(path, "utf8"), { loader: "ts" });
  }
});