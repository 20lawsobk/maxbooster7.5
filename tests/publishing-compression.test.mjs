import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectArtifacts } from "../scripts/verify-runtime-artifacts.mjs";

// Exercise the actual publishing compressor without invoking build.sh's
// source deletion, installs, providers, or deployment operations.
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-compression-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const build = fs.readFileSync("build.sh", "utf8");
  const start = build.indexOf('_PDIM_FORMAT="gzip-9"');
  const end = build.indexOf("# ── node_modules pre-pruning", start);
  assert.ok(start >= 0 && end > start);
  fs.writeFileSync(path.join(root, "compress.sh"), build.slice(start, end));
  fs.mkdirSync(path.join(root, "fixture"));
  fs.writeFileSync(path.join(root, "fixture/data.txt"), "capsule fixture\n".repeat(65536));
  return {
    root,
    run: command => spawnSync("bash", ["-c", `set -e; source ./compress.sh; ${command}`], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, XZ_DEFAULTS: "-9e -T0", XZ_OPT: "-9e -T0" },
    }),
  };
}

test("publishing uses bounded compression and produces a gate-compatible restorable archive", async t => {
  const { root, run } = setup(t);
  const result = run(`
    test "$XZ_OPT" = "-6 -T2 --memlimit-compress=256MiB"
    test -z "\${XZ_DEFAULTS:-}"
    _pdim_tar_create fixture.pdim fixture || exit $?
    printf '%s' "$_PDIM_FORMAT" > codec
    mkdir extracted
    tar -xJf fixture.pdim -C extracted
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, "fixture.pdim.partial")), false);
  assert.deepEqual(fs.readFileSync(path.join(root, "extracted/fixture/data.txt")),
    fs.readFileSync(path.join(root, "fixture/data.txt")));
  const sha256 = createHash("sha256").update(fs.readFileSync(path.join(root, "fixture.pdim"))).digest("hex");
  fs.writeFileSync(path.join(root, "fixture.manifest.json"), JSON.stringify({
    sha256, compression: fs.readFileSync(path.join(root, "codec"), "utf8"),
  }));
  const gate = await inspectArtifacts(root, ["fixture"]);
  assert.equal(gate.ready, true, gate.failures.join("\n"));
});

test("compression failure remains visible and preserves source and previous capsule", t => {
  const { root, run } = setup(t);
  fs.writeFileSync(path.join(root, "fixture.pdim"), "previous valid capsule");
  const result = run("_pdim_tar_create fixture.pdim missing-source || exit $?");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing-source/);
  assert.match(result.stderr, /capsule compression failed/);
  assert.equal(fs.readFileSync(path.join(root, "fixture.pdim"), "utf8"), "previous valid capsule");
  assert.equal(fs.existsSync(path.join(root, "fixture.pdim.partial")), false);
  assert.equal(fs.existsSync(path.join(root, "fixture/data.txt")), true);
});
