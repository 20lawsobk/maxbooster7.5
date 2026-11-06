#!/usr/bin/env node
/**
 * Deterministic repository-wide engineering backlog generator.
 * Every tracked Git entry gets a complete ten-stage task chain plus independent
 * reviewers. All admin journeys also get their own detailed task chains.
 * No task is marked done from static discovery or an LLM assertion.
 */
import fs from "node:fs";
import path from "node:path";
import {ROOT, DEFAULT_OUTPUT, inventory, sha, writeJson, option} from "./common.mjs";
import {TEAM, ROLE_BY_ID, FILE_STAGES, ADMIN_DOMAINS, assignment} from "./team-catalog.mjs";

const args = process.argv.slice(2);
const out = path.resolve(option(args, "--output", DEFAULT_OUTPUT));
if (!out.startsWith(ROOT + path.sep)) throw new Error("Plan output must live below the checkout");
const scope = inventory();
const taskPath = path.join(out,"team-tasks.ndjson");
const ledgerPath = path.join(out,"admin-journeys.json");
const manifestPath = path.join(out,"team-plan.json");
fs.mkdirSync(out,{recursive:true});
const temp = taskPath + ".tmp-" + process.pid;
const fd=fs.openSync(temp,"wx",0o600);
const countByRole={},countByRisk={},fileCoverage=new Set(), taskIds=new Set();
let tasks=0;
function uniqueTask(id, fields) {
  if (taskIds.has(id)) throw new Error("Duplicate work ID: "+id);
  taskIds.add(id);
  if (!ROLE_BY_ID[fields.owner]) throw new Error("Unknown role: "+fields.owner);
  fs.writeSync(fd,JSON.stringify({id, status:"UNVERIFIED",revision:scope.revision,...fields})+"\n");
  tasks++;
  countByRole[fields.owner]=(countByRole[fields.owner]??0)+1;
  countByRisk[fields.risk]=(countByRisk[fields.risk]??0)+1;
}
function taskId(key,stage,role) {return "ASO-"+sha(scope.revision+"\0"+key+"\0"+stage+"\0"+role).slice(0,20);}
const ledger=[];
try {
  // Frontload admin user journeys as first-class product acceptance items.
  const domainRoles = {
    "admin-access":"security-engineer","artist-management":"backend-engineer",
    "fan-management":"frontend-engineer","project-management":"backend-engineer",
    "daw-studio":"audio-dsp-engineer","content-distribution":"integrations-engineer",
    "marketing-automation":"integrations-engineer","revenue-analytics":"billing-engineer",
    "ai-assistant":"ai-ml-engineer","collaboration":"backend-engineer",
    "marketplace":"billing-engineer","subscriptions":"billing-engineer",
    "administration":"security-engineer","operational-recovery":"sre-devops-engineer",
  };
  for(const [domain, objective] of ADMIN_DOMAINS) {
    const owner=domainRoles[domain];
    let prior=null;
    const ids=[];
    for(const stage of FILE_STAGES) {
      const id=taskId("admin/"+domain,stage.key,owner);
      uniqueTask(id,{
        scope:"admin-journey",subject:domain,objective,
        stage:stage.key,title:stage.title,owner,risk:"critical",
        priority:0,dependsOn:prior?[prior]:[],
        instructions:stage.instruction,
        roleChecklist:ROLE_BY_ID[owner].work,
        expectedEvidence:stage.output,
        completionPolicy:"Exact-commit runtime proof; synthetic/UI presence is not acceptable"
      });
      prior=id;ids.push(id);
    }
    const reviewers=["qa-engineer","security-engineer","release-engineer"].filter(r=>r!==owner);
    for(const role of reviewers) {
      const id=taskId("admin/"+domain,"independent-"+role,role);
      uniqueTask(id,{
        scope:"admin-journey",subject:domain,objective,stage:"independent-review",
        title:"Independent "+ROLE_BY_ID[role].title+" acceptance",owner:role,
        risk:"critical",priority:0,dependsOn:[prior],
        instructions:"Independently execute all role-specific work below and return actual reproducible proof, including denied non-admin access, source version and preserved existing behavior.",
        roleChecklist:ROLE_BY_ID[role].work,
        expectedEvidence:ROLE_BY_ID[role].acceptance,
        completionPolicy:"Independent observed acceptance and reviewed receipts required"
      });
    }
    ledger.push({domain,objective,owner,taskIds:ids,independentReviewers:reviewers,
      status:"UNVERIFIED",blocking:true,receipt:null});
  }
  // Crucially no path filter: imports, binaries, ignored-by-test files and
  // unexpectedly named subtrees still receive an explicit chain.
  for(const entry of scope.files) {
    const assignmentData=assignment(entry);
    fileCoverage.add(entry.path);
    let prior=null;
    for(const stage of FILE_STAGES) {
      const id=taskId(entry.path,stage.key,assignmentData.owner);
      uniqueTask(id,{
        scope:"repository-file",subject:entry.path,blob:entry.blob,mode:entry.mode,
        title:stage.title,stage:stage.key,
        owner:assignmentData.owner,risk:assignmentData.risk,
        priority:assignmentData.risk==="critical"?1:assignmentData.isCode?2:3,
        dependsOn:prior?[prior]:[],
        instructions:stage.instruction,
        roleChecklist:ROLE_BY_ID[assignmentData.owner].work,
        expectedEvidence:stage.output,
        completionPolicy:"Fresh source-aware evidence and exact expected observable effect"
      });
      prior=id;
    }
    for(const role of assignmentData.reviewers) {
      const id=taskId(entry.path,"review-"+role,role);
      uniqueTask(id,{
        scope:"repository-file",subject:entry.path,blob:entry.blob,mode:entry.mode,
        title:ROLE_BY_ID[role].title+" independent audit",stage:"peer-specialist",
        owner:role,risk:assignmentData.risk,
        priority:assignmentData.risk==="critical"?1:3,
        dependsOn:[prior],instructions:"Perform each applicable role-specific checklist item for this exact file and every affected caller. Report blockers explicitly rather than certifying static presence.",
        roleChecklist:ROLE_BY_ID[role].work,
        expectedEvidence:ROLE_BY_ID[role].acceptance,
        completionPolicy:"Independent reviewed source/test/recovery receipts"
      });
    }
  }
  if(fileCoverage.size!==scope.files.length)throw new Error("Tracked file coverage mismatch");
  fs.closeSync(fd);
  fs.renameSync(temp,taskPath);
  writeJson(ledgerPath,{schemaVersion:1,revision:scope.revision,objective:"Administrator can truly use every Max Booster feature end-to-end; public user launch is deferred",journeys:ledger});
  const manifest={
    schemaVersion:1,createdAt:new Date().toISOString(),revision:scope.revision,
    scope:"ALL TRACKED GIT FILES AND ALL REQUIRED ADMIN JOURNEYS",
    scopeInventoryCount:scope.count,enumeratedFiles:fileCoverage.size,
    unassignedFiles:scope.files.filter(x=>!fileCoverage.has(x.path)),
    teamSize:TEAM.length,roles:TEAM.map(({id,title,acceptance})=>({id,title,acceptance})),
    requiredJourneys:ledger.length,totalTasks:tasks,countByRole,countByRisk,
    taskFile:path.relative(ROOT,taskPath),adminLedger:path.relative(ROOT,ledgerPath),
    status:"TASKS_PLANNED_NOT_EXECUTED",
    noPublicLaunch:true,
    notes:[
      "Every tracked path is covered without filtering or sample truncation.",
      "Tasks have exact accountable roles, ordered steps, independent reviewers and evidence obligations.",
      "A generated task is never a passed feature or a verified fix.",
      "Public signup and general-user access remain closed in admin-only runtime; do not disable admin/security protections.",
      "Submodule pointer contents, any untracked files and external provider capabilities require separate evidence."
    ]
  };
  writeJson(manifestPath,manifest);
  console.log(JSON.stringify({status:manifest.status,files:manifest.enumeratedFiles,
    roles:manifest.teamSize,adminJourneys:manifest.requiredJourneys,tasks:manifest.totalTasks,
    output:manifest.taskFile}));
} catch(error) {
  try {fs.closeSync(fd);}catch{}
  try{fs.rmSync(temp,{force:true});}catch{}
  throw error;
}
