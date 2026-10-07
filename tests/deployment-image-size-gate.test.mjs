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

test("large generated video assets remain excluded from the published workspace", () => {
  const tracked = spawnSync("git", [
    "check-ignore", "--no-index", "-q", "public/generated-content/videos/beat_ad_publish_guard.mp4",
  ]);
  assert.equal(tracked.status, 0, "generated video output must stay excluded by .gitignore");
  const dockerignore = fs.readFileSync(".dockerignore", "utf8");
  assert.match(dockerignore, /^public\/generated-content\/$/m);
});
