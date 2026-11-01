/** Current-format, writer-drained SQL + canonical PDIM recovery; no live services. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { build } from "esbuild";
import { startDisposablePostgres, loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";
import { writeSnapshotManifest, restoreVerifiedSnapshot } from "../scripts/pdim-content-recovery-drill-lib.mjs";
const root=fileURLToPath(new URL("..",import.meta.url)),hash=bytes=>createHash("sha256").update(bytes).digest("hex");
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

test("current SQL metadata and canonical PDIM bytes jointly recover in independent fresh processes",{timeout:120000},async t=>{
  const scratch=await mkdtemp(path.join(tmpdir(),"current-storage-joint-")),bundle=path.join(scratch,"retained"),sourceDir=path.join(scratch,"source"),targetDir=path.join(scratch,"restored");
  const pairId=randomUUID(),expectedFile=path.join(scratch,"expected.json");let cluster;const pools=[];const results={};
  await mkdir(bundle,{mode:0o700});await mkdir(sourceDir,{mode:0o700});await mkdir(targetDir,{mode:0o700});
  t.after(async()=>{try{await Promise.all(pools.map(pool=>pool.end()));}finally{try{await cluster?.stop();}finally{await rm(scratch,{recursive:true,force:true});}}});
  const worker=path.join(scratch,"current-joint-worker.mjs");
  await symlink(path.join(root,"node_modules"),path.join(scratch,"node_modules"),"dir");
  await build({entryPoints:[path.join(root,"tests/contracts/helpers-current-storage-joint-worker.ts")],outfile:worker,bundle:true,packages:"external",platform:"node",format:"esm",target:"node22",alias:{"@shared":path.join(root,"shared")},banner:{js:'import {createRequire as __ownedCreateRequire} from "node:module";const require=__ownedCreateRequire(import.meta.url);'},logLevel:"silent"});
  cluster=await startDisposablePostgres();const settings=cluster.pool.options;
  for(const name of ["joint_source","joint_restored","joint_protected"])await cluster.pool.query(`CREATE DATABASE ${name}`);
  const connect=name=>{const pool=new Pool({host:settings.host,port:5432,user:settings.user,database:name,max:3});pools.push(pool);return pool;};
  const source=connect("joint_source"),restored=connect("joint_restored"),protectedDb=connect("joint_protected");
  const url=name=>{const value=new URL(`postgresql://${encodeURIComponent(settings.user)}@localhost/${name}`);value.searchParams.set("host",settings.host);return value.toString();};
  await source.query(`CREATE TABLE users(id varchar PRIMARY KEY);INSERT INTO users VALUES('joint-owner-a'),('joint-owner-b');
    CREATE TABLE joint_recovery_marker(pair_id text PRIMARY KEY);INSERT INTO joint_recovery_marker VALUES('${pairId}');
    CREATE TABLE fabric_objects(id varchar PRIMARY KEY,chunk_ids jsonb NOT NULL DEFAULT '[]');
    CREATE TABLE fabric_chunks(id varchar PRIMARY KEY,object_id varchar,node_ids jsonb NOT NULL,size_bytes varchar NOT NULL,checksum varchar NOT NULL);
    CREATE TABLE fabric_storage_nodes(id varchar PRIMARY KEY,capacity_bytes varchar NOT NULL,used_bytes varchar NOT NULL,healthy boolean NOT NULL);`);
  for(const name of ["0096_fabric_deletion_journals.sql","0097_hybrid_storage_metadata.sql","0098_social_media_jobs.sql","0099_fabric_migration_journal.sql"])
    await source.query(await readFile(path.join(root,"migrations",name),"utf8"));
  await protectedDb.query("CREATE TABLE protected_sentinel(value text);INSERT INTO protected_sentinel VALUES('unchanged')");
  const runWorker=async(mode,cwd,database)=>{
    const port=await freePort(),child=spawn(process.execPath,[worker,mode],{
      cwd,env:{PATH:process.env.PATH,HOME:cwd,TMPDIR:cwd,NODE_ENV:"test",DATABASE_URL:url(database),SESSION_SECRET:"owned-current-recovery-fixture-secret-only",
        LOCAL_PDIM_PORT:String(port),PDIM_EXEC_URL:`http://127.0.0.1:${port}/api/redis/instances/local/exec`,PDIM_PERSISTENCE:"disk",
        JOINT_EXPECTED_FILE:expectedFile,JOINT_BUNDLE_DIR:bundle,JOINT_PAIR_ID:pairId,READINESS_ISOLATED_PG:"1",READINESS_LOCAL_CODECS:"1",READINESS_EGRESS_GUARD:"1",
        NODE_OPTIONS:`--import=${path.join(root,"scripts/readiness-egress-guard.mjs")}`,...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})},stdio:["ignore","pipe","pipe"]});
    let output="";child.stdout.on("data",bytes=>{output+=bytes});child.stderr.on("data",bytes=>{output+=bytes});
    await new Promise((resolve,reject)=>{let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill("SIGKILL")},45000);child.once("error",error=>{clearTimeout(timer);reject(error)});child.once("close",code=>{clearTimeout(timer);if(code===0&&!timedOut)resolve();else reject(Error(`Owned ${mode} worker ${timedOut?"timeout":"failed"}: ${output.slice(-9000)}`))});});
    const line=output.split("\n").find(line=>line.startsWith("JOINT_RESULT "));assert.ok(line,"actual worker must return an acceptance receipt");return JSON.parse(line.slice("JOINT_RESULT ".length));
  };
  await t.test("current service writes settle, then actual authoritative PDIM snapshot is exported through its pinned descriptor",async()=>{
    results.source=await runWorker("source",sourceDir,"joint_source");assert.equal(results.source.writersDrained,true);assert.equal(results.source.pinnedSnapshot,true);
    assert.equal((await source.query("SELECT count(*)::int AS n FROM hybrid_storage_files")).rows[0].n,5);
  });
  assert.equal(results.source?.writersDrained,true,"source checkpoint admission must pass before dump/restore");
  const tools=await loadDatabaseSubject("server/services/backup/postgresTools.ts"),dumper=await loadDatabaseSubject("server/services/backup/databaseDump.ts"),restoreTool=await loadDatabaseSubject("server/services/backup/databaseRestore.ts");
  const allowedDatabases=new Set(["joint_source","joint_restored","joint_protected"]),commands=[];
  const ownedSpawn=(command,args,options)=>{assert.ok(["pg_dump","psql"].includes(path.basename(command)));if(!args.includes("--version")){assert.equal(options.env.PGHOST,settings.host);assert.ok(allowedDatabases.has(options.env.PGDATABASE));}
    for(const name of ["DATABASE_URL","SESSION_SECRET","STRIPE_SECRET_KEY"])assert.equal(options.env[name],undefined);
    commands.push(path.basename(command));return spawn(command,args,{...options,timeout:20000});};
  const dependencies={env:{PATH:process.env.PATH,HOME:scratch,TMPDIR:scratch,LANG:"C"},spawn:ownedSpawn};let dump;
  await t.test("real production pg_dump helper uses a caller-pinned SQL snapshot after all owned writers stop",async()=>{
    const pinned=await source.connect();try{await pinned.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");const snapshotId=(await pinned.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
      dump=await dumper.generateUncommittedDatabaseDump(url("joint_source"),{tmpDirectory:scratch,spawn:ownedSpawn,snapshotId,selectTool:value=>tools.selectPgDumpForServer(value,dependencies)});
      await writeFile(path.join(bundle,"database.sql"),dump.bytes,{mode:0o600,flag:"wx"});assert.equal(dump.checksum,hash(dump.bytes));
    }finally{await pinned.query("ROLLBACK");pinned.release();}
  });
  const pdimFile=path.join(bundle,"pdim.json"),pdimManifestFile=path.join(bundle,"pdim.manifest.json");
  const pdimManifest=await writeSnapshotManifest(pdimFile,pdimManifestFile,{pairId,sqlSha256:dump.checksum});
  const pair={schemaVersion:1,pairId,sql:{bytes:dump.size,sha256:dump.checksum,sourceMajor:dump.sourceMajor},pdim:{bytes:pdimManifest.snapshotBytes,sha256:pdimManifest.snapshotSha256},pdimManifestSha256:hash(await readFile(pdimManifestFile))};
  await writeFile(path.join(bundle,"pair.json"),JSON.stringify(pair),{mode:0o600,flag:"wx"});
  for(const file of ["database.sql","pdim.json","pdim.manifest.json","pair.json"])assert.equal((await stat(path.join(bundle,file))).mode&0o777,0o600);
  // The pair manifest is a rehearsal bookkeeping receipt, not a new archive or
  // production restore API. Actual SQL/PDIM tools retain their original formats.
  const preflight=async({sqlFile=path.join(bundle,"database.sql"),snapshot=pdimFile,manifest=pdimManifestFile,pairing=pair}={})=>{
    const [sqlBytes,pdimBytes,manifestBytes]=await Promise.all([readFile(sqlFile),readFile(snapshot),readFile(manifest)]);
    assert.equal(pairing.schemaVersion,1,"pair version");assert.equal(pairing.pairId,pairId,"pair identity");
    assert.equal(sqlBytes.length,pairing.sql.bytes,"SQL bytes");assert.equal(hash(sqlBytes),pairing.sql.sha256,"SQL digest");
    assert.equal(pdimBytes.length,pairing.pdim.bytes,"PDIM bytes");assert.equal(hash(pdimBytes),pairing.pdim.sha256,"PDIM digest");
    assert.equal(hash(manifestBytes),pairing.pdimManifestSha256,"PDIM manifest digest");
    const metadata=JSON.parse(manifestBytes);assert.equal(metadata.content.pairId,pairing.pairId,"cross-store pair identity");assert.equal(metadata.content.sqlSha256,pairing.sql.sha256,"paired SQL digest");
    assert.equal(JSON.parse(pdimBytes)["recovery:pair-id"].value,pairing.pairId,"checkpoint semantic identity");return sqlBytes;
  };
  await t.test("corrupt SQL, corrupt PDIM and mismatched pair reject before protected SQL or file mutation",async()=>{
    const sentinel=path.join(scratch,"protected/data/local-pdim-store.json");await mkdir(path.dirname(sentinel),{recursive:true});await writeFile(sentinel,"protected-owned-target",{mode:0o600});
    const sqlBad=path.join(scratch,"sql-corrupt.sql"),pdimBad=path.join(scratch,"pdim-corrupt.json");
    const sql=Buffer.from(dump.bytes);sql[Math.floor(sql.length/2)]^=1;await writeFile(sqlBad,sql,{mode:0o600});
    const bytes=Buffer.from(await readFile(pdimFile));bytes[Math.floor(bytes.length/2)]^=1;await writeFile(pdimBad,bytes,{mode:0o600});
    const before=commands.length;
    await assert.rejects(preflight({sqlFile:sqlBad}),/SQL digest/);await assert.rejects(preflight({snapshot:pdimBad}),/PDIM digest/);
    await assert.rejects(preflight({pairing:{...pair,pairId:randomUUID()}}),/pair identity/);
    const crossed=path.join(scratch,"crossed.manifest.json"),different={...pdimManifest,content:{pairId:randomUUID(),sqlSha256:dump.checksum}};
    await writeFile(crossed,JSON.stringify(different),{mode:0o600});
    await assert.rejects(preflight({manifest:crossed,pairing:{...pair,pdimManifestSha256:hash(await readFile(crossed))}}),/cross-store pair identity/);
    assert.equal(commands.length,before,"admission denial never spawns psql");assert.equal(await readFile(sentinel,"utf8"),"protected-owned-target");
    assert.deepEqual((await protectedDb.query("SELECT value FROM protected_sentinel")).rows,[{value:"unchanged"}]);
  });
  await t.test("original process and original SQL/database directory are unavailable before independent restore",async()=>{
    await source.end();pools.splice(pools.indexOf(source),1);await cluster.pool.query("DROP DATABASE joint_source");await rm(sourceDir,{recursive:true,force:true});
    assert.equal((await cluster.pool.query("SELECT count(*)::int AS n FROM pg_database WHERE datname='joint_source'")).rows[0].n,0);
  });
  await t.test("verified paired bytes restore fresh SQL in one transaction and a fresh canonical owner from retained checkpoint only",async()=>{
    const admitted=await preflight(),staged=path.join(scratch,"verified-restore.sql"),validation=path.join(scratch,"verify-pair.sql");
    await writeFile(staged,admitted,{mode:0o600,flag:"wx"});
    await writeFile(validation,`DO $$ BEGIN IF (SELECT pair_id FROM public.joint_recovery_marker) <> '${pairId}' THEN RAISE EXCEPTION 'paired SQL identity mismatch'; END IF; END $$;`,{mode:0o600,flag:"wx"});
    const selected=await tools.selectPsqlForRestore(url("joint_restored"),dump.sourceMajor,dependencies);
    await restoreTool.runDatabaseRestore(selected.tool.path,["-X","-v","ON_ERROR_STOP=1","--single-transaction","-f",staged,"-f",validation],url("joint_restored"),{spawn:ownedSpawn,timeoutMs:20000});
    await restoreVerifiedSnapshot(pdimFile,pdimManifestFile,path.join(targetDir,"data/local-pdim-store.json"));
    results.recovered=await runWorker("verify",targetDir,"joint_restored");assert.equal(results.recovered.currentSqlMetadataRecovered,true);assert.equal(results.recovered.currentPdimBytesRecovered,true);
  });
  assert.equal(results.recovered?.currentSqlMetadataRecovered,true,"successful independent restore is required before a passing receipt");
  const evidence={schemaVersion:1,status:"passed",completedAt:new Date().toISOString(),sourceRevision:(await import("node:child_process")).execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
    scope:"Controlled writer-drained current-format PostgreSQL + disk-backed canonical PDIM recovery in fresh processes; no offsite, private Neon, Replit, migration or global capacity claim",
    source:results.source,recovered:results.recovered,pairedBundle:{sqlBytes:pair.sql.bytes,sqlSha256:pair.sql.sha256,pdimBytes:pair.pdim.bytes,pdimSha256:pair.pdim.sha256},
    admissionRejections:4,protectedTargetsUnchanged:true,originalSourceDestroyed:true,originalSourceProcessExited:true,nodeVersion:process.version,postgresMajor:dump.sourceMajor,privateArtifactModes:"0600",privatePayloadsRetainedInReports:false,
    actualTools:{pgDump:commands.includes("pg_dump"),psql:commands.includes("psql")},
    sourceHashes:Object.fromEntries(await Promise.all(["tests/current-storage-joint-recovery.test.mjs","tests/contracts/helpers-current-storage-joint-worker.ts","server/lib/localPdimServer.ts","server/services/hybridStorageService.ts","server/services/hybridStorageRepository.ts","server/services/hybridImmutableByteStore.ts","server/services/socialMediaJobRepository.ts","server/services/backup/databaseDump.ts","server/services/backup/databaseRestore.ts","server/services/backup/postgresTools.ts","scripts/pdim-content-recovery-drill-lib.mjs","server/pocket-dimension/fabric/infra/MigrationOutbox.ts","server/pocket-dimension/fabric/storage/PocketDimensionChunkStore.ts"].map(async name=>[name,hash(await readFile(path.join(root,name)))])))};
  const reportDir=path.join(root,"reports/recovery-acceptance/2026-10-27-current-sql-pdim");await mkdir(reportDir,{recursive:true});
  await writeFile(path.join(reportDir,`receipt-${Date.now()}.json`),JSON.stringify(evidence,null,2)+"\n");
});
