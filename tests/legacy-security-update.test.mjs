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
const bundle = (...files) => ({ schemaVersion: 1, files });
test("replay is opt-in, idempotent, and preserves unrelated files", t => {
  const root = fixture(t), update = bundle(entry());
  assert.equal(applyLegacyUpdate(root, update).pending.length, 1);
  assert.equal(fs.readFileSync(path.join(root, entry().path), "utf8"), "old");
  assert.equal(applyLegacyUpdate(root, update, { apply: true }).applied.length, 1);
  assert.equal(applyLegacyUpdate(root, update, { apply: true }).applied.length, 0);
  assert.equal(fs.readFileSync(path.join(root, "maxbooster7.5/keep.txt"), "utf8"), "user content");
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
  assert.throws(() => applyLegacyUpdate(root, bundle({ ...entry(), path: "maxbooster7.5/../package.json" })), /Unsafe/);
  assert.throws(() => applyLegacyUpdate(root, bundle(entry(), entry())), /duplicate/);
  fs.symlinkSync("package.json", path.join(root, "maxbooster7.5/link.json"));
  assert.throws(() => applyLegacyUpdate(root, bundle(entry("link.json")), { apply: true }), /Symlink/);
});