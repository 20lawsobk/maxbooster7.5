import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {runExecutive,validatePlan} from "../script/deployment/executive.mjs";
import {buildPlan,startPlan} from "../script/deployment/plans.mjs";
import {buildSync} from "esbuild";
import {pathToFileURL} from "node:url";
const capacity=()=>({cpus:4,memoryMB:8192,availableMB:8192,ioSlots:2});
const task=(id,deps=[],code="")=>({id,deps,cpu:1,io:1,memoryMB:64,command:process.execPath,args:["-e",code]});
test("real subprocesses overlap and prerequisites finish before successors",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-test-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 // Synchronize both actual children instead of assuming the OS starts them
 // within a particular number of milliseconds under parallel test load.
 const code=id=>`const fs=require('fs');fs.appendFileSync('events','start ${id}\\n');
 const timer=setInterval(()=>{const s=fs.readFileSync('events','utf8');
 if(${JSON.stringify(id)}==='c'||(s.includes('start a')&&s.includes('start b'))){clearInterval(timer);fs.appendFileSync('events','end ${id}\\n');}},10);`;
 await runExecutive([task("a",[],code("a")),task("b",[],code("b")),task("c",["a","b"],code("c"))],
 {cwd:root,capacity,pollMs:10,budgetMs:5000,log(){}});
 const events=fs.readFileSync(path.join(root,"events"),"utf8").trim().split("\n");
 assert.ok(events.indexOf("start b")<events.indexOf("end a"));
 assert.ok(events.indexOf("start c")>events.indexOf("end b"));
});
test("deadline kills hung task instead of admitting its dependent",async()=>{
 let launched=false;
 await assert.rejects(runExecutive([task("hang",[],"setInterval(()=>{},1000)"),task("dependent",["hang"])],
 {capacity,pollMs:10,budgetMs:150,log(line){if(line.includes("starting dependent"))launched=true;}}),/deadline/);
 assert.equal(launched,false);
});
test("failed prerequisite blocks dependent; invalid graphs rejected before execution",async()=>{
 await assert.rejects(runExecutive([task("fail",[],"process.exit(12)"),task("child",["fail"])],
 {capacity,pollMs:10,log(){}}),/fail exited 12/);
 assert.throws(()=>validatePlan([task("a",["b"]),task("b",["a"])]),/cycle/);
 const plan=buildPlan();
 validatePlan(plan);validatePlan(startPlan(process.execPath));
 assert.deepEqual(plan.find(t=>t.id==="cleanup").deps,["node"]);
 assert.deepEqual(plan.find(t=>t.id==="node").deps,[]);
});
test("admission adapts when available memory recovers",async()=>{
 let samples=0;
 await runExecutive([task("work")],{capacity:()=>({...capacity(),availableMB:++samples<3?0:8192}),
 pollMs:10,budgetMs:2000,log(){}});
 assert.ok(samples>=3);
});
test("startup plan requires all restores before launching app; source deletion is last",()=>{
 assert.deepEqual(startPlan(process.execPath).at(-1).deps.sort(),
 ["restore-app", "restore-node", "restore-python", "restore-maxcore", "restore-pdim"].sort());
 assert.equal(startPlan(process.execPath).find(t=>t.id==="restore-python").args.at(-1),".pdim-restored-py");
 const plan=buildPlan();
 assert.deepEqual(plan.find(t=>t.id==="source").deps.sort(),["pack_maxcore","pack_node","pack_pdim","pack_python"]);
});
test("a ready application is supervised beyond the startup deadline",async()=>{
 const app={...task("application",[],"setTimeout(()=>{},250)"),application:true};
 const result=await runExecutive([app],{capacity,pollMs:10,budgetMs:150,readiness:async()=>true,log(){}});
 assert.equal(result.ready,true);
});
test("failed process descendants cannot continue writing after rejection",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-drain-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const childCode="setTimeout(()=>require('fs').writeFileSync('late-write','bad'),600)";
 const code=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});setTimeout(()=>process.exit(12),100);`;
 await assert.rejects(runExecutive([task("fail",[],code)],{cwd:root,capacity,pollMs:10,log(){}}),/exited/);
 await new Promise(resolve=>setTimeout(resolve,750));
 assert.equal(fs.existsSync(path.join(root,"late-write")),false);
});
test("actual build.sh pack task removes only its fixture source and restores it",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-real-pack-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,"dist"),{recursive:true});
 fs.mkdirSync(path.join(root,"python_runtime"));
 fs.copyFileSync("build.sh",path.join(root,"build.sh"));
 fs.writeFileSync(path.join(root,"python_runtime/payload"),"roundtrip fixture".repeat(100));
 fs.copyFileSync("dist/pdim-restore.mjs",path.join(root,"dist/pdim-restore.mjs"));
 buildSync({entryPoints:["script/publish-capsules.ts"],bundle:true,platform:"node",format:"esm",
   outfile:path.join(root,"dist/publish-capsules.mjs")});
 const job={...buildPlan().find(t=>t.id==="pack_python"),deps:[],
   args:[path.join(root,"build.sh"),"--executive-task","pack_python"]};
 await runExecutive([job],{cwd:root,capacity,pollMs:10,budgetMs:10000,log(){}});
 assert.equal(fs.existsSync(path.join(root,"python_runtime")),false);
 const {restoreCapsule}=await import(pathToFileURL(path.join(root,"dist/pdim-restore.mjs")));
 assert.equal(await restoreCapsule("python_runtime.pdim","python_runtime.manifest.json","python_runtime"),true);
 assert.equal(fs.readFileSync(path.join(root,"python_runtime/payload"),"utf8"),"roundtrip fixture".repeat(100));
});
test("compression allocation grows with measured capacity, not runtime VM settings",async()=>{
 let allocation="";
 await runExecutive([{...task("compress"),elasticCPU:true,maxCPU:8}],
 {capacity:()=>({...capacity(),cpus:16,ioSlots:4}),pollMs:10,log(line){if(line.includes("starting compress"))allocation=line;}});
 assert.match(allocation,/cpu=8/);
});
test("portable Python provisioning rejects partial downloads and host-runtime fallback",()=>{
 const build=fs.readFileSync(new URL("../build.sh",import.meta.url),"utf8");
 assert.match(build,/curl --fail --silent --show-error --location/);
 assert.match(build,/set -o pipefail/);
 assert.match(build,/refusing a host-Python fallback/);
 assert.doesNotMatch(build,/python3" -m venv/);
});
test("node_modules pruning removes non-runtime trees in one fail-closed pass",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"build-prune-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.copyFileSync("build.sh",path.join(root,"build.sh"));
 const files=[
  ["node_modules/pkg/runtime.js","runtime"],
  ["node_modules/pkg/runtime.js.map","map"],
  ["node_modules/pkg/types.d.ts","types"],
  ["node_modules/pkg/source.ts","source"],
  ["node_modules/pkg/README.md","readme"],
  ["node_modules/pkg/test/test.js","test"],
  ["node_modules/pkg/docs/index.html","docs"],
  ["node_modules/pkg/doc/namespace.js","runtime doc namespace"],
  ["node_modules/@tensorflow/tfjs-backend-webgl/dist/backend.js","required backend"],
 ];
 for(const [name,contents] of files){
  const filename=path.join(root,name);
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,contents);
 }
 const result=spawnSync("bash",[path.join(root,"build.sh"),"--executive-task","prune"],
  {cwd:root,encoding:"utf8",timeout:10000});
 assert.equal(result.status,0,result.stderr+result.stdout);
 for(const [name] of files){
  const filename=path.join(root,name);
  const shouldRemain=name.endsWith("/runtime.js") ||
    name.endsWith("/namespace.js") || name.endsWith("/backend.js");
  assert.equal(fs.existsSync(filename),shouldRemain,`${name} retention`);
 }
 assert.ok(fs.existsSync(path.join(root,"node_modules/.pdim-restored")));
 const build=fs.readFileSync("build.sh","utf8");
 const prune=build.split("_pdim_prune_nm() {")[1].split("\n}")[0];
 assert.equal((prune.match(/\bfind node_modules\b/g)||[]).length,1);
 assert.doesNotMatch(build,/\bdu\b|sha256sum source\.pdim/);
});
