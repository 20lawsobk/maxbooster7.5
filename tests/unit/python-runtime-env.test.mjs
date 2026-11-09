import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolvePythonRuntime } from "../../scripts/testing/python-runtime-env.mjs";

function pythonVersion(python) {
  const versionProbe = spawnSync(
    python,
    ["-I", "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
    { encoding: "utf8" },
  );
  assert.equal(versionProbe.status, 0, versionProbe.stderr);
  return versionProbe.stdout.trim();
}

test("python test runtime accepts the isolated packaged runtime site directory", () => {
  const python = "python3";
  const version = pythonVersion(python);
  const root = mkdtempSync(path.join(os.tmpdir(), "python-runtime-env-"));
  const packages = path.join(
    root,
    "python_runtime",
    "lib",
    `python${version}`,
    "site-packages",
  );
  mkdirSync(packages, { recursive: true });
  try {
    const runtime = resolvePythonRuntime(root, python, {
      PATH: process.env.PATH,
      HOME: os.tmpdir(),
      MAXBOOSTER_PYTHON_SITE_PACKAGES: packages,
    });

    assert.equal(runtime.executable, python);
    assert.equal(runtime.sitePackages, packages);
    assert.ok(runtime.ldLibraryPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("python test runtime prefers the app's packaged interpreter when no override is set", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "python-runtime-default-"));
  const python = path.join(root, "python_runtime", "bin", "python3");
  const packages = path.join(root, "python_runtime", "lib", "python3.12", "site-packages");
  mkdirSync(path.dirname(python), { recursive: true });
  mkdirSync(packages, { recursive: true });
  writeFileSync(python, "#!/bin/sh\nprintf '3.12\\n'\n");
  chmodSync(python, 0o755);
  try {
    const runtime = resolvePythonRuntime(root, undefined, {
      PATH: process.env.PATH,
      HOME: os.tmpdir(),
    });

    assert.equal(runtime.executable, python);
    assert.equal(runtime.sitePackages, packages);
    assert.ok(runtime.ldLibraryPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("python test runtime rejects package directories outside approved project roots", () => {
  const python = "python3";
  const version = pythonVersion(python);
  const root = mkdtempSync(path.join(os.tmpdir(), "python-runtime-env-"));
  try {
    const approved = path.join(root, "python_runtime", "lib", `python${version}`, "site-packages");
    mkdirSync(approved, { recursive: true });

    assert.throws(
      () =>
        resolvePythonRuntime(root, python, {
          PATH: process.env.PATH,
          HOME: os.tmpdir(),
          MAXBOOSTER_PYTHON_SITE_PACKAGES: os.tmpdir(),
        }),
      /Interpreter-matched Python packages are unavailable/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
