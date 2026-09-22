import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reconcile, snapshot } from "../scripts/reconcile-nested-dependencies.mjs";

function fixture(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pnpm-reconcile-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "workspace");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "package.json"), '{"dependencies":{"qs":"6.16.0"}}');
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  fs.writeFileSync(path.join(root, "source.ts"), "original source");
  fs.mkdirSync(path.join(root, "node_modules/qs"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules/qs/package.json"), '{"name":"qs","version":"6.15.3"}');
  const pnpm = path.join(dir, "fixture-pnpm.cjs");
  fs.writeFileSync(pnpm, `#!${process.execPath}\nconst fs=require("node:fs");\n` +
    `if (!process.argv.includes("--frozen-lockfile") || !process.argv.includes("--ignore-scripts")) process.exit(9);\n` + body);
  fs.chmodSync(pnpm, 0o755);
  return { root, pnpm };
}
const install = `fs.mkdirSync("node_modules/qs",{recursive:true});fs.writeFileSync("node_modules/qs/package.json",'{"name":"qs","version":"6.16.0"}');`;
test("successful clean install replaces stale generated tree without modifying source/locks", t => {
  const { root, pnpm } = fixture(t, install);
  const before = snapshot(root);
  const result = reconcile(root, { apply: true, pnpm });
  assert.equal(result.installed, true);
  assert.equal(result.lifecycleScriptsExecuted, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "node_modules/qs/package.json"))).version, "6.16.0");
  assert.deepEqual(snapshot(root), before);
  assert.equal(fs.readFileSync(path.join(root, "source.ts"), "utf8"), "original source");
});
test("failed frozen install preserves existing runtime", t => {
  const { root, pnpm } = fixture(t, "process.exit(7);");
  assert.throws(() => reconcile(root, { apply: true, pnpm }), /Frozen install failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "node_modules/qs/package.json"))).version, "6.15.3");
});
test("unexpected lock mutation is rejected before promotion", t => {
  const { root, pnpm } = fixture(t, install + 'fs.writeFileSync("pnpm-lock.yaml","changed");');
  const before = snapshot(root);
  assert.throws(() => reconcile(root, { apply: true, pnpm }), /configuration changed/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "node_modules/qs/package.json"))).version, "6.15.3");
});
test("offline diagnostic never replaces installed files", t => {
  const { root, pnpm } = fixture(t, 'if(!process.argv.includes("--offline")||!process.argv.includes("--lockfile-only"))process.exit(8);');
  assert.equal(reconcile(root, { pnpm }).installed, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "node_modules/qs/package.json"))).version, "6.15.3");
});
test("stale newly installed dependency is rejected before promotion", t => {
  const { root, pnpm } = fixture(t, install.replace("6.16.0", "6.15.3"));
  assert.throws(() => reconcile(root, { apply: true, pnpm }), /Clean installed tree rejected/);
});