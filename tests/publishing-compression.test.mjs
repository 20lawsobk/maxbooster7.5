import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildSync } from "esbuild";
import { inspectArtifacts } from "../scripts/verify-runtime-artifacts.mjs";

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-zstd-"));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, "dist"));
  buildSync({entryPoints:["script/publish-capsules.ts"], bundle:true, platform:"node",
    format:"esm", outfile:path.join(root,"dist/publish-capsules.mjs")});
  fs.copyFileSync("dist/pdim-restore.mjs", path.join(root,"dist/pdim-restore.mjs"));
  fs.mkdirSync(path.join(root,"fixture"));
  fs.writeFileSync(path.join(root,"fixture/data.txt"), "capsule fixture\n".repeat(65536));
  const run = (...args) => spawnSync(process.execPath, ["dist/publish-capsules.mjs", ...args],
    {cwd:root,encoding:"utf8"});
  return {root,run};
}

test("shared packer removes source only after a gate-valid zstd capsule and real restore round-trips", async t => {
  const {root,run}=setup(t);
  const original=fs.readFileSync(path.join(root,"fixture/data.txt"));
  const packed=run("directory","fixture.pdim","fixture");
  assert.equal(packed.status,0,packed.stderr);
  assert.equal(fs.existsSync(path.join(root,"fixture")),false);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"fixture.manifest.json")));
  assert.equal(manifest.compression,"zstd-6");
  assert.equal(manifest.sha256,createHash("sha256").update(fs.readFileSync(path.join(root,"fixture.pdim"))).digest("hex"));
  assert.equal((await inspectArtifacts(root,["fixture"])).ready,true);
  const {restoreCapsule}=await import(pathToFileURL(path.join(root,"dist/pdim-restore.mjs")));
  assert.equal(await restoreCapsule("fixture.pdim","fixture.manifest.json","fixture"),true);
  assert.deepEqual(fs.readFileSync(path.join(root,"fixture/data.txt")),original);
  fs.appendFileSync(path.join(root,"fixture.pdim"),"corrupt");
  assert.equal(await restoreCapsule("fixture.pdim","fixture.manifest.json","fixture"),false);
});

test("missing required directory fails instead of claiming a successful capsule", t => {
  const {run}=setup(t);
  assert.notEqual(run("directory","missing.pdim","missing").status,0);
});

test("GNU tar also restores zstd capsules when bsdtar is unavailable", t => {
  const {root,run}=setup(t);
  const bytes=fs.readFileSync(path.join(root,"fixture/data.txt"));
  assert.equal(run("directory","fixture.pdim","fixture").status,0);
  const bin=path.join(root,"bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,"bsdtar"),"#!/bin/sh\nexit 127\n",{mode:0o755});
  const restore=pathToFileURL(path.join(root,"dist/pdim-restore.mjs")).href;
  const result=spawnSync(process.execPath,["--input-type=module","-e",
    `import {restoreCapsule} from ${JSON.stringify(restore)}; if(!await restoreCapsule('fixture.pdim','fixture.manifest.json','fixture')) process.exit(1);`],
    {encoding:"utf8",cwd:root,env:{...process.env,PATH:bin+":"+process.env.PATH}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/GNU tar/);
  assert.deepEqual(fs.readFileSync(path.join(root,"fixture/data.txt")),bytes);
});

test("source-tree packing preserves files until the shell performs cleanup", t => {
  const {root,run}=setup(t);
  const result=run("paths","source.pdim","fixture");
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(path.join(root,"fixture/data.txt")),true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,"source.manifest.json"))).compression,"zstd-6");
});

