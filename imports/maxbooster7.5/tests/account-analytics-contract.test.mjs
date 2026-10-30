/** Real PostgreSQL -> app aggregate service -> canonical MaxCore ASGI over HTTP.
 * node --import tsx --test tests/account-analytics-contract.test.mjs
 * Requires owned local PostgreSQL tools and the prepared portable Python runtime.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { drizzle } from "drizzle-orm/node-postgres";
import { startDisposablePostgres, loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";

const root = path.resolve(import.meta.dirname, "..");
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test("private owner aggregates reach actual MaxCore statistics without model or learning state", { timeout: 60000 }, async t => {
  const temp = await mkdtemp(path.join(tmpdir(), "account-analytics-contract-"));
  let cluster, python;
  t.after(async () => {
    try {
      if (python && python.exitCode === null) {
        const closed = once(python, "close"); python.kill("SIGTERM"); await closed;
      }
    } finally { try { await cluster?.stop(); } finally { await rm(temp, { recursive: true, force: true }); } }
  });
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const pythonCode = `import sys\nsys.path.insert(0,sys.argv[1])\nfrom fastapi import FastAPI,Header,HTTPException\nfrom ai_model.analytics import create_router\nimport uvicorn\ndef authorize(authorization:str=Header(None)):\n if authorization!='Bearer owned-analytics-contract':raise HTTPException(401,'Unauthorized')\napp=FastAPI()\napp.include_router(create_router(authorize,lambda:None))\nuvicorn.run(app,host='127.0.0.1',port=int(sys.argv[2]),access_log=False,log_level='warning')\n`;
  python = spawn(path.join(root, "python_runtime/bin/python3"), ["-I", "-B", "-c", pythonCode,
    path.join(root, "external/maxcore/artifacts/ai-training-server"), String(port)], {
    cwd: temp, env: { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, LANG: "C.UTF-8",
      OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1",
      ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  python.stdout.on("data", data => { diagnostics += data; }); python.stderr.on("data", data => { diagnostics += data; });
  python.on("error", error => { diagnostics += error.message; });
  const headers = { Authorization: "Bearer owned-analytics-contract", "Content-Type": "application/json" };
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${origin}/api/analytics/capability`, { headers, signal: AbortSignal.timeout(200) })).ok) { ready = true; break; } } catch {}
    if (python.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.ok(ready, `Owned canonical analytics router must start: ${diagnostics.slice(-2000)}`);
  cluster = await startDisposablePostgres();
  await cluster.pool.query(`CREATE TABLE analytics(id bigserial PRIMARY KEY,user_id text NOT NULL,date timestamp NOT NULL,
    streams integer,revenue real,total_listeners integer);
    CREATE TABLE posts(id text PRIMARY KEY,user_id text NOT NULL,published_at timestamp,status text,engagement jsonb);`);
  for (let index = 0; index < 7; index++) {
    const date = `2026-10-${20 + index}T12:00:00`;
    await cluster.pool.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES($1,$2,$3,$4,$5)",
      ["owner-a", date, (index + 1) * 10, (index + 1) * 0.25, (index + 1) * 3]);
    await cluster.pool.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES('owner-b',$1,999999,999999,999999)", [date]);
  }
  await cluster.pool.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES('owner-a','2026-10-19',888888,888888,888888),('owner-a','2026-10-27',777777,777777,777777)");
  const transportModule = await loadDatabaseSubject("server/services/maxcoreControlTransport.ts", {
    "./maxcoreConnector.js": `export const getMaxcoreOrigin=()=>${JSON.stringify(origin)};export const getMaxcoreGenerationHeaders=()=>({Authorization:'Bearer owned-analytics-contract'});export const getMaxcoreAdminHeaders=()=>({});`,
  });
  const calls = [];
  const transport = transportModule.createMaxCoreControlTransport(async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : undefined });
    return fetch(url, options);
  });
  const subject = await loadDatabaseSubject("server/services/accountAnalyticsService.ts", {
    "../db.js": "export const db={execute(){throw Error('Default database forbidden')}};",
    "./maxcoreControlTransport.js": "export const maxCoreControlTransport={request(){throw Error('Default transport forbidden')}};",
  });
  const service = subject.createAccountAnalyticsService({ database: drizzle(cluster.pool), transport, now: () => new Date("2026-10-27T23:59:59Z") });
  let validPrediction, validInsight, validCapability;
  await t.test("capability is dedicated and model-free; unauthorized direct requests fail", async () => {
    const result = await service.capability(); validCapability = result; assert.equal(result.available, true); assert.equal(result.trainedModelRequired, false);
    assert.deepEqual(result.publicContext, { status: "unavailable", usedForForecast: false });
    assert.equal((await fetch(`${origin}/api/analytics/capability`)).status, 401);
  });
  await t.test("calendar-day SQL and MaxCore OLS produce exact owned trend with no foreign/current-day data", async () => {
    validPrediction = await service.predict("owner-a", { metric: "streams", timeframe: "7d" });
    assert.equal(validPrediction.status, "ready"); assert.equal(validPrediction.trend, "up"); assert.equal(validPrediction.accuracy, null);
    assert.deepEqual(validPrediction.dataWindow, { start: "2026-10-20", end: "2026-10-27", dataPoints: 7, missingDays: 0 });
    assert.deepEqual(validPrediction.predictions.map(point => point.value), [80, 90, 100, 110, 120, 130, 140]);
    assert.equal(validPrediction.predictions[0].date, "2026-10-27");
    assert.ok(validPrediction.predictions.every(point => point.confidence === null && point.lower95 === point.value && point.upper95 === point.value));
    assert.equal(calls.at(-1).body.points.length, 7);
    assert.equal(JSON.stringify(calls.at(-1).body).includes("owner-"), false, "No account identifier enters the numeric contract");
  });
  await t.test("owned factual summaries preserve exact currency fractions and listener-observation caveat", async () => {
    const result = await service.insights("owner-a", "7d"); validInsight = result;
    assert.deepEqual(result.metrics, { streams: 280, revenue: 7, listeners: 84 });
    assert.match(result.insight, /280 recorded streams/); assert.match(result.insight, /not a unique audience count/);
    assert.equal(result.method.causalInference, false);
    const revenue = await service.predict("owner-a", { metric: "revenue", timeframe: "7d" });
    assert.equal(revenue.predictions[0].value, 2);
  });
  await t.test("multiple platforms aggregate once per UTC day without flattening missing days", async () => {
    await cluster.pool.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES('owner-c','2026-10-20T00:01',11,0.5,2),('owner-c','2026-10-20T23:59',13,0.25,3),('owner-c','2026-10-26',31,1,4)");
    const result = await service.predict("owner-c", { metric: "streams", timeframe: "7d" });
    assert.equal(result.status, "insufficient_history"); assert.deepEqual(result.predictions, []);
    assert.deepEqual(calls.at(-1).body.points, [{ date: "2026-10-20", value: 24 }, { date: "2026-10-26", value: 31 }]);
    assert.equal(result.dataWindow.missingDays, 5);
  });
  await t.test("empty account does not inherit another owner's data or claim zero performance", async () => {
    const prediction = await service.predict("empty-owner", { metric: "streams", timeframe: "7d" });
    assert.equal(prediction.status, "insufficient_history"); assert.deepEqual(prediction.predictions, []);
    const insight = await service.insights("empty-owner", "7d");
    assert.equal(insight.status, "insufficient_history"); assert.deepEqual(insight.metrics, { streams: null, revenue: null, listeners: null });
    assert.match(insight.insight, /missing observations are not zero/);
  });
  await t.test("lifetime post counters cannot masquerade as timestamped daily engagement history", async () => {
    await cluster.pool.query(`INSERT INTO posts VALUES
      ('a','owner-a','2026-10-20','published','{"likes":2,"comments":3,"shares":4,"saves":1}'),
      ('b','owner-a','2026-10-20','published','{"likes":0}'),
      ('c','owner-a','2026-10-21','published',NULL),
      ('d','owner-a','2026-10-22','draft','{"likes":9999}'),
      ('e','owner-b','2026-10-20','published','{"likes":999999}')`);
    const result = await service.predict("owner-a", { metric: "engagement", timeframe: "7d" });
    assert.equal(result.status, "insufficient_history");
    assert.deepEqual(calls.at(-1).body.points, []);
    assert.equal(result.sourceAvailability.code, "DAILY_ENGAGEMENT_REPORTS_UNAVAILABLE");
  });
  await t.test("invalid input and absent identity reject before SQL or external requests", async () => {
    const before = calls.length;
    await assert.rejects(service.predict(undefined, { metric: "streams", timeframe: "7d" }), /Authentication required/);
    await assert.rejects(service.predict("owner-a", { metric: "streams;DROP TABLE analytics", timeframe: "7d" }), /Valid metric/);
    await assert.rejects(service.insights("owner-a", "1000000d"), /Valid timeframe/);
    assert.equal(calls.length, before);
    assert.equal((await cluster.pool.query("SELECT count(*)::int AS count FROM analytics")).rows[0].count, 19);
  });
  await t.test("invalid recorded numeric values fail explicitly rather than entering public learning or fabricating output", async () => {
    await cluster.pool.query("INSERT INTO analytics(user_id,date,streams,revenue,total_listeners) VALUES('invalid-owner','2026-10-20',-1,1,1)");
    const before = calls.length;
    await assert.rejects(service.predict("invalid-owner", { metric: "streams", timeframe: "7d" }), /invalid observations/);
    assert.equal(calls.length, before);
  });
  await t.test("unavailable or structurally empty MaxCore output never invokes a local forecast fallback", async () => {
    const database = drizzle(cluster.pool), now = () => new Date("2026-10-27");
    for (const response of [null, {}, { ...validPrediction, predictions: [] }, { ...validPrediction, accuracy: 1 }]) {
      const invalid = subject.createAccountAnalyticsService({ database, now, transport: { request: async () => response } });
      await assert.rejects(invalid.predict("owner-a", { metric: "streams", timeframe: "7d" }), /MaxCore returned/);
    }
    const unavailable = subject.createAccountAnalyticsService({ database, now, transport: { request: async () => { throw Error("owned upstream outage"); } } });
    await assert.rejects(unavailable.insights("owner-a", "7d"), /temporarily unavailable/);
  });
  await t.test("generic availability cannot advertise a dedicated model-free no-retention analytics capability", async () => {
    const variants = [null, {}, { available: true, version: 1 }, { ...validCapability, capability: "social-caption" },
      { ...validCapability, methods: ["observed_summary"] }, { ...validCapability, methods: "ordinary_least_squares" },
      { ...validCapability, trainedModelRequired: true }, { ...validCapability, privateDataRetention: "training" },
      { ...validCapability, timeframes: ["7d", "30d"] }, { ...validCapability, timeframes: null }];
    for (const response of variants) {
      const invalid = subject.createAccountAnalyticsService({ database: drizzle(cluster.pool), now: () => new Date("2026-10-27"), transport: { request: async () => response } });
      await assert.rejects(invalid.capability(), /capability unavailable/);
    }
  });
  await t.test("protocol mismatches cannot replace the requested forecast calendar or observation accounting", async () => {
    const variants = [
      { ...validPrediction, predictions: validPrediction.predictions.slice(1) },
      { ...validPrediction, predictions: validPrediction.predictions.map(point => ({ ...point, date: "2026-10-26" })) },
      { ...validPrediction, predictions: validPrediction.predictions.map(point => ({ ...point, date: "2026-10-27T00:00:00Z" })) },
      { ...validPrediction, dataWindow: { ...validPrediction.dataWindow, dataPoints: 6 } },
      { ...validPrediction, dataWindow: { ...validPrediction.dataWindow, missingDays: 1.5 } },
      { ...validPrediction, method: { ...validPrediction.method, trainedModelRequired: true } },
      { ...validPrediction, method: { ...validPrediction.method, uncertainty: "guaranteed_future" } },
      { ...validPrediction, method: { ...validPrediction.method, accuracyCalibrated: true } },
      { ...validPrediction, status: "insufficient_history", predictions: [] },
    ];
    for (const response of variants) {
      const invalid = subject.createAccountAnalyticsService({ database: drizzle(cluster.pool), now: () => new Date("2026-10-27"), transport: { request: async () => response } });
      await assert.rejects(invalid.predict("owner-a", { metric: "streams", timeframe: "7d" }), /MaxCore returned/);
    }
  });
  await t.test("personal summaries reject unbacked totals, impossible counts and ready states without observations", async () => {
    const variants = [
      { ...validInsight, metrics: { ...validInsight.metrics, streams: 999999 } },
      { ...validInsight, metrics: { ...validInsight.metrics, revenue: null } },
      { ...validInsight, dataWindow: { ...validInsight.dataWindow, dataPoints: 7.5 } },
      { ...validInsight, dataWindow: { ...validInsight.dataWindow, missingDays: -1 } },
      { ...validInsight, status: "insufficient_history" },
      { ...validInsight, insight: "" },
    ];
    for (const response of variants) {
      const invalid = subject.createAccountAnalyticsService({ database: drizzle(cluster.pool), now: () => new Date("2026-10-27"), transport: { request: async () => response } });
      await assert.rejects(invalid.insights("owner-a", "7d"), /MaxCore returned/);
    }
    const emptyLie = subject.createAccountAnalyticsService({ database: drizzle(cluster.pool), now: () => new Date("2026-10-27"),
      transport: { request: async () => ({ ...validInsight, dataWindow: { ...validInsight.dataWindow, dataPoints: 0, missingDays: 7 },
        metrics: { streams: null, revenue: null, listeners: null } }) } });
    await assert.rejects(emptyLie.insights("empty-owner", "7d"), /MaxCore returned/);
  });
  assert.ok(calls.every(call => ["/api/analytics/capability", "/api/analytics/predict", "/api/analytics/insights"].includes(new URL(call.url).pathname)),
    "No public ingestion/training/generation-fallback endpoint receives private analytics");
});
