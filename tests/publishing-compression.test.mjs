import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectArtifacts } from "../scripts/verify-runtime-artifacts.mjs";
import { transformSync } from "esbuild";

// Exercise the actual publishing compressor without invoking build.sh's
// source deletion, installs, providers, or deployment operations.
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-compression-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const build = fs.readFileSync("build.sh", "utf8");
  const start = build.indexOf('_PDIM_FORMAT="gzip-1"');
  const end = build.indexOf("# ── node_modules pre-pruning", start);
  assert.ok(start >= 0 && end > start);
  fs.writeFileSync(path.join(root, "compress.sh"), build.slice(start, end));
  const packStart = build.indexOf("_pdim_pack() {");
  const packEnd = build.indexOf("# Pre-prune node_modules, then pack all capsules", packStart);
  assert.ok(packStart >= 0 && packEnd > packStart);
  fs.writeFileSync(path.join(root, "pack.sh"), build.slice(packStart, packEnd));
  fs.mkdirSync(path.join(root, "fixture"));
  fs.writeFileSync(path.join(root, "fixture/data.txt"), "capsule fixture\n".repeat(65536));
  return {
    root,
    run: command => spawnSync("bash", ["-c", `${build.slice(0, build.indexOf("# ─── Purge"))}\nsource ./compress.sh; ${command}`], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, GZIP: "-9", XZ_DEFAULTS: "-9e -T0", XZ_OPT: "-9e -T0" },
    }),
  };
}

test("publishing refuses failed or malformed checksums without deleting source", t => {
  const { root, run } = setup(t);
  for (const implementation of ['return 1', 'echo unavailable']) {
    const result = run(`source ./pack.sh; sha256sum() { ${implementation}; }; _pdim_pack fixture fixture.pdim Fixture`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum.*source retained/);
    assert.equal(fs.existsSync(path.join(root, "fixture/data.txt")), true);
    assert.equal(fs.existsSync(path.join(root, "fixture.manifest.json")), false);
  }
});

test("publishing reports each pack phase and writes a valid manifest before cleanup", t => {
  const { root, run } = setup(t);
  const result = run("source ./pack.sh; _pdim_pack fixture fixture.pdim Fixture");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /compression starting:[\s\S]*compression complete:[\s\S]*checksum starting:[\s\S]*checksum complete; writing manifest:[\s\S]*manifest written; source cleanup starting:/);
  assert.equal(fs.existsSync(path.join(root, "fixture")), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixture.manifest.json")));
  assert.equal(manifest.sha256, createHash("sha256").update(fs.readFileSync(path.join(root, "fixture.pdim"))).digest("hex"));
});

test("large archive writes emit progress before compression completes", t => {
  const { root, run } = setup(t);
  const large = path.join(root, "fixture/large.bin");
  fs.writeFileSync(large, "");
  fs.truncateSync(large, 110 * 1024 * 1024);
  const result = run("_pdim_tar_create fixture.pdim fixture || exit $?");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Capsule progress: 10000 records/);
});

test("archive replacement failure cannot be reported as successful compression", t => {
  const { run } = setup(t);
  const result = run("mv() { return 31; }; _pdim_tar_create fixture.pdim fixture || exit $?");
  assert.equal(result.status, 31);
  assert.doesNotMatch(result.stdout, /compression complete/);
});

test("publishing reports failing line and status without exposing command arguments", () => {
  const build = fs.readFileSync("build.sh", "utf8");
  const end = build.indexOf("# ─── Purge");
  assert.ok(end > 0);
  const result = spawnSync("bash", ["-c", `${build.slice(0, end)}\nfalse sensitive-fixture-argument`], {encoding: "utf8"});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /build.sh failed at line \d+ \(exit 1\)/);
  assert.doesNotMatch(result.stderr, /sensitive-fixture-argument/);
});

test("publishing uses bounded compression and produces a gate-compatible restorable archive", async t => {
  const { root, run } = setup(t);
  const result = run(`
    test "$_PDIM_FORMAT" = "gzip-1"
    test -z "\${GZIP:-}"
    test -z "\${XZ_OPT:-}"
    test -z "\${XZ_DEFAULTS:-}"
    _pdim_tar_create fixture.pdim fixture || exit $?
    printf '%s' "$_PDIM_FORMAT" > codec
    mkdir extracted
    tar -xzf fixture.pdim -C extracted
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

function compilePacker(root) {
  const source = fs.readFileSync("script/build.ts", "utf8");
  const start = source.indexOf("const packOne =");
  const end = source.indexOf("const outcomes = await Promise.allSettled", start);
  assert.ok(start >= 0 && end > start);
  const { code } = transformSync(source.slice(start, end), { loader: "ts", format: "cjs" });
  return new Function("root", "fs", "path", "spawn", "createHash", `${code}; return packOne;`)(
    root, fs, path, spawn, createHash,
  );
}

test("compiling build packs with the same codec and commits its manifest before source cleanup", async t => {
  const { root } = setup(t);
  await compilePacker(root)({ dir: "fixture", capsule: "fixture.pdim" });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixture.manifest.json")));
  assert.equal(manifest.compression, "gzip-1");
  assert.equal(fs.existsSync(path.join(root, "fixture")), false);
  const gate = await inspectArtifacts(root, ["fixture"]);
  assert.equal(gate.ready, true, gate.failures.join("\n"));
});

test("compiling build reports pack failure without deleting source or writing a manifest", async t => {
  const { root } = setup(t);
  await assert.rejects(compilePacker(root)({
    dir: "fixture", capsule: "missing-parent/fixture.pdim",
  }), /packing fixture exited/);
  assert.equal(fs.existsSync(path.join(root, "fixture/data.txt")), true);
  assert.equal(fs.existsSync(path.join(root, "missing-parent/fixture.manifest.json")), false);
});
