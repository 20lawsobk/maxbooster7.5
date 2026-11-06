import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ROOT, option, integerOption, sha, inventory, execute,
  externalEvidence, REQUIRED_EXTERNAL, REQUIRED_ADMIN_EXTERNAL, requiredReleaseEvidence, readJson, writeJson} from "../scripts/aso/common.mjs";

test("CLI options reject dangerous/unbounded invalid integers", () => {
  assert.equal(option(["--mode", "full"], "--mode", "quick"), "full");
  assert.equal(integerOption(["--max-cycles", "0"], "--max-cycles", 3), 0);
  assert.throws(() => integerOption(["--max-cycles", "-2"], "--max-cycles", 3));
  assert.throws(() => integerOption(["--max-cycles", "NaN"], "--max-cycles", 3));
  assert.throws(() => integerOption(["--max-cycles", "100000"], "--max-cycles", 3));
});

test("repository scope inventories full Git index, not only client/server", () => {
  const value = inventory();
  assert.ok(value.count > 100);
  assert.equal(value.files.length, value.count);
  assert.ok(value.files.some(x => x.path === "package.json"));
  assert.ok(value.files.some(x => x.path.startsWith("client/")));
  assert.ok(value.files.some(x => x.path.startsWith("server/")));
  assert.ok(value.files.some(x => x.path.startsWith("external/")));
  assert.ok(value.files.some(x => x.path.startsWith("scripts/")));
  assert.ok(value.files.some(x => x.path.startsWith(".github/")));
  assert.equal(value.files.reduce((n, row) => n + (row.path.startsWith("client/") ? 1 : 0), 0), value.counts.frontend);
  assert.ok(ROOT.endsWith("maxbooster7.5") || fs.existsSync(path.join(ROOT, "package.json")));
});

test("independent approval is required and must match current revision", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "aso-evidence-"));
  try {
    assert.equal(externalEvidence("", "abc").valid, false);
    const file = path.join(folder, "release.json");
    const checks = Object.fromEntries(REQUIRED_EXTERNAL.map(id => [id, {status: "pass", receipt: "independent-operator-receipt"}]));
    writeJson(file, {commit: "abc", approvedBy: "operator", approvedAt: new Date().toISOString(), releaseId: "release-1", checks});
    assert.equal(externalEvidence(file, "def").valid, false);
    assert.equal(externalEvidence(file, "abc").valid, true);
    const data = readJson(file);
    delete data.checks["backup-restore"];
    writeJson(file, data);
    assert.equal(externalEvidence(file, "abc").valid, false);
  } finally { fs.rmSync(folder, {recursive: true, force: true}); }
});

test("child failures, timeouts and logs are recorded rather than silently passed", async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "aso-exec-"));
  try {
    const okay = await execute("okay", [process.execPath, "-e", "console.log('ok')"], folder, 5000);
    assert.equal(okay.status, "pass");
    const failed = await execute("failed", [process.execPath, "-e", "process.exit(8)"], folder, 5000);
    assert.equal(failed.status, "fail");
    assert.equal(failed.exitCode, 8);
    const timedOut = await execute("timeout", [process.execPath, "-e", "setInterval(() => {},1000)"], folder, 150);
    assert.equal(timedOut.status, "fail");
    assert.equal(timedOut.timedOut, true);
    assert.equal(sha(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  } finally { fs.rmSync(folder, {recursive: true, force: true}); }
});


test("admin release requires every administrator capability, closed signup and exact-scope receipts", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "aso-admin-evidence-"));
  try {
    const file = path.join(folder, "admin-release.json");
    const checks = Object.fromEntries(REQUIRED_ADMIN_EXTERNAL.map(id => [id, {status:"pass",receipt:"real-evidence-to-verify-out-of-band"}]));
    assert.ok(requiredReleaseEvidence("admin").includes("admin-registration-closed"));
    assert.ok(!requiredReleaseEvidence("public").includes("admin-registration-closed"));
    writeJson(file,{profile:"admin",commit:"abc",approvedBy:"operator",approvedAt:new Date().toISOString(),releaseId:"admin-1",checks});
    assert.equal(externalEvidence(file,"abc","public").valid,false);
    assert.equal(externalEvidence(file,"abc","admin").valid,true);
    const data=readJson(file);
    delete data.checks["admin-daw-real-audio"];
    writeJson(file,data);
    assert.equal(externalEvidence(file,"abc","admin").valid,false);
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});
