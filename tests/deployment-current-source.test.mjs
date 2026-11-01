import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("historical publishing shell only reuses prebuilt output for source-less input", () => {
  const shell = readFileSync("build.sh", "utf8");
  assert.match(shell, /if \[ ! -d client \] && \[ ! -d server \]/);
  assert.match(shell, /PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build/);
  execFileSync("bash", ["-n", "build.sh"]);
  execFileSync("bash", ["-n", "start.sh"]);
});

test("compile path builds the same complete runtime entry set as prepared publishing", () => {
  const script = readFileSync("script/build.ts", "utf8");
  assert.match(script, /await buildServerBundles\(root\)/);
  const entries = readFileSync("script/lib/serverBundles.ts", "utf8");
  for (const name of ["server/index.ts", "server/cluster.ts",
    "server/diffusion-gateway/index.ts", "server/computeSizing.ts",
    "scripts/retained-pdim-recovery-worker.ts"]) assert.ok(entries.includes(name));
});
