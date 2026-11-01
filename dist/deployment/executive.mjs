import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {liveCapacity} from "./capacity.mjs";
import {buildPlan,startPlan} from "./plans.mjs";
import {createOwnedProcessTracker} from "./owned-processes.mjs";

export function validatePlan(tasks) {
  const map=new Map(tasks.map(t=>[t.id,t]));
  if(map.size!==tasks.length) throw Error("Duplicate task ID");
  const visiting=new Set(),done=new Set();
  function visit(id) {
    if(!map.has(id)) throw Error(`Unknown prerequisite ${id}`);
    if(visiting.has(id)) throw Error(`Dependency cycle at ${id}`);
    if(done.has(id)) return;
    visiting.add(id);
    const t=map.get(id);
    if(!t.command || !Array.isArray(t.args) || ![t.cpu,t.io,t.memoryMB].every(n=>Number.isFinite(n)&&n>=0))
      throw Error(`Invalid task ${id}`);
    t.deps.forEach(visit); visiting.delete(id); done.add(id);
  }
  tasks.forEach(t=>visit(t.id));
}

export async function runExecutive(tasks, {
  cwd=process.cwd(), env=process.env, capacity=liveCapacity, budgetMs=1800000,
  pollMs=500, log=console.log, signal, readiness,
}={}) {
  validatePlan(tasks);
  if(!Number.isFinite(budgetMs)||budgetMs<=0) throw Error("Invalid executive budget");
  const start=Date.now(),done=new Set(),pending=new Map(tasks.map(t=>[t.id,t]));
  const active=new Map(), children=new Set(); let failure=null,lastReport=0,ready=false;
  // Prioritize prerequisites with the most downstream work instead of file order.
  const rank=id=>1+Math.max(0,...tasks.filter(t=>t.deps.includes(id)).map(t=>rank(t.id)));
  const priorities=new Map(tasks.map(t=>[t.id,rank(t.id)]));
  const abort=()=>{failure ??= Error("Executive interrupted");};
  signal?.addEventListener("abort",abort,{once:true});
  try {
    while(pending.size || active.size) {
      if(signal?.aborted) abort();
      if(!ready && Date.now()-start>budgetMs) failure ??= Error(`Executive deadline expired; running=${[...active.keys()]} waiting=${[...pending.keys()]}`);
      for(const [id,job] of active) {
        job.owned?.capture();
        if(!job.closed && !(ready && job.task.application) && Date.now()-job.started>(job.task.timeoutMs??budgetMs)) failure ??= Error(`Task deadline expired: ${id}`);
        if(!job.closed) continue;
        active.delete(id);
        if(job.error || job.code!==0) failure ??= job.error ?? Error(`${id} exited ${job.code}`);
        else {
          done.add(id);
          log(`[executive] completed ${id} in ${((Date.now()-job.started)/1000).toFixed(1)}s`);
        }
      }
      if(failure) break;
      const cap=capacity();
      const running=[...active.values()];
      let cpu=running.reduce((n,j)=>n+j.cpu,0), memory=running.reduce((n,j)=>n+j.task.memoryMB,0);
      let io=running.reduce((n,j)=>n+j.task.io,0);
      for(const task of [...pending.values()].sort((a,b)=>priorities.get(b.id)-priorities.get(a.id))) {
        if(!task.deps.every(d=>done.has(d))) continue;
        const eligible=[...pending.values()].filter(t=>t.deps.every(d=>done.has(d))).length;
        const slots=Math.max(1,Math.min(eligible,cap.ioSlots-io));
        const desired=task.elasticCPU ? Math.min(task.maxCPU,Math.floor((cap.cpus-cpu)/slots)) : task.cpu;
        const assignedCPU=Math.max(1,Math.min(desired,Math.floor(cap.cpus)));
        if(task.memoryMB>cap.memoryMB*0.9) throw Error(`${task.id} needs ${task.memoryMB} MiB; container capacity is insufficient`);
        if(active.size && (cpu+assignedCPU>Math.max(1,cap.cpus) || memory+task.memoryMB>cap.memoryMB*0.8 ||
          io+task.io>cap.ioSlots || task.memoryMB>cap.availableMB)) continue;
        if(!active.size && task.memoryMB>cap.availableMB) continue;
        const child=spawn(task.command,task.args,{cwd,detached:true,stdio:"inherit",env:{
          ...env,DEPLOY_TASK_CPU:String(assignedCPU),CARGO_BUILD_JOBS:String(assignedCPU),
        }});
        const job={task,child,cpu:assignedCPU,closed:false,started:Date.now(),
          owned:child.pid?createOwnedProcessTracker(child.pid):null};
        children.add(job);
        child.once("error",error=>{job.error=error;job.closed=true;});
        child.once("close",code=>{job.code=code;job.closed=true;});
        active.set(task.id,job); pending.delete(task.id);
        cpu+=assignedCPU;memory+=task.memoryMB;io+=task.io;
        log(`[executive] starting ${task.id}; cpu=${assignedCPU}, reserved=${task.memoryMB} MiB`);
      }
      if(!ready && readiness && [...active.values()].some(j=>j.task.application)) {
        ready=await readiness();
        if(ready) log("[executive] Application readiness confirmed; supervising runtime (not a publication-success claim)");
      }
      if(Date.now()-lastReport>=15000) {
        log(`[executive] elapsed=${Math.round((Date.now()-start)/1000)}s running=${[...active.keys()].join(",")||"none"} waiting=${[...pending.keys()].join(",")||"none"} available=${Math.round(cap.availableMB)}MiB ioSlots=${cap.ioSlots} ${ready?"ready":`budgetRemaining=${Math.max(0,Math.round((budgetMs-Date.now()+start)/1000))}s`}`);
        lastReport=Date.now();
      }
        if(active.size || pending.size) await delay(pollMs);
    }
    if(failure) throw failure;
    if(readiness && !ready) throw Error("Application exited before becoming ready");
    return {completed:[...done],ready};
  } finally {
    signal?.removeEventListener("abort",abort);
    // Application sidecars can create their own sessions. A group-only kill
    // misses those descendants; cutting the app off at5s also prevented its
    // existing25s graceful worker drain from reaching subsystem shutdown.
    const stopped=await Promise.all([...children].map(job=>job.owned?.stop({
      graceMs:job.task.application?26000:5000,descendantGraceMs:2000,
    })));
    if(stopped.some(result=>result?.remaining.length))throw Error('Owned deployment descendants did not stop');
    await Promise.all([...children].filter(j=>!j.closed).map(j=>new Promise(resolve=>j.child.once("close",resolve))));
  }
}

