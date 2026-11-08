import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runPortablePython } from "../script/lib/portablePython.mjs";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "python_runtime");
const binary = path.join(runtime, "bin/python3");
const verifier = path.join(root, "script/lib/verifyPortablePython.py");
const installer = path.join(root, "script/lib/installPortablePythonDependencies.py");

test("real portable interpreter ignores host Python paths, home and user packages", t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "python-isolation-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.writeFileSync(path.join(temp, "host_pollution.py"), "VALUE = 'host'\n");
  const env = { ...process.env, PYTHONPATH: temp };
  delete env.PYTHONHOME;
  assert.equal(execFileSync(binary, ["-c", "import host_pollution; print(host_pollution.VALUE)"], {
    env, encoding: "utf8",
  }).trim(), "host");
  env.PYTHONHOME = path.join(temp, "nonexistent-python-home");
  env.PYTHONUSERBASE = temp;
  const result = runPortablePython(binary, ["-c",
    "import importlib.util, sys; assert sys.flags.isolated; assert importlib.util.find_spec('host_pollution') is None; print('isolated')",
  ], { env, cwd: temp, encoding: "utf8" });
  assert.equal(result.trim(), "isolated");
  assert.match(runPortablePython(binary, [verifier, runtime], { env, encoding: "utf8" }), /isolation verified/);
  assert.match(runPortablePython(binary, ["-m", "pip", "--version"], { env, encoding: "utf8" }), /python_runtime/);
});

test("origin verifier refuses wrong prefixes and foreign search paths", () => {
  assert.throws(() => runPortablePython(binary, [verifier, os.tmpdir()], { stdio: "pipe" }), /prefix/);
  assert.throws(() => runPortablePython(binary, ["-c",
    "import runpy,sys; sys.path.append('/outside-release'); v=sys.argv[1]; sys.argv=sys.argv[1:]; runpy.run_path(v,run_name='__main__')",
    verifier, runtime,
  ], { stdio: "pipe" }), /search path escapes/);
});

test("portable installer scopes dependencies to production MaxCore requirements and disables user installs", () => {
  const code = `
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("portable_installer", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
requirements = module.runtime_requirements(pathlib.Path(sys.argv[2]))
names = {module.Requirement(item).name.lower() for item in requirements}
assert "httpx2" not in names and "volare" not in names
assert "anyio==4.16.0" in requirements
assert "fsspec>=2026.6.0" in requirements
assert "cryptography>=48.0.1" in requirements
assert module.requirements_satisfied(["anyio>=4.14.2,<5"], {"anyio": "4.16.0"})
assert not module.requirements_satisfied(["anyio>=4.14.2,<5"], {"anyio": "4.9.0"})
assert module.pip_install_environment({"PIP_USER": "1"})["PIP_USER"] == "0"
print("portable dependency scope and pip environment verified")
`;
  const output = execFileSync(binary, ["-I", "-B", "-c", code, installer, root], { encoding: "utf8" });
  assert.match(output, /portable dependency scope and pip environment verified/);
});

test("isolated pip install failure is reproduced and cleared by PIP_USER=0 without writes", () => {
  const args = ["-I", "-m", "pip", "install", "--dry-run", "--no-index", "--no-deps", "torch>=2.13.0"];
  assert.throws(
    () => execFileSync(binary, args, {
      encoding: "utf8",
      env: { ...process.env, PIP_USER: "1" },
    }),
    error => {
      assert.equal(error.status, 1);
      assert.match(error.stderr, /Can not perform a '--user' install/);
      return true;
    },
  );
  const output = execFileSync(binary, args, {
    encoding: "utf8",
    env: { ...process.env, PIP_USER: "0" },
  });
  assert.match(output, /Requirement already satisfied: torch/);
});