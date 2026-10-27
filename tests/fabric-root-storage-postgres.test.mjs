import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
test("active root fabric preserves shared bytes and recovers failed SQL publication/deletion", { timeout: 60_000 }, async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "fabric-root-storage-"));
  let database;
  try {
    database = await startDisposablePostgres();
    await database.pool.query(`
      CREATE TABLE fabric_objects(id varchar PRIMARY KEY,volume_id varchar NOT NULL,original_name varchar NOT NULL,
        content_type varchar NOT NULL,size_bytes varchar NOT NULL,chunk_ids jsonb NOT NULL,content_hash varchar NOT NULL,created_at timestamp NOT NULL);
      CREATE TABLE fabric_chunks(id varchar PRIMARY KEY,object_id varchar NOT NULL,node_ids jsonb NOT NULL,size_bytes varchar NOT NULL,
        checksum varchar NOT NULL,created_at timestamp NOT NULL);
      CREATE TABLE fabric_storage_nodes(id varchar PRIMARY KEY,region varchar NOT NULL,cost_tier varchar NOT NULL,backend_type varchar NOT NULL,
        backend_config jsonb NOT NULL,capacity_bytes varchar NOT NULL,used_bytes varchar NOT NULL,healthy boolean NOT NULL,last_heartbeat timestamp NOT NULL);
      INSERT INTO fabric_storage_nodes VALUES('a','local','standard','test','{}','10000000','0',true,now()),
        ('b','local','standard','test','{}','10000000','0',true,now());
    `);
    const migration = await readFile(path.join(root, "migrations/0096_fabric_deletion_journals.sql"), "utf8");
    await database.pool.query(migration); await database.pool.query(migration);
    await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
    const contents = `
      import assert from 'node:assert/strict';
      import {randomBytes} from 'node:crypto';
      import {PocketStorageService} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/PocketStorageService.ts"))};
      import {ObjectIndex} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/infra/ObjectIndex.ts"))};
      import {ChunkIndex} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/infra/ChunkIndex.ts"))};
      import {NodeRegistry} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/infra/NodeRegistry.ts"))};
      import {pool} from ${JSON.stringify(path.join(root,"server/db.ts"))};
      const stores={a:new Map(),b:new Map()},deletes=[];
      let offline=false,failWrite=false;
      function factory(node){return {
        putChunk:async(id,data)=>{if(failWrite&&node==='b')throw Error('write offline');stores[node].set(id,Buffer.from(data))},
        getChunk:async id=>{const data=stores[node].get(id);if(!data)throw Error('missing chunk');return Buffer.from(data)},
        deleteChunk:async id=>{deletes.push(node);if(offline&&node==='b')throw Error('delete offline');stores[node].delete(id)},
        hasChunk:async id=>stores[node].has(id)
      }}
      const service=()=>new PocketStorageService({getPocket:async()=>({id:'pocket',policy:{redundancy:2}})},
        {getVolume:async id=>({id,pocketId:'pocket'})},new ObjectIndex(),new ChunkIndex(),new NodeRegistry(),
        {placeChunk:async()=>({nodeIds:['a','b']})},factory);
      const query=text=>pool.query(text);
      const data=randomBytes(16384);
      const options={profile:'lossless-max-dedup',allowLossy:false};
      (async()=>{try{
        const first=service();
        const a=await first.putObject('pocket','volume-a',data,'same.bin','application/octet-stream',options);
        const b=await first.putObject('pocket','volume-b',data,'same.bin','application/octet-stream',options);
        assert.notEqual(a,b);
        assert.ok((await query('SELECT ref_count FROM fabric_chunks')).rows.every(row=>row.ref_count===2));
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,0);
        const before=Number((await query('SELECT sum(used_bytes::bigint) AS n FROM fabric_storage_nodes')).rows[0].n);
        assert.ok(before>0);
        await query(\`INSERT INTO fabric_objects(id,volume_id,original_name,content_type,size_bytes,chunk_ids,content_hash,created_at)
          VALUES('legacy-unknown','legacy-volume','unknown.bin','application/octet-stream','0','[]','unknown',now())\`);
        await assert.rejects(first.deleteObject(a),error=>error.statusCode===409);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,0);
        await first.deleteObject('legacy-unknown');
        await first.deleteObject(a);
        assert.equal(deletes.length,0,'shared content cannot be physically removed');
        assert.ok((await first.getObject(b)).data.equals(data));
        offline=true;
        await assert.rejects(first.deleteObject(b),/remains pending/);
        const partial=(await query('SELECT id,used_bytes FROM fabric_storage_nodes ORDER BY id')).rows;
        assert.equal(partial[0].used_bytes,'0');assert.ok(Number(partial[1].used_bytes)>0);
        assert.equal(stores.a.size,0);assert.ok(stores.b.size>0);
        offline=false;
        await service().drainPendingDeletions();
        assert.equal(stores.b.size,0);
        assert.equal(Number((await query('SELECT sum(used_bytes::bigint) AS n FROM fabric_storage_nodes')).rows[0].n),0);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,0);

        await query(\`CREATE FUNCTION fail_root_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'publication failure'; END $$;
          CREATE TRIGGER fail_root_publish BEFORE INSERT ON fabric_chunks FOR EACH ROW EXECUTE FUNCTION fail_root_publish();\`);
        await assert.rejects(first.putObject('pocket','volume-a',data,'same.bin','application/octet-stream',options));
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_objects')).rows[0].n,0);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_chunks')).rows[0].n,0);
        assert.equal(stores.a.size+stores.b.size,0,'failed metadata publication must reclaim physical writes');
        assert.equal(Number((await query('SELECT sum(used_bytes::bigint) AS n FROM fabric_storage_nodes')).rows[0].n),0);
        await query('DROP TRIGGER fail_root_publish ON fabric_chunks;DROP FUNCTION fail_root_publish()');
        failWrite=true;
        await assert.rejects(first.putObject('pocket','volume-a',data,'same.bin','application/octet-stream',options));
        assert.equal(stores.a.size+stores.b.size,0,'all in-flight writes must settle before compensation');
        assert.equal(Number((await query('SELECT sum(used_bytes::bigint) AS n FROM fabric_storage_nodes')).rows[0].n),0);
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_deletion_objects')).rows[0].n,0);
        failWrite=false;
        const baseData=randomBytes(65536),nextData=Buffer.from(baseData);nextData[1234]^=255;
        const base=await first.putObject('pocket','delta-volume',baseData,'base.bin','application/octet-stream',options);
        const child=await first.putObject('pocket','delta-volume',nextData,'child.bin','application/octet-stream',{...options,versionOf:base});
        assert.ok((await first.getObject(child)).data.equals(nextData));
        assert.equal((await query('SELECT count(*)::integer AS n FROM fabric_object_dependencies')).rows[0].n,1);
        await assert.rejects(first.deleteObject(base),error=>error.statusCode===409);
        assert.ok((await first.getObject(child)).data.equals(nextData),'retaining the base keeps its child readable');
        await first.deleteObject(child);await first.deleteObject(base);

        let announcePublish,continuePublish;
        const entered=new Promise(resolve=>{announcePublish=resolve}),hold=new Promise(resolve=>{continuePublish=resolve});
        const originalPublish=ObjectIndex.prototype.putObjectWithChunks;
        let pause=true;
        ObjectIndex.prototype.putObjectWithChunks=async function(...args){
          if(pause){pause=false;announcePublish();await hold}
          return originalPublish.apply(this,args);
        };
        const payload=randomBytes(32768);
        const failedWrite=first.putObject('pocket','fence-volume',payload,'fenced.bin','application/octet-stream',options)
          .then(value=>({value}),error=>({error}));
        await entered;
        const locks=(await query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND pid<>pg_backend_pid()")).rows;
        assert.equal(locks.length,1,'only the owned disposable catalog backend may be terminated');
        await query('SELECT pg_terminate_backend('+locks[0].pid+')');
        await service().drainPendingDeletions();
        const replacement=await service().putObject('pocket','fence-volume',payload,'fenced.bin','application/octet-stream',options);
        continuePublish();
        const stale=await failedWrite;
        assert.ok(stale.error,'an old owner cannot publish after successor cleanup');
        ObjectIndex.prototype.putObjectWithChunks=originalPublish;
        assert.ok((await service().getObject(replacement)).data.equals(payload),'stale compensation cannot destroy successor bytes');
        const dedup=await service().putObject('pocket','fence-volume',payload,'fenced.bin','application/octet-stream',options);
        assert.equal(dedup,replacement);assert.ok((await service().getObject(dedup)).data.equals(payload));
        await service().deleteObject(replacement);
        console.log('ROOT_FABRIC_VERIFIED');
      }finally{await pool.end()}})().catch(error=>{console.error(error);process.exitCode=1});
    `;
    const fixture = path.join(scratch,"fixture.cjs");
    await build({stdin:{contents,resolveDir:root,sourcefile:"root-fabric-fixture.ts",loader:"ts"},outfile:fixture,
      bundle:true,packages:"external",platform:"node",format:"cjs",logLevel:"silent",
      alias:{"@shared":path.join(root,"shared")} });
    const options = database.pool.options;
    const url = new URL(`postgresql://${encodeURIComponent(options.user)}@localhost/${options.database}`);
    url.searchParams.set("host",options.host);url.searchParams.set("port",String(options.port));
    const child = spawnSync(process.execPath,[fixture],{cwd:scratch,encoding:"utf8",timeout:50_000,
      env:{PATH:process.env.PATH,HOME:scratch,NODE_ENV:"test",DATABASE_URL:url.toString(),
        SESSION_SECRET:"isolated-root-fabric-fixture-secret-not-an-application-binding",
        READINESS_ISOLATED_PG:"1",READINESS_EGRESS_GUARD:"1",READINESS_LOCAL_CODECS:"1",
        NODE_OPTIONS:`--import=${path.join(root,"scripts/readiness-egress-guard.mjs")}`,
        ...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})} });
    assert.equal(child.status,0,(child.stderr||child.stdout||child.error?.message).slice(-12000));
    assert.match(child.stdout,/ROOT_FABRIC_VERIFIED/);
  } finally { await database?.stop(); await rm(scratch,{recursive:true,force:true}); }
});
