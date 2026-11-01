const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const Module = require("node:module");
const compiled = buildSync({
  entryPoints: ["server/lib/readinessWorkerLifecycle.ts"],
  bundle: true, platform: "node", format: "cjs", write: false,
}).outputFiles[0].text;
const mod = new Module("readiness-worker-fixture");
mod._compile(compiled, "readiness-worker-fixture.cjs");
const { scheduleDrainingWork, assertWorkerSchema } = mod.exports;

test("schema failure prevents startup and probes are read only", async () => {
  const queries = [];
  await assertWorkerSchema(async sql => queries.push(sql), true, true);
  assert.equal(queries.length, 7);
  assert.ok(queries.every(sql => /^SELECT .* LIMIT 0$/.test(sql)));
  await assert.rejects(assertWorkerSchema(async () => {
    throw new Error("migration missing");
  }, true, true), /migration missing/);
});

test("scheduler serializes work, stops future ticks, and drains active work", async () => {
  let finish;
  let count = 0;
  const stop = scheduleDrainingWork(() => {
    count++;
    return new Promise(resolve => { finish = resolve; });
  }, 2, error => { throw error; });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(count, 1);
  let drained = false;
  const drain = stop().then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(drained, false);
  finish();
  await drain;
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.equal(count, 1);
});

test("rejected work is reported rather than an unhandled timer rejection", async () => {
  const errors = [];
  const stop = scheduleDrainingWork(async () => { throw new Error("unavailable"); },
    1000, error => errors.push(error.message));
  await new Promise(resolve => setImmediate(resolve));
  await stop();
  assert.deepEqual(errors, ["unavailable"]);
});