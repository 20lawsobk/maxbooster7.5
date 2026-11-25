import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const script=path.resolve("script/parallel-build-cleanup.sh");
function fixture(t, fail=false, readonlyCache=false, platformWrites=false) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"build-cleanup-"));
  const readonlyDirs=[];
  t.after(()=>{
    for(const directory of readonlyDirs) {
      if(fs.existsSync(directory)) fs.chmodSync(directory,0o700);
    }
    fs.rmSync(root,{recursive:true,force:true});
  });
  const targets=[".local",".agents"];
  for(const dir of [...targets,"node_modules/.vite","node_modules/.cache",".cache","server","data","uploads"]) {
    fs.mkdirSync(path.join(root,dir),{recursive:true});
    fs.writeFileSync(path.join(root,dir,"keep-or-delete"),"fixture");
  }
  if(readonlyCache) {
    const module=path.join(root,".cache/testing/subsystems/go/pkg/mod/golang.org/x/sync@v0.24.0/syncmap");
    fs.mkdirSync(module,{recursive:true});
    fs.writeFileSync(path.join(module,"map_test.go"),"fixture");
    function makeReadOnly(directory) {
      for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        if(entry.isDirectory()) makeReadOnly(path.join(directory,entry.name));
      }
      readonlyDirs.push(directory);
      fs.chmodSync(directory,0o555);
    }
    makeReadOnly(path.join(root,".cache"));
  }
  fs.mkdirSync(path.join(root,"bin"));
  const realRm=spawnSync("which",["rm"],{encoding:"utf8"}).stdout.trim();
  fs.writeFileSync(path.join(root,"bin/rm"),`#!/bin/bash
target="\${@: -1}"
echo "start $target" >> "$EVENTS"
if [[ "$WRITE_PLATFORM_CACHE" == "yes" ]]; then
  mkdir -p "$WORKSPACE_ROOT/.cache/platform"
  echo active >> "$WORKSPACE_ROOT/.cache/platform/writes"
fi
if [[ "$target" == ".local" && "$FAIL_TEST" == "yes" ]]; then
sleep 0.1
  echo "end $target" >> "$EVENTS"
  exit 23
fi
  sleep 0.1
"$REAL_RM" "$@"
rc=$?
echo "end $target" >> "$EVENTS"
exit "$rc"
`,{mode:0o755});
  const result=spawnSync("bash",[script,root],{encoding:"utf8",timeout:20000,
    env:{...process.env,PATH:path.join(root,"bin")+":"+process.env.PATH,
      EVENTS:path.join(root,"events"),REAL_RM:realRm,FAIL_TEST:fail?"yes":"no",
      WORKSPACE_ROOT:root,WRITE_PLATFORM_CACHE:platformWrites?"yes":"no"}});
  return {root,targets,result,events:fs.readFileSync(path.join(root,"events"),"utf8").trim().split("\n")};
}

test("cleanup serializes agent-state removal and preserves npm and platform caches", t=>{
  const {root,targets,result,events}=fixture(t,false,false,true);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(events,targets.map(target=>[`start ${target}`,`end ${target}`]).flat());
  for(const target of targets) assert.equal(fs.existsSync(path.join(root,target)),false);
  for(const target of ["node_modules/.vite","node_modules/.cache"]) assert.equal(fs.existsSync(path.join(root,target,"keep-or-delete")),true);
  for(const target of [".cache","server","data","uploads"]) assert.equal(fs.existsSync(path.join(root,target,"keep-or-delete")),true);
  assert.equal(fs.readFileSync(path.join(root,".cache/platform/writes"),"utf8").trim().split("\n").length,targets.length);
  assert.match(result.stdout,/\[cleanup\] Complete/);
});

test("cleanup preserves Replit workspace cache and its read-only Go module tree",t=>{
  const {root,targets,result}=fixture(t,false,true);
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(path.join(root,".cache/testing/subsystems/go/pkg/mod/golang.org/x/sync@v0.24.0/syncmap/map_test.go")),true);
  assert.equal(fs.statSync(path.join(root,".cache")).mode & 0o777,0o555);
  for(const target of targets) assert.equal(fs.existsSync(path.join(root,target)),false);
  assert.match(result.stdout,/\[cleanup\] Complete/);
});

test("failure prevents later cleanup work from starting and exits unsuccessfully", t=>{
  const {root,result,events}=fixture(t,true);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/FAILED .local/);
  assert.deepEqual(events,["start .local","end .local"]);
  assert.equal(fs.existsSync(path.join(root,".cache/keep-or-delete")),true);
  assert.equal(fs.existsSync(path.join(root,".agents/keep-or-delete")),true);
});

test("deployment defers npm cache removal until after both build paths",()=>{
  const build=fs.readFileSync(path.resolve("build.sh"),"utf8");
  assert.doesNotMatch(build,/rm -rf \.cache\//);
  assert.match(build,/rm -rf node_modules\/\.vite node_modules\/\.cache/);
  const dependencies=build.slice(build.indexOf("phase_dependencies()"),build.indexOf("phase_rust()"));
  assert.doesNotMatch(dependencies,/rm -rf node_modules\/\.vite/);
  assert.match(build,/phase_prune\(\)[\s\S]*?_pdim_prune_nm/);
});
