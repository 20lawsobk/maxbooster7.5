import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("publishing shell reuses verified artifacts only on its source-less fast path", () => {
  const shell = readFileSync("build.sh", "utf8");
  assert.match(shell, /if \[\[ ! -d client &&\s*! -d server &&\s*-s "\$frontend" &&\s*-s "\$server" &&\s*-s "\$cluster" \]\]/);
  assert.match(shell, /FAST_PATH=1/);
  assert.match(shell, /FAST_PATH=0/);
  assert.match(shell, /PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build/);
  execFileSync("bash", ["-n", "build.sh"]);
  execFileSync("bash", ["-n", "start.sh"]);
});

test("compile path builds the same complete runtime entry set as prepared publishing", () => {
  const script = readFileSync("script/build.ts", "utf8");
  assert.match(script, /await buildServerBundles\(root\)/);
  const entries = readFileSync("script/lib/serverBundles.ts", "utf8");
  for (const name of ["src/index.ts", "server/cluster.ts",
    "server/diffusion-gateway/index.ts", "server/computeSizing.ts",
    "scripts/retained-pdim-recovery-worker.ts"]) assert.ok(entries.includes(name));
  const adapter = readFileSync("src/index.ts", "utf8");
  assert.match(adapter, /import ["']\.\.\/server\/index\.js["']/);
  const buildContract = readFileSync("scripts/start-production.mjs", "utf8");
  assert.match(buildContract, /"shared",\s*"src",\s*"script"/);
  const shell = readFileSync("build.sh", "utf8");
  assert.match(shell, /client server shared src script scripts electron/);
});
