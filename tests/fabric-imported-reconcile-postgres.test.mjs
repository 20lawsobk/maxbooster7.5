import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const root=fileURLToPath(new URL("..",import.meta.url));
test("imported startup reconciliation waits for full object publication and retains unproven chunks",{timeout:60_000},async()=>{
  const scratch=await mkdtemp(path.join(tmpdir(),"fabric-imported-reconcile-"));let database;
  try{
    database=await startDisposablePostgres();
    await database.pool.query(`
      CREATE TABLE fabric_objects(id text PRIMARY KEY,volume_id text NOT NULL,original_name text NOT NULL,content_type text NOT NULL,
        size_bytes bigint NOT NULL,chunk_ids jsonb NOT NULL,content_hash text NOT NULL,manifest jsonb NOT NULL,created_at timestamp NOT NULL);
      CREATE TABLE fabric_chunks(id text PRIMARY KEY,object_id text NOT NULL,node_ids jsonb NOT NULL,size_bytes bigint NOT NULL,
        checksum text NOT NULL,ref_count integer NOT NULL DEFAULT 1,created_at timestamp NOT NULL);
      CREATE TABLE fabric_storage_nodes(id text PRIMARY KEY,used_bytes bigint NOT NULL);
      CREATE TABLE fabric_segments(object_id text NOT NULL);
      INSERT INTO fabric_storage_nodes VALUES('a',0);
    `);
    await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
    const contents=`
      import assert from 'node:assert/strict';
      import {PocketStorageService} from ${JSON.stringify(path.join(root,"external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts"))};
      import {ObjectIndex} from ${JSON.stringify(path.join(root,"external/pdim/artifacts/api-server/src/pocket-dimension/fabric/infra/ObjectIndex.ts"))};
      import {ChunkIndex} from ${JSON.stringify(path.join(root,"external/pdim/artifacts/api-server/src/pocket-dimension/fabric/infra/ChunkIndex.ts"))};
      import {pool} from '@workspace/db';
      const bytes=new Map(),query=text=>pool.query(text);
      const nodes={addUsedBytes:async(_id,n)=>pool.query('UPDATE fabric_storage_nodes SET used_bytes=used_bytes+$1',[n]),
        listAllNodes:async()=>[{id:'a'}],setUsedBytes:async(_id,n)=>pool.query('UPDATE fabric_storage_nodes SET used_bytes=$1',[n])};
      const factory=()=>({hasChunk:async id=>bytes.has(id),putChunk:async(id,value)=>{bytes.set(id,Buffer.from(value))},
        getChunk:async id=>Buffer.from(bytes.get(id)),deleteChunk:async id=>{bytes.delete(id)}});
      const service=()=>new PocketStorageService({}, {},new ObjectIndex(),new ChunkIndex(),{},nodes,{placeChunk:async()=>({nodeIds:['a']})},factory);
      (async()=>{try{
        let announce,release;
        const entered=new Promise(resolve=>{announce=resolve}),hold=new Promise(resolve=>{release=resolve});
        const original=ObjectIndex.prototype.putObject;
        ObjectIndex.prototype.putObject=async function(...args){announce();await hold;return original.apply(this,args)};
        const writer=service().storeObject('volume','fixture.bin','application/octet-stream',Buffer.from('publication race fixture'));
        await entered;
        const boot=service();
        let reconciled=false;
        const reconcile=boot.reconcileRefCounts().then(()=>{reconciled=true});
        const deadline=Date.now()+2000;let waiting=0;
        while(Date.now()<deadline&&!waiting){waiting=(await query("SELECT count(*)::integer AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n;if(!waiting)await new Promise(resolve=>setTimeout(resolve,10))}
        assert.ok(waiting>0);assert.equal(reconciled,false);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_chunks')).rows[0].n,1);assert.equal(bytes.size,1);
        release();const stored=await writer;await reconcile;ObjectIndex.prototype.putObject=original;
        assert.ok((await boot.retrieveObject(stored.id)).data.equals(Buffer.from('publication race fixture')));
        await query(\`INSERT INTO fabric_chunks VALUES('unpublished','', '["a"]',5,'unpublished',2,now())\`);
        bytes.set('unpublished',Buffer.from('owned'));
        await boot.reconcileRefCounts();
        assert.equal((await query("SELECT ref_count FROM fabric_chunks WHERE id='unpublished'")).rows[0].ref_count,2);
        assert.ok(bytes.has('unpublished'),'a snapshot cannot prove an unpublished chunk may be destroyed');
        await boot.reconcileNodeUsage();
        console.log('IMPORTED_RECONCILE_VERIFIED');
      }finally{await pool.end()}})().catch(error=>{console.error(error);process.exitCode=1});
    `;
    const fixture=path.join(scratch,"fixture.cjs");
    await build({stdin:{contents,resolveDir:root,sourcefile:"imported-reconcile-fixture.ts",loader:"ts"},outfile:fixture,
      bundle:true,packages:"external",platform:"node",format:"cjs",logLevel:"silent",
      alias:{"@workspace/db":path.join(root,"external/pdim/lib/db/src/index.ts"),"@workspace/db/schema":path.join(root,"external/pdim/lib/db/src/schema/index.ts")} });
    const options=database.pool.options,url=new URL(`postgresql://${encodeURIComponent(options.user)}@localhost/${options.database}`);
    url.searchParams.set("host",options.host);url.searchParams.set("port",String(options.port));
    const child=spawnSync(process.execPath,[fixture],{cwd:scratch,encoding:"utf8",timeout:45_000,
      env:{PATH:process.env.PATH,HOME:scratch,NODE_ENV:"test",DATABASE_URL:url.toString(),
        ...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})} });
    assert.equal(child.status,0,(child.stderr||child.stdout||child.error?.message).slice(-10000));
    assert.match(child.stdout,/IMPORTED_RECONCILE_VERIFIED/);
  }finally{await database?.stop();await rm(scratch,{recursive:true,force:true})}
});
