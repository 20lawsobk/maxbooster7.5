import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { computeRemainingAppMembers } from "../script/lib/dockerignoreScan.js";
import { DEPLOYMENT_CONTROL_FILES } from "../script/lib/deploymentControlFiles.js";
import { packCapsuleMembers } from "../script/lib/capsulePack.js";

test("real packing preserves publishing manifests and npm can still read package.json", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-control-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = new Map<string, string>();
  for (const name of DEPLOYMENT_CONTROL_FILES) {
    const content = name === "package.json"
      ? JSON.stringify({ name: "capsule-check", scripts: { check: "node -e \"console.log('manifest-readable')\"" } })
      : `fixture-${name}\n`;
    before.set(name, content);
    fs.writeFileSync(path.join(root, name), content);
  }
  fs.mkdirSync(path.join(root, "dist"));
  fs.writeFileSync(path.join(root, "dist/index.mjs"), "export const ready = true;\n");
  fs.mkdirSync(path.join(root, "server"));
  fs.writeFileSync(path.join(root, "server/package.json"), '{"type":"module"}');
  const members = computeRemainingAppMembers(root);
  assert.deepEqual(members, ["dist/index.mjs", "server/package.json"]);
  await packCapsuleMembers({ root, members, capsule: "app_remainder.pdim", threads: 1 });
  for (const [name, content] of before) {
    assert.equal(fs.readFileSync(path.join(root, name), "utf8"), content);
  }
  assert.equal(fs.existsSync(path.join(root, "dist/index.mjs")), false);
  assert.equal(execFileSync("tar", ["--zstd", "-tf", path.join(root, "app_remainder.pdim")],
    { encoding: "utf8" }).trim(), "dist/index.mjs\nserver/package.json");
  assert.match(execFileSync("npm", ["run", "check"], {
    cwd: root, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: root, CI: "true" },
  }), /manifest-readable/);
});

test("direct member lists cannot delete protected root files", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-control-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of DEPLOYMENT_CONTROL_FILES) {
    fs.writeFileSync(path.join(root, file), "unchanged");
    for (const member of [file, `./${file}`, `nested/../${file}`]) {
      await assert.rejects(packCapsuleMembers({
        root, members: [member], capsule: "app_remainder.pdim", threads: 1,
      }), /Refusing to capsule deployment control file/);
    }
    assert.equal(fs.readFileSync(path.join(root, file), "utf8"), "unchanged");
  }
  assert.equal(fs.existsSync(path.join(root, "app_remainder.pdim")), false);
});