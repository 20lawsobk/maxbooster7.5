import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("real adaptive source capsule applies root-only exclusions without dropping nested source fixtures", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import fs from 'node:fs/promises';
    import os from 'node:os';
    import path from 'node:path';
    import assert from 'node:assert/strict';
    import {PlatformCapsuleBuilder,PlatformCapsuleLoader} from './external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.ts';
    import {adaptiveCapsuleCodec} from './script/lib/adaptiveCapsuleCodec.ts';
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'source-admission-'));
    try {
      for(const d of ['data','uploads','private-runtime','module/private-runtime'])
        await fs.mkdir(path.join(root,d),{recursive:true});
      for(const d of ['data','uploads','private-runtime'])
        await fs.writeFile(path.join(root,d,'private.txt'),'must not be included');
      await fs.writeFile(path.join(root,'module/private-runtime/source.json'),'{}');
      const output=path.join(root,'packed');
      const m=await new PlatformCapsuleBuilder(root).build({
        version:'admission-test',encrypt:false,storagePath:output,
        rootExcludePatterns:['data','uploads','private-runtime','packed'],
        compressionCodec:adaptiveCapsuleCodec
      });
      const l=new PlatformCapsuleLoader();
      await l.load(m.id,output,adaptiveCapsuleCodec);
      assert.equal(await l.verify(),true);
      assert.deepEqual(l.getManifest().files.map(f=>f.path),['module/private-runtime/source.json']);
    } finally {await fs.rm(root,{recursive:true,force:true});}
  `], { encoding: "utf8", timeout: 60000, env: { ...process.env, DEPLOY_TASK_CPU: "1" } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
