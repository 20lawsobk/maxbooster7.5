import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { buildPlan, startPlan } from "../script/deployment/plans.mjs";

test("publishing graph builds the application remainder before finalizing", () => {
  const tasks = new Map(buildPlan().map(task => [task.id, task]));
  assert.deepEqual(tasks.get("remainder")?.deps, ["source"]);
  assert.deepEqual(tasks.get("finalize")?.deps, ["remainder"]);
  assert.deepEqual(tasks.get("remainder")?.args, ["build.sh", "--executive-task", "remainder"]);

  const restore = startPlan(process.execPath).find(task => task.id === "restore-app");
  assert.deepEqual(restore?.args.slice(1), [
    "app_remainder.pdim", "app_remainder.manifest.json", ".", ".pdim-restored-app",
  ]);

  const shell = fs.readFileSync("build.sh", "utf8");
  assert.match(shell, /phase_remainder\(\)\s*\{/);
  assert.match(shell, /node dist\/publish-capsules\.mjs remainder app_remainder\.pdim/);
  assert.match(shell, /\|source\|remainder\|assets\|finalize\)/);
  assert.match(shell, /Required startup capsule or manifest missing/);
  const packer = fs.readFileSync("script/publish-capsules.ts", "utf8");
  assert.match(packer, /mode === "remainder"/);
  assert.match(packer, /preserveSource: false/);
});

test("remainder inventory retains pre-restore modules and selects runtime assets", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maxbooster-remainder-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [
    "dist/deployment/executive.mjs",
    "dist/deployment/owned-processes.mjs",
    "dist/pdim-restore.mjs",
    "dist/index.mjs",
    "dist/public/index.html",
    "source.pdim",
    "source.manifest.json",
    "build.sh",
    ".node_bin/node",
    "node_modules.pdim",
    "node_modules.manifest.json",
    "scripts/port-contract.sh",
    "scripts/redis-supervisor.sh",
  ];
  for (const file of files) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "fixture");
  }
  fs.writeFileSync(path.join(root, ".dockerignore"), "");
  const bundled = await build({
    entryPoints: ["script/lib/dockerignoreScan.ts"],
    bundle: true, platform: "node", format: "esm", target: "node22",
    write: false, logLevel: "silent",
  });
  const scanner = path.join(root, "scanner.mjs");
  fs.writeFileSync(scanner, bundled.outputFiles[0].contents);
  const { computeRemainingAppMembers } = await import(pathToFileURL(scanner).href);
  const members = computeRemainingAppMembers(root);
  for (const required of ["dist/index.mjs", "dist/public/index.html",
    "source.pdim", "source.manifest.json", "scripts/redis-supervisor.sh"]) {
    assert.ok(members.includes(required), `missing runtime member ${required}`);
  }
  for (const bootstrap of ["dist/deployment/executive.mjs",
    "dist/deployment/owned-processes.mjs", "dist/pdim-restore.mjs",
    "build.sh", ".node_bin/node", "node_modules.pdim",
    "node_modules.manifest.json", "scripts/port-contract.sh"]) {
    assert.ok(!members.includes(bootstrap), `bootstrap must remain outside capsule: ${bootstrap}`);
  }
});
