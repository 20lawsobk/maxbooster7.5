import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const script=path.resolve("script/parallel-build-cleanup.sh");
function fixture(t, fail=false) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"build-cleanup-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const targets=[".local",".cache",".agents","node_modules/.vite","node_modules/.cache"];
  for(const dir of [...targets,"server","data","uploads"]) {
    fs.mkdirSync(path.join(root,dir),{recursive:true});
    fs.writeFileSync(path.join(root,dir,"keep-or-delete"),"fixture");
  }
  fs.mkdirSync(path.join(root,"bin"));
  const realRm=spawnSync("which",["rm"],{encoding:"utf8"}).stdout.trim();
  fs.writeFileSync(path.join(root,"bin/rm"),`#!/bin/bash
target="\${@: -1}"
echo "start $target" >> "$EVENTS"
if [[ "$target" == ".local" && "$FAIL_TEST" == "yes" ]]; then
  sleep 0.1
  echo "end $target" >> "$EVENTS"
  exit 23
fi
sleep 1.5
"$REAL_RM" "$@"
rc=$?
echo "end $target" >> "$EVENTS"
exit "$rc"
`,{mode:0o755});
  const result=spawnSync("bash",[script,root],{encoding:"utf8",timeout:20000,
    env:{...process.env,PATH:path.join(root,"bin")+":"+process.env.PATH,
      EVENTS:path.join(root,"events"),REAL_RM:realRm,FAIL_TEST:fail?"yes":"no"}});
  return {root,targets,result,events:fs.readFileSync(path.join(root,"events"),"utf8").trim().split("\n")};
}

test("cleanup overlaps two deletions, removes every cache, and preserves application data", t=>{
  const {root,targets,result,events}=fixture(t);
  assert.equal(result.status,0,result.stderr);
  let running=0,peak=0;
  for(const event of events) { running+=event.startsWith("start")?1:-1; peak=Math.max(peak,running); }
  assert.equal(peak,2); assert.equal(running,0);
  for(const target of targets) assert.equal(fs.existsSync(path.join(root,target)),false);
  for(const target of ["server","data","uploads"]) assert.equal(fs.existsSync(path.join(root,target,"keep-or-delete")),true);
  assert.match(result.stdout,/\[cleanup\] Complete/);
});

test("failure stops queued deletions, drains active work, and exits unsuccessfully", t=>{
  const {root,result,events}=fixture(t,true);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/FAILED .local/);
  assert.deepEqual(events.filter(x=>x.startsWith("start")).sort(),["start .cache","start .local"]);
  assert.ok(events.includes("end .cache"));
  assert.equal(fs.existsSync(path.join(root,".agents/keep-or-delete")),true);
});
