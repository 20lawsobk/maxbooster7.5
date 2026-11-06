import test from "node:test";
import assert from "node:assert/strict";
import {chooseSpecialistIncidents,selectSpecialistModel,updateRoleOutcome} from "../scripts/aso/team-policy.mjs";

test("model selection is low-cost for routine first attempts and deep for recurring failures",()=>{
  const env={};
  assert.equal(selectSpecialistModel({family:"code-correctness",repetition:1},env),"gpt-6.1-terra");
  assert.equal(selectSpecialistModel({family:"code-correctness",repetition:3},env),"gpt-6.1-sol");
  assert.equal(selectSpecialistModel({family:"security-or-access",repetition:1},env),"gpt-6.1-sol");
  assert.equal(selectSpecialistModel({family:"code-correctness",repetition:5},{ASO_ROLE_MODEL:"chosen-model"}),"chosen-model");
});
test("role scheduling adapts to actual successes, runtime and repeated failures",()=>{
  const cases=[
    {id:"slow",file:"server/b.ts",status:"OPEN_NOT_FIXED",risk:"standard",owner:"backend-engineer",family:"code-correctness",repetition:1,priority:2},
    {id:"fast",file:"client/a.tsx",status:"OPEN_NOT_FIXED",risk:"standard",owner:"frontend-engineer",family:"frontend-or-browser",repetition:1,priority:2},
    {id:"critical",file:"server/auth.ts",status:"OPEN_NOT_FIXED",risk:"critical",owner:"security-engineer",family:"security-or-access",repetition:1,priority:0},
    {id:"blocked",file:"client/c.ts",status:"OPEN_NOT_FIXED",risk:"standard",owner:"frontend-engineer",family:"frontend-or-browser",repetition:3,priority:2,blockedByRepetition:true},
  ];
  const outcomes={
    "backend-engineer":{attempts:2,successes:0,totalDurationMs:1000000},
    "frontend-engineer":{attempts:2,successes:2,totalDurationMs:150000}
  };
  const choices=chooseSpecialistIncidents(cases,outcomes);
  assert.deepEqual(choices.map(x=>x.id),["fast","slow"]);
  const after=updateRoleOutcome(outcomes["backend-engineer"],{accepted:true,durationMs:50000});
  assert.equal(after.successes,1);
  assert.equal(after.attempts,3);
  assert.equal(after.totalDurationMs,1050000);
  assert.equal(after.lastStatus,"VERIFIED_BRANCH_COMMIT");
});
