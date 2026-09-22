// Isolated boundary tests; run with env -i PATH="$PATH" node scripts/test-data-runtime.mjs.
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { convertLegacy, verifyConverted } from "./convert-pdim-legacy-recovery.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "runtime-tests-"));
async function bundle(entry, mocks) {
  const output = join(dir, `${Math.random()}.mjs`);
  await build({
    entryPoints: [entry], outfile: output, bundle: true, platform: "node", format: "esm",
    plugins: [{
      name: "isolated-boundaries",
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          for (const [pattern, contents] of mocks) {
            if (pattern.test(args.path)) return { path: args.path, namespace: "mock", pluginData: contents };
          }
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.pluginData, loader: "js" }));
      },
    }],
  });
  return import(pathToFileURL(output));
}
const sessionMock = `export default {Store: class {}}`;
const sqlMock = `export const sql=(strings,...values)=>({strings,values});`;
try {
  globalThis.testDb = { execute: () => { throw new Error("unconfigured mock"); } };
  globalThis.testAuthority = {
    async validate() { throw new Error("unconfigured authority mock"); },
    async revoke() { throw new Error("unconfigured authority mock"); },
  };
  const { AuthoritativeSessionStore } = await bundle("server/middleware/authoritativeSessionStore.ts", [
    [/express-session/, sessionMock],
    [/\/db\.js$/, `export const db=globalThis.testDb;`],
    [/^drizzle-orm$/, sqlMock],
    [/services\/sessionAuthority/, `export const sessionAuthority=async()=>globalThis.testAuthority;`],
  ]);
  const store = new AuthoritativeSessionStore();
  for (const method of ["set", "touch", "destroy"]) {
    let commit, callback = false;
    testDb.execute = () => new Promise(resolve => { commit = resolve; });
    const args = method === "destroy" ? ["sid"] : ["sid", { cookie: { maxAge: 1000 } }];
    store[method](...args, err => { assert.equal(err, undefined); callback = true; });
    assert.equal(callback, false, `${method} must wait for commit`);
    commit({});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(callback, true);
    testDb.execute = async () => { throw new Error("PG offline"); };
    await new Promise(resolve => store[method](...args, err => {
      assert.equal(err.message, "PG offline"); resolve();
    }));
  }
  await new Promise(resolve => store.get("sid", err => {
    assert.equal(err.message, "PG offline"); resolve();
  }));
  testDb.execute = async query => {
    assert.match(query.strings.join(""), /^UPDATE pg_sessions/);
    return { rows: [] };
  };
  await new Promise(resolve => store.touch("deleted", { cookie: {} }, err => {
    assert.equal(err, undefined); resolve();
  }));
  const readSession = () => new Promise((resolve, reject) =>
    store.get("sid", (err, data) => err ? reject(err) : resolve(data)));
  testDb.execute = async () => ({ rows: [{ sess: JSON.stringify({ userId: "user", authGeneration: "1" }) }] });
  let generation = "1", validations = 0;
  testAuthority.validate = async (user, issued) => {
    assert.equal(user, "user"); validations++;
    return issued === generation;
  };
  assert.equal((await readSession()).userId, "user");
  generation = "2";
  assert.equal(await readSession(), null);
  assert.equal(validations, 2, "every authenticated read checks authority");
  testDb.execute = async () => ({ rows: [{ sess: JSON.stringify({ passport: { user: { id: "user" } }, authGeneration: "2" }) }] });
  assert.equal((await readSession()).passport.user.id, "user");
  testDb.execute = async () => ({ rows: [{ sess: JSON.stringify({ userId: "user" }) }] });
  assert.equal(await readSession(), null, "missing epoch must not bypass authority");
  testAuthority.validate = async () => { throw new Error("authority offline"); };
  await assert.rejects(readSession(), /authority offline/);
  testDb.execute = async () => ({ rows: [{ sess: JSON.stringify({ cookie: {} }) }] });
  assert.deepEqual(await readSession(), { cookie: {} });
  const { revokeUserSessions } = await bundle("server/middleware/sessionConfig.ts", [
    [/express-session/, sessionMock],
    [/\/db\.js$/, `export const db=globalThis.testDb;`],
    [/^drizzle-orm$/, sqlMock],
    [/services\/sessionAuthority/, `export const sessionAuthority=async()=>globalThis.testAuthority;`],
    [/redisClient/, `export const getRedisClient=()=>{throw new Error("No transient revocation permitted");};`],
    [/pdimClient/, `export const isPdimConfigured=()=>false;`],
    [/logger/, `export const logger={info(){},warn(){},error(){}};`],
    [/config\/env/, `export const env={};`],
  ]);
  let revokeCommit, acknowledged = false;
  testAuthority.revoke = () => new Promise(resolve => { revokeCommit = resolve; });
  const revoking = revokeUserSessions("user").then(result => {
    assert.deepEqual(result, { confirmed: true }); acknowledged = true;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(acknowledged, false);
  revokeCommit(); await revoking;
  testAuthority.revoke = async () => { throw new Error("revocation commit failed"); };
  await assert.rejects(revokeUserSessions("user"), /revocation commit failed/);
  console.log("PASS D6: set/touch/destroy await commit, propagate failures; read failure explicit; touch UPDATE-only");
  console.log("PASS D6 auth integration: uncached generation validation, authority errors explicit, durable revoke waits and confirms");

  globalThis.workerMocks = { processor: null };
  const { startRetentionWorker } = await bundle("server/lib/scaleJobQueue.ts", [
    [/^bullmq$/, `export class Queue { constructor(){ throw new Error("No startup queue sweep allowed"); } }
      export class Job {} export class UnrecoverableError extends Error {}
      export class Worker { constructor(n,p){globalThis.workerMocks.processor=p;} on(){} async run(){} }`],
    [/redisClient/, `export const newBullMQRedisConnection=()=>({});`],
    [/logger/, `export const logger={info(){},warn(){},debug(){}};`],
    [/customerHealthScoreService/, `export const customerHealthScoreService={};`],
    [/dunningService/, `export const dunningService={};`],
    [/reEngagementService/, `export const reEngagementService={};`],
    [/featureEventBuffer/, `export const flushFeatureEvents=async()=>{};`],
  ]);
  startRetentionWorker();
  const valid = { name: "feature-event-flush", data: {}, opts: {}, id: "valid" };
  for (let i = 0; i < 11; i++) {
    const malformed = { data: {}, opts: { removeOnFail: true }, id: String(i) };
    await assert.rejects(workerMocks.processor(malformed), /Quarantined/);
    assert.equal(malformed.opts.removeOnFail, false);
  }
  await workerMocks.processor(valid);
  console.log("PASS D7: eleven malformed records retained as failed; valid processor runs; no startup sweep");

  const objects = new Map();
  globalThis.fabricTest = {
    async getNamedObject(_id, _pocket, key) { return objects.get(key) ?? null; },
    async recommendedPolicy() { return {}; },
    async putNamedObject(_id, _pocket, key, _mime, bytes) { objects.set(key, bytes); },
    async deleteNamedObject(_id, _pocket, key) { objects.delete(key); },
  };
  const { RedisStore } = await bundle("external/pdim/artifacts/api-server/src/redis/store.ts", [
    [/^wasmoon$/, `export class LuaFactory {} export class LuaEngine {}`],
    [/^@msgpack\/msgpack$/, `export const encode=()=>{}; export const decode=()=>{};`],
    [/fabric\/index\.js$/, `export const fabricStorage=globalThis.fabricTest;`],
    [/lua-pool/, `export const luaPool={};`],
  ]);
  const redis = new RedisStore("fixture", "fixture");
  const encoded = redis.encodeRecovery(Buffer.from('{"version":1,"records":[]}'));
  assert.deepEqual(redis.decodeRecovery(encoded), { version: 1, records: [] });
  const corrupt = JSON.parse(encoded); corrupt.sha256 = "invalid";
  assert.throws(() => redis.decodeRecovery(Buffer.from(JSON.stringify(corrupt))), /checksum/);
  fabricTest.getNamedObject = async () => { throw new Error("storage offline"); };
  await assert.rejects(redis.load(), /snapshot recovery failed/);
  assert.equal(redis.data.size, 0);
  fabricTest.getNamedObject = async () => redis.encodeRecovery(Buffer.from(JSON.stringify({
    version: 1, records: [{ s: 2, c: "SET", a: ["x", "y"] }],
  })));
  await assert.rejects(redis.replayAof(), /sequence discontinuity/);
  redis.execSync("XADD", ["stream", "*", "field", "value"]);
  const id = redis.execSync("XRANGE", ["stream", "-", "+"])[0][0];
  await redis.persist();
  const snapshot = redis.decodeRecovery([...objects.values()][0]);
  assert.equal(snapshot.entries.stream.value[0].id, id);
  assert.equal(redis.aofSeq, 1); // Read-only stream commands do not append journal records.
  fabricTest.getNamedObject = async (_id, _pocket, key) => objects.get(key) ?? null;
  const recovered = new RedisStore("fixture", "recovered");
  await recovered.load();
  assert.equal(recovered.execSync("XRANGE", ["stream", "-", "+"])[0][0], id);
  await recovered.close();
  objects.clear();
  const missing = new RedisStore("missing", "missing");
  await assert.rejects(missing.load(), /snapshot recovery failed/);
  await missing.load(true);
  await missing.close();
  console.log("PASS D4: checksum corruption, storage outage, sequence gap rejected; stream snapshot preserves generated ID");
  const frozenStream = {
    type: "stream", value: [{ id: "100-0", fields: ["field", "value"] }],
    groups: { workers: {
      lastDeliveredId: "100-0",
      pending: [{ id: "100-0", consumer: "worker", deliveredAt: 100, count: 1 }],
      consumers: { worker: { name: "worker", lastSeenAt: 100 } },
    } },
  };
  const legacySnapshot = { version: 1, savedAt: 1000, baselineSeq: 1, entries: { key: { type: "string", value: "value" } } };
  const legacyAof = { version: 1, records: [{ s: 1, c: "SET", a: ["key", "value"] }] };
  const streamExport = { version: 1, baselineSeq: 1, entries: { stream: frozenStream } };
  const inputPaths = ["legacy-snapshot.json", "legacy-aof.json", "stream-export.json", "approval.json"].map(name => join(dir, name));
  async function prepareConversion() {
    const bytes = [legacySnapshot, legacyAof, streamExport].map(value => JSON.stringify(value));
    const hashes = bytes.map(value => createHash("sha256").update(value).digest("hex"));
    const approval = {
      instanceId: "fixture", baselineSeq: 1, snapshotSha256: hashes[0], aofSha256: hashes[1],
      streamsSha256: hashes[2], freezeConfirmed: true, streamsComplete: true, expectedKeyCount: 2,
    };
    await Promise.all([...bytes, JSON.stringify(approval)].map((value, i) => writeFile(inputPaths[i], value)));
  }
  await prepareConversion();
  const convertedDirectory = join(dir, "converted");
  assert.equal((await convertLegacy(...inputPaths, convertedDirectory)).valid, true);
  const ready = JSON.parse(await readFile(join(convertedDirectory, "READY.json")));
  objects.clear();
  for (const artifact of ready.uploadOrder) objects.set(artifact.name, await readFile(join(convertedDirectory, artifact.file)));
  const migratedStore = new RedisStore("fixture", "migrated");
  await migratedStore.load();
  assert.equal(migratedStore.execSync("GET", ["key"]), "value");
  assert.deepEqual(migratedStore.data.get("stream"), frozenStream);
  await migratedStore.close();
  assert.deepEqual(await readFile(inputPaths[0]), await readFile(join(convertedDirectory, "original-snapshot.json")));
  await assert.rejects(convertLegacy(...inputPaths, convertedDirectory), /EEXIST/);
  await writeFile(join(convertedDirectory, "aof.v2.json"), "{}");
  await assert.rejects(verifyConverted(convertedDirectory), /Artifact digest mismatch/);
  legacyAof.records.push({ s: 2, c: "INCR", a: ["counter"] });
  await prepareConversion();
  await assert.rejects(convertLegacy(...inputPaths, join(dir, "unfolded")), /uncheckpointed tail/);
  legacyAof.records.pop();
  legacySnapshot.entries.key.type = "unknown";
  await prepareConversion();
  await assert.rejects(convertLegacy(...inputPaths, join(dir, "unknown")), /Unsupported legacy entry/);
  console.log("PASS D4 legacy conversion: real loader accepts generation + stream pending metadata; originals retained; overwrite/tamper/unfolded-tail/unknown-type rejected");

  globalThis.backupTest = { catalog: [], files: new Map(), spawnArgs: [] };
  process.env.NEON_DATABASE_URL = "postgres://fixture/preferred";
  process.env.DATABASE_URL = "postgres://fixture/other";
  const { DatabaseBackupService } = await bundle("server/services/backup/databaseBackupService.ts", [
    [/logger/, `export const logger={info(){},warn(){},error(){}};`],
    [/cronScheduler/, `export default {schedule(_expression,callback){
      globalThis.backupTest.scheduled=callback;
      return {stop(){globalThis.backupTest.cronStopped=true;}};
    }};`],
    [/backupCatalog/, `export const backupCatalog={
      async list(){if(globalThis.backupTest.failList)throw new Error("catalog offline");return globalThis.backupTest.catalog;},
      async pending(r){globalThis.backupTest.catalog.push(r);},
      async state(key,state){globalThis.backupTest.catalog.find(r=>r.key===key).state=state;},
      async verify(key){globalThis.backupTest.catalog.find(r=>r.key===key).state="verified";},
      async remove(key){globalThis.backupTest.catalog=globalThis.backupTest.catalog.filter(r=>r.key!==key);},
      async claimDay(){globalThis.backupTest.claims=(globalThis.backupTest.claims??0)+1;return true;},
      async renewDay(){globalThis.backupTest.renewals=(globalThis.backupTest.renewals??0)+1;await globalThis.backupTest.renewHook?.();},
      async finishDay(_day,_owner,state){(globalThis.backupTest.finishes??=[]).push(state);}
    };`],
    [/storageService/, `export const storageService={
      async uploadFileAtKey(buf,key){await globalThis.backupTest.uploadHook?.();globalThis.backupTest.files.set(key,buf);},
      async downloadFile(key){const b=globalThis.backupTest.files.get(key);return globalThis.backupTest.corrupt?Buffer.from("bad"):b;},
      async deleteFile(key){if(globalThis.backupTest.failDelete)throw new Error("delete offline");globalThis.backupTest.files.delete(key);}
    };`],
    [/postgresTools/, `
      const dumpTool={path:"/fixture/postgresql-17/bin/pg_dump",major:17,version:"17.5"};
      const restoreTool={path:"/fixture/postgresql-17/bin/psql",major:17,version:"17.5"};
      export async function selectPgDumpForServer(url){
        (globalThis.backupTest.toolSelections??=[]).push({operation:"dump",url,serverMajor:17});
        return {tool:dumpTool,serverMajor:17,probes:[dumpTool]};
      }
      export function dumpedServerMajor(sql){
        const match=sql.subarray(0,8192).toString("utf8").match(/^-- Dumped from database version\\s+(\\d+)(?:\\.\\d+)?/m);
        if(!match)throw new Error("Backup is missing PostgreSQL source-version metadata");
        return Number(match[1]);
      }
      export function dumpedServerVersion(sql){
        const match=sql.subarray(0,8192).toString("utf8").match(/^-- Dumped from database version\\s+(\\d+(?:\\.\\d+)?)/m);
        if(!match)throw new Error("Backup is missing PostgreSQL source-version metadata");
        return match[1];
      }
      export async function selectPsqlForRestore(url,dumpedMajor){
        if(dumpedMajor!==17)throw new Error("unexpected synthetic dump major");
        (globalThis.backupTest.toolSelections??=[]).push({operation:"restore",url,dumpedMajor,targetMajor:17});
        return {tool:restoreTool,serverMajor:17,probes:[restoreTool]};
      }
      export function safePostgresDiagnostic(value){return String(value);}
    `],
    [/^(?:node:)?child_process$/, `import {EventEmitter} from "node:events";import {PassThrough} from "node:stream";
      export function spawn(cmd,args,options){
        globalThis.backupTest.spawnArgs.push({cmd,args,options});
        const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();
        p.kill=()=>{};
        setImmediate(()=>{
          if(cmd.endsWith("/pg_dump"))p.stdout.end("-- PostgreSQL database dump\\n-- Dumped from database version 17.11\\nSELECT 1;\\n");
          else p.stdout.end("");
          p.emit("close",globalThis.backupTest.exitCode??0);
        });
        return p;
      }`],
  ]);
  const backups = new DatabaseBackupService();
  const keys = await Promise.all([backups.createBackup(), backups.createBackup()]);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(backupTest.catalog.every(r => r.state === "verified"), true);
  assert.equal(backupTest.spawnArgs[0].cmd, "/fixture/postgresql-17/bin/pg_dump");
  assert.deepEqual(backupTest.spawnArgs[0].args, ["--no-owner", "--no-acl"]);
  assert.equal(backupTest.spawnArgs[0].options.env.PGDATABASE, process.env.NEON_DATABASE_URL);
  assert.equal(backupTest.toolSelections[0].serverMajor, 17);
  for (const key of keys) assert.equal(backupTest.files.has(key), true);
  backupTest.corrupt = true;
  await assert.rejects(backups.createBackup(), /checksum mismatch/);
  assert.equal(backupTest.catalog.at(-1).state, "pending");
  backupTest.corrupt = false;
  backupTest.failList = true;
  await assert.rejects(backups.listBackups(), /catalog offline/);
  backupTest.failList = false;
  await assert.rejects(backups.restoreBackup(keys[0], process.env.NEON_DATABASE_URL), /isolated target/);
  backupTest.exitCode = 1;
  await assert.rejects(backups.restoreBackup(keys[0], "postgres://isolated/recovery", "SELECT 1;"), /Restore failed/);
  assert.equal(backupTest.spawnArgs.at(-1).cmd, "/fixture/postgresql-17/bin/psql");
  assert.equal(backupTest.spawnArgs.at(-1).args.includes("ON_ERROR_STOP=1"), true);
  assert.equal(backupTest.spawnArgs.at(-1).options.env.PGDATABASE, "postgres://isolated/recovery");
  assert.deepEqual(backupTest.toolSelections.at(-1), {
    operation: "restore",
    url: "postgres://isolated/recovery",
    dumpedMajor: 17,
    targetMajor: 17,
  });
  console.log("PASS D1-D3: concurrent unique verified keys, checksum mismatch pending, catalog errors explicit, preferred target, isolated fail-stop restore");
  // Exercise the actual scheduler, createBackup pipeline, stop barrier and
  // heartbeat lifecycle, with only external I/O and the wall-clock hour mocked.
  const originalHours = Date.prototype.getUTCHours;
  const originalInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const heartbeatCallbacks = new Map();
  let utcHour = 3;
  Date.prototype.getUTCHours = () => utcHour;
  globalThis.setInterval = (callback, ms, ...args) => {
    const timer = originalInterval(callback, ms, ...args);
    if (ms === 60_000) heartbeatCallbacks.set(timer, callback);
    return timer;
  };
  globalThis.clearInterval = timer => {
    heartbeatCallbacks.delete(timer);
    originalClearInterval(timer);
  };
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  process.env.ENABLE_BACKUPS = "true";
  try {
    globalThis.backupTest = { catalog: [], files: new Map(), spawnArgs: [] };
    const uploadEntered = deferred(), uploadRelease = deferred();
    backupTest.uploadHook = () => { uploadEntered.resolve(); return uploadRelease.promise; };
    const drainingService = new DatabaseBackupService();
    await drainingService.initialize();
    await uploadEntered.promise;
    assert.equal(heartbeatCallbacks.size, 1);
    let stopped = false;
    const stopPending = drainingService.stop(1000);
    stopPending.then(() => { stopped = true; });
    assert.equal(drainingService.stop(), stopPending, "repeated stop shares drain result");
    await tick();
    assert.equal(stopped, false, "stop must wait for pending catch-up upload");
    assert.equal(backupTest.cronStopped, true);
    const claims = backupTest.claims;
    await backupTest.scheduled();
    assert.equal(backupTest.claims, claims, "stop blocks later cron dispatch");
    const renewalRelease = deferred();
    let held = false;
    backupTest.renewHook = () => {
      if (!held) { held = true; return renewalRelease.promise; }
    };
    [...heartbeatCallbacks.values()][0]();
    uploadRelease.resolve();
    for (let i = 0; i < 20 && !backupTest.finishes?.length; i++) await tick();
    assert.deepEqual(backupTest.finishes, ["complete"]);
    assert.equal(stopped, false, "stop also drains an already-dispatched renewal");
    assert.equal(heartbeatCallbacks.size, 0, "terminal commit releases heartbeat");
    renewalRelease.resolve();
    await stopPending;
    assert.equal(drainingService.activeRuns.size, 0);
    await assert.rejects(drainingService.initialize(), /stopping/);

    globalThis.backupTest = { catalog: [], files: new Map(), spawnArgs: [] };
    utcHour = 1; // no due catch-up; next run is dispatched by cron
    const timedService = new DatabaseBackupService();
    await timedService.initialize();
    await tick();
    utcHour = 3;
    const cronUploadEntered = deferred(), cronUploadRelease = deferred();
    backupTest.uploadHook = () => { cronUploadEntered.resolve(); return cronUploadRelease.promise; };
    const cronRun = backupTest.scheduled();
    await cronUploadEntered.promise;
    await assert.rejects(timedService.stop(10), /drain timed out/);
    assert.equal(timedService.activeRuns.size, 1);
    assert.equal(heartbeatCallbacks.size, 1, "timeout must not abandon ownership of live work");
    assert.equal(backupTest.finishes, undefined, "timeout cannot falsely complete or fail an active lease");
    const renewals = backupTest.renewals;
    [...heartbeatCallbacks.values()][0]();
    await tick();
    assert.equal(backupTest.renewals, renewals + 1, "live work keeps renewing during timed-out drain");
    cronUploadRelease.reject(new Error("upload failed during shutdown"));
    await cronRun;
    assert.deepEqual(backupTest.finishes, ["failed"]);
    assert.equal(backupTest.catalog[0].state, "pending", "incomplete dump remains recoverable");
    assert.equal(heartbeatCallbacks.size, 0);
    assert.equal(timedService.activeRuns.size, 0);
    console.log("PASS D2 shutdown: catch-up/cron tracked; dispatch fenced; upload and renewal drained; bounded timeout preserves ownership; failed run stays recoverable");
  } finally {
    for (const timer of heartbeatCallbacks.keys()) originalClearInterval(timer);
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClearInterval;
    Date.prototype.getUTCHours = originalHours;
    delete process.env.ENABLE_BACKUPS;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}