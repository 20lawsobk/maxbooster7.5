const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadPolicy(mode, options={}) {
  const compiled=ts.transpileModule(fs.readFileSync("server/services/governancePolicyService.ts","utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    reportDiagnostics:true,
  });
  assert.equal(compiled.diagnostics?.length,0);
  const module={exports:{}};
  const db={select:()=>({from:()=>({where:async()=>{
    if(options.unavailable) throw new Error("Database unavailable");
    return [{key:"platform.userRegistrationEnabled",value:"true"}];
  }})})};
  const imports={
    "../db.js":{db},
    "../../shared/schema.js":{systemSettings:{key:"key"}},
    "drizzle-orm":{inArray:()=>({})},
  };
  vm.runInNewContext(compiled.outputText,{
    module,exports:module.exports,require:name=>{
      if(!(name in imports)) throw new Error("Unexpected import "+name);
      return imports[name];
    },
    process:{env:{MAXBOOSTER_ADMIN_ONLY_MODE:mode}},
    console,Date,Error,Boolean,Number,JSON,
  });
  return module.exports;
}
async function checkAccess(policy,role) {
  const response={code:200,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;return this;},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}};
  let passed=false;
  await policy.enforceMaintenance({user:role?{role}:undefined},response,()=>{passed=true;});
  return {passed,code:response.code,body:response.body};
}

test("explicit administrator-only mode blocks all anonymous and ordinary-user application paths",async()=>{
  const policy=loadPolicy("true");
  assert.equal(policy.isAdminOnlyMode(),true);
  assert.equal((await checkAccess(policy,undefined)).code,403);
  assert.equal((await checkAccess(policy,"user")).code,403);
  assert.equal((await checkAccess(policy,"admin")).passed,true);
  await assert.rejects(policy.assertRegistrationEnabled(),error=>error.statusCode===403);
});
test("admin-only setting overrides even an enabled database registration setting",async()=>{
  const policy=loadPolicy(" TRUE ");
  assert.equal(policy.isAdminOnlyMode(),true);
  await assert.rejects(policy.assertRegistrationEnabled(),error=>error.statusCode===403);
});
test("disabled admin-only mode preserves existing stored governance decisions",async()=>{
  const policy=loadPolicy("false");
  assert.equal(policy.isAdminOnlyMode(),false);
  assert.equal((await checkAccess(policy,"user")).passed,true);
  await policy.assertRegistrationEnabled();
});
test("governance store outage never grants admin recovery access by default",async()=>{
  const policy=loadPolicy("true",{unavailable:true});
  assert.equal((await checkAccess(policy,"admin")).code,503);
});
