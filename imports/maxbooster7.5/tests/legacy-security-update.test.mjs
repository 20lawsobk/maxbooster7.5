import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { applyLegacyUpdate } from "../scripts/apply-legacy-security-update.mjs";

const hash = content => createHash("sha256").update(content).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-upgrade-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "maxbooster7.5"));
  fs.writeFileSync(path.join(root, "maxbooster7.5/package.json"), "old");
  fs.writeFileSync(path.join(root, "maxbooster7.5/keep.txt"), "user content");
  return root;
}
const entry = (name = "package.json") => ({
  path: `maxbooster7.5/${name}`, content: "patched",
  beforeSha256: hash("old"), afterSha256: hash("patched"),
});
const addEntry = (name, content = "new file") => ({
  path: `maxbooster7.5/${name}`, operation: "add", content,
  beforeSha256: null, afterSha256: hash(content),
});
const bundle = (...files) => ({ schemaVersion: 1, files });
test("replay is opt-in, idempotent, and preserves unrelated files", t => {
  const root = fixture(t), update = bundle(entry());
  assert.equal(applyLegacyUpdate(root, update).pending.length, 1);
  assert.equal(fs.readFileSync(path.join(root, entry().path), "utf8"), "old");
  assert.equal(applyLegacyUpdate(root, update, { apply: true }).applied.length, 1);
  assert.equal(applyLegacyUpdate(root, update, { apply: true }).applied.length, 0);
  assert.equal(fs.readFileSync(path.join(root, "maxbooster7.5/keep.txt"), "utf8"), "user content");
});
test("successive updates accept original and verified predecessors, never custom edits", t => {
  const root = fixture(t), file = path.join(root, entry().path);
  const update = bundle({ ...entry(), acceptedBeforeSha256: [hash("previous patch")] });
  for (const startingContent of ["old", "previous patch", "patched"]) {
    fs.writeFileSync(file, startingContent);
    applyLegacyUpdate(root, update, { apply: true });
    assert.equal(fs.readFileSync(file, "utf8"), "patched");
    assert.deepEqual(applyLegacyUpdate(root, update, { apply: true }).applied, []);
  }
  fs.writeFileSync(file, "custom");
  assert.throws(() => applyLegacyUpdate(root, update, { apply: true }), /refusing overwrite/);
  assert.equal(fs.readFileSync(file, "utf8"), "custom");
});
test("invalid predecessor lists and predecessors on additions are rejected", t => {
  const root = fixture(t);
  for (const acceptedBeforeSha256 of ["not-array", ["bad-hash"], [null], [123]]) {
    assert.throws(() => applyLegacyUpdate(root, bundle({ ...entry(), acceptedBeforeSha256 })), /checksum/);
  }
  assert.throws(() => applyLegacyUpdate(root, bundle({
    ...addEntry("new.json"), acceptedBeforeSha256: [hash("old")],
  })), /checksum/);
});
test("guarded additions create only absent files and replay idempotently", t => {
  const root = fixture(t), update = bundle(addEntry("server/services/acmeCrypto.ts", "native helper"));
  fs.mkdirSync(path.join(root, "maxbooster7.5/server/services"), { recursive: true });
  assert.deepEqual(applyLegacyUpdate(root, update).pending, ["maxbooster7.5/server/services/acmeCrypto.ts"]);
  assert.deepEqual(applyLegacyUpdate(root, update, { apply: true }).applied, ["maxbooster7.5/server/services/acmeCrypto.ts"]);
  assert.equal(fs.readFileSync(path.join(root, "maxbooster7.5/server/services/acmeCrypto.ts"), "utf8"), "native helper");
  assert.deepEqual(applyLegacyUpdate(root, update, { apply: true }).applied, []);
});
test("guarded additions refuse existing custom files and symlinks", t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "maxbooster7.5/server/services"), { recursive: true });
  const custom = addEntry("server/services/acmeCrypto.ts", "native helper");
  fs.writeFileSync(path.join(root, custom.path), "custom");
  assert.throws(() => applyLegacyUpdate(root, bundle(custom), { apply: true }), /refusing add/);
  fs.unlinkSync(path.join(root, custom.path));
  fs.symlinkSync("package.json", path.join(root, custom.path));
  assert.throws(() => applyLegacyUpdate(root, bundle(custom), { apply: true }), /Symlink/);
});
test("preflight rejects custom edits before changing another file", t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "maxbooster7.5/custom.json"), "custom changes");
  assert.throws(() => applyLegacyUpdate(root, bundle(entry(), entry("custom.json")), { apply: true }), /refusing overwrite/);
  assert.equal(fs.readFileSync(path.join(root, entry().path), "utf8"), "old");
});
test("invalid hashes, traversal, duplicates, and symlinks fail closed", t => {
  const root = fixture(t);
  assert.throws(() => applyLegacyUpdate(root, bundle({ ...entry(), content: "tampered" }), { apply: true }), /checksum/);
  assert.throws(() => applyLegacyUpdate(root, bundle({ ...addEntry("new.json"), beforeSha256: hash("old") }), { apply: true }), /checksum/);
  assert.throws(() => applyLegacyUpdate(root, bundle({ ...addEntry("new.json"), operation: "replace" }), { apply: true }), /checksum/);
  assert.throws(() => applyLegacyUpdate(root, bundle({ ...entry(), path: "maxbooster7.5/../package.json" })), /Unsafe/);
  assert.throws(() => applyLegacyUpdate(root, bundle(entry(), entry())), /duplicate/);
  fs.symlinkSync("package.json", path.join(root, "maxbooster7.5/link.json"));
  assert.throws(() => applyLegacyUpdate(root, bundle(entry("link.json")), { apply: true }), /Symlink/);
});