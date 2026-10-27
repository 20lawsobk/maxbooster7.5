import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, symlink, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root=fileURLToPath(new URL("..",import.meta.url));
test("real Drizzle generation emits catalog epoch/dependency SQL rather than exiting zero with an empty migration",{timeout:60_000},async()=>{
  const scratch=await mkdtemp(path.join(tmpdir(),"fabric-schema-generation-"));
  try{
    await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
    const schema=await readFile(path.join(root,"shared/schema.ts"),"utf8");
    await writeFile(path.join(scratch,"schema.ts"),schema.replace('export * from "./readiness-schema";',''));
    const output=path.join(scratch,"generated"),config=path.join(scratch,"drizzle.json");
    await writeFile(config,JSON.stringify({dialect:"postgresql",schema:path.join(scratch,"schema.ts"),out:output}));
    const child=spawnSync(process.execPath,[path.join(root,"node_modules/drizzle-kit/bin.cjs"),"generate",`--config=${config}`],
      {cwd:root,encoding:"utf8",timeout:45_000,env:{PATH:process.env.PATH,HOME:scratch,LANG:"C"}});
    assert.equal(child.status,0,child.stderr||child.stdout||child.error?.message);
    const files=(await readdir(output)).filter(file=>file.endsWith(".sql"));
    assert.ok(files.length>0,"Generator exit zero is insufficient when schema serialization produced no SQL");
    const sql=(await Promise.all(files.map(file=>readFile(path.join(output,file),"utf8")))).join("\n");
    assert.match(sql,/CREATE TABLE "fabric_catalog_fence"/);
    assert.match(sql,/"generation" bigint DEFAULT 0 NOT NULL/);
    assert.match(sql,/CREATE TABLE "fabric_object_dependencies"/);
    assert.match(sql,/"dependencies_indexed" boolean DEFAULT false NOT NULL/);
    assert.match(sql,/"physical_keys" jsonb/);
  }finally{await rm(scratch,{recursive:true,force:true})}
});
