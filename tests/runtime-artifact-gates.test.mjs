import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectDependencies, inspectDeploymentDependencies, inspectArtifacts, inspectRestored, digest } from "../scripts/verify-runtime-artifacts.mjs";
import { PORTABLE_NODE_VERSION } from "../script/lib/portableNodePolicy.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-gate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}
test("release gate excludes legacy only with image exclusion; workspace audit still rejects stale legacy", t => {
  const root = fixture(t);
  for (const scope of [".", "external/maxcore", "external/pdim", "dns-os", "tls-proxy"]) {
    write(root, `${scope}/package.json`, "{}");
    write(root, `${scope}/node_modules/qs/package.json`, '{"name":"qs","version":"6.16.1"}');
  }
  write(root, "maxbooster7.5/node_modules/qs/package.json", '{"name":"qs","version":"6.15.3"}');
  write(root, ".dockerignore", "maxbooster7.5/\n");
  assert.equal(inspectDeploymentDependencies(root).ready, true);
  assert.equal(inspectDependencies(root).ready, false);
  write(root, ".dockerignore", "maxbooster7.5/\n!maxbooster7.5/\n");
  assert.match(inspectDeploymentDependencies(root).failures.join(), /not excluded/);
  write(root, ".dockerignore", "maxbooster7.5/\n");
  write(root, "external/maxcore/node_modules/qs/package.json", '{"name":"qs","version":"6.15.3"}');
  assert.match(inspectDeploymentDependencies(root).failures.join(), /external\/maxcore.*validated floor/);
  fs.rmSync(path.join(root, "external/pdim/node_modules"), { recursive: true });
  assert.match(inspectDeploymentDependencies(root).failures.join(), /external\/pdim/);
  fs.unlinkSync(path.join(root, ".dockerignore"));
  assert.throws(() => inspectDeploymentDependencies(root), /ENOENT/);
});
test("installed stale nested copy fails despite patched top-level package and lock", t => {
  const root = fixture(t);
  write(root, "package.json", '{"dependencies":{"qs":"6.16.1"}}');
  write(root, "package-lock.json", '{"packages":{"node_modules/qs":{"version":"6.16.1"}}}');
  write(root, "node_modules/qs/package.json", '{"name":"qs","version":"6.16.1"}');
  assert.equal(inspectDependencies(root, ["."]).ready, true);
  write(root, "node_modules/parent/node_modules/qs/package.json", '{"name":"qs","version":"6.15.3"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
});
test("unpatched node-forge is rejected even when only a nested consumer installs it", t => {
  const root = fixture(t);
  write(root, "package.json", "{}");
  write(root, "node_modules/parent/node_modules/node-forge/package.json", '{"name":"node-forge","version":"1.4.0"}');
  assert.match(inspectDependencies(root, ["."]).failures.join(), /node-forge@1.4.0; no patched release/);
});
test("missing workspace, prerelease version and escaping installed symlink fail closed", t => {
  const root = fixture(t), outside = fixture(t);
  write(root, "package.json", "{}");
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  write(root, "node_modules/qs/package.json", '{"name":"qs","version":"6.16.1-rc.1"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  fs.symlinkSync(outside, path.join(root, "node_modules/escape"));
  assert.match(inspectDependencies(root, ["."]).failures.join("\n"), /escapes workspace/);
});
test("fast-uri accepts independently compatible patched 3.x and 4.x, rejects vulnerable 4.x", t => {
  const root = fixture(t);
  write(root, "package.json", "{}");
  write(root, "node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"4.1.2"}');
  assert.equal(inspectDependencies(root, ["."]).ready, false);
  write(root, "node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"4.2.3"}');
  write(root, "node_modules/ajv/node_modules/fast-uri/package.json", '{"name":"fast-uri","version":"3.1.9"}');
  assert.equal(inspectDependencies(root, ["."]).ready, true);
});
test("all security families reject stale nested copies and accept explicitly validated branches", t => {
  const root = fixture(t);
  write(root, "package.json", "{}");
  const pairs = [
    ["qs", "6.16.0", "6.16.1"],
    ["axios", "1.19.0", "1.20.0"], ["fastify", "5.12.5", "5.12.6"],
    ["ip-address", "10.7.3", "10.7.4"], ["undici", "7.30.0", "7.30.1"],
    ["undici", "6.28.1", "6.29.1"],
    ["electron", "43.7.7", "43.8.1"],
    ["orval", "8.5.3", "8.33.0"], ["linkify-it", "5.0.1", "5.0.2"],
    ["linkify-it", "5.0.0", "6.1.0"],
    ["sharp", "0.35.3", "0.35.5"], ["sharp", "0.35.4", "0.35.5"],
    ["dompurify", "3.4.16", "3.4.17"], ["body-parser", "2.3.0", "2.4.0"],
    ["postcss", "8.5.16", "8.5.26"], ["browserslist", "4.28.1", "4.28.8"],
    ["baseline-browser-mapping", "2.10.0", "2.11.15"], ["@babel/core", "7.29.0", "7.29.7"],
    ["brace-expansion", "2.1.1", "5.0.12"], ["nanoid", "3.3.16", "3.3.18"],
    ["brace-expansion", "2.1.4", "2.1.7"],
    ["uuid", "7.0.3", "11.1.1"], ["yaml", "2.8.2", "2.9.1"],
    ["markdown-it", "14.3.2", "14.3.3"], ["zod", "3.25.76", "4.6.7"], ["zod", "4.6.5", "4.6.6"], ["vitest", "4.1.11", "4.1.12"],
    ["@vitest/mocker", "4.1.11", "4.1.12"], ["csv-parse", "6.2.1", "7.0.2"],
    ["fast-uri", "3.1.8", "3.1.9"], ["fast-uri", "4.2.1", "4.2.3"],
    ["multer", "2.4.0", "2.5.0"],
  ];
  for (const [name, stale, safe] of pairs) {
    const file = `node_modules/consumer/node_modules/${name}/package.json`;
    write(root, file, JSON.stringify({ name, version: stale }));
    assert.equal(inspectDependencies(root, ["."]).ready, false, `${name}@${stale}`);
    write(root, file, JSON.stringify({ name, version: safe }));
    assert.equal(inspectDependencies(root, ["."]).ready, true, `${name}@${safe}`);
  }
  write(root, "node_modules/nanoid/package.json", '{"name":"nanoid","version":"5.1.16"}');
  write(root, "node_modules/uuid/package.json", '{"name":"uuid","version":"14.0.2"}');
  assert.equal(inspectDependencies(root, ["."]).ready, true);
  write(root, "node_modules/extract-zip/package.json", '{"name":"extract-zip","version":"2.0.1"}');
  assert.match(inspectDependencies(root, ["."]).failures.join("\n"), /no patched release/);
});
test("unpatched brace walkers, merge helpers and shared HTTP cache policies cannot be reintroduced", t => {
  const root = fixture(t);
  write(root, "package.json", "{}");
  for (const [name, version] of [["braces", "3.0.3"], ["http-cache-semantics", "4.2.0"], ["deepmerge", "4.3.1"]]) {
    const file = `node_modules/consumer/node_modules/${name}/package.json`;
    write(root, file, JSON.stringify({ name, version }));
    assert.match(inspectDependencies(root, ["."]).failures.join("\n"), /no patched release/);
    fs.rmSync(path.dirname(path.join(root, file)), { recursive: true });
  }
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
test("restored Node provenance admits the provisioned pin and rejects stale or malformed records", t => {
  const root = fixture(t);
  const record = { version: PORTABLE_NODE_VERSION, platform: "linux-x64", archiveSha256: "a".repeat(64) };
  const check = value => {
    write(root, ".node_bin/provenance.json", JSON.stringify(value));
    return inspectRestored(root, [".node_bin/provenance.json"]);
  };
  assert.equal(check(record).ready, true);
  for (const changed of [{ version: "22.22.0" }, { platform: "darwin-arm64" }, { archiveSha256: "invalid" }]) {
    assert.match(check({ ...record, ...changed }).failures.join(), /invalid pinned Node provenance/);
  }
});
