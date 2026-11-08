import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { provisionPortablePython } from "../script/lib/provisionPortablePython.mjs";

function fixture(t, version = "3.12.13") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "portable-python-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "script/lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "script/lib/installPortablePythonDependencies.py"), "# fixture installer\n");
  fs.mkdirSync(path.join(root, "python/bin"), { recursive: true });
  const python = path.join(root, "python/bin/python3");
  fs.writeFileSync(python, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Python ${version}"; exit 0; fi\nexit 0\n`);
  fs.chmodSync(python, 0o755);
  const archive = path.join(root, "fixture.tar.gz");
  const packed = spawnSync("tar", ["--create", "--gzip", "--file", archive, "--directory", root, "python"], {
    encoding: "utf8",
  });
  assert.equal(packed.status, 0, packed.stderr);
  return { root, archive };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.stdio ?? "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
  return String(result.stdout ?? "");
}

test("portable Python archive is extracted, installed, and verified before final placement", t => {
  const { root, archive } = fixture(t);
  const result = provisionPortablePython(root, {
    download: (_url, destination) => fs.copyFileSync(archive, destination),
    run,
  });
  assert.equal(result.reused, false);
  assert.equal(result.version, "3.12.13");
  assert.equal(fs.readFileSync(path.join(result.runtime, "bin/python3"), "utf8").includes("Python 3.12.13"), true);
  assert.deepEqual(fs.readdirSync(root).filter(name => name.startsWith(".python-runtime-stage-")), []);
});

test("valid existing runtime is verified without network or replacement", t => {
  const { root } = fixture(t);
  const runtime = path.join(root, "python_runtime");
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  fs.renameSync(path.join(root, "python"), runtime);
  let downloadCalls = 0;
  const result = provisionPortablePython(root, {
    download: () => { downloadCalls++; throw new Error("must not download"); },
    run,
  });
  assert.equal(result.reused, true);
  assert.equal(downloadCalls, 0);
});

test("interrupted dependency installation leaves the previous runtime untouched", t => {
  const { root, archive } = fixture(t, "3.12.13");
  const runtime = path.join(root, "python_runtime");
  fs.mkdirSync(path.join(runtime, "bin"), { recursive: true });
  fs.writeFileSync(path.join(runtime, "bin/python3"), "# previous incomplete runtime\n");
  fs.writeFileSync(path.join(runtime, "preserved-marker"), "do not delete");
  const failingRun = (command, args, options = {}) => {
    if (String(command).endsWith("/bin/python3") &&
        args.some(argument => argument.endsWith("installPortablePythonDependencies.py")) &&
        !args.includes("--verify-only")) {
      throw new Error("fixture interrupted dependency installation");
    }
    return run(command, args, options);
  };
  assert.throws(() => provisionPortablePython(root, {
    download: (_url, destination) => fs.copyFileSync(archive, destination),
    run: failingRun,
  }), /fixture interrupted dependency installation/);
  assert.equal(fs.readFileSync(path.join(runtime, "preserved-marker"), "utf8"), "do not delete");
  assert.deepEqual(fs.readdirSync(root).filter(name => name.startsWith(".python-runtime-stage-")), []);
});

test("invalid archive is rejected before replacing an existing runtime", t => {
  const { root } = fixture(t);
  const runtime = path.join(root, "python_runtime");
  fs.mkdirSync(runtime);
  fs.writeFileSync(path.join(runtime, "preserved-marker"), "previous runtime");
  assert.throws(() => provisionPortablePython(root, {
    download: (_url, destination) => fs.writeFileSync(destination, "not a gzip archive"),
    run,
  }));
  assert.equal(fs.readFileSync(path.join(runtime, "preserved-marker"), "utf8"), "previous runtime");
  assert.deepEqual(fs.readdirSync(root).filter(name => name.startsWith(".python-runtime-stage-")), []);
});
