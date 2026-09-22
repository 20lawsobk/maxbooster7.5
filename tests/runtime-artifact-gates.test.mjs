import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectDependencies, inspectArtifacts, inspectRestored, digest } from "../scripts/verify-runtime-artifacts.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-gate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}
test("installed stale nested copy fails despite patched top-level package and lock", t => {
  const root = fixture(t);
  write(root, "package.json", '{"dependencies":{"qs":"6.16.0"}}');
  write(root, "package-lock.json", '{"packages":{"node_modules/qs":{"version":"6.16.0"}}}');
  write(root, "node_modules/qs/package.json", '{"name":"qs","version":"6.16.0"}');
  assert.equal(inspectDependencies(root, ["."]).ready, true);
  write(root, "node_modules/parent/node_modules/qs/package.json", '{"name":"qs","version":"6.15.3"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
});
test("missing workspace, prerelease version and escaping installed symlink fail closed", t => {
  const root = fixture(t), outside = fixture(t);
  write(root, "package.json", "{}");
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  write(root, "node_modules/qs/package.json", '{"name":"qs","version":"6.16.0-rc.1"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  fs.symlinkSync(outside, path.join(root, "node_modules/escape"));
  assert.match(inspectDependencies(root, ["."]).failures.join("\n"), /escapes workspace/);
});
test("fast-uri accepts independently compatible patched 3.x and 4.x, rejects vulnerable 4.x", t => {
  const root = fixture(t);
  write(root, "package.json", "{}");
  write(root, "node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"4.1.2"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  write(root, "node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"4.1.3"}');
  write(root, "node_modules/ajv/node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"3.1.6"}');
  assert.equal(inspectDependencies(root, ["."]).ready, true);
});
test("capsule gate hashes actual bytes and rejects missing, changed and unknown-codec capsules", async t => {
  const root = fixture(t);
  assert.equal((await inspectArtifacts(root, ["fixture"])).ready, false);
  write(root, "fixture.pdim", "isolated checksum fixture; not a real release archive");
  const sha256 = await digest(path.join(root, "fixture.pdim"));
  write(root, "fixture.manifest.json", JSON.stringify({ sha256, compression: "zstd-19" }));
  assert.equal((await inspectArtifacts(root, ["fixture"])).ready, true);
  write(root, "fixture.pdim", "changed");
  assert.match((await inspectArtifacts(root, ["fixture"])).failures.join(), /checksum mismatch/);
  write(root, "fixture.manifest.json", JSON.stringify({ sha256, compression: "unknown" }));
  assert.match((await inspectArtifacts(root, ["fixture"])).failures.join(), /unsupported codec/);
});
test("restored output gate rejects absent artifacts and invalid JS without executing it", t => {
  const root = fixture(t);
  write(root, "dist/index.mjs", "throw new Error('must not execute');");
  assert.ok(!inspectRestored(root).failures.some(x => x.startsWith("dist/index.mjs:")));
  write(root, "dist/index.mjs", "export const = ;");
  assert.match(inspectRestored(root).failures.join(), /syntax check failed/);
});