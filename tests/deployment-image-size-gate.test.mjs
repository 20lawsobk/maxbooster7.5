import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const gate = path.resolve("script/deployment/image-size-gate.sh");

test("image size gate blocks before publishing when a release exceeds its budget", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-image-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "payload.bin"), Buffer.alloc(2048));

  const result = spawnSync("bash", [gate, root, "1024"], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /BLOCKED: release footprint is/);
  assert.match(result.stderr, /Largest top-level paths/);
  assert.equal(fs.statSync(path.join(root, "payload.bin")).size, 2048, "the gate must not delete release contents");
});

test("image size gate measures the actual release root and excludes only .git/.local", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-image-budget-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "payload.bin"), Buffer.alloc(2048));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, ".git", "ignored.bin"), Buffer.alloc(4096));
  fs.mkdirSync(path.join(root, ".local"));
  fs.writeFileSync(path.join(root, ".local", "ignored.bin"), Buffer.alloc(4096));

  const result = spawnSync("bash", [gate, root, "8192"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: release footprint is/);
});

test("image size gate rejects invalid limits and roots explicitly", () => {
  const invalidLimit = spawnSync("bash", [gate, ".", "8GB"], { encoding: "utf8" });
  assert.equal(invalidLimit.status, 2);
  assert.match(invalidLimit.stderr, /positive integer/);

  const missingRoot = spawnSync("bash", [gate, path.join(os.tmpdir(), "no-such-release-root"), "1024"], { encoding: "utf8" });
  assert.equal(missingRoot.status, 2);
  assert.match(missingRoot.stderr, /root does not exist/);
});

test("generated video exclusion rules remain configured (not proof of platform behavior)", () => {
  const tracked = spawnSync("git", [
    "check-ignore", "--no-index", "-q", "public/generated-content/videos/beat_ad_publish_guard.mp4",
  ]);
  assert.equal(tracked.status, 0, "generated video output must stay excluded by .gitignore");
  const dockerignore = fs.readFileSync(".dockerignore", "utf8");
  assert.match(dockerignore, /^public\/generated-content\/$/m);
});

test("the actual finalize phase runs after source removal and rejects an oversized sparse payload", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-finalize-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "dist/deployment"), { recursive: true });
  fs.mkdirSync(path.join(root, ".local/state"), { recursive: true });
  fs.copyFileSync(gate, path.join(root, "dist/deployment/image-size-gate.sh"));
  fs.copyFileSync("build.sh", path.join(root, "build.sh"));
  fs.writeFileSync(path.join(root, ".local/state/build-path"), "0");
  const options = { cwd: root, encoding: "utf8", timeout: 15000,
    env: { ...process.env, DEPLOY_STATE_DIR: path.join(root, ".local/state") } };
  assert.equal(fs.existsSync(path.join(root, "script")), false);
  const success = spawnSync("bash", ["build.sh", "--executive-task", "finalize"], options);
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /Build complete/);

  const payload = fs.openSync(path.join(root, "oversized.pdim"), "w");
  try { fs.ftruncateSync(payload, 8_000_000_001); } finally { fs.closeSync(payload); }
  const failure = spawnSync("bash", ["build.sh", "--executive-task", "finalize"], options);
  assert.equal(failure.status, 1, failure.stderr);
  assert.match(failure.stderr, /BLOCKED/);
  assert.doesNotMatch(failure.stdout, /Build complete/);
  assert.equal(fs.statSync(path.join(root, "oversized.pdim")).size, 8_000_000_001);
});

test("the configured publishing build runs the image-size gate before reporting success", () => {
  const repl = fs.readFileSync(".replit", "utf8");
  const build = fs.readFileSync("build.sh", "utf8");
  assert.match(repl, /build\s*=\s*\[\s*"bash"\s*,\s*"build\.sh"\s*\]/);
  assert.match(repl, /run\s*=\s*\[\s*"bash"\s*,\s*"start\.sh"\s*\]/);
  const finalize = build.slice(build.indexOf("phase_finalize()"));
  assert.match(build, /cp script\/deployment\/image-size-gate\.sh dist\/deployment\//);
  assert.match(finalize, /dist\/deployment\/image-size-gate\.sh/);
  assert.match(finalize, /image-size-gate\.sh/);
  assert.ok(finalize.indexOf("image-size-gate.sh") < finalize.indexOf("Build complete"));
});
