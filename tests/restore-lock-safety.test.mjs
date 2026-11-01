import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireRestoreLock } from "../dist/pdim-restore.mjs";

test("restore lock timeout never authorizes concurrent extraction or deletes a live owner's lock", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lock = path.join(root, "node_modules.pdim-restore.lock");
  fs.writeFileSync(lock, String(process.pid));
  await assert.rejects(acquireRestoreLock("node_modules", { root, timeoutMs: 25 }), /refusing concurrent extraction/);
  assert.equal(fs.readFileSync(lock, "utf8"), String(process.pid));
});

test("uncontended restore releases only after work completes", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const release = await acquireRestoreLock("external/maxcore", { root });
  const lock = path.join(root, "external_maxcore.pdim-restore.lock");
  assert.equal(fs.readFileSync(lock, "utf8"), String(process.pid));
  release();
  assert.equal(fs.existsSync(lock), false);
});