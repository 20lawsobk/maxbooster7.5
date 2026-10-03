import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { deploymentPackStateDirectory, RECOVERY_HELPER_PATH } from "../script/lib/deploymentPackRecovery.mjs";

// Real npm, real tar/zstd, real recovery. No app imports, services or credentials.
const repo = process.cwd();
const url = file => JSON.stringify(pathToFileURL(path.join(repo, file)).href);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-entry-"));
  const authorization = { DEPLOY_PACK:"1", PUBLISH_PAYLOAD_CLEANUP:"1", PUBLISH_BUILD_ROOT:root };
  const state = deploymentPackStateDirectory(root, authorization);
  t.after(() => {
    fs.rmSync(root, {recursive:true, force:true});
    fs.rmSync(state, {recursive:true, force:true});
  });
  function write(file, value) {
    fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true});
    fs.writeFileSync(path.join(root,file), value);
  }
  write(RECOVERY_HELPER_PATH, fs.readFileSync(RECOVERY_HELPER_PATH));
  // Absolute loader is a harness dependency, not an alternate build entry point.
  const loader = pathToFileURL(path.join(repo,"node_modules/tsx/dist/loader.mjs")).href;
  write("package.json", JSON.stringify({type:"module", scripts:{build:`node --import ${loader} fixture-build.mjs`}}));
  write("node_modules/input", Buffer.from([0,1,127,255]));
  write("server/source.ts", "original source");
  write("start.sh", "preserved bootstrap");
  write(".local/ignored/evidence", "disposable evidence");
  write("fixture-build.mjs", `
    import fs from "node:fs";
    import {beginDeploymentPack, deploymentPackStateDirectory} from "./${RECOVERY_HELPER_PATH}";
    import {packCapsule, packCapsuleMembers} from ${url("script/lib/capsulePack.ts")};
    import {assertPublishingCleanupExpectation, cleanPublishingPayload, measurePublishingPayload} from ${url("script/lib/publishingPayload.ts")};
    import {computeRemainingAppMembers} from ${url("script/lib/dockerignoreScan.ts")};
    const root=process.cwd();
    assertPublishingCleanupExpectation(process.env, root);
    if (!fs.existsSync("node_modules/input")) throw Error("pre-npm recovery missing");
    const tx=beginDeploymentPack(root);
    await packCapsule({root,dir:"node_modules",capsule:"node_modules.pdim",threads:1});
    if(process.env.FIXTURE_INTERRUPT==="1") process.kill(process.pid,"SIGKILL");
    const members=computeRemainingAppMembers(root).filter(p => p!=="${RECOVERY_HELPER_PATH}");
    if(members.some(p=>p.includes("journal.json"))) throw Error("shipped recovery");
    tx.preserveMembers(members);
    await packCapsuleMembers({root,members,capsule:"app_remainder.pdim",threads:1});
    const policy=".local/\\n.deployment-pack-state/\\n";
    cleanPublishingPayload({root,env:process.env,dockerignore:policy,requiredPaths:["start.sh","package.json","${RECOVERY_HELPER_PATH}"]});
    const measured=measurePublishingPayload(root,policy);
    console.log("REAL_FIXTURE_BUILD_COMPLETE", measured.totalBytes, deploymentPackStateDirectory(root));
    tx.complete();
  `);
  write(".dockerignore", ".local/\n.deployment-pack-state/\n");
  const env = { PATH:process.env.PATH, HOME:root, CI:"true" };
  const run = (extra = {}, args = ["--publish-disposable-copy", "."]) =>
    spawnSync(process.execPath, [path.join(root,RECOVERY_HELPER_PATH), ...args],
      {cwd:root, env:{...env,...extra},encoding:"utf8",timeout:60000});
  return {root,state,authorization,write,run};
}

