import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn, spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {once} from "node:events";
const helper = path.resolve("script/deployment/publishing-context.sh");
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"publishing-boundary-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {cwd:root,env:{PATH:process.env.PATH,HOME:root},encoding:"utf8"};
}
test("publishing owns authorization and isolates every child cache before cleanup",t=>{
  const options=fixture(t);
  const result=spawnSync("bash",["-eu","-c",`
    source "$1"; prepare_publishing_context
    tools=$(mktemp -d /tmp/deployment-tools.XXXXXX)
    trap 'rm -rf -- "$tools"' EXIT
    isolate_publishing_caches
    test "$PUBLISH_BUILD_ROOT" = "$PWD"
    test "$DEPLOY_PACK:$PUBLISH_PAYLOAD_CLEANUP:$PUBLISH_SHELL_PACKS_CAPSULES" = 1:1:1
    for key in XDG_CACHE_HOME npm_config_cache NPM_CONFIG_CACHE NODE_COMPILE_CACHE BOOSTERSTATE_CARGO_HOME PIP_CACHE_DIR UV_CACHE_DIR; do
      [[ "\${!key}" == "$tools"/cache/* ]]
    done
  `,"fixture",helper],options);
  assert.equal(result.status,0,result.stderr);
});
test("conflicting inherited authorization fails before publishing",t=>{
  const options=fixture(t);
  for(const env of [{DEPLOY_PACK:"0"},{PUBLISH_PAYLOAD_CLEANUP:"0"},{PUBLISH_BUILD_ROOT:"/other"}]){
    const result=spawnSync("bash",["-eu","-c",'source "$1"; prepare_publishing_context',"fixture",helper],
      {...options,env:{...options.env,...env}});
    assert.equal(result.status,1);
    assert.match(result.stderr,/Conflicting inherited/);
  }
});
test("overlapping publishing is rejected; normal exit releases the lock",async t=>{
  const options=fixture(t);
  fs.mkdirSync(path.join(options.cwd,"scripts"));
  fs.copyFileSync("scripts/build-production.mjs",path.join(options.cwd,"scripts/build-production.mjs"));
  const first=spawn("bash",["-eu","-c",'source "$1"; prepare_publishing_context; echo locked; read -r release',"fixture",helper],
    {...options,stdio:["pipe","pipe","pipe"]});
  t.after(()=>first.kill());
  await once(first.stdout,"data");
  const run=()=>spawnSync("bash",["-eu","-c",'source "$1"; prepare_publishing_context',"fixture",helper],options);
  const second=run();
  assert.equal(second.status,73);
  assert.match(second.stderr,/refusing overlapping/);
  const ordinary=spawnSync(process.execPath,["scripts/build-production.mjs"],options);
  assert.equal(ordinary.status,73);
  assert.match(ordinary.stderr,/no compilation started/);
  const exited=once(first,"exit");
  first.stdin.end("release\n");
  await exited;
  assert.equal(run().status,0);
});

test("actual historical entry hands off once with isolated caches and authorized recovery", {timeout:90000}, t=>{
  const options=fixture(t);
  for (const file of ["build.sh","script/deployment/bootstrap.sh","script/deployment/publishing-context.sh","script/lib/deploymentPackRecovery.mjs"]) {
    const target=path.join(options.cwd,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(file,target);
  }
  const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
  fs.writeFileSync(path.join(options.cwd,"package.json"),JSON.stringify({packageManager:pkg.packageManager}));
  // The real bootstrap and recovery execute; the destructive executive is
  // replaced by an assertion fixture, not represented as a complete build.
  fs.writeFileSync(path.join(options.cwd,"script/deployment/executive.mjs"),`
    import assert from "node:assert/strict";
    import fs from "node:fs";
    assert.equal(process.argv[2],"build");
    assert.equal(process.env.PUBLISH_BUILD_ROOT,process.cwd());
    assert.equal(process.env.PUBLISH_SHELL_PACKS_CAPSULES,"1");
    for(const key of ["NODE_COMPILE_CACHE","npm_config_cache","PIP_CACHE_DIR","UV_CACHE_DIR"]) {
      assert.ok(process.env[key].startsWith(process.env.DEPLOY_BOOTSTRAP_DIR+"/cache/"));
      fs.mkdirSync(process.env[key],{recursive:true});
      fs.writeFileSync(process.env[key]+"/write","isolated");
    }
    fs.rmSync(".cache",{recursive:true,force:true});
    console.log("isolated executive handoff verified");
    fs.rmSync(process.env.DEPLOY_BOOTSTRAP_DIR,{recursive:true,force:true});
  `);
  fs.mkdirSync(path.join(options.cwd,".cache"));
  const result=spawnSync("bash",["build.sh"],{...options,timeout:85000});
  assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
  assert.equal(result.stdout.split("isolated executive handoff verified").length-1,1);
});
