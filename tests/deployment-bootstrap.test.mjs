import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("bootstrap verifies compatible package managers without starting a build",()=>{
  let output;
  try {
    output=execFileSync("bash",["script/deployment/bootstrap.sh","--check"],{
      encoding:"utf8",timeout:90000,
    });
  } catch(error) {
    error.message+=`\nBootstrap output:\n${error.stdout??""}\n${error.stderr??""}`;
    throw error;
  }
  assert.match(output,/\[bootstrap\] Probing Node:/);
  assert.match(output,/\[bootstrap\] Resolving compatible npm/);
  assert.match(output,/\[bootstrap\] Resolving compatible pnpm/);
  for (const manager of ["npm", "pnpm"]) {
    const version = JSON.parse(fs.readFileSync("package.json", "utf8"))
      .packageManager.match(new RegExp(`^${manager}@(\\S+)$`))?.[1];
    if (version) assert.match(output, new RegExp(`Preserved ${manager} ${version.replaceAll(".", "\\.")}`));
  }
  assert.match(output,/Sequential plan verified; 18 ordered phases; no build phases executed/);
  assert.match(output,/Toolchain and sequential build plan verified; build not executed/);
  assert.doesNotMatch(output,/Running dependency-ordered build phases/);
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
  assert.match(failure.stderr,/No compatible durable npm installation found/);
  assert.match(failure.stdout,/\[bootstrap\] Resolving compatible npm/);
  assert.doesNotMatch(failure.stdout,/Running dependency-ordered build phases/);
  const after = new Set(fs.readdirSync("/tmp").filter((p) => p.startsWith("deployment-tools.")));
  assert.deepEqual(
    [...after].filter((entry) => !before.has(entry)),
    [],
    "this failed bootstrap must not leak a new temporary toolchain directory",
  );
  assert.ok(fs.existsSync(path.join(root,"package.json")));
});
