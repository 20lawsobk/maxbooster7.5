import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {EventEmitter} from "node:events";
import {bindShutdownSignals,coordinateBuildPlan,runExecutive,validatePlan} from "../script/deployment/executive.mjs";
import {buildPlan,startPlan} from "../script/deployment/plans.mjs";
import {
  clampDeploymentCapacity,
  DEDICATED_DEPLOYMENT_LIMITS,
  liveCapacity,
} from "../script/deployment/capacity.mjs";
import {buildSync} from "esbuild";
import {pathToFileURL} from "node:url";
const capacity=()=>({cpus:4,memoryMB:8192,availableMB:8192,ioSlots:2});
const task=(id,deps=[],code="")=>({id,deps,cpu:1,io:1,memoryMB:64,command:process.execPath,args:["-e",code]});
test("deployment resource ceiling matches the configured dedicated machine",()=>{
 assert.deepEqual(DEDICATED_DEPLOYMENT_LIMITS,{cpus:16,memoryGB:64});
 assert.deepEqual(clampDeploymentCapacity({cpus:32,memoryGB:128}),{cpus:16,memoryGB:64});
 assert.deepEqual(clampDeploymentCapacity({cpus:8,memoryGB:32}),{cpus:8,memoryGB:32});
 assert.throws(()=>clampDeploymentCapacity({cpus:0,memoryGB:64}),/Invalid detected deployment capacity/);
 const live=liveCapacity();
 assert.ok(live.cpus>0&&live.cpus<=16);
 assert.ok(live.memoryMB>0&&live.memoryMB<=65536);
 assert.ok(live.usedMB>=0&&live.usedMB<=live.memoryMB);
 assert.ok(live.availableMB<=live.memoryMB);
});
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
test("resource-starved admission fails with capacity evidence instead of idling to the build deadline",async()=>{
  let launched=false;
  const logs=[];
  await assert.rejects(
    runExecutive([{
      ...task("large-stage",[],"process.exit(0)"),
      memoryMB:512,
    }],{
      capacity:()=>({cpus:4,memoryMB:4096,availableMB:256,ioSlots:2}),
      pollMs:5,
      budgetMs:5000,
      admissionTimeoutMs:50,
      log(line){
        logs.push(line);
        if(line.includes("starting large-stage")) launched=true;
      },
    }),
    error=>{
      assert.equal(error.code,"DEPLOY_CAPACITY_ADMISSION_TIMEOUT");
      assert.equal(error.taskId,"large-stage");
      assert.equal(error.requiredMemoryMB,512);
      assert.equal(error.availableMB,256);
      assert.match(error.message,/large-stage requires 512 MiB; 256 MiB available/);
      return true;
    },
  );
  assert.equal(launched,false);
  assert.ok(logs.every(line=>!line.includes("completed large-stage")));
});
test("capsule tasks retry a child-only transient signal after cleanup",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-retry-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const attemptsFile=path.join(root,"attempts");
  const code=`const fs=require('node:fs');const file=process.env.EXECUTIVE_ATTEMPTS_FILE;let n=0;try{n=Number(fs.readFileSync(file,'utf8'))}catch{};fs.writeFileSync(file,String(n+1));if(n===0)process.kill(process.pid,'SIGTERM');`;
  const capsulePlanTask=buildPlan().find(job=>job.id==="app_capsule");
  assert.equal(capsulePlanTask.maxRetries,1);
  assert.deepEqual(capsulePlanTask.retryOnSignals,["SIGTERM","SIGHUP"]);
  const logs=[];
  await runExecutive([{
    ...capsulePlanTask,deps:[],command:process.execPath,args:["-e",code],
    memoryMB:512,cpu:1,retryBackoffMs:5,
  }],{cwd:root,env:{...process.env,EXECUTIVE_ATTEMPTS_FILE:attemptsFile},
    capacity:()=>({cpus:4,memoryMB:4096,availableMB:4096,ioSlots:2}),
    pollMs:5,budgetMs:3000,log:line=>logs.push(line)});
  assert.equal(fs.readFileSync(attemptsFile,"utf8"),"2");
  assert.ok(logs.some(line=>line.includes("retry app_capsule: SIGTERM; 1/1")));
  assert.ok(logs.some(line=>line.includes("completed app_capsule")));
});
test("executor cancellation stops promptly and is never retried",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-cancel-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const attemptsFile=path.join(root,"attempts");
  const code=`const fs=require('node:fs');fs.appendFileSync(process.env.EXECUTIVE_ATTEMPTS_FILE,'started\\n');setInterval(()=>{},1000);`;
  const capsulePlanTask=buildPlan().find(job=>job.id==="app_capsule");
  const controller=new AbortController();
  const running=runExecutive([{
    ...capsulePlanTask,deps:[],command:process.execPath,args:["-e",code],
    memoryMB:512,cpu:1,
  }],{cwd:root,env:{...process.env,EXECUTIVE_ATTEMPTS_FILE:attemptsFile},
    capacity:()=>({cpus:4,memoryMB:4096,availableMB:4096,ioSlots:2}),
    pollMs:5,budgetMs:5000,signal:controller.signal,log(){}});
  const deadline=Date.now()+2000;
  while(!fs.existsSync(attemptsFile)&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(fs.existsSync(attemptsFile),true,"task should have started before cancellation");
  controller.abort(Error("Publish cancelled by user"));
  let rejection;
  await assert.rejects(running,error=>{rejection=error;return /Publish cancelled by user/.test(error.message);});
  assert.equal(fs.readFileSync(attemptsFile,"utf8").trim().split("\n").length,1);
  assert.deepEqual(rejection.runningTasks,["app_capsule"]);
  assert.equal(rejection.taskCheckpoint.find(item=>item.id==="app_capsule").state,"running");
});
test("unreasoned abort signals retain an actionable executive interruption error",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-abort-reason-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const started=path.join(root,"started");
  const controller=new AbortController();
  const running=runExecutive([task(
    "work",
    [],
    `require("node:fs").writeFileSync(${JSON.stringify(started)},"yes");setInterval(()=>{},1000);`,
  )],{
    cwd:root,
    capacity,
    pollMs:5,
    budgetMs:3000,
    signal:controller.signal,
    log(){},
  });
  const deadline=Date.now()+2000;
  while(!fs.existsSync(started)&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(fs.existsSync(started),"the task must be running before abort");
  controller.abort();
  await assert.rejects(running,error=>{
    assert.match(error.message,/Executive interrupted/);
    assert.equal(error.code,"DEPLOY_EXECUTIVE_ABORT");
    assert.equal(error.signalOrigin,"abort-signal");
    assert.equal(error.cause?.name,"AbortError");
    return true;
  });
});
test("executor binds TERM, INT and HUP with truthful signal metadata and removes handlers",()=>{
  const emitter=new EventEmitter(),controller=new AbortController();
  const unbind=bindShutdownSignals(controller,emitter);
  emitter.emit("SIGHUP");
  assert.equal(controller.signal.aborted,true);
  assert.equal(controller.signal.reason.message,"Executive interrupted by SIGHUP");
  assert.equal(controller.signal.reason.code,"DEPLOY_EXECUTIVE_SIGNAL");
  assert.equal(controller.signal.reason.signalOrigin,"unknown");
  assert.equal(controller.signal.reason.signalScope,"executive");
  assert.equal(controller.signal.reason.resumePolicy,"not-auto-resumed-ambiguous-origin");
  unbind();
  assert.equal(emitter.listenerCount("SIGINT"),0);
  assert.equal(emitter.listenerCount("SIGTERM"),0);
  assert.equal(emitter.listenerCount("SIGHUP"),0);
});
test("capsule packers use available CPU while I/O reservations cap concurrency",async()=>{
  const logs=[];let active=0,maximum=0;
  const jobs=["pack_node","pack_python","pack_maxcore","pack_pdim"].map(id=>({
    ...task(id,[],"setTimeout(()=>{},40)"),
    io:2,
    elasticCPU:true,
    maxCPU:16,
  }));
  await runExecutive(jobs,{capacity:()=>({cpus:16,memoryMB:65536,availableMB:65536,ioSlots:4}),pollMs:5,budgetMs:3000,log(line){
    logs.push(line);
    if(line.includes("starting pack_"))maximum=Math.max(maximum,++active);
    if(line.includes("completed pack_"))active--;
  }});
  assert.equal(maximum,2);
  assert.equal(active,0);
  assert.equal(logs.filter(line=>line.includes("starting pack_")&&line.includes("cpu=8;")).length,4);
});
test("assigned CPU budget reaches native, Go, and npm build workers",async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-resource-budget-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const output=path.join(root,"assigned.json");
 const code=`require("node:fs").writeFileSync(${JSON.stringify(output)},JSON.stringify({
  deploy:process.env.DEPLOY_TASK_CPU,cargo:process.env.CARGO_BUILD_JOBS,
  go:process.env.GOMAXPROCS,npm:process.env.npm_config_jobs
 }))`;
 await runExecutive([{...task("resource-budget",[],code),elasticCPU:true,maxCPU:16,toolchainBudget:true}],{
  cwd:root,
  capacity:()=>({cpus:16,memoryMB:65536,availableMB:65536,ioSlots:4}),
  pollMs:5,budgetMs:3000,log(){},
 });
 assert.deepEqual(JSON.parse(fs.readFileSync(output,"utf8")),{deploy:"16",cargo:"16",go:"16",npm:"16"});
});
test("task exceeding total I/O capacity fails instead of waiting indefinitely",async()=>{
  await assert.rejects(
    runExecutive([{...task("oversized",[]),io:3}],{
      capacity:()=>({...capacity(),ioSlots:2}),
      pollMs:5,
      budgetMs:1000,
      log(){},
    }),
    /oversized needs 3 I\/O slots; capacity is 2/,
  );
});
test("failed prerequisite blocks dependent; invalid graphs rejected before execution",async()=>{
 await assert.rejects(runExecutive([task("fail",[],"process.exit(12)"),task("child",["fail"])],
 {capacity,pollMs:10,log(){}}),/fail exited 12/);
 assert.throws(()=>validatePlan([task("a",["b"]),task("b",["a"])]),/cycle/);
 const plan=buildPlan();
 validatePlan(plan);validatePlan(startPlan(process.execPath));
 assert.deepEqual(plan.find(t=>t.id==="cleanup").deps,["node"]);
 assert.deepEqual(plan.find(t=>t.id==="node").deps,[]);
  for(const id of ["pack_node","pack_python","pack_maxcore","pack_pdim"]) {
    assert.equal(plan.find(t=>t.id===id).io,2,`${id} must reserve two I/O slots`);
     assert.equal(plan.find(t=>t.id===id).maxCPU,DEDICATED_DEPLOYMENT_LIMITS.cpus,`${id} should use available build CPU`);
  }
   for(const id of ["app_capsule","source","remainder"]) {
     assert.equal(plan.find(t=>t.id===id).maxCPU,DEDICATED_DEPLOYMENT_LIMITS.cpus,`${id} should use available dedicated CPU`);
   }
    for (const id of ["cleanup","dependencies","rust"]) {
      const phase=plan.find(t=>t.id===id);
      assert.equal(phase.cpu,1,`${id} should start with a small reservation`);
      assert.equal(phase.maxCPU,DEDICATED_DEPLOYMENT_LIMITS.cpus,`${id} should scale to the configured CPU ceiling`);
      assert.equal(phase.elasticCPU,true,`${id} should use elastic CPU allocation`);
    }
   assert.equal(plan.find(t=>t.id==="dependencies").memoryMB,8192);
   assert.equal(plan.find(t=>t.id==="rust").memoryMB,8192);
   assert.equal(plan.find(t=>t.id==="app_capsule").memoryMB,8192);
});
test("admission adapts when available memory recovers",async()=>{
 let samples=0;
 await runExecutive([task("work")],{capacity:()=>({...capacity(),availableMB:++samples<3?0:8192}),
 pollMs:10,budgetMs:2000,log(){}});
 assert.ok(samples>=3);
});
test("live CPU and memory budget fluctuations pause admissions, preserve active work, then resume",async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"executive-budget-fluctuation-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const firstStarted=path.join(root,"first-started");
  const firstFinished=path.join(root,"first-finished");
  const secondStarted=path.join(root,"second-started");
  let samples=0;
  let recoveredAt=Infinity;
  const logs=[];
  const fluctuatingCapacity=()=>{
    samples++;
    if(samples>=80&&recoveredAt===Infinity)recoveredAt=Date.now();
    const recovered=samples>=80;
    return {
      cpus:recovered?6:samples===1?6:2,
      memoryMB:4096,
      availableMB:recovered?400:samples===1?400:128,
      ioSlots:2,
    };
  };
  const firstCode=`const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(firstStarted)},"started");setTimeout(()=>fs.writeFileSync(${JSON.stringify(firstFinished)},"finished"),150);`;
  const secondCode=`require("node:fs").writeFileSync(${JSON.stringify(secondStarted)},String(Date.now()));`;
  await runExecutive([
    {...task("first",[],firstCode),cpu:3,memoryMB:256},
    {...task("second",[],secondCode),cpu:3,memoryMB:256},
  ],{
    cwd:root,capacity:fluctuatingCapacity,pollMs:5,budgetMs:3000,
    admissionTimeoutMs:1500,log(line){logs.push(line);},
  });
  assert.equal(fs.readFileSync(firstStarted,"utf8"),"started");
  assert.equal(fs.readFileSync(firstFinished,"utf8"),"finished");
  assert.notEqual(recoveredAt,Infinity,"capacity should recover during the run");
  assert.ok(Number(fs.readFileSync(secondStarted,"utf8"))>=recoveredAt,
    "queued work should wait for recovered capacity");
  assert.ok(samples>=80,"the scheduler should continue sampling capacity");
  assert.ok(logs.some(line=>line.includes("memoryReserved=")&&line.includes("memoryUsed=")),
    "progress should report reserved and observed memory budgets");
});
test("startup plan requires all restores before launching app; source deletion is last",()=>{
 assert.deepEqual(startPlan(process.execPath).at(-1).deps.sort(),
 ["restore-app", "restore-node", "restore-python", "restore-maxcore", "restore-pdim"].sort());
 assert.equal(startPlan(process.execPath).find(t=>t.id==="restore-python").args.at(-1),".pdim-restored-py");
 const plan=coordinateBuildPlan(buildPlan());
 assert.deepEqual(plan.find(t=>t.id==="source").deps.sort(),[
  "assets","pack_maxcore","pack_node","pack_pdim","pack_python","rust",
 ]);
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
 const state=path.join(root,"state");
 fs.mkdirSync(state);
 fs.mkdirSync(path.join(root,"dist"),{recursive:true});
 fs.mkdirSync(path.join(root,"python_runtime"));
 fs.copyFileSync("build.sh",path.join(root,"build.sh"));
 fs.writeFileSync(path.join(root,"python_runtime/payload"),"roundtrip fixture".repeat(100));
 fs.copyFileSync("dist/pdim-restore.mjs",path.join(root,"dist/pdim-restore.mjs"));
 buildSync({entryPoints:["script/publish-capsules.ts"],bundle:true,platform:"node",format:"esm",
   outfile:path.join(root,"dist/publish-capsules.mjs")});
 const job={...buildPlan().find(t=>t.id==="pack_python"),deps:[],
   args:[path.join(root,"build.sh"),"--executive-task","pack_python"]};
 await runExecutive([job],{cwd:root,env:{...process.env,DEPLOY_STATE_DIR:state},
  capacity,pollMs:10,budgetMs:10000,log(){}});
 assert.equal(fs.existsSync(path.join(root,"python_runtime")),false);
 const {restoreCapsule}=await import(pathToFileURL(path.join(root,"dist/pdim-restore.mjs")));
 assert.equal(await restoreCapsule("python_runtime.pdim","python_runtime.manifest.json","python_runtime"),true);
 assert.equal(fs.readFileSync(path.join(root,"python_runtime/payload"),"utf8"),"roundtrip fixture".repeat(100));
});
test("compression allocation grows with measured capacity, not runtime VM settings",async()=>{
 let allocation="";
  await runExecutive([{...task("compress"),elasticCPU:true,maxCPU:16}],
 {capacity:()=>({...capacity(),cpus:16,ioSlots:4}),pollMs:10,log(line){if(line.includes("starting compress"))allocation=line;}});
  assert.match(allocation,/cpu=16/);
});
test("portable Python provisioning stages downloads and rejects host-runtime fallback",()=>{
 const build=fs.readFileSync(new URL("../build.sh",import.meta.url),"utf8");
  assert.match(build,/provisionPortablePython\.mjs/);
  const provision=fs.readFileSync(new URL("../script/lib/provisionPortablePython.mjs",import.meta.url),"utf8");
  assert.match(provision,/--output/);
  assert.match(provision,/mkdtempSync/);
  assert.match(provision,/replaceRuntime/);
  assert.doesNotMatch(provision,/curl[^\n]*\|[^\n]*tar/);
 assert.doesNotMatch(build,/python3" -m venv/);
});
test("node_modules pruning preserves runtime sources and notices while dropping package-only trees",t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"build-prune-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.copyFileSync("build.sh",path.join(root,"build.sh"));
  fs.mkdirSync(path.join(root,"script/lib"),{recursive:true});
  fs.copyFileSync("script/lib/pruneRuntimeNodeModules.mjs",
   path.join(root,"script/lib/pruneRuntimeNodeModules.mjs"));
 const files=[
  ["node_modules/pkg/runtime.js","runtime"],
  ["node_modules/pkg/runtime.js.map","map"],
  ["node_modules/pkg/types.d.ts","types"],
  ["node_modules/pkg/source.ts","source"],
  ["node_modules/pkg/README.md","readme"],
   ["node_modules/pkg/LICENSE","license"],
   ["node_modules/pkg/NOTICE.txt","notice"],
  ["node_modules/pkg/test/test.js","test"],
  ["node_modules/pkg/docs/index.html","docs"],
  ["node_modules/pkg/doc/namespace.js","runtime doc namespace"],
   ["node_modules/pkg/examples/third-party/NOTICE","example notice"],
  ["node_modules/@tensorflow/tfjs-backend-webgl/dist/backend.js","required backend"],
 ];
 for(const [name,contents] of files){
  const filename=path.join(root,name);
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,contents);
 }
 fs.writeFileSync(path.join(root,"node_modules/.pdim-restored"),"fixture marker");
 const result=spawnSync(process.execPath,[
  path.resolve("script/lib/pruneRuntimeNodeModules.mjs"),root,
 ],{cwd:root,encoding:"utf8",timeout:10000});
 assert.equal(result.status,0,result.stderr+result.stdout);
 for(const [name] of files){
  const filename=path.join(root,name);
   const shouldRemain=name.endsWith("/runtime.js") ||
     name.endsWith("/namespace.js") || name.endsWith("/backend.js") ||
     name.endsWith("/source.ts") || name.endsWith("/types.d.ts") ||
     name.endsWith("/README.md") || name.endsWith("/LICENSE") ||
     name.endsWith("/NOTICE.txt") || name.endsWith("/NOTICE");
  assert.equal(fs.existsSync(filename),shouldRemain,`${name} retention`);
 }
 assert.ok(fs.existsSync(path.join(root,"node_modules/.pdim-restored")));
 const build=fs.readFileSync("build.sh","utf8");
  const prune=build.split("_pdim_prune_nm() {")[1].split("\n}")[0];
  assert.match(prune,/pruneRuntimeNodeModules\.mjs/);
  assert.doesNotMatch(prune,/find node_modules/);
 assert.doesNotMatch(build,/\bdu\b|sha256sum source\.pdim/);
});
test("managed FFmpeg bypasses the GitHub download and performs real audio/video encodes",t=>{
 const binary=path.resolve("node_modules/ffmpeg-static/ffmpeg");
 const resolver=spawnSync("bash",["-c",
  'source script/deployment/ffmpeg-path.sh; export FFMPEG_BIN="$1"; resolve_ffmpeg && verify_ffmpeg_capabilities && printf "%s" "$FFMPEG_BIN"',
  "ffmpeg-path-test",binary],{encoding:"utf8",timeout:30000});
 assert.equal(resolver.status,0,resolver.stderr+resolver.stdout);
 assert.equal(resolver.stdout.trim().split("\n").at(-1),binary);
 const env={...process.env,FFMPEG_BIN:binary};
 const install=spawnSync(process.execPath,["node_modules/ffmpeg-static/install.js"],
  {encoding:"utf8",env,timeout:10000});
 assert.equal(install.status,0,install.stderr);
 assert.match(install.stdout,/is installed already/);
 assert.doesNotMatch(install.stdout+install.stderr,/github\.com\/eugeneware/);
 const resolved=spawnSync(process.execPath,["-p","require('ffmpeg-static')"],
  {encoding:"utf8",env,timeout:10000});
 assert.equal(resolved.status,0,resolved.stderr);
 assert.equal(resolved.stdout.trim(),binary);
 const system=spawnSync("bash",["-c",
  'source script/deployment/ffmpeg-path.sh; unset FFMPEG_BIN FFMPEG_PATH FFPROBE_PATH; resolve_ffmpeg && verify_ffmpeg_capabilities && printf "%s\\n%s" "$FFMPEG_BIN" "$FFPROBE_PATH"'],
  {encoding:"utf8",timeout:30000});
 assert.equal(system.status,0,system.stderr+system.stdout);
 const systemPaths=system.stdout.trim().split("\n").slice(-2);
 const [systemFfmpeg,systemFfprobe]=systemPaths;
 assert.match(systemFfmpeg,/ffmpeg-full/);
 const mediaDir=fs.mkdtempSync(path.join(os.tmpdir(),"ffmpeg-system-smoke-"));
 t.after(()=>fs.rmSync(mediaDir,{recursive:true,force:true}));
 const audioPath=path.join(mediaDir,"smoke.mp3");
 const audio=spawnSync(systemFfmpeg,[
  "-hide_banner","-v","error","-f","lavfi","-i","sine=frequency=440:duration=0.8",
  "-af","rubberband=tempo=1.1:pitch=1.0:formant=preserved,loudnorm=I=-14:TP=-1.5:LRA=11",
  "-c:a","libmp3lame","-y",audioPath,
 ],{encoding:"utf8",timeout:30000});
 assert.equal(audio.status,0,audio.stderr);
 const videoPath=path.join(mediaDir,"smoke.mp4");
 const video=spawnSync(systemFfmpeg,[
  "-hide_banner","-v","error","-f","lavfi","-i","color=c=blue:s=64x64:d=0.5",
  "-c:v","libx264","-pix_fmt","yuv420p","-t","0.5","-y",videoPath,
 ],{encoding:"utf8",timeout:30000});
 assert.equal(video.status,0,video.stderr);
 for(const [mediaPath,codec] of [[audioPath,"mp3"],[videoPath,"h264"]]){
  const probe=spawnSync(systemFfprobe,[
   "-v","error","-show_entries","stream=codec_name","-of","csv=p=0",mediaPath,
  ],{encoding:"utf8",timeout:10000});
  assert.equal(probe.status,0,probe.stderr);
  assert.equal(probe.stdout.trim(),codec);
 }
 const invalid=spawnSync("bash",["-c",
  'source script/deployment/ffmpeg-path.sh; FFMPEG_BIN=/missing/ffmpeg resolve_ffmpeg'],
  {encoding:"utf8",timeout:10000});
 assert.notEqual(invalid.status,0);
 const build=fs.readFileSync("build.sh","utf8");
 const start=fs.readFileSync("start.sh","utf8");
 const nix=fs.readFileSync("replit.nix","utf8");
 const dependencyPhase=build.slice(build.indexOf("phase_dependencies()"),build.indexOf("phase_rust()"));
 const resolveIndex=dependencyPhase.indexOf("if ! resolve_ffmpeg");
 const installIndex=dependencyPhase.search(/^\s*npm ci(?:\s|$)/m);
 assert.match(nix,/pkgs\.ffmpeg-full/);
 assert.ok(resolveIndex>=0&&installIndex>=0&&resolveIndex<installIndex);
 assert.match(build,/cp script\/deployment\/ffmpeg-path\.sh dist\/deployment\/ffmpeg-path\.sh/);
 assert.match(start,/source "\$_SCRIPT_DIR\/dist\/deployment\/ffmpeg-path\.sh"/);
});