for (const indicators of [{}, {REPLIT_DEPLOYMENT:"",REPLIT_DEPLOYMENT_ID:""},
  {REPLIT_DEPLOYMENT:"1",REPLIT_DEPLOYMENT_ID:"runtime-present"}]) {
  test(`actual publishing entry packs and reenters with indicators ${JSON.stringify(indicators)}`, t => {
    const f = fixture(t);
    const protectedFiles = ["package.json", "start.sh", RECOVERY_HELPER_PATH];
    const before = protectedFiles.map(p => fs.readFileSync(path.join(f.root,p)));
    for (let attempt=0; attempt<2; attempt++) {
      const result=f.run(indicators);
      assert.equal(result.status,0,result.stderr+result.stdout);
      assert.match(result.stdout,/REAL_FIXTURE_BUILD_COMPLETE/);
      protectedFiles.forEach((p,i)=>assert.deepEqual(fs.readFileSync(path.join(f.root,p)),before[i]));
      assert.ok(fs.existsSync(path.join(f.state,"journal.json")));
      assert.ok(!fs.existsSync(path.join(f.root,".deployment-pack-state")));
      assert.ok(!fs.existsSync(path.join(f.root,"node_modules")));
      assert.ok(!fs.existsSync(path.join(f.root,"fixture-build.mjs")));
    }
    const restored=f.run({...indicators,...f.authorization},["--recover", "."]);
    assert.equal(restored.status,0,restored.stderr);
    assert.deepEqual(fs.readFileSync(path.join(f.root,"node_modules/input")),Buffer.from([0,1,127,255]));
    assert.equal(fs.readFileSync(path.join(f.root,"server/source.ts"),"utf8"),"original source");
  });
}

test("interrupted publishing recovers before npm and preserves later edits", t => {
  const f=fixture(t);
  assert.notEqual(f.run({FIXTURE_INTERRUPT:"1"}).status,0);
  f.write("node_modules/input","later edit");
  const retry=f.run();
  assert.equal(retry.status,0,retry.stderr+retry.stdout);
  assert.equal(f.run(f.authorization,["--recover","."]).status,0);
  assert.equal(fs.readFileSync(path.join(f.root,"node_modules/input"),"utf8"),"later edit");
});

test("partial, mismatched and ambiguous contexts leave source and recovery bytes unchanged", t => {
  const f=fixture(t);
  assert.notEqual(f.run({FIXTURE_INTERRUPT:"1"}).status,0);
  const journal=fs.readFileSync(path.join(f.state,"journal.json"));
  const source=fs.readFileSync(path.join(f.root,"server/source.ts"));
  for(const [env,args] of [
    [{DEPLOY_PACK:"1"},["--recover","."]],
    [{REPLIT_DEPLOYMENT:"1"},["--recover","."]],
    [{DEPLOY_PACK:"1",PUBLISH_PAYLOAD_CLEANUP:"1"},["--recover","."]],
    [{...f.authorization,PUBLISH_BUILD_ROOT:"/wrong-root"},["--recover","."]],
    [{DEPLOY_PACK:"1"},["--publish-disposable-copy","."]],
    [{},["--publish-disposable-copy","/tmp"]],
  ]) {
    const result=f.run(env,args);
    assert.notEqual(result.status,0);
    assert.deepEqual(fs.readFileSync(path.join(f.state,"journal.json")),journal);
    assert.deepEqual(fs.readFileSync(path.join(f.root,"server/source.ts")),source);
    assert.ok(!fs.existsSync(path.join(f.root,"node_modules")));
  }
});

test("conflicting local and publishing journals reject before any restore", t => {
  const f=fixture(t);
  assert.notEqual(f.run({FIXTURE_INTERRUPT:"1"}).status,0);
  const before=fs.readFileSync(path.join(f.state,"journal.json"));
  f.write(".deployment-pack-state/transaction/journal.json","preserve conflicting evidence");
  const result=f.run();
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Conflicting local and publishing recovery journals/);
  assert.deepEqual(fs.readFileSync(path.join(f.state,"journal.json")),before);
  assert.equal(fs.readFileSync(path.join(f.root,".deployment-pack-state/transaction/journal.json"),"utf8"),"preserve conflicting evidence");
  assert.ok(!fs.existsSync(path.join(f.root,"node_modules")));
});