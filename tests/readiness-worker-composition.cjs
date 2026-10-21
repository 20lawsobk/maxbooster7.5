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
  await assertWorkerSchema(async sql => {
    queries.push(sql);
    return queries.length === 1
      ? { rows: [{ current_schema: "public", missing_relations: [] }] }
      : { rows: [] };
  }, true, true);
  assert.equal(queries.length, 9);
  assert.match(queries[0], /current_schema\(\)[\s\S]*to_regclass/);
  assert.ok(queries.slice(1).every(sql => /^SELECT .* LIMIT 0$/.test(sql)));
  await assert.rejects(assertWorkerSchema(async () => {
    throw new Error("migration missing");
  }, true, true), /migration missing/);
});

test("missing relation names the selected database variable and the fallback cause", async () => {
  const missing = Object.assign(new Error('relation "integration_catalog_jobs" does not exist'), { code: "42P01" });
  await assert.rejects(assertWorkerSchema(async () => { throw missing; }, false, false, "DATABASE_URL"),
    err => err.name === "WorkerSchemaUnavailableError" && err.cause === missing &&
      /selected by DATABASE_URL/.test(err.message) && /NEON_DATABASE_URL is not set/.test(err.message) &&
      /integration_catalog_jobs/.test(err.message) && /performs no DDL/.test(err.message));
  await assert.rejects(assertWorkerSchema(async () => { throw missing; }, false, false, "NEON_DATABASE_URL"),
    err => /selected by NEON_DATABASE_URL/.test(err.message) && !/fell back/.test(err.message));
  const network = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  await assert.rejects(assertWorkerSchema(async () => { throw network; }, false, false, "DATABASE_URL"),
    err => err === network);
});

test("database source mirrors application precedence", () => {
  const { databaseSourceName } = mod.exports;
  assert.equal(databaseSourceName({ NEON_DATABASE_URL: "postgres://a", DATABASE_URL: "postgres://b" }), "NEON_DATABASE_URL");
  assert.equal(databaseSourceName({ DATABASE_URL: "postgres://b" }), "DATABASE_URL");
  assert.equal(databaseSourceName({}), "none");
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