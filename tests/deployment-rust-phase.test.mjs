import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

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

test("real Rust compilation survives concurrent workspace cleanup", {
  skip: process.env.RUN_RUST_TOOLCHAIN_TESTS !== "1",
  timeout: 240000,
}, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rust-publish-concurrent-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["scripts", "boosterstate", "scratch"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  for (const file of ["build.sh", "scripts/build-boosterstate.sh", "scripts/boosterstate-toolchain.nix", "scripts/prepare-rust-toolchain.py",
    "boosterstate/Cargo.toml", "boosterstate/Cargo.lock"]) {
    fs.copyFileSync(file, path.join(root, file));
  }
  fs.cpSync("boosterstate/src", path.join(root, "boosterstate/src"), { recursive: true });
  const child = spawn("bash", ["build.sh", "--executive-task", "rust"], {
    cwd: root,
    env: { ...process.env, TMPDIR: path.join(root, "scratch"), DEPLOY_TASK_CPU: "2" },
    detached: true,
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const cleanup = setInterval(() => {
    for (const dir of [".cache", "boosterstate/target"]) {
      fs.rmSync(path.join(root, dir), { recursive: true, force: true });
    }
  }, 100);
  const deadline = setTimeout(() => process.kill(-child.pid, "SIGKILL"), 220000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0, output);
    fs.accessSync(path.join(root, "bin/boosterstate"), fs.constants.X_OK);
    assert.deepEqual(fs.readdirSync(path.join(root, "scratch")), [], "private build scratch is cleaned");
  } finally {
    clearInterval(cleanup);
    clearTimeout(deadline);
  }
});