async function main(mode) {
  if(!["build","start"].includes(mode)) throw Error("Expected build or start executive mode");
  const tasks=mode==="build"?buildPlan():startPlan(process.execPath);
  validatePlan(tasks);
  const state=fs.mkdtempSync(path.join(os.tmpdir(),"deployment-executive-"));
  const controller=new AbortController();
  const stop=()=>controller.abort();
  process.on("SIGTERM",stop);process.on("SIGINT",stop);
  const budget=Number(mode==="build" ? process.env.DEPLOY_BUILD_BUDGET_SECONDS??1800 : process.env.DEPLOY_START_BUDGET_SECONDS??900);
  const bootstrapElapsed=mode==="build" && process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS
    ? Date.now()-Number(process.env.DEPLOY_EXECUTIVE_STARTED_SECONDS)*1000 : 0;
  console.log(`[executive] ${mode} budget=${budget}s (local safety budget, not a documented platform timeout)`);
  try {
    await runExecutive(tasks,{env:{...process.env,DEPLOY_STATE_DIR:state},budgetMs:budget*1000-bootstrapElapsed,signal:controller.signal,
      ...(mode==="start"?{readiness:async()=>{
        try {
          const response=await fetch(`http://127.0.0.1:${process.env.PORT||5000}/api/ready`,{signal:AbortSignal.timeout(1500)});
          const body=await response.json();
          return response.status===200 && body.status==="ok" && body.unifiedAwareness?.ready===true;
        } catch { return false; }
      }}:{})});
  } finally {
    process.off("SIGTERM",stop);process.off("SIGINT",stop);
    fs.rmSync(state,{recursive:true,force:true});
    if(mode==="build" && /^\/tmp\/deployment-tools\.[a-zA-Z0-9]+$/.test(process.env.DEPLOY_BOOTSTRAP_DIR??"")) {
      fs.rmSync(process.env.DEPLOY_BOOTSTRAP_DIR,{recursive:true,force:true});
    }
    const stub=Number(process.env.DEPLOY_BOOT_STUB_PID);
    if(mode==="start" && Number.isInteger(stub) && stub>1) {
      try {process.kill(stub,"SIGTERM");} catch(e) {if(e.code!=="ESRCH") throw e;}
    }
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(e=>{console.error("[executive] FAILED:",e.message);process.exitCode=1;});
}
