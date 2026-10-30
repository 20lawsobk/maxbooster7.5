import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("real bootstrap verifies the selected toolchain and preserves each package outside cleanup",()=>{
  let output;
  try {
    output=execFileSync("bash",["script/deployment/bootstrap.sh","--check"],{
      encoding:"utf8",timeout:90000,
    });
  } catch(error) {
    error.message+=`\nBootstrap output:\n${error.stdout??""}\n${error.stderr??""}`;
    throw error;
  }
  assert.match(output,/\[bootstrap\] Preparing build toolchain/);
  for (const manager of ["npm", "pnpm"]) {
    const preferred = fs.realpathSync(execFileSync("bash", ["-c", 'command -v "$1"', "bootstrap-test", manager], { encoding: "utf8" }).trim());
    if (preferred.startsWith("/nix/store/")) {
      assert.match(output, new RegExp(`Using immutable ${manager} package store path`));
      assert.doesNotMatch(output, new RegExp(`Preserving ${manager} outside workspace`));
    } else {
      assert.match(output, new RegExp(`Preserving ${manager} outside workspace`));
    }
  }
  assert.match(output,/Verifying preserved npm/);
  assert.match(output,/Verifying preserved pnpm/);
  assert.match(output,/Toolchain ready; temporary footprint:/);
  assert.match(output,/Build toolchain verified outside workspace caches/);
  assert.doesNotMatch(output,/Handing off/);
});

test("bootstrap announces and cleans up a failure before admitting destructive tasks",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"bootstrap-failure-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({packageManager:"npm@0.0.0"}));
  fs.mkdirSync(path.join(root, "script/lib"), { recursive: true });
  fs.copyFileSync("script/lib/deploymentPackRecovery.mjs", path.join(root, "script/lib/deploymentPackRecovery.mjs"));
  const before=new Set(fs.readdirSync("/tmp").filter(p=>p.startsWith("deployment-tools.")));
  let failure;
  try {
    execFileSync("bash",[path.resolve("script/deployment/bootstrap.sh"),"--check"],{
      cwd:root,encoding:"utf8",timeout:90000,stdio:"pipe",
    });
  } catch(error) {failure=error;}
  assert.ok(failure);
  assert.match(failure.stderr,/No durable npm installation found; refusing cleanup/);
  assert.match(failure.stdout,/\[bootstrap\] Resolving compatible npm/);
  assert.doesNotMatch(failure.stdout,/Handing off/);
  assert.deepEqual(new Set(fs.readdirSync("/tmp").filter(p=>p.startsWith("deployment-tools."))),before);
  assert.ok(fs.existsSync(path.join(root,"package.json")));
});
