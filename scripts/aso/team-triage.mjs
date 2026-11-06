#!/usr/bin/env node
/**
 * Evidence-aware adaptive triage: maps failed verification commands, actual
 * referenced Git paths and missing operator receipts to accountable senior
 * engineers. Never claims diagnosis without a reproducible error.
 */
import fs from "node:fs";
import path from "node:path";
import {ROOT,DEFAULT_OUTPUT,option,readJson,writeJson,sha,inventory,revision,requiredReleaseEvidence} from "./common.mjs";
import {ROLE_BY_ID,assignment,FILE_STAGES} from "./team-catalog.mjs";

const args=process.argv.slice(2);
const out=path.resolve(option(args,"--output",DEFAULT_OUTPUT));
if (!out.startsWith(ROOT+path.sep)) throw new Error("Untrusted triage output path");
const report=readJson(option(args,"--report",path.join(out,"report.json")));
if (!report || report.revision!==revision() || !Array.isArray(report.executed)) {
  throw new Error("Missing or stale source-bound verifier report");
}
const paths=new Set(inventory().files.map(entry=>entry.path));
const policyPath=path.join(out,"team-learning.json");
const policy=readJson(policyPath,{
  schemaVersion:1,roleOutcomes:{},signatureCounts:{},failureFamilies:{},
  strategyOutcomes:{},attempts:[],maxConsecutiveNoProgress:2,
});
const incidents=[];
function originFor(command,error) {
  const msg=(command+" "+error).toLowerCase();
  if (/(admin|permission|unauthorized|403|oauth|csrf|mfa|registration|security|audit|secret|sast|injection)/.test(msg)) return {role:"security-engineer",family:"security-or-access"};
  if (/(stripe|payment|refund|invoice|royalt|payout|subscription|billing)/.test(msg)) return {role:"billing-engineer",family:"money-integrity"};
  if (/(maxcore|model|torch|inference|training|checkpoint|tokenizer|ai)/.test(msg)) return {role:"ai-ml-engineer",family:"ai-qualification"};
  if (/(studio|audio|render|daw|track|vst)/.test(msg)) return {role:"audio-dsp-engineer",family:"media-workflow"};
  if (/(database|schema|migration|postgres|redis|pdim|storage)/.test(msg)) return {role:"database-engineer",family:"data-and-recovery"};
  if (/(provider|distribution|dsp|webhook|social|marketing)/.test(msg)) return {role:"integrations-engineer",family:"provider-operations"};
  if (/(tsx|vite|client|browser|ui|page)/.test(msg)) return {role:"frontend-engineer",family:"frontend-or-browser"};
  if (/(typescript|tsc|typecheck|types-server|types-client|lint|eslint)/.test(msg)) return {role:"backend-engineer",family:"code-correctness"};
  if (/(start|build|deploy|ci|port|socket|network|health|ready)/.test(msg)) return {role:"sre-devops-engineer",family:"runtime-and-delivery"};
  if (/(test|assert|coverage|fixture)/.test(msg)) return {role:"qa-engineer",family:"test-failure"};
  return {role:"principal-architect",family:"unclassified-blocker"};
}
function references(log) {
  // Identify source paths from diagnostic formats without copying logs or
  // sending private snippets to remote agents.
  const lines=log.split(/\r?\n/),hits=new Set();
  let candidateCount=0;
  for(const line of lines) {
    const matches=line.matchAll(/(?:^|[\s(])((?:client|server|shared|scripts?|tests?|external|database|migrations|drizzle|docs|evaluations|dns-node|electron|mobile)\/[a-zA-Z0-9_.\-\/ ]+\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|json|yml|yaml|sh|sql|nix))(?=[:(\s]|$)/g);
    for(const match of matches) {
      candidateCount++;
      const name=match[1].trim();
      if(paths.has(name)) hits.add(name);
    }
  }
  return {items:[...hits].sort(),parsedReferences:candidateCount};
}
for(const row of report.executed) {
  if(row.status==="pass")continue;
  let log="";
  try{
    const location=path.resolve(ROOT,row.log??"");
    if(location.startsWith(out+path.sep) && fs.statSync(location).isFile()) {
      const buf=fs.readFileSync(location);
      // bounded tail represents recent diagnostics, but the full log is still
      // available for the specialist to inspect in its private evidence dir.
      log=buf.subarray(Math.max(0,buf.length-256*1024)).toString("utf8");
    }
  }catch{}
  const refs=references(log);
  const classification=originFor(row.id,log.slice(-32000));
  const topPaths=refs.items.slice(0,64);
  const groups=topPaths.length?topPaths:[null];
  for(const file of groups) {
    const specialist=file?assignment({path:file}):{owner:classification.role,risk:"critical",reviewers:["qa-engineer"]};
    const owner=file?specialist.owner:classification.role;
    const family=classification.family;
    const signature=sha([report.revision,row.id,family,file??"UNLOCATED"].join("\0")).slice(0,24);
    const previous=policy.signatureCounts[signature]??0;
    const roleStats=policy.roleOutcomes[owner]??{attempts:0,successes:0};
    const priorFailures=Math.max(0,roleStats.attempts-roleStats.successes);
    const blocked=previous>=policy.maxConsecutiveNoProgress;
    const proposal=blocked?"senior-human-or-independent-review":
      row.id==="lint"?"reviewed-eslint-mechanical":
      /^types?/.test(row.id)?"position-verified-typescript-repair":
      "specialist-root-cause-investigation";
    incidents.push({
      id:"INC-"+signature,revision:report.revision,sourceGate:row.id,
      sourceExitCode:row.exitCode,sourceTimedOut:row.timedOut,
      sourceLog:row.log,file,owner,secondaryReviewers:[...new Set(["qa-engineer","security-engineer",...(specialist.reviewers??[])])].filter(x=>x!==owner),
      family,risk:specialist.risk,
      status:"OPEN_NOT_FIXED",priority:blocked?0:specialist.risk==="critical"?1:2,
      repetition:previous+1,blockedByRepetition:blocked,proposedStrategy:proposal,
      workflow:FILE_STAGES.map(stage=>({
        stage:stage.key,description:stage.instruction,expectedEvidence:stage.output
      })),
      ownerChecklist:ROLE_BY_ID[owner].work,
      proofRequired:"Exact revision, real reproduced symptom, targeted fix, negative test and independent review",
    });
    policy.signatureCounts[signature]=(policy.signatureCounts[signature]??0)+1;
    policy.failureFamilies[family]=(policy.failureFamilies[family]??0)+1;
  }
  if(refs.items.length>64) {
    incidents.push({
      id:"OVERFLOW-"+sha(row.id+report.revision).slice(0,20),
      sourceGate:row.id,status:"UNMAPPED_LOG_REFERENCES",
      owner:"engineering-manager",risk:"critical",priority:0,
      omittedKnownPathCount:refs.items.length-64,
      requiredAction:"Inspect remaining paths directly; do not interpret this capped diagnostic sample as full coverage."
    });
  }
}
const missingReceipts=report.releaseEvidence?.valid ? [] :
  (report.releaseEvidence?.missing?.length ? report.releaseEvidence.missing :
    requiredReleaseEvidence(report.releaseProfile??"public"));
for(const missing of missingReceipts) {
  const isAdmin=report.releaseProfile==="admin";
  const map={
    "admin-ai-qualified-model-output":"ai-ml-engineer",
    "admin-daw-real-audio":"audio-dsp-engineer",
    "admin-billing-and-revenue":"billing-engineer",
    "admin-distribution-and-marketing":"integrations-engineer",
    "admin-recovery-drill":"sre-devops-engineer",
    "admin-registration-closed":"security-engineer"
  };
  const owner=map[missing]??(isAdmin?"product-director":"release-engineer");
  incidents.push({
    id:"EVID-"+sha(report.revision+"\0"+missing).slice(0,24),revision:report.revision,
    sourceGate:"external-independent-acceptance",status:"MISSING_ACCEPTANCE_EVIDENCE",
    owner,risk:"critical",priority:0,evidenceId:missing,
    proposedStrategy:"independent-staging-verification",
    ownerChecklist:ROLE_BY_ID[owner].work,
    proofRequired:"Real non-forged receipt verified by operator; no simulation can substitute for external behavior"
  });
}
incidents.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
const result={
  schemaVersion:1,generatedAt:new Date().toISOString(),revision:report.revision,
  releaseProfile:report.releaseProfile,sourceStatus:report.status,
  sourceInventoryCount:report.inventoryCount,
  incidents,incidentCount:incidents.length,unresolved:incidents.length,
  roleWorkload:Object.fromEntries(ROLE_BY_ID?Object.keys(ROLE_BY_ID).map(k=>[k,incidents.filter(x=>x.owner===k).length]):[]),
  status:incidents.length?"ENGINEERING_REMEDIATION_REQUIRED":"NO_REPORTED_FAILURES_NOT_A_RELEASE_CERTIFICATE"
};
writeJson(path.join(out,"team-incidents.json"),result);
writeJson(policyPath,policy);
console.log(JSON.stringify({status:result.status,revision:result.revision,
  incidents:result.incidentCount,rolesWithWork:Object.values(result.roleWorkload).filter(Boolean).length}));
