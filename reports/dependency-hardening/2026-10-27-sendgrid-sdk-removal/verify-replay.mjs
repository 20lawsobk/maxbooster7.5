// Known-original controlled rehearsal. Requires the recorded Git objects.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { applyLegacyUpdate } from "../../../scripts/apply-legacy-security-update.mjs";

const baseline = "c06fbecdb32a5c3b76662f631604bfd9abac386b";
const sourceCommit = "2c9b739a89bb2334142ded99da14fe57878208b1";
const git = spec => execFileSync("git", ["show", spec], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const original = JSON.parse(git(`${baseline}:tools/legacy-security-update.json`));
const current = JSON.parse(fs.readFileSync("tools/legacy-security-update.json", "utf8"));
const digest = content => createHash("sha256").update(content).digest("hex");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "maxbooster-sendgrid-replay-"));
const result = { baseline, sourceCommit, originalEntries: original.files.length,
  currentEntries: current.files.length, fixtureIsolated: true,
  scope: "Known-original rehearsal, not an actual retained legacy checkout or deployed legacy acceptance" };
const prefixes = ["maxbooster7.5/", "maxbooster7.5/maxbooster7.5/"];
const hashes = () => current.files.map(file => digest(fs.readFileSync(path.join(directory, file.path))));
try {
  for (const file of original.files) {
    fs.mkdirSync(path.dirname(path.join(directory, file.path)), { recursive: true });
    fs.writeFileSync(path.join(directory, file.path), file.content);
  }
  for (const prefix of prefixes) {
    for (const name of ["server/monitoring/alertingService.ts", "server/monitoring/emailMonitor.ts", "server/workers/index.ts", "server/routes/monitoring.ts"]) {
      const content = git(`${sourceCommit}:${name}`);
      const file = current.files.find(file => file.path === prefix + name);
      assert.equal(file.beforeSha256, digest(content), "Only verified Git-original bytes may be reconstructed");
      fs.mkdirSync(path.dirname(path.join(directory, file.path)), { recursive: true });
      fs.writeFileSync(path.join(directory, file.path), content);
    }
    fs.mkdirSync(path.join(directory, prefix, "server/lib"), { recursive: true });
  }
  fs.writeFileSync(path.join(directory, "maxbooster7.5/user-content.txt"), "Unrelated content");
  const expected = current.files.filter(file => !fs.existsSync(path.join(directory, file.path)) ||
    digest(fs.readFileSync(path.join(directory, file.path))) !== file.afterSha256).map(file => file.path);
  assert.equal(expected.length, 18);
  assert.deepEqual(applyLegacyUpdate(directory, current).pending, expected);
  assert.deepEqual(applyLegacyUpdate(directory, current, { apply: true }).applied, expected);
  for (const file of current.files) assert.equal(digest(fs.readFileSync(path.join(directory, file.path))), file.afterSha256);
  assert.deepEqual(applyLegacyUpdate(directory, current, { apply: true }).applied, []);
  const staleManifest = original.files.find(file => file.path === "maxbooster7.5/package.json");
  const manifest = current.files.find(file => file.path === staleManifest.path);
  for (const prefix of prefixes) {
    const caller = current.files.find(file => file.path === prefix + "server/monitoring/alertingService.ts");
    fs.writeFileSync(path.join(directory, manifest.path), staleManifest.content);
    fs.writeFileSync(path.join(directory, caller.path), "// Unknown caller history\n" + caller.content);
    const before = hashes();
    assert.throws(() => applyLegacyUpdate(directory, current, { apply: true }), /Custom changes found; refusing overwrite/);
    assert.deepEqual(hashes(), before, "No earlier manifest update may occur when a later caller is unknown");
    fs.writeFileSync(path.join(directory, manifest.path), manifest.content);
    fs.writeFileSync(path.join(directory, caller.path), caller.content);
    const helper = current.files.find(file => file.path === prefix + "server/lib/sendgridAlertTransport.ts");
    fs.writeFileSync(path.join(directory, helper.path), "// Existing custom helper");
    const withCustomHelper = hashes();
    assert.throws(() => applyLegacyUpdate(directory, current, { apply: true }), /File already exists; refusing add/);
    assert.deepEqual(hashes(), withCustomHelper);
    fs.writeFileSync(path.join(directory, helper.path), helper.content);
  }
  assert.equal(fs.readFileSync(path.join(directory, "maxbooster7.5/user-content.txt"), "utf8"), "Unrelated content");
  Object.assign(result, { status: "passed", updatedEntries: expected,
    allFinalChecksumsVerified: true, idempotent: true,
    unknownCallerHistoryRejectsBeforeAnyManifestWrite: true,
    customTransportAdditionsRejectedAndPreserved: true, unrelatedFilePreserved: true });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
  result.fixtureCleaned = !fs.existsSync(directory);
}
console.log(JSON.stringify(result, null, 2));
