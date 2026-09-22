const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const vm = require("node:vm");
const ts = require("typescript");
const { Client } = require("pg");

function fixture(row) {
  const source = fs.readFileSync("server/storage.ts", "utf8");
  const getStart = source.indexOf("  async getScheduledPostById(");
  const updateStart = source.indexOf("  async updateScheduledPost(");
  const updateEnd = source.indexOf("  async getSocialMetrics(", updateStart);
  assert.ok(getStart > 0 && updateStart > getStart && updateEnd > updateStart);
  const methods = source.slice(getStart, source.indexOf("  // ── Social-post aliases", getStart)) +
    source.slice(updateStart, updateEnd);
  const compiled = ts.transpileModule(`export class Storage { ${methods} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);

  const exports = {};
  const writes = [];
  const sql = (strings, ...values) => ({ text: strings.join("?"), values });
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => row ? [row] : [] }) }) }),
    update: () => ({ set: values => {
      writes.push(values);
      return { where: () => ({ returning: async () => [{ id: "post" }] }) };
    } }),
  };
  vm.runInNewContext(compiled.outputText, {
    exports, db, sql, Date,
    posts: { id: "post_id", engagement: "engagement_column" },
    eq: () => true,
  });
  return { storage: new exports.Storage(), writes };
}

test("scheduled-post reads accept root arrays, legacy results, current results, and mixed metadata", async () => {
  const rootReceipt = { platform: "root", outcome: "unknown" };
  let harness = fixture({ id: "root", platform: "root", content: "caption",
    scheduledAt: new Date(0), engagement: [rootReceipt] });
  assert.deepEqual(JSON.parse(JSON.stringify((await harness.storage.getScheduledPostById("root")).results)),
    [rootReceipt]);

  const current = { platform: "instagram", outcome: "confirmed" };
  const legacy = { platform: "youtube", success: true };
  harness = fixture({ id: "mixed", platform: "fallback", content: "old",
    scheduledAt: new Date(0), engagement: {
      postingResults: [current],
      results: [legacy],
      platforms: ["instagram", "youtube"],
      content: { text: "legacy metadata" },
      viralPrediction: 0,
      createdBy: "legacy-worker",
      unrelated: { retained: true },
    } });
  const loaded = await harness.storage.getScheduledPostById("mixed");
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.results)), [current, legacy]);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.content)), { text: "legacy metadata" });
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.platforms)), ["instagram", "youtube"]);
  assert.equal(loaded.viralPrediction, 0);
  assert.equal(loaded.createdBy, "legacy-worker");
});

test("scheduled-post SQL atomically canonicalizes every receipt shape without metadata loss", async () => {
  const { storage, writes } = fixture(null);
  await storage.updateScheduledPost("post", {
    results: [{ platform: "instagram", outcome: "failed", success: false }],
    viralPrediction: 0,
  });
  const expression = writes[0].engagement;
  assert.match(expression.text, /WITH engagement_object AS/);
  assert.match(expression.text, /->'postingResults'\) = 'array'/);
  assert.match(expression.text, /->'results'\) = 'array'/);
  assert.match(expression.text, /jsonb_typeof\(\?::jsonb\) = 'array'/);
  assert.match(expression.text, /SELECT \(value - 'results'\)/,
    "legacy receipt key is removed only after its entries enter the canonical aggregate");
  assert.match(expression.text, /incoming\.outcome_rank > existing\.outcome_rank/);
  assert.match(expression.text, /existing\.operation_key = incoming\.operation_key/);
  assert.match(expression.text, /existing\.outcome_rank > 0/);
  assert.match(expression.text, /FROM engagement_object/,
    "the merge starts with the row's object, preserving unrelated metadata");
  assert.deepEqual(JSON.parse(expression.values.find(value =>
    typeof value === "string" && value.includes("viralPrediction"))),
    { viralPrediction: 0 });
});

function postgresBinary(name) {
  const postgres = childProcess.execFileSync("bash", ["-c", "command -v postgres"],
    { encoding: "utf8" }).trim();
  return path.join(path.dirname(postgres), name);
}

function renderExpression(expression) {
  const parameters = [];
  const pieces = expression.text.split("?");
  let text = pieces[0];
  expression.values.forEach((value, index) => {
    if (value === "engagement_column") {
      text += "engagement";
    } else {
      parameters.push(value);
      text += `$${parameters.length}`;
    }
    text += pieces[index + 1];
  });
  return { text, parameters };
}

test("real PostgreSQL merge progresses only the same operation and never downgrades confirmation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-compat-pg-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  fs.mkdirSync(socket);
  const initdb = postgresBinary("initdb");
  const pgCtl = postgresBinary("pg_ctl");
  const port = 25432 + (process.pid % 1000);
  childProcess.execFileSync(initdb, ["-D", data, "-A", "trust", "-U", "postgres", "--no-locale"],
    { stdio: "ignore" });
  childProcess.execFileSync(pgCtl,
    ["-D", data, "-o", `-F -h '' -k ${socket} -p ${port}`, "-w", "start"],
    { stdio: "ignore" });
  t.after(() => {
    childProcess.execFileSync(pgCtl, ["-D", data, "-m", "fast", "-w", "stop"],
      { stdio: "ignore" });
    fs.rmSync(root, { recursive: true, force: true });
  });

  const client = new Client({ host: socket, port, user: "postgres", database: "postgres" });
  await client.connect();
  t.after(() => client.end());
  await client.query("CREATE TABLE receipt_posts (id integer PRIMARY KEY, engagement jsonb)");
  const at = "2026-09-22T10:00:00.000Z";

  async function save(results, metadata = {}) {
    const { storage, writes } = fixture(null);
    await storage.updateScheduledPost("post", {
      ...(results === undefined ? {} : { results }),
      ...metadata,
    });
    const rendered = renderExpression(writes[0].engagement);
    const updated = await client.query(
      `UPDATE receipt_posts SET engagement = ${rendered.text} WHERE id = 1 RETURNING engagement`,
      rendered.parameters,
    );
    return updated.rows[0].engagement;
  }

  await client.query("INSERT INTO receipt_posts VALUES (1, $1::jsonb)", [JSON.stringify({
    results: [{ platform: "instagram", outcome: "started", success: false, postedAt: at }],
    unrelated: { legacy: true },
    content: { text: "keep me" },
  })]);
  let engagement = await save(undefined, { viralPrediction: 0 });
  assert.deepEqual(engagement.unrelated, { legacy: true });
  assert.deepEqual(engagement.content, { text: "keep me" });
  assert.equal(engagement.viralPrediction, 0);
  assert.equal("results" in engagement, false);
  assert.equal(engagement.postingResults[0].outcome, "started");

  engagement = await save([
    { platform: "instagram", outcome: "unknown", success: false, postedAt: at, error: "lost ack" },
  ]);
  assert.deepEqual(engagement.postingResults.map(receipt => receipt.outcome), ["unknown"]);

  engagement = await save([
    { platform: "instagram", outcome: "confirmed", success: true, postedAt: at, postId: "remote-1" },
  ]);
  assert.deepEqual(engagement.postingResults.map(receipt => receipt.outcome), ["confirmed"]);
  assert.equal(engagement.postingResults[0].postId, "remote-1");

  engagement = await save([
    { platform: "instagram", outcome: "unknown", success: false, postedAt: at, error: "stale" },
  ]);
  assert.equal(engagement.postingResults.length, 1);
  assert.equal(engagement.postingResults[0].outcome, "confirmed",
    "a confirmed operation cannot be downgraded");

  await client.query("UPDATE receipt_posts SET engagement = $1::jsonb WHERE id = 1", [JSON.stringify({
    postingResults: [
      { platform: "youtube", outcome: "unknown", success: false, postedAt: at },
    ],
    unrelated: { current: true },
  })]);
  engagement = await save(undefined, { createdBy: "reconciler" });
  assert.deepEqual(engagement.unrelated, { current: true });
  assert.equal(engagement.postingResults[0].outcome, "unknown");

  engagement = await save([
    { platform: "youtube", outcome: "confirmed", success: true,
      postedAt: "2026-09-22T11:00:00.000Z", postId: "different-operation" },
  ]);
  assert.equal(engagement.postingResults.length, 1);
  assert.equal(engagement.postingResults[0].outcome, "unknown",
    "same platform is not enough to replace a protected receipt from another operation");
});