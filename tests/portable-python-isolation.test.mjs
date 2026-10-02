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