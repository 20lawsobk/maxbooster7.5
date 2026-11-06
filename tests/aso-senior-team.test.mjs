import test from "node:test";
import assert from "node:assert/strict";
import {TEAM, ROLE_BY_ID, FILE_STAGES, ADMIN_DOMAINS, assignment} from "../scripts/aso/team-catalog.mjs";

test("senior team has unique roles with exact reusable verification duties",()=>{
  assert.ok(TEAM.length>=18);
  assert.equal(new Set(TEAM.map(role=>role.id)).size,TEAM.length);
  for(const role of TEAM){
    assert.ok(role.title.includes("Senior") || role.title.includes("Principal"),role.title);
    assert.ok(role.work.length>=5,role.id);
    assert.ok(role.work.every(step=>typeof step==="string"&&step.length>35),role.id);
    assert.ok(role.acceptance.length>25,role.id);
    assert.equal(ROLE_BY_ID[role.id],role);
  }
});
test("administrator product scope is complete and never treated as public rollout",()=>{
  assert.ok(ADMIN_DOMAINS.length>=12);
  assert.equal(new Set(ADMIN_DOMAINS.map(([id])=>id)).size,ADMIN_DOMAINS.length);
  for(const expected of ["admin-access","daw-studio","content-distribution",
      "revenue-analytics","ai-assistant","marketplace","administration","operational-recovery"]){
    assert.ok(ADMIN_DOMAINS.some(([id])=>id===expected),expected);
  }
});
test("every tracked file type can be given accountable owner and independent reviewers",()=>{
  const paths=[
    "client/src/pages/Admin.tsx","server/routes.ts",
    "server/services/billingAccountStatus.ts","server/services/governancePolicyService.ts",
    "shared/schema.ts","external/maxcore/inference.py",
    "tests/critical-login.test.mjs",".github/workflows/ci.yml",
    "scripts/aso/team-catalog.mjs","assets/unknown-file.bin",
    "docs/ASO_AUTONOMOUS_ORGANIZATION.md","some-new-subsystem/unusual-format.extension"
  ];
  for(const file of paths){
    const assigned=assignment({path:file});
    assert.ok(ROLE_BY_ID[assigned.owner],file);
    assert.ok(["critical","standard","asset","configuration"].includes(assigned.risk));
    assert.ok(assigned.reviewers.every(role=>ROLE_BY_ID[role] && role!==assigned.owner),file);
    assert.ok(assigned.reviewers.includes("qa-engineer") || assigned.owner==="qa-engineer",file);
  }
  assert.equal(assignment({path:"server/services/billingAccountStatus.ts"}).owner,"billing-engineer");
  assert.equal(assignment({path:"client/src/pages/Admin.tsx"}).owner,"security-engineer");
  assert.equal(assignment({path:"external/maxcore/model.py"}).owner,"ai-ml-engineer");
});
test("every engineering stage has completion proof rather than a trust-me success signal",()=>{
  assert.ok(FILE_STAGES.length>=10);
  assert.equal(new Set(FILE_STAGES.map(x=>x.key)).size,FILE_STAGES.length);
  for(const stage of FILE_STAGES){
    assert.ok(stage.instruction.length>90);
    assert.ok(stage.output.length>10);
  }
});
