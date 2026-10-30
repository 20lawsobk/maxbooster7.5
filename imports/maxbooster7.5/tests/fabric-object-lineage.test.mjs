import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
test("actual fabric handlers require pocket→volume→object lineage before reading or deleting bytes", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "fabric-lineage-"));
  try {
    await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
    const calls = [];
    let objectVolume = "volume", volumePocket = "pocket", conflict = false;
    globalThis.fabricLineageFixture = {
      getPocket: async () => ({ id:"pocket",ownerId:"owner" }),
      getVolume: async () => ({id:"volume",pocketId:volumePocket}),
      getObjectMetadata:async()=>({id:"object",volumeId:objectVolume}),
      getObject:async()=>{calls.push("read");return {data:Buffer.from("owned"),object:{contentType:"text/plain",originalName:"owned.txt"}}},
      deleteObject:async()=>{calls.push("delete");if(conflict)throw Object.assign(Error("Live dependent version"),{statusCode:409})},
      listObjects:async()=>{calls.push("list");return []},
    };
    const output = path.join(scratch,"router.mjs");
    await build({entryPoints:[path.join(root,"server/routes/fabric.ts")],outfile:output,bundle:true,packages:"external",platform:"node",format:"esm",logLevel:"silent",
      plugins:[{name:"owned-handler-boundaries",setup(builder){
        builder.onResolve({filter:/pocket-dimension\/fabric\/index\.js$|middleware\/auth\.js$|logger\.js$/},args=>({path:args.path,namespace:"fixture"}));
        builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path.includes("fabric/index")
          ? "export const fabricStorage=globalThis.fabricLineageFixture; export const fabricNodeRegistry={};export const autoClusterManager={};"
          : args.path.includes("auth") ? "export const requireAuth=(_req,_res,next)=>next();"
          : "export const logger={warn(){},info(){}};"}));
      }}]});
    const router=(await import(pathToFileURL(output).href)).default;
    async function invoke(method, suffix="/:objectId") {
      const route=router.stack.find(layer=>layer.route?.path===`/pockets/:pocketId/volumes/:volumeId/objects${suffix}`&&layer.route.methods[method]).route;
      const response={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this},send(body){this.body=body;return this},end(){return this},setHeader(){}};
      await route.stack.at(-1).handle({user:{id:"owner"},params:{pocketId:"pocket",volumeId:"volume",objectId:"object"}},response);
      return response;
    }
    for(const method of ["get","delete"]){
      calls.length=0;objectVolume="foreign-volume";
      assert.equal((await invoke(method)).statusCode,404);assert.deepEqual(calls,[]);
      objectVolume="volume";volumePocket="foreign-pocket";
      assert.equal((await invoke(method)).statusCode,404);assert.deepEqual(calls,[]);
      volumePocket="pocket";
      assert.equal((await invoke(method)).statusCode,method==="get"?200:204);
      assert.deepEqual(calls,[method==="get"?"read":"delete"]);
    }
    calls.length=0;volumePocket="foreign-pocket";
    assert.equal((await invoke("get","")).statusCode,404);assert.deepEqual(calls,[]);
    volumePocket="pocket";conflict=true;
    const held=await invoke("delete");
    assert.equal(held.statusCode,409);assert.equal(held.body.code,"FABRIC_DEPENDENCY_IN_USE");
  } finally {delete globalThis.fabricLineageFixture;await rm(scratch,{recursive:true,force:true})}
});
