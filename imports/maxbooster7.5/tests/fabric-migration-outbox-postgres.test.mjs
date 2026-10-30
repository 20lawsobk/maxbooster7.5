import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { build } from "esbuild";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
test("fabric migration journals recover physical I/O and accounting across process restarts", { timeout: 90_000 }, async t => {
  const scratch = await mkdtemp(path.join(tmpdir(), "fabric-migration-"));
  let database;
  try {
    database = await startDisposablePostgres();
    await database.pool.query(`CREATE TABLE fabric_chunks(id varchar PRIMARY KEY,object_id varchar,node_ids jsonb NOT NULL,
      size_bytes varchar NOT NULL,checksum varchar NOT NULL,physical_keys jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE fabric_storage_nodes(id varchar PRIMARY KEY,capacity_bytes varchar NOT NULL,used_bytes varchar NOT NULL,healthy boolean NOT NULL);
      CREATE TABLE fabric_catalog_fence(id text PRIMARY KEY,generation bigint NOT NULL DEFAULT 0);
      INSERT INTO fabric_catalog_fence VALUES('root-catalog',0);`);
    const migration = await readFile(path.join(root, "migrations/0099_fabric_migration_journal.sql"), "utf8");
    await database.pool.query(migration); await database.pool.query(migration);
    await symlink(path.join(root, "node_modules"), path.join(scratch, "node_modules"), "dir");
    const contents = `
      import assert from 'node:assert/strict';
      import {createHash} from 'node:crypto';
      import {readFile,writeFile,rm,mkdir,readdir} from 'node:fs/promises';
      import path from 'node:path';
      import {PocketDimensionChunkStore} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts"))};
      import {RedisStore} from ${JSON.stringify(path.join(root,"external/pdim/artifacts/api-server/src/redis/store.ts"))};
      import {Rebalancer} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/control/Rebalancer.ts"))};
      import {MigrationOutbox} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/infra/MigrationOutbox.ts"))};
      import {withFabricCatalogLock} from ${JSON.stringify(path.join(root,"server/pocket-dimension/fabric/infra/DeletionOutbox.ts"))};
      import {pool} from ${JSON.stringify(path.join(root,"server/db.ts"))};
      const [scenario,phase]=process.argv.slice(2),data=Buffer.from('durable migration bytes'),hash=createHash('sha256').update(data).digest('hex');
      const base=path.join(process.cwd(),'physical'),sourceKey=hash+'.source',otherKey=hash+'.other';
      const counts=async()=>Object.fromEntries((await pool.query('SELECT id,used_bytes FROM fabric_storage_nodes ORDER BY id')).rows.map(row=>[row.id,Number(row.used_bytes)]));
      const jobs=async()=>(await pool.query('SELECT * FROM fabric_migration_jobs')).rows;
      const location=async()=>(await pool.query('SELECT * FROM fabric_chunks')).rows[0];
      const file=(node,key)=>path.join(base,node,key);
      let interrupted=false;
      let persistentStore,persistentTarget;
      const persistentValues=new Map(),snapshotFile=path.join(process.cwd(),'canonical-target.json');
      const factory=node=>node==='b'&&persistentTarget?{
        putChunk:async(key,bytes)=>{await persistentTarget.putChunk(key,bytes);if(phase==='fault'){
          const dataKey=[...persistentValues.keys()].find(key=>!key.endsWith(':deleted'));
          await persistentStore.exec('SET',[dataKey,Buffer.from('actual stored corruption').toString('base64')]);
          await writeFile(snapshotFile,JSON.stringify([...persistentValues]));
        }},
        getChunk:key=>persistentTarget.getChunk(key),deleteChunk:key=>persistentTarget.deleteChunk(key),hasChunk:key=>persistentTarget.hasChunk(key),
      }:({
        putChunk:async(key,bytes)=>{
          if(scenario==='stale'&&phase==='fault'&&!interrupted){
            interrupted=true;
            const locks=(await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND pid<>pg_backend_pid()")).rows;
            assert.equal(locks.length,1);await pool.query('SELECT pg_terminate_backend($1)',[locks[0].pid]);
            await withFabricCatalogLock(async()=>{const journal=new MigrationOutbox(factory);for(const job of await journal.pending())await journal.resume(job)});
          }
          await mkdir(path.join(base,node),{recursive:true});await writeFile(file(node,key),bytes);
          if(phase==='fault'&&scenario==='write')throw Error('fixture ambiguous target write');},
        getChunk:async key=>phase==='fault'&&scenario==='verify'&&node==='b'?Buffer.from('corrupt target'):readFile(file(node,key)),
        deleteChunk:async key=>{if(phase==='fault'&&scenario==='delete'&&node==='a')throw Error('fixture source deletion outage');await rm(file(node,key),{force:true});},
        hasChunk:async key=>{try{await readFile(file(node,key));return true}catch{return false}}
      });
      const chunks={withCatalogLock:withFabricCatalogLock};
      const rebalancer=()=>new Rebalancer({},chunks,{},factory);
      (async()=>{try{
      if(['corrupt','rotate'].includes(scenario)){
        if(phase!=='fault')for(const pair of JSON.parse(await readFile(snapshotFile,'utf8')))persistentValues.set(...pair);
        persistentStore=new RedisStore('corrupt-target-fixture','migration-owner');persistentStore.attachEmbeddedSnapshot(persistentValues);
        persistentTarget=new PocketDimensionChunkStore('durable-target-b',()=>({eval:async(script,count,...args)=>{
          const result=await persistentStore.exec('EVAL',[script,String(count),...args]);
          await writeFile(snapshotFile,JSON.stringify([...persistentValues]));return result;
        }}));
      }

        if(phase==='discard-stale'){
          const values=new Map(),canonical=new RedisStore('migration-fixture','migration-owner');canonical.attachEmbeddedSnapshot(values);
          let release,announce;const held=new Promise(resolve=>{release=resolve}),entered=new Promise(resolve=>{announce=resolve});
          let deniedRetired=false;
          const owner={eval:async(script,count,...args)=>{const result=await canonical.exec('EVAL',[script,String(count),...args]);if(result===-1)deniedRetired=true;return result}};
          let first=true;
          const delayed=new PocketDimensionChunkStore('target-b',()=>({...owner,eval:async(...args)=>{if(first){first=false;announce();await held}return owner.eval(...args)}}));
          const target=new PocketDimensionChunkStore('target-b',()=>owner);
          const oldFactory=node=>node==='b'?delayed:factory(node),newFactory=node=>node==='b'?target:factory(node);
          const oldJournal=new MigrationOutbox(oldFactory);
          const oldMove=withFabricCatalogLock(async()=>{const job=await oldJournal.begin(hash,'a','b');await oldJournal.resume(job)}).then(()=>({ok:true}),error=>({error}));
          try{
            await entered;
            const locks=(await pool.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND granted AND pid<>pg_backend_pid()")).rows;assert.equal(locks.length,1);
            await pool.query('SELECT pg_terminate_backend($1)',[locks[0].pid]);
            await withFabricCatalogLock(async()=>{
              await factory('a').deleteChunk(sourceKey);await factory('c').deleteChunk(otherKey);
              await pool.query('DELETE FROM fabric_chunks');await pool.query("UPDATE fabric_storage_nodes SET used_bytes='0' WHERE id IN ('a','c')");
              const fresh=new MigrationOutbox(newFactory);for(const job of await fresh.pending())await fresh.resume(job);
            });
            assert.equal((await jobs()).length,0);assert.deepEqual(await counts(),{a:0,b:0,c:0});
            release();const outcome=await oldMove;assert.match(outcome.error?.message??'',/Stale fabric catalog generation/);assert.equal(deniedRetired,true,'authority rejected stale physical publication before stale SQL repair was fenced');
            assert.equal(values.size,1,'durable tombstone is retained after late publication is denied');
            assert.equal([...values.keys()].filter(key=>!key.endsWith(':deleted')).length,0,'late old physical write cannot recreate discarded target content');
          }finally{release();canonical.closeEmbedded()}
        }else if(phase==='fault'){
          await rm(base,{recursive:true,force:true});await mkdir(path.join(base,'a'),{recursive:true});await mkdir(path.join(base,'c'),{recursive:true});
          await writeFile(file('a',sourceKey),data);await writeFile(file('c',otherKey),data);
          await pool.query('DROP TRIGGER IF EXISTS migration_publish_fault ON fabric_chunks;DROP FUNCTION IF EXISTS migration_publish_fault();DROP TRIGGER IF EXISTS migration_receipt_fault ON fabric_migration_jobs;DROP FUNCTION IF EXISTS migration_receipt_fault()');
          await pool.query('TRUNCATE fabric_migration_jobs,fabric_chunks,fabric_storage_nodes');
          await pool.query(\`INSERT INTO fabric_storage_nodes VALUES('a','1000000',$1,true),('b','1000000','0',true),('c','1000000',$1,true)\`,[String(data.length)]);
          await pool.query(\`INSERT INTO fabric_chunks VALUES($1,'object','["a","c"]',$2,$1,$3)\`,[hash,String(data.length),JSON.stringify({a:sourceKey,c:otherKey})]);
          if(scenario==='reserve'||scenario==='discard'){
            await withFabricCatalogLock(()=>new MigrationOutbox(factory).begin(hash,'a','b'));
            assert.deepEqual(await counts(),{a:data.length,b:data.length,c:data.length});
            assert.equal((await jobs())[0].state,'copying');
            if(scenario==='discard'){
              const job=(await jobs())[0];await factory('b').putChunk(job.target_key,data);
              await pool.query('DELETE FROM fabric_chunks');await pool.query(\`UPDATE fabric_storage_nodes SET used_bytes='0' WHERE id IN ('a','c')\`);
              await factory('a').deleteChunk(sourceKey);await factory('c').deleteChunk(otherKey);
            }
          }else if(scenario==='concurrent'){
            // Parent starts two independent renderer processes after this seed.
          }else if(scenario==='capacity'){
            await pool.query(\`UPDATE fabric_storage_nodes SET capacity_bytes='1' WHERE id='b'\`);
            await assert.rejects(rebalancer().migrateChunk(hash,'a','b'),/capacity/);
            assert.equal((await jobs()).length,0);assert.deepEqual(await counts(),{a:data.length,b:0,c:data.length});
            assert.ok((await factory('a').getChunk(sourceKey)).equals(data));
          }else{
            if(scenario==='rotate')await pool.query(\`CREATE FUNCTION migration_rotation_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.target_key<>OLD.target_key THEN RAISE EXCEPTION 'fixture rotation outage'; END IF; RETURN NEW; END $$;CREATE TRIGGER migration_rotation_fault BEFORE UPDATE ON fabric_migration_jobs FOR EACH ROW EXECUTE FUNCTION migration_rotation_fault()\`);
            if(scenario==='publish')await pool.query(\`CREATE FUNCTION migration_publish_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture publication outage'; END $$;
              CREATE TRIGGER migration_publish_fault BEFORE UPDATE ON fabric_chunks FOR EACH ROW EXECUTE FUNCTION migration_publish_fault()\`);
            if(scenario==='receipt')await pool.query(\`CREATE FUNCTION migration_receipt_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture receipt outage'; END $$;
              CREATE TRIGGER migration_receipt_fault BEFORE DELETE ON fabric_migration_jobs FOR EACH ROW EXECUTE FUNCTION migration_receipt_fault()\`);
            if(scenario==='success')await rebalancer().migrateChunk(hash,'a','b');
            else await assert.rejects(rebalancer().migrateChunk(hash,'a','b'),error=>/fixture|verification|Stale fabric/.test(error.message+' '+error.cause?.message));
            if(scenario==='publish')await pool.query('DROP TRIGGER migration_publish_fault ON fabric_chunks;DROP FUNCTION migration_publish_fault()');
            if(scenario==='rotate')await pool.query('DROP TRIGGER migration_rotation_fault ON fabric_migration_jobs;DROP FUNCTION migration_rotation_fault()');
            if(scenario==='receipt')await pool.query('DROP TRIGGER migration_receipt_fault ON fabric_migration_jobs;DROP FUNCTION migration_receipt_fault()');
            if(scenario==='stale'){
              assert.equal((await jobs()).length,0,'successor completed the original durable intent');
              assert.deepEqual(await counts(),{a:0,b:data.length,c:data.length});
              const loc=await location();assert.deepEqual(loc.node_ids,['b','c']);
              assert.ok((await factory('b').getChunk(loc.physical_keys.b)).equals(data),'late stale write uses the same verified migration key');
            }else if(scenario!=='success'){
              const job=(await jobs())[0];assert.ok(job,'failed migration remains durable');
              assert.equal(job.state,['delete','receipt'].includes(scenario)?'published':'copying');
              assert.deepEqual(await counts(),{a:data.length,b:data.length,c:data.length},'both replicas stay conservatively charged until cleanup commits');
              assert.ok((await factory('c').getChunk(otherKey)).equals(data));
              if(scenario==='delete')assert.ok((await factory('a').getChunk(sourceKey)).equals(data));
              if(scenario==='receipt')assert.equal(await factory('a').hasChunk(sourceKey),false,'physical deletion before rolled-back receipt is safe to retry');
              const loc=await location();assert.deepEqual(loc.node_ids,['delete','receipt'].includes(scenario)?['b','c']:['a','c']);
            }
          }
        }else if(['target-loss','target-corruption'].includes(phase)){
          const job=(await jobs())[0];assert.equal(job.state,'published');
          const original=await factory('b').getChunk(job.target_key);
          if(phase==='target-loss')await factory('b').deleteChunk(job.target_key);
          else await writeFile(file('b',job.target_key),Buffer.from('actual corrupt published target'));
          await assert.rejects(rebalancer().drainPendingMigrations(),phase==='target-loss'?/ENOENT/:/Published migration target integrity failed/);
          assert.ok((await factory('a').getChunk(sourceKey)).equals(data),'healthy original cannot be deleted while its published replacement is unavailable or corrupt');
          assert.equal((await jobs())[0].state,'published');
          assert.deepEqual(await counts(),{a:data.length,b:data.length,c:data.length},'source and replacement remain charged while recovery is blocked');
          await writeFile(file('b',job.target_key),original);
          await rebalancer().drainPendingMigrations();
          assert.equal((await jobs()).length,0);assert.deepEqual(await counts(),{a:0,b:data.length,c:data.length});
        }else if(phase==='compete'){
          try{await rebalancer().migrateChunk(hash,'a','b');console.log('MIGRATION_MOVE_SUCCESS')}catch(error){assert.match(error.message,/unindexed source/);console.log('MIGRATION_MOVE_ALREADY_COMPLETED')}
        }else{
          if(scenario==='rotate')await assert.rejects(rebalancer().drainPendingMigrations(),/permanently deleted/);
          await rebalancer().drainPendingMigrations();await rebalancer().drainPendingMigrations();
          assert.equal((await jobs()).length,0);
          if(scenario==='discard'){
            assert.deepEqual(await counts(),{a:0,b:0,c:0});assert.deepEqual(await readdir(path.join(base,'b')),[]);
          }else if(scenario!=='capacity'){
            const loc=await location();assert.deepEqual(loc.node_ids,['b','c']);assert.equal(loc.physical_keys.a,undefined);
            assert.ok((await factory('b').getChunk(loc.physical_keys.b)).equals(data));assert.ok((await factory('c').getChunk(otherKey)).equals(data));
            assert.equal(await factory('a').hasChunk(sourceKey),false);
            assert.deepEqual(await counts(),{a:0,b:data.length,c:data.length});
            if(persistentTarget){assert.equal([...persistentValues.keys()].filter(key=>!key.endsWith(':deleted')).length,1,'one verified live target plus control tombstone');}
            else assert.equal((await readdir(path.join(base,'b'))).length,1,'restart never creates an untracked extra target key');
          }
        }
        console.log('MIGRATION_PHASE_VERIFIED '+scenario+' '+phase);
      }finally{persistentStore?.closeEmbedded();await pool.end()}})().catch(error=>{console.error(error);process.exitCode=1});
    `;
    const fixture = path.join(scratch,"fixture.cjs");
    await build({stdin:{contents,resolveDir:root,sourcefile:"migration-fixture.ts",loader:"ts"},outfile:fixture,
      bundle:true,packages:"external",platform:"node",format:"cjs",logLevel:"silent",alias:{"@shared":path.join(root,"shared")} });
    const options = database.pool.options;
    const url = new URL(`postgresql://${encodeURIComponent(options.user)}@localhost/${options.database}`);
    url.searchParams.set("host",options.host);url.searchParams.set("port",String(options.port));
    const childOptions = {cwd:scratch,encoding:"utf8",timeout:15_000,env:{PATH:process.env.PATH,HOME:scratch,NODE_ENV:"test",DATABASE_URL:url.toString(),SESSION_SECRET:"isolated-migration-fixture-secret-not-an-application-binding",READINESS_ISOLATED_PG:"1",READINESS_EGRESS_GUARD:"1",NODE_OPTIONS:`--import=${path.join(root,"scripts/readiness-egress-guard.mjs")}`,...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})}};
    const run = (scenario, phase) => {
      const child = spawnSync(process.execPath,[fixture,scenario,phase],{cwd:scratch,encoding:"utf8",timeout:15_000,
        env:{PATH:process.env.PATH,HOME:scratch,NODE_ENV:"test",DATABASE_URL:url.toString(),
          SESSION_SECRET:"isolated-migration-fixture-secret-not-an-application-binding",READINESS_ISOLATED_PG:"1",READINESS_EGRESS_GUARD:"1",
          NODE_OPTIONS:`--import=${path.join(root,"scripts/readiness-egress-guard.mjs")}`,
          ...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})} });
      assert.equal(child.status,0,(child.stderr||child.stdout||child.error?.message).slice(-8000));
      assert.match(child.stdout,/MIGRATION_PHASE_VERIFIED/);
    };
    for (const [scenario,label] of [
      ["success","verified target and original replica retain exact bytes with balanced accounting"],
      ["reserve","restart after reservation before physical write resumes the same target key"],
      ["write","ambiguous completed target write remains journaled and is resumed without double charge"],
      ["corrupt","actual corrupted PDIM target is retired and a new immutable key recovers after process restart"],
      ["rotate","SQL rollback after target retirement safely rotates the retained tombstoned key on retry"],
      ["verify","failed target verification retains the source and reserved target until successful retry"],
      ["publish","SQL publication failure preserves original catalog and recovers after restart"],
      ["delete","source deletion outage retains published target and durable cleanup receipt"],
      ["receipt","SQL failure after physical deletion retries cleanup without double subtraction"],
      ["discard","a removed source reclaims an interrupted unpublished target and refunds its reservation"],
      ["capacity","insufficient target capacity denies admission before physical I/O or journal publication"],
      ["stale","terminated catalog owner cannot republish or double-account after successor migration recovery"],
    ]) await t.test(label,()=>{run(scenario,"fault");run(scenario,"restart");});
    await t.test("restart retains healthy source when published replacement bytes are missing",()=>{run("delete","fault");run("delete","target-loss");run("delete","restart");});
    await t.test("restart retains healthy source when published replacement bytes are corrupt",()=>{run("delete","fault");run("delete","target-corruption");run("delete","restart");});
    await t.test("discard after lost SQL owner atomically denies delayed old PDIM publication",()=>{run("concurrent","fault");run("concurrent","discard-stale");});
    await t.test("two independent processes serialize migration without duplicate capacity charges",async()=>{
      run("concurrent","fault");
      const compete=()=>new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[fixture,"concurrent","compete"],childOptions);let output="";
        child.stdout.on("data",bytes=>{output+=bytes});child.stderr.on("data",bytes=>{output+=bytes});
        child.on("error",reject);child.on("close",code=>{try{assert.equal(code,0,output);resolve(output)}catch(error){reject(error)}});
      });
      const outcomes=await Promise.all([compete(),compete()]);
      assert.equal(outcomes.filter(text=>text.includes("MIGRATION_MOVE_SUCCESS")).length,1);
      assert.equal(outcomes.filter(text=>text.includes("MIGRATION_MOVE_ALREADY_COMPLETED")).length,1);
      run("concurrent","restart");
    });
  } finally { await database?.stop(); await rm(scratch,{recursive:true,force:true}); }
});
