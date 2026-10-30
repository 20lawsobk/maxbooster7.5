import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeBuildPaths } from "../script/lib/deploymentPackRecovery.mjs";

test("native cleanup handles exact argv paths and never follows directory symlinks", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-cleanup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outside = path.join(root, "retained");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "evidence"), "unchanged");
  const tree = path.join(root, "remove; $(not-a-command)");
  fs.mkdirSync(tree);
  fs.symlinkSync(outside, path.join(tree, "external"), "dir");
  fs.writeFileSync(path.join(tree, "file"), "remove");
  const link = path.join(root, "--directory-link");
  fs.symlinkSync(outside, link, "dir");
  removeBuildPaths([tree, link, path.join(root, "already-missing")]);
  assert.equal(fs.existsSync(tree), false);
  assert.equal(fs.existsSync(link), false);
  assert.equal(fs.readFileSync(path.join(outside, "evidence"), "utf8"), "unchanged");
  removeBuildPaths([]);
});

test("native cleanup validates the entire request before any deletion", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-cleanup-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const invalid of ["/", "relative", "/tmp/../etc", `${root}/`, null]) {
    assert.throws(() => removeBuildPaths([root, invalid]), /normalized absolute non-root/);
    assert.equal(fs.existsSync(root), true);
  }
});