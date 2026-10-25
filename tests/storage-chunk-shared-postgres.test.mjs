import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm, lstat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const body = (changes = {}) => ({ fileId: "shared-file", userId: "fixture-owner", fileName: "fixture.wav",
  mimeType: "audio/wav", category: "audio", fileSize: "4", totalChunks: "2", chunkIndex: "0", ...changes });

test("storage chunk protocol crosses worker boundaries with real private PostgreSQL locks", { timeout: 45_000 }, async t => {
  const cluster = await startDisposablePostgres();
  const scratch = await mkdtemp(path.join(tmpdir(), "shared-upload-integration-"));
  const workers = new Set();
  const options = cluster.pool.options;
  let serial = 0;
  async function stop(child) {
    if (!workers.has(child)) return;
    workers.delete(child);
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = new Promise(resolve => child.once("close", resolve));
    child.kill("SIGKILL"); await closed;
  }
  t.after(async () => {
    await Promise.all([...workers].map(stop)); await cluster.stop(); await rm(scratch, { recursive: true, force: true });
  });
  const script = path.join(scratch, "worker.mjs");
  await writeFile(script, `
    import pg from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules/pg/lib/index.js")).href)};
    import {ChunkUploadSessions} from ${JSON.stringify(pathToFileURL(path.join(root, "server/lib/chunkUploadSessions.ts")).href)};
    const config=JSON.parse(process.argv[2]);
    const pool=new pg.Pool({...config.database,max:2,connectionTimeoutMillis:3000});
    const store=new ChunkUploadSessions({directory:config.directory,limits:config.limits,connect:async()=>{
      const client=await pool.connect();return{query:async(text,values)=>{await client.query(text,values)},release:()=>client.release()};
    }});
    process.on('message',async request=>{try{
      let result;
      if(request.op==='accept') result=await store.accept(request.body,Buffer.from(request.bytes));
      if(request.op==='begin') {result=await store.beginCompletion(request.fileId,request.userId);result={...result,bytes:result.bytes.toString()};}
      if(request.op==='finish') result=await store.finishCompletion(request.fileId,request.userId,request.token);
      if(request.op==='cancel') result=await store.cancel(request.fileId,request.userId);
      if(request.op==='stats') result=await store.stats();
      process.send({id:request.id,result});
    }catch(error){process.send({id:request.id,status:error.statusCode||500,error:error.message});}});
    process.send({ready:true});
  `, { mode: 0o600 });
  async function launch(directory, limits = {}) {
    const child = fork(script, [JSON.stringify({ directory, limits, database: { host: options.host, port: options.port,
      user: options.user, database: options.database } })], {
      execArgv: ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs")],
      env: { HOME: scratch, TMPDIR: scratch, PATH: process.env.PATH || "/usr/bin:/bin", LANG: "C" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    workers.add(child);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Owned upload worker startup deadline")), 5_000);
      child.once("message", message => { clearTimeout(timer); message.ready ? resolve() : reject(new Error("Worker startup protocol")); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
    });
    return child;
  }
  function call(child, request) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const listener = message => { if (message.id === id) { clearTimeout(timer); child.off("message", listener); resolve(message); } };
      const timer = setTimeout(() => { child.off("message", listener); reject(new Error("Owned upload worker operation deadline")); }, 10_000);
      child.on("message", listener); child.send({ ...request, id });
    });
  }
  const directory = path.join(scratch, "private-staging");
  let first = await launch(directory), second = await launch(directory);
  await t.test("alternating workers retain exact bytes and a single shared reservation", async () => {
    assert.equal((await call(first, { op: "accept", body: body(), bytes: "AB" })).result.complete, false);
    assert.equal((await call(second, { op: "accept", body: body({ chunkIndex: "1" }), bytes: "CD" })).result.complete, true);
    assert.deepEqual((await call(first, { op: "stats" })).result, { sessions: 1, reservedBytes: 4, bufferedBytes: 4 });
    assert.deepEqual((await call(second, { op: "stats" })).result, { sessions: 1, reservedBytes: 4, bufferedBytes: 4 });
  });
  let claim;
  await t.test("simultaneous final claims have exactly one owner", async () => {
    const results = await Promise.all([first, second].map(child => call(child, { op: "begin", fileId: "shared-file", userId: "fixture-owner" })));
    assert.equal(results.filter(value => value.status === 409).length, 1);
    claim = results.find(value => value.result)?.result;
    assert.equal(claim.bytes, "ABCD"); assert.equal(claim.digest, digest("ABCD"));
    assert.match(claim.key, /^users\/fixture-owner\/audio\/chunk-[a-f0-9-]+\/fixture.wav$/);
  });
  await t.test("restart retains an uncertain claim and cannot start a duplicate object", async () => {
    await stop(first); first = await launch(directory);
    const pending = (await call(first, { op: "accept", body: body({ chunkIndex: "1" }), bytes: "CD" })).result;
    assert.equal(pending.pending, true); assert.equal(pending.key, claim.key); assert.equal(pending.token, claim.token);
    assert.equal((await call(first, { op: "cancel", fileId: "shared-file", userId: "fixture-owner" })).status, 409);
    assert.equal((await call(second, { op: "finish", fileId: "shared-file", userId: "fixture-owner", token: "foreign-token" })).status, 409);
    await call(second, { op: "finish", fileId: "shared-file", userId: "fixture-owner", token: claim.token });
    const receipt = (await call(first, { op: "accept", body: body({ chunkIndex: "1" }), bytes: "CD" })).result;
    assert.equal(receipt.completed, true); assert.equal(receipt.key, claim.key);
    assert.equal((await call(second, { op: "stats" })).result.reservedBytes, 0);
    assert.equal((await readdir(path.join(directory, digest("shared-file")))).filter(file => file.endsWith(".chunk")).length, 0);
  });
  await t.test("foreign owners and changed duplicate bytes cannot reuse receipts", async () => {
    assert.equal((await call(second, { op: "accept", body: body({ userId: "foreign" }), bytes: "AB" })).status, 403);
    assert.equal((await call(first, { op: "accept", body: body(), bytes: "ZZ" })).status, 409);
  });
  await t.test("per-user and global reservations are shared across workers", async () => {
    const quotaDirectory = path.join(scratch, "quota-staging"), limits = { maxFileBytes: 10, maxChunkBytes: 10,
      maxReservedBytes: 6, maxUserReservedBytes: 4, maxSessions: 3, maxUserSessions: 2 };
    const a = await launch(quotaDirectory, limits), b = await launch(quotaDirectory, limits);
    assert.ok((await call(a, { op: "accept", body: body(), bytes: "AB" })).result);
    assert.equal((await call(b, { op: "accept", body: body({ fileId: "another" }), bytes: "AB" })).status, 429);
    assert.equal((await call(b, { op: "accept", body: body({ fileId: "foreign-quota", userId: "other" }), bytes: "AB" })).status, 429);
    await call(b, { op: "cancel", fileId: "shared-file", userId: "fixture-owner" });
    assert.equal((await call(a, { op: "stats" })).result.reservedBytes, 0);
    await stop(a); await stop(b);
  });
  await t.test("actual private chunk tampering fails before completion claim", async () => {
    const metadata = body({ fileId: "tampered", fileSize: "2", totalChunks: "1" });
    await call(first, { op: "accept", body: metadata, bytes: "AB" });
    const file = path.join(directory, digest("tampered"), "0.chunk");
    assert.equal((await lstat(file)).mode & 0o077, 0);
    assert.equal((await lstat(directory)).mode & 0o077, 0);
    await writeFile(file, "ZZ");
    const result = await call(second, { op: "begin", fileId: "tampered", userId: "fixture-owner" });
    assert.equal(result.status, 500); assert.match(result.error, /integrity/);
    const manifest = JSON.parse(await readFile(path.join(directory, digest("tampered"), "manifest.json"), "utf8"));
    assert.equal(manifest.state, "staging");
    await call(first, { op: "cancel", fileId: "tampered", userId: "fixture-owner" });
  });
  await t.test("a crashed empty initial session is reclaimed without losing occupied reservations", async () => {
    const orphan = path.join(directory, digest("orphan-session"));
    const { mkdir } = await import("node:fs/promises"); await mkdir(orphan, { mode: 0o700 });
    assert.ok((await call(second, { op: "accept", body: body({ fileId: "after-orphan" }), bytes: "AB" })).result);
    await assert.rejects(lstat(orphan), { code: "ENOENT" });
    await call(first, { op: "cancel", fileId: "after-orphan", userId: "fixture-owner" });
  });
  await t.test("a symlinked staging parent is rejected before retaining bytes", async () => {
    const publicDirectory = path.join(scratch, "public"), link = path.join(scratch, "linked-parent");
    const { mkdir } = await import("node:fs/promises"); await mkdir(publicDirectory, { mode: 0o700 });
    await symlink(publicDirectory, link);
    const child = await launch(path.join(link, "staging"));
    const result = await call(child, { op: "accept", body: body(), bytes: "AB" });
    assert.equal(result.status, 500); assert.match(result.error, /symlinked/);
    assert.deepEqual(await readdir(publicDirectory), []); await stop(child);
  });
  await t.test("corrupt manifests fail closed without freeing reservations", async () => {
    await call(first, { op: "accept", body: body({ fileId: "corrupt-manifest" }), bytes: "AB" });
    const file = path.join(directory, digest("corrupt-manifest"), "manifest.json");
    const original = JSON.parse(await readFile(file, "utf8"));
    const mutations = [value => { value.metadata.fileName = "../escape"; },
      value => { value.metadata.userId = "foreign/path"; }, value => { value.bytes = 0; },
      value => { value.metadata.totalChunks = 1; }, value => { value.key += "/escape"; },
      value => { value.state = "complete"; value.token = "not-a-token"; value.digest = "0".repeat(64); }];
    for (const mutate of mutations) {
      const changed = structuredClone(original); mutate(changed); await writeFile(file, JSON.stringify(changed));
      assert.equal((await call(second, { op: "stats" })).status, 500);
    }
    await writeFile(file, JSON.stringify(original));
    assert.deepEqual((await call(first, { op: "stats" })).result, { sessions: 1, reservedBytes: 4, bufferedBytes: 2 });
    await call(second, { op: "cancel", fileId: "corrupt-manifest", userId: "fixture-owner" });
  });
  await t.test("symlinked chunks cannot escape private staging", async () => {
    await call(second, { op: "accept", body: body({ fileId: "symlink", fileSize: "2", totalChunks: "1" }), bytes: "AB" });
    const file = path.join(directory, digest("symlink"), "0.chunk"), target = path.join(scratch, "unrelated");
    await writeFile(target, "AB"); await rm(file); await symlink(target, file);
    const result = await call(first, { op: "begin", fileId: "symlink", userId: "fixture-owner" });
    assert.equal(result.status, 500); assert.equal(await readFile(target, "utf8"), "AB");
  });
});
