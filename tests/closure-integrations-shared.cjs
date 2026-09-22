const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function storageFixture() {
  const source = fs.readFileSync("server/storage.ts", "utf8");
  const start = source.indexOf("  async updateScheduledPost(");
  const end = source.indexOf("  async getSocialMetrics(", start);
  assert.ok(start > 0 && end > start);
  const compiled = ts.transpileModule(`export class Storage { ${source.slice(start, end)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics.length, 0);
  const exports = {};
  const writes = [];
  const sql = (strings, ...values) => ({ text: strings.join("?"), values });
  const db = { update: () => ({ set: values => {
    writes.push(values);
    return { where: () => ({ returning: async () => [{ id: "post" }] }) };
  } }) };
  vm.runInNewContext(compiled.outputText, { exports, db, sql, Date,
    posts: { id: "post_id", engagement: "engagement_column" }, eq: () => true });
  return { storage: new exports.Storage(), writes };
}

test("shared scheduled-post updates merge metadata and protect ambiguous/confirmed receipts", async () => {
  const { storage, writes } = storageFixture();
  await storage.updateScheduledPost("post", {
    results: [{ platform: "instagram", success: true, postId: "receipt" }],
    content: { text: "caption" }, platforms: ["instagram", "facebook"],
    viralPrediction: { score: 0 }, createdBy: "manual", status: "completed",
  });
  const saved = writes[0];
  assert.equal(saved.platform, "instagram");
  assert.equal(saved.content, '{"text":"caption"}');
  assert.ok(saved.publishedAt instanceof Date);
  assert.equal(Array.isArray(saved.engagement), false);
  assert.match(saved.engagement.text, /THEN \?::jsonb ELSE '\{\}'::jsonb END/);
  assert.match(saved.engagement.text, /IN \('started','unknown','confirmed'\)/);
  assert.match(saved.engagement.text, /jsonb_build_object\('postingResults'/);
  assert.match(saved.engagement.text, /UNION ALL/);
  const metadata = saved.engagement.values.filter(v => typeof v === "string")
    .find(v => v.includes('"platforms"'));
  assert.deepEqual(JSON.parse(metadata), { content: { text: "caption" },
    platforms: ["instagram", "facebook"], viralPrediction: { score: 0 }, createdBy: "manual" });
  assert.equal("results" in saved, false);
  assert.equal("createdBy" in saved, false);
});

test("compatibility status method delegates to the same atomic merge; status-only retains engagement", async () => {
  const { storage, writes } = storageFixture();
  await storage.updateScheduledPostStatus("post", "completed", [{ platform: "youtube", success: true }]);
  assert.match(writes[0].engagement.text, /postingResults/);
  assert.ok(writes[0].publishedAt instanceof Date);
  await storage.updateScheduledPostStatus("post", "failed");
  assert.equal(writes[1].status, "failed");
  assert.equal("engagement" in writes[1], false);
});

test("raw engagement replacement and malformed result arrays fail before writing", async () => {
  const { storage, writes } = storageFixture();
  await assert.rejects(storage.updateScheduledPost("post", { engagement: { postingResults: [] } }), /named metadata/);
  await assert.rejects(storage.updateScheduledPost("post", { results: {} }), /must be an array/);
  assert.equal(writes.length, 0);
});

test("digest is schema-gated and registered with the real draining lifecycle", () => {
  const source = fs.readFileSync("server/index.ts", "utf8");
  const check = source.indexOf("FROM integration_notification_digest LIMIT 0");
  assert.ok(check > 0);
  assert.ok(check < source.indexOf("databaseBackupService.initialize()"));
  assert.ok(check < source.indexOf("scheduleDrainingWork(runCatalogDiscoveryJobs"));
  assert.match(source, /readinessWorkerStops\.push\(scheduleDrainingWork\(runNotificationDigestBatch, 60_000,/);
  assert.match(source, /readinessWorkerStops\.splice\(0\)\.map\(stop => Promise\.resolve\(\)\.then/);
});