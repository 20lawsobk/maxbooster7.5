import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("isolated publishing rehearsal does not copy the retained Task 123 snapshot", () => {
  const source = readFileSync("scripts/rehearse-publishing-build.mjs", "utf8");
  const exclusions = source.match(/const excluded = new Set\(\[([\s\S]*?)\]\);/)?.[1];
  assert.ok(exclusions, "rehearsal root exclusion policy must remain explicit");
  assert.match(exclusions, /"\.task123-publishing-candidate"/);
});

test("real adaptive source capsule applies root-only exclusions without dropping nested source fixtures", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';
    import assert from 'node:assert/strict';
    import {PlatformCapsuleBuilder,PlatformCapsuleLoader} from './external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.ts';
    import {adaptiveCapsuleCodec} from './script/lib/adaptiveCapsuleCodec.ts';
    import {SOURCE_CAPSULE_ROOT_EXCLUDES} from './script/lib/sourceCapsuleExclusions.ts';
    import {computeRemainingAppMembers} from './script/lib/dockerignoreScan.ts';
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'source-admission-'));
    try {
      for(const d of ['data','uploads','private-runtime','module/private-runtime','.task123-publishing-candidate'])
        await fs.mkdir(path.join(root,d),{recursive:true});
      for(const d of ['data','uploads','private-runtime'])
        await fs.writeFile(path.join(root,d,'private.txt'),'must not be included');
      await fs.writeFile(path.join(root,'.task123-publishing-candidate','large-rehearsal-output.bin'),'not a runtime asset');
      await fs.writeFile(path.join(root,'module/private-runtime/source.json'),'{}');
      const output=path.join(root,'packed');
      const m=await new PlatformCapsuleBuilder(root).build({
        version:'admission-test',encrypt:false,storagePath:output,
        rootExcludePatterns:[...SOURCE_CAPSULE_ROOT_EXCLUDES,'private-runtime','packed'],
        compressionCodec:adaptiveCapsuleCodec
      });
      const l=new PlatformCapsuleLoader();
      await l.load(m.id,output,adaptiveCapsuleCodec);
      assert.equal(await l.verify(),true);
      assert.deepEqual(l.getManifest().files.map(f=>f.path),['module/private-runtime/source.json']);

      const dockerignore=await fs.readFile(path.join(process.cwd(),'.dockerignore'),'utf8');
      await fs.writeFile(path.join(root,'.dockerignore'),dockerignore);
      const deployMembers=computeRemainingAppMembers(root);
      assert.equal(deployMembers.some(f=>f.startsWith('.task123-publishing-candidate/')),false);
    } finally {await fs.rm(root,{recursive:true,force:true});}
  `], { encoding: "utf8", timeout: 60000, env: { ...process.env, DEPLOY_TASK_CPU: "1" } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
