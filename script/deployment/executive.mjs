import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {liveCapacity} from "./capacity.mjs";
import {buildPlan,startPlan} from "./plans.mjs";
import {createOwnedProcessTracker} from "./owned-processes.mjs";

function liveProcessGroupMembers(groupId) {
  const members = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const match = fs.readFileSync(`/proc/${name}/stat`, "utf8").match(/^\d+ \(.*\) (.*)$/s);
      if (!match) continue;
      const fields = match[1].trim().split(/\s+/);
      if (Number(fields[2]) === groupId && !["Z", "X"].includes(fields[0])) {
        members.push(Number(name));
      }
    } catch (error) {
      if (!["ENOENT", "ESRCH", "EACCES"].includes(error.code)) throw error;
    }
  }
  return members;
}

async function terminateFailedTaskGroup(groupId, { graceMs = 250, killWaitMs = 1000 } = {}) {
  if (!Number.isInteger(groupId) || groupId < 2) return;
  const signalGroup = signal => {
    try {
      process.kill(-groupId, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  signalGroup("SIGTERM");
  const graceDeadline = Date.now() + graceMs;
  while (liveProcessGroupMembers(groupId).length && Date.now() < graceDeadline) {
    await delay(10);
  }
  let remaining = liveProcessGroupMembers(groupId);
  if (remaining.length) {
    signalGroup("SIGKILL");
    const killDeadline = Date.now() + killWaitMs;
    while ((remaining = liveProcessGroupMembers(groupId)).length && Date.now() < killDeadline) {
      await delay(10);
    }
  }
  if (remaining.length) {
    throw new Error(`failed task process group still has live members: ${remaining.join(",")}`);
  }
}

export function bindShutdownSignals(controller, emitter = process) {
  const bindings = ["SIGINT", "SIGTERM", "SIGHUP"].map(signalName => {
    const handler = () => {
      if (controller.signal.aborted) return;
      const reason = Error(`Executive interrupted by ${signalName}`);
      reason.code = "DEPLOY_EXECUTIVE_SIGNAL";
      reason.signal = signalName;
      // POSIX signals do not identify whether the sender is a user action,
      // platform supervisor, or another parent process.
      reason.signalOrigin = "unknown";
      controller.abort(reason);
    };
    emitter.on(signalName, handler);
    return [signalName, handler];
  });
  return () => {
    for (const [signalName, handler] of bindings) emitter.off(signalName, handler);
  };
}

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
    if(t.maxRetries !== undefined &&
      (!Number.isInteger(t.maxRetries) || t.maxRetries < 0 || t.maxRetries > 2))
      throw Error(`Invalid retry limit for task ${id}`);
    if(t.retryBackoffMs !== undefined &&
      (!Number.isInteger(t.retryBackoffMs) || t.retryBackoffMs < 0 || t.retryBackoffMs > 30000))
      throw Error(`Invalid retry backoff for task ${id}`);
    if(t.retryOnSignals !== undefined &&
      (!Array.isArray(t.retryOnSignals) ||
       t.retryOnSignals.some(s => !["SIGTERM", "SIGHUP"].includes(s))))
      throw Error(`Invalid retry signals for task ${id}`);
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
  const active=new Map(), children=new Set(), attempts=new Map(), retryAt=new Map();
  const firstStartedAt=new Map(), completionStats=new Map();
  for (const task of tasks) attempts.set(task.id,0);
  let failure=null,lastReport=0,ready=false;
  // Prioritize prerequisites with the most downstream work instead of file order.
  const rank=id=>1+Math.max(0,...tasks.filter(t=>t.deps.includes(id)).map(t=>rank(t.id)));
  const priorities=new Map(tasks.map(t=>[t.id,rank(t.id)]));
  const taskCheckpoint=()=>{
    const now=Date.now();
    return tasks.map(task=>{
      if(done.has(task.id)) return {id:task.id,state:"completed",attempts:attempts.get(task.id),
        elapsedSeconds:completionStats.get(task.id)?.elapsedSeconds??0};
      const job=active.get(task.id);
      if(job) return {id:task.id,state:"running",attempt:job.attempt,
        elapsedSeconds:Math.max(0,Math.floor((now-job.started)/1000)),
        cpu:job.cpu,memoryMB:job.task.memoryMB,io:job.task.io};
      if(pending.has(task.id)) {
        const blockedBy=task.deps.filter(dependency=>!done.has(dependency));
        const retryDelay=Math.max(0,(retryAt.get(task.id)??0)-now);
        return {id:task.id,state:retryDelay?"retry-backoff":"waiting",
          attempts:attempts.get(task.id),blockedBy,
          ...(retryDelay?{retryInMs:retryDelay}:{})};
      }
      return {id:task.id,state:"blocked",attempts:attempts.get(task.id),
        blockedBy:task.deps.filter(dependency=>!done.has(dependency))};
    });
  };
  const abort=()=>{
    if(failure) return;
    failure = signal?.reason instanceof Error && signal.reason.name!=="AbortError"
      ? signal.reason
      : Error("Executive interrupted by an external stop request");
    log(`[executive] Stop requested: ${failure.message}; signalOrigin=${failure.signalOrigin??"not supplied"}; stopping without retry.`);
  };
  signal?.addEventListener("abort",abort,{once:true});
  let primaryError=null;
  try {
    while(pending.size || active.size) {
      if(signal?.aborted) abort();
      if(!ready && Date.now()-start>budgetMs) {
        failure ??= Error(`Executive deadline expired after ${Math.round((Date.now()-start)/1000)}s`);
        failure.code ??= "DEPLOY_EXECUTIVE_DEADLINE";
      }
      for(const [id,job] of active) {
        job.owned?.capture();
        if(!job.closed && !(ready && job.task.application) && Date.now()-job.started>(job.task.timeoutMs??budgetMs)) {
          failure ??= Error(`Task deadline expired: ${id} after ${Math.round((Date.now()-job.started)/1000)}s`);
          failure.code ??= "DEPLOY_TASK_DEADLINE";
          failure.taskId ??= id;
        }
        if(!job.closed) continue;
        active.delete(id);
        if(job.error || job.code!==0) {
          let cleanupError=null;
          try {
            await terminateFailedTaskGroup(job.child.pid);
          } catch(error) {
            cleanupError=error;
          }
          const maxRetries=job.task.maxRetries??0;
          const retriesUsed=Math.max(0,job.attempt-1);
          const retryableSignal=!signal?.aborted && !failure && !cleanupError && job.signal &&
            (job.task.retryOnSignals??[]).includes(job.signal);
          if(retryableSignal && retriesUsed<maxRetries) {
            const baseDelay=job.task.retryBackoffMs??500;
            const backoff=Math.min(30000,baseDelay*(2**retriesUsed));
            pending.set(id,job.task);
            retryAt.set(id,Date.now()+backoff);
            log(`[executive] ${id} interrupted by ${job.signal}; retry ${retriesUsed+1}/${maxRetries} in ${backoff}ms after process cleanup.`);
          } else {
            failure ??= cleanupError
              ? Error(`${id} process group cleanup failed: ${cleanupError.message}`,{cause:cleanupError})
              : job.error ?? Error(
                job.signal
                  ? `${id} interrupted by ${job.signal} after ${retriesUsed} retries`
                  : `${id} exited ${job.code}`,
              );
            failure.taskId ??= id;
            failure.taskSignal ??= job.signal??null;
          }
        }
        else {
          done.add(id);
          const elapsedSeconds=Number(((Date.now()-(firstStartedAt.get(id)??job.started))/1000).toFixed(1));
          completionStats.set(id,{elapsedSeconds,attempts:job.attempt});
          log(`[executive] completed ${id} in ${elapsedSeconds.toFixed(1)}s (attempts=${job.attempt})`);
        }
      }
      if(failure) break;
      const cap=capacity();
      const running=[...active.values()];
      let cpu=running.reduce((n,j)=>n+j.cpu,0), memory=running.reduce((n,j)=>n+j.task.memoryMB,0);
      let io=running.reduce((n,j)=>n+j.task.io,0);
      for(const task of [...pending.values()].sort((a,b)=>priorities.get(b.id)-priorities.get(a.id))) {
        if(!task.deps.every(d=>done.has(d))) continue;
        if((retryAt.get(task.id)??0)>Date.now()) continue;
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
        const attempt=attempts.get(task.id)+1;
        attempts.set(task.id,attempt);
        if(!firstStartedAt.has(task.id)) firstStartedAt.set(task.id,Date.now());
        const job={task,child,cpu:assignedCPU,closed:false,started:Date.now(),attempt,
          owned:child.pid?createOwnedProcessTracker(child.pid):null};
        children.add(job);
        child.once("error",error=>{job.error=error;job.closed=true;});
        child.once("close",(code,exitSignal)=>{job.code=code;job.signal=exitSignal;job.closed=true;});
        active.set(task.id,job); pending.delete(task.id);
        cpu+=assignedCPU;memory+=task.memoryMB;io+=task.io;
        retryAt.delete(task.id);
        log(`[executive] starting ${task.id}; attempt=${attempt}; cpu=${assignedCPU}, reserved=${task.memoryMB} MiB, io=${task.io}`);
      }
      if(!ready && readiness && [...active.values()].some(j=>j.task.application)) {
        ready=await readiness();
        if(ready) log("[executive] Application readiness confirmed; supervising runtime (not a publication-success claim)");
      }
      if(Date.now()-lastReport>=15000) {
        const running=[...active.values()].map(job=>
          `${job.task.id}:${Math.floor((Date.now()-job.started)/1000)}s/a${job.attempt}/cpu${job.cpu}/io${job.task.io}`);
        const waiting=[...pending.values()].map(task=>{
          const blockers=task.deps.filter(dependency=>!done.has(dependency));
          return blockers.length?`${task.id}[${blockers.join("+")}]`:task.id;
        });
        log(`[executive] elapsed=${Math.round((Date.now()-start)/1000)}s running=${running.join(",")||"none"} waiting=${waiting.join(",")||"none"} available=${Math.round(cap.availableMB)}MiB io=${io}/${cap.ioSlots} ${ready?"ready":`budgetRemaining=${Math.max(0,Math.round((budgetMs-Date.now()+start)/1000))}s`}`);
        lastReport=Date.now();
      }
        if(active.size || pending.size) await delay(pollMs);
    }
    if(failure) {
      failure.completedTasks=[...done];
      failure.runningTasks=[...active.keys()];
      failure.waitingTasks=[...pending.keys()];
      failure.taskCheckpoint=taskCheckpoint();
      failure.checkpointAt=new Date().toISOString();
      throw failure;
    }
    if(readiness && !ready) throw Error("Application exited before becoming ready");
    log(`[executive] plan completed in ${((Date.now()-start)/1000).toFixed(1)}s; tasks=${done.size}; retries=${[...attempts.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0)}`);
    return {completed:[...done],ready,durations:Object.fromEntries(completionStats)};
  } catch(error) {
    primaryError=error;
    throw error;
  } finally {
    signal?.removeEventListener("abort",abort);
    // Application sidecars can create their own sessions. A group-only kill
    // misses those descendants; cutting the app off at5s also prevented its
    // existing25s graceful worker drain from reaching subsystem shutdown.
    if(active.size) log(`[executive] Draining active tasks after failure: ${[...active.keys()].join(",")}`);
    const stopped=await Promise.all([...children].map(job=>job.owned?.stop({
      graceMs:job.task.application?26000:5000,descendantGraceMs:2000,
    })));
    const remaining=stopped.flatMap(result=>result?.remaining??[]);
    if(remaining.length) {
      const cleanupError=Error(`Owned deployment descendants did not stop: ${remaining.join(",")}`);
      if(primaryError) {
        primaryError.cleanupError=cleanupError.message;
        log(`[executive] Cleanup warning after primary failure: ${cleanupError.message}`);
      } else throw cleanupError;
    }
    await Promise.all([...children].filter(j=>!j.closed).map(j=>new Promise(resolve=>j.child.once("close",resolve))));
  }
}

async function main(mode) {
  if(!["build","start"].includes(mode)) throw Error("Expected build or start executive mode");
  const tasks=mode==="build"?buildPlan():startPlan(process.execPath);
  validatePlan(tasks);
  const state=fs.mkdtempSync(path.join(os.tmpdir(),"deployment-executive-"));
  const controller=new AbortController();
  const unbindSignals=bindShutdownSignals(controller);
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
  } catch(error) {
    console.error("[executive] Task checkpoint:", JSON.stringify({
      code:error.code??null,
      signal:error.signal??error.taskSignal??null,
      signalOrigin:error.signalOrigin??null,
      taskId:error.taskId??null,
      checkpointAt:error.checkpointAt??new Date().toISOString(),
      completed: error.completedTasks ?? [],
      interrupted: error.runningTasks ?? [],
      waiting: error.waitingTasks ?? [],
      tasks:error.taskCheckpoint??[],
      cleanupError:error.cleanupError??null,
    }));
    throw error;
  } finally {
    unbindSignals();
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
