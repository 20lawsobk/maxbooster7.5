import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deploymentPackStateDirectory } from "../script/lib/deploymentPackRecovery.mjs";

test("DEPLOY_PACK alone cannot relocate local recovery", () => {
  assert.equal(deploymentPackStateDirectory("/example/workspace", {DEPLOY_PACK:"1"}),
    "/example/workspace/.deployment-pack-state/transaction");
});

test("publishing CLI refuses recovery mutations without a platform indicator", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-cli-guard-"));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const env = {...process.env, REPLIT_DEPLOYMENT:"0", REPLIT_DEPLOYMENT_ID:"",
    DEPLOY_PACK:"1", PUBLISH_PAYLOAD_CLEANUP:"1"};
  const helper = new URL("../script/lib/deploymentPackRecovery.mjs", import.meta.url);
  fs.mkdirSync(path.join(root,"node_modules"));
  fs.writeFileSync(path.join(root,"node_modules/input"),"retained input");
  execFileSync(process.execPath,["--input-type=module","-e",`
    import {beginDeploymentPack} from ${JSON.stringify(helper.href)};
    beginDeploymentPack(${JSON.stringify(root)}).complete();
  `],{env});
  fs.rmSync(path.join(root,"node_modules"),{recursive:true});
  const result = spawnSync(process.execPath,[fileURLToPath(helper),"--recover",root],
    {env,encoding:"utf8"});
  assert.equal(result.status,1);
  assert.match(result.stderr,/no platform deployment indicator/);
  assert.equal(fs.existsSync(path.join(root,"node_modules")),false);
  assert.equal(fs.existsSync(path.join(root,".deployment-pack-state/transaction/journal.json")),true);
});

test("publishing snapshots survive removal of ignored build-copy state and recover in fresh Node", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-recovery-fixture-"));
  const env = {...process.env, REPLIT_DEPLOYMENT:"1", REPLIT_DEPLOYMENT_ID:"isolated-fixture"};
  const recovery = deploymentPackStateDirectory(root, env);
  t.after(() => {
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(recovery,{recursive:true,force:true});
  });
  assert.ok(!recovery.startsWith(root + "/"));
  fs.mkdirSync(path.join(root,"node_modules"));
  fs.writeFileSync(path.join(root,"node_modules/input"),"original");
  const helper = new URL("../script/lib/deploymentPackRecovery.mjs", import.meta.url).href;
  execFileSync(process.execPath,["--input-type=module","-e",`
    import {beginDeploymentPack} from ${JSON.stringify(helper)};
    beginDeploymentPack(${JSON.stringify(root)}).complete();
  `],{env});
  fs.rmSync(path.join(root,"node_modules"),{recursive:true});
  fs.rmSync(path.join(root,".deployment-pack-state"),{recursive:true,force:true});
  execFileSync(process.execPath,["--input-type=module","-e",`
    import {recoverDeploymentPack} from ${JSON.stringify(helper)};
    if(!recoverDeploymentPack(${JSON.stringify(root)})) throw Error("No recovery");
  `],{env});
  assert.equal(fs.readFileSync(path.join(root,"node_modules/input"),"utf8"),"original");
  assert.equal(fs.existsSync(recovery),false);
});

test("real pack, publishing cleanup and fresh-process recovery preserve build inputs", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-clean-pack-"));
  const env = {...process.env, DEPLOY_PACK:"1", PUBLISH_PAYLOAD_CLEANUP:"1",
    REPLIT_DEPLOYMENT:"1", REPLIT_DEPLOYMENT_ID:"isolated-clean-pack-fixture"};
  const recovery = deploymentPackStateDirectory(root, env);
  t.after(() => {
    fs.rmSync(root,{recursive:true,force:true});
    fs.rmSync(recovery,{recursive:true,force:true});
  });
  fs.mkdirSync(path.join(root,"node_modules"));
  fs.writeFileSync(path.join(root,"node_modules/input"),"original build input");
  fs.mkdirSync(path.join(root,".local/archive"),{recursive:true});
  fs.symlinkSync("/tmp/absent-audio-session-for-test",path.join(root,".local/archive/audio"));
  const helper = new URL("../script/lib/deploymentPackRecovery.mjs", import.meta.url).href;
  const packer = new URL("../script/lib/capsulePack.ts", import.meta.url).href;
  const cleanup = new URL("../script/lib/publishingPayload.ts", import.meta.url).href;
  execFileSync(process.execPath,["--import","tsx","--input-type=module","-e",`
    import {beginDeploymentPack} from ${JSON.stringify(helper)};
    import {packCapsule} from ${JSON.stringify(packer)};
    import {cleanPublishingPayload} from ${JSON.stringify(cleanup)};
    const root=${JSON.stringify(root)};
    const transaction=beginDeploymentPack(root);
    await packCapsule({root,dir:"node_modules",capsule:"node_modules.pdim",threads:1});
    cleanPublishingPayload({root,env:process.env,dockerignore:".local/\\n.deployment-pack-state/\\n",
      requiredPaths:["node_modules.pdim","node_modules.manifest.json"]});
    transaction.complete();
  `],{env});
  assert.equal(fs.existsSync(path.join(root,".local")),false);
  assert.equal(fs.existsSync(path.join(root,"node_modules")),false);
  assert.equal(fs.existsSync(path.join(recovery,"journal.json")),true);
  execFileSync(process.execPath,["--input-type=module","-e",`
    import {recoverDeploymentPack} from ${JSON.stringify(helper)};
    if(!recoverDeploymentPack(${JSON.stringify(root)})) throw Error("No recovery");
  `],{env});
  assert.equal(fs.readFileSync(path.join(root,"node_modules/input"),"utf8"),"original build input");
});