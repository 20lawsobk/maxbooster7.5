import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";

// Execute only the production snapshot function, never the suite runner.
const source = fs.readFileSync("scripts/readiness-beta-simulation.mjs", "utf8");
const start = source.indexOf("function preservePreviousReport() {");
const end = source.indexOf("\nconst node = ", start);
assert.ok(start > 0 && end > start);

test("beta progress replacement preserves immutable previous report bytes and checksums", t => {
  const dir = fs.mkdtempSync(join(tmpdir(), "beta-history-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const reportBase = join(dir, "beta-simulation");
  const snapshot = runInNewContext(`${source.slice(start, end)}\npreservePreviousReport;`, {
    ...fs, reportBase, join, createHash, randomUUID, Date,
  });
  assert.equal(snapshot(), null);
  const previous = { json: '{"finishedAt":"previous","results":[]}\n', md: "# Previous evidence\n" };
  for (const [ext, bytes] of Object.entries(previous)) fs.writeFileSync(`${reportBase}.${ext}`, bytes);
  const saved = snapshot();
  assert.equal(saved.files.length, 2);
  for (const entry of saved.files) {
    const ext = entry.path.split(".").at(-1);
    assert.equal(fs.readFileSync(entry.path, "utf8"), previous[ext]);
    assert.equal(entry.sha256, createHash("sha256").update(previous[ext]).digest("hex"));
  }
  fs.writeFileSync(`${reportBase}.json`, '{"startedAt":"new","results":[]}\n');
  const next = snapshot();
  assert.notEqual(next.directory, saved.directory);
  assert.equal(fs.readFileSync(saved.files[0].path, "utf8"), previous.json);
  assert.equal(fs.readFileSync(next.files[0].path, "utf8"), '{"startedAt":"new","results":[]}\n');
});

test("closure suite inputs exist and incomplete latest cycles are explicitly described", () => {
  for (const file of [
    "server/services/accountErasureWorkflow.test.ts",
    "tests/closure-integrations.cjs", "tests/closure-integrations-shared.cjs",
    "tests/runtime-artifact-gates.test.mjs", "tests/nested-reconciliation.test.mjs",
    "server/services/backup/__tests__/postgresTools.test.ts",
  ]) {
    assert.ok(fs.existsSync(file), file);
    assert.ok(source.includes(`"${file}"`), `${file} must be scheduled`);
  }
  assert.match(source, /latest started cycle/);
  assert.match(source, /absent finishedAt means incomplete/);
  assert.doesNotMatch(source, /Only the latest cycle is retained/);
  assert.ok(source.indexOf("report.previousReport = preservePreviousReport();") < source.indexOf("  save();\n  for (const command"));
});