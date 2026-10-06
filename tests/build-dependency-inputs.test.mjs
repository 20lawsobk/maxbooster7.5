import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fixture(t, failingScope = "") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-dependency-inputs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["script", "scripts", "bin", "external/maxcore", "external/pdim"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.copyFileSync("script/sync-subsystem-dependencies.sh", path.join(root, "script/sync-subsystem-dependencies.sh"));
  for (const scope of ["external/maxcore", "external/pdim"]) {
    for (const input of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
      fs.writeFileSync(path.join(root, scope, input), "{}");
    }
  }
  fs.writeFileSync(path.join(root, "bin/pnpm"), `#!/bin/sh
printf '%s|%s|%s\\n' "$PWD" "$CI" "$*" >> "$FIXTURE_LOG"
case "$PWD" in *"${failingScope || "__no_failure__"}") exit 7;; esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, "scripts/verify-runtime-artifacts.mjs"), `
export function inspectDependencies(root, scopes) {
  if (JSON.stringify(scopes) !== '["external/maxcore","external/pdim"]') throw Error("wrong scopes");
  return {ready:true, failures:[]};
}`);
  return {
    root,
    run: () => spawnSync("bash", ["script/sync-subsystem-dependencies.sh"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, FIXTURE_LOG: path.join(root, "calls") },
    }),
  };
}

test("both independent subsystem locks drive frozen installs in their own directories", t => {
  const { root, run } = fixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(root, "calls"), "utf8").trim().split("\n"), [
    `${root}/external/maxcore|true|install --frozen-lockfile`,
    `${root}/external/pdim|true|install --frozen-lockfile`,
  ]);
  assert.match(result.stdout, /passed the runtime dependency gate/);
});

test("a failed frozen install prevents packaging and cannot be treated as success", t => {
  const { run } = fixture(t, "external/pdim");
  const result = run();
  assert.equal(result.status, 7);
  assert.doesNotMatch(result.stdout, /passed the runtime dependency gate/);
});

test("missing corrected lock input aborts instead of retaining a stale installed tree", t => {
  const { root, run } = fixture(t);
  fs.unlinkSync(path.join(root, "external/maxcore/pnpm-lock.yaml"));
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing locked dependency input/);
  assert.equal(fs.existsSync(path.join(root, "calls")), false);
});

test("historical fast build and compiling build refresh subsystem dependencies before packaging", () => {
  const shell = fs.readFileSync("build.sh", "utf8");
  const compile = fs.readFileSync("script/build.ts", "utf8");
  assert.ok(shell.indexOf("bash script/sync-subsystem-dependencies.sh") < shell.indexOf("FAST_PATH=1"));
  for (const scope of ["maxcore", "pdim"]) {
    assert.ok(shell.includes(`_pdim_pack "external/${scope}" "external_${scope}.pdim"`));
    assert.ok(compile.includes(`dir: "external/${scope}"`));
  }
  assert.ok(compile.indexOf("bash script/sync-subsystem-dependencies.sh") < compile.indexOf("npx vite build"));
});