test("compressor failure retains source and the previous archive", t => {
  const {root}=setup(t);
  fs.writeFileSync(path.join(root,"fixture.pdim"),"previous");
  const bin=path.join(root,"bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,"zstd"),"#!/bin/sh\nexit 23\n",{mode:0o755});
  const result=spawnSync(process.execPath,["dist/publish-capsules.mjs","directory","fixture.pdim","fixture"],
    {cwd:root,encoding:"utf8",env:{...process.env,PATH:bin+":"+process.env.PATH}});
  assert.notEqual(result.status,0);
  assert.equal(fs.readFileSync(path.join(root,"fixture.pdim"),"utf8"),"previous");
  assert.equal(fs.existsSync(path.join(root,"fixture/data.txt")),true);
});

test("both publishing paths use shared deployment packing while retaining adaptive app-capsule generation", () => {
  const shell=fs.readFileSync("build.sh","utf8"), build=fs.readFileSync("script/build.ts","utf8");
  assert.match(shell,/script\/build-capsule\.ts/);
  assert.match(shell,/script\/publish-capsules\.ts --bundle/);
  assert.match(shell,/node dist\/publish-capsules\.mjs directory/);
  assert.match(shell,/PUBLISH_SHELL_PACKS_CAPSULES=1 npm run build/);
  assert.match(build,/await publishCapsule/);
  assert.match(build,/PUBLISH_SHELL_PACKS_CAPSULES !== "1"/);
  assert.doesNotMatch(build,/gzip -1/);
  const source = fs.readFileSync("script/build-capsule.ts","utf8");
  assert.match(source,/compressionCodec: adaptiveCapsuleCodec/);
  assert.match(source,/loader.load\(metadata.id, OUTPUT_DIR, adaptiveCapsuleCodec\)/);
});

test("adaptive application capsule is verified by a fresh reader; legacy gzip pockets remain readable", t => {
  const {root}=setup(t);
  const platform=pathToFileURL(path.resolve("external/pdim/artifacts/api-server/src/pocket-dimension/platform-capsule.ts")).href;
  const core=pathToFileURL(path.resolve("external/pdim/artifacts/api-server/src/pocket-dimension/index.ts")).href;
  const adapter=pathToFileURL(path.resolve("script/lib/adaptiveCapsuleCodec.ts")).href;
  const result=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",`
    import assert from 'node:assert/strict';
    process.chdir(${JSON.stringify(root)});
    const {PlatformCapsuleBuilder,PlatformCapsuleLoader}=await import(${JSON.stringify(platform)});
    const {PocketDimension}=await import(${JSON.stringify(core)});
    const {adaptiveCapsuleCodec}=await import(${JSON.stringify(adapter)});
    let calls=0;
    const codec={...adaptiveCapsuleCodec,compress:async data=>{
      calls++; const packed=await adaptiveCapsuleCodec.compress(data);
      assert.equal(packed.subarray(0,4).toString(),'PDCF'); return packed;
    }};
    const builder=new PlatformCapsuleBuilder(${JSON.stringify(path.join(root,"fixture"))});
    const storagePath=${JSON.stringify(path.join(root,"capsules"))};
    const meta=await builder.build({version:'test',platformName:'Fixture',storagePath,compressionCodec:codec,encrypt:false});
    assert.ok(calls>0);
    const reader=new PlatformCapsuleLoader();
    await reader.load(meta.id,storagePath,adaptiveCapsuleCodec);
    assert.equal(await reader.verify(),true);
    const legacy=new PocketDimension({id:'legacy',name:'legacy',storagePath});
    await legacy.open(); await legacy.write('sample',Buffer.from('legacy payload')); await legacy.close();
    const reopened=new PocketDimension({id:'legacy',name:'legacy',storagePath,compressionCodec:adaptiveCapsuleCodec});
    await reopened.open(); assert.equal((await reopened.read('sample')).toString(),'legacy payload'); await reopened.close();
    console.log('ADAPTIVE_AND_LEGACY_VERIFIED');
  `],{cwd:process.cwd(),encoding:"utf8",timeout:120000,maxBuffer:1024*1024});
  assert.equal(result.status,0,result.stderr + result.stdout);
  assert.match(result.stdout,/ADAPTIVE_AND_LEGACY_VERIFIED/);
});
