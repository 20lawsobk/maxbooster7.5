import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("actual publishing Rust phase fails closed even with a stale binary", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rust-publish-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["scripts", "boosterstate/target", "bin"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync("build.sh", path.join(root, "build.sh"));
  fs.copyFileSync("scripts/build-boosterstate.sh", path.join(root, "scripts/build-boosterstate.sh"));
  fs.copyFileSync("boosterstate/Cargo.toml", path.join(root, "boosterstate/Cargo.toml"));
  fs.writeFileSync(path.join(root, "bin/boosterstate"), "stale", { mode: 0o755 });
  const result = spawnSync("bash", ["build.sh", "--executive-task", "rust"], {
    cwd: root, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Cargo.lock is required/);
  assert.doesNotMatch(result.stdout, /graceful fallback|Ready:/);
  assert.ok(fs.existsSync(path.join(root, "boosterstate/target")), "failed builds retain diagnostics");
});
