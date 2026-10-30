// Local cold-runtime rehearsal. Never deploys or inherits application secrets.
// env -i PATH="$PATH" HOME=/tmp LD_LIBRARY_PATH="$LD_LIBRARY_PATH" node scripts/readiness-packed-acceptance.mjs MODEL_STATE_ROOT OUTPUT_DIRECTORY
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomBytes,createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import pg from 'pg';
import {inspectColdRuntimeReadiness} from './lib/cold-runtime-readiness.mjs';
import {createOwnedProcessTracker} from '../script/deployment/owned-processes.mjs';

const forbidden = Object.keys(process.env).filter(key => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|REDIS|STRIPE|RESEND|SENDGRID|TWILIO|AWS|SENTRY|TOKEN|SECRET|KEY|NODE_OPTIONS/i.test(key));
if (forbidden.length) throw Error(`Refusing inherited runtime credentials/configuration: ${forbidden.join(', ')}`);
if (process.argv.length !== 4) throw Error('Expected public model state root and output directory');
const root = process.cwd(), models = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
fs.mkdirSync(out, {recursive:true});
const temp = fs.mkdtempSync('/tmp/readiness-packed-'), cold = path.join(temp,'cold');
const evidence = {startedAt:new Date().toISOString(), scope:'Cold payload only; ephemeral PostgreSQL and private copied public model state; no provider credentials', startup:'not_run'};
let app, client, postgresStarted = false, owned, ownershipPoll;
const appLog = fs.openSync(path.join(out,'packed-startup.log'),'w');
function run(command,args,env,cwd=root) {
  const result=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  fs.appendFileSync(path.join(out,'packed-setup.log'), `${command} ${args.join(' ')}\n${result.stdout??''}${result.stderr??''}\n`);
  if(result.status!==0) throw Error(`${command} failed (${result.status}): ${(result.stderr??'').slice(-1000)}`);
}
async function port() { return new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}); }
const names=['PORT','LOCAL_PDIM_PORT','VIDEO_DIFFUSION_PORT','MAXCORE_LOCAL_PORT','BOOSTERSTATE_SIDECAR_PORT','MODEL_API_PORT','MODEL_API_HEALTH_PORT','PYTHON_AI_PORT'];
const ports={}; for(const name of names) { let p; do { p=await port(); } while(Object.values(ports).includes(String(p))); ports[name]=String(p); }
let pgPort; do { pgPort=await port(); } while(Object.values(ports).includes(String(pgPort)));
const base={PATH:process.env.PATH,HOME:path.join(temp,'home'),LANG:'C',TZ:'UTC',...(process.env.LD_LIBRARY_PATH?{LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH}:{})};
async function request(route, options={}, targetPort=ports.PORT) {
  const started=Date.now();
  // The actual readiness route bounds health probes at3s, then awareness at5s.
  // Preserve that existing contract plus2s transport margin; other calls stay2s.
  const r=await fetch(`http://127.0.0.1:${targetPort}${route}`,{...options,signal:AbortSignal.timeout(route==='/api/ready'?10000:2000)});
  const text=await r.text(); let body; try {body=JSON.parse(text);} catch {body=text.slice(0,200);}
  return {status:r.status,body,elapsedMs:Date.now()-started};
}
async function wait(route,predicate,timeout=180000,targetPort=ports.PORT) {
  const until=Date.now()+timeout;let latest;
  while(Date.now()<until) {if(app.exitCode!==null) throw Error(`Packed runtime exited ${app.exitCode}`);try{latest=await request(route,{},targetPort);if(predicate(latest))return latest;}catch{} await new Promise(r=>setTimeout(r,500));}
  throw Error(`Timed out waiting for ${route}; last status ${latest?.status}`);
}
try {
  fs.mkdirSync(base.HOME);fs.mkdirSync(path.join(temp,'schema'));fs.mkdirSync(path.join(temp,'state'));
  run(process.execPath,['--import','tsx','-e',"import('./script/publish-release.ts').then(m=>m.verifyPreparedRelease(process.cwd()))"],{...base,MAXCORE_SERVING_RELEASE:'live-awareness'});
  evidence.preparedArtifactIdentity='pass';
  fs.cpSync(path.join(root,'.prepared-release/payload'),cold,{recursive:true,verbatimSymlinks:true});
  fs.writeFileSync(path.join(cold,'.replit'),`[[ports]]\nlocalPort = ${ports.PORT}\nexternalPort = 80\n`);
  evidence.portMapping = 'Explicit ephemeral platform port table; original payload snapshot retained';
  evidence.initialPayloadOnly = !fs.existsSync(path.join(cold,'node_modules')) && !fs.existsSync(path.join(cold,'python_runtime')) && !fs.existsSync(path.join(cold,'dist/index.mjs'));
  if(!evidence.initialPayloadOnly) throw Error('Cold target already includes unpacked runtime/application');
  fs.cpSync(models,path.join(temp,'state/models'),{recursive:true,verbatimSymlinks:true});
  // The mutable serving pointer contains absolute run paths. Retaining it here
  // would let the rehearsal read the original model state outside its copy.
  // Keep every immutable checkpoint/report/certificate byte unchanged; fresh
  // local discovery must enforce its existing parent-root checks on this copy.
  fs.rmSync(path.join(temp,'state/models/candidate_registry/selected.json'),{force:true});
  evidence.modelState = {mode:'private copied state',selectedPointer:'cleared in copy only',
    immutableEvidenceRewritten:false,capability:'unverified',
    selection:'Local discovery must revalidate parent IDs, checkpoint digests and public certificates under the copied root. Cold runtime boot alone does not prove model capability.'};
  // The outer setup uses the checkout tools only to initialize a disposable DB;
  // the child runtime below has no source/dependency symlinks to the checkout.
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  fs.writeFileSync(path.join(temp,'schema/schema.ts'),fs.readFileSync(path.join(root,'shared/schema.ts'),'utf8').replace('export * from "./readiness-schema";',''));
  fs.writeFileSync(path.join(temp,'drizzle.json'),JSON.stringify({dialect:'postgresql',schema:path.join(temp,'schema/schema.ts'),out:path.join(temp,'generated')}));
  run(process.execPath,['node_modules/drizzle-kit/bin.cjs','generate',`--config=${path.join(temp,'drizzle.json')}`],base);
  const baselineMigrations=fs.readdirSync(path.join(temp,'generated')).filter(file=>file.endsWith('.sql')).sort();
  if(!baselineMigrations.length||baselineMigrations.some(file=>!fs.readFileSync(path.join(temp,'generated',file),'utf8').trim()))throw Error('Schema generator produced no usable SQL; exit zero alone does not establish a fixture schema');
  run('initdb',['-D',path.join(temp,'pg'),'-U','packed','--auth=trust','--no-locale','--encoding=UTF8'],base);
  run('pg_ctl',['-D',path.join(temp,'pg'),'-l',path.join(out,'packed-postgres.log'),'-o',`-h 127.0.0.1 -k ${temp} -p ${pgPort} -c shared_buffers=32MB -c max_connections=40`,'-w','start'],base);postgresStarted=true;
  client=new pg.Client({host:'127.0.0.1',port:pgPort,user:'packed',database:'postgres'});await client.connect();
  for(const file of baselineMigrations) await client.query(fs.readFileSync(path.join(temp,'generated',file),'utf8'));
  for(const file of fs.readdirSync(path.join(root,'migrations')).filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.split('_')[0])>=20).sort()) await client.query(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  evidence.ephemeralDatabase='pass';
  // Schema generation needed checkout dependencies above. Remove that setup
  // link before boot: otherwise Node could climb from cold/ to its parent and
  // silently resolve a missing packed dependency from the source checkout.
  fs.unlinkSync(path.join(temp,'node_modules'));
  evidence.checkoutDependencyFallback=false;
  // Keep the existing TCP/TLS/UDP transport guard. Unlike the source-only
  // fixture, the cold executive must launch its real local child runtimes.
  const guard=fs.readFileSync(path.join(root,'scripts/readiness-egress-guard.mjs'),'utf8').split('for (const method of [')[0]+'\nsyncBuiltinESMExports();\n';
  fs.mkdirSync(path.join(temp,'lib'));
  fs.copyFileSync(path.join(root,'scripts/lib/isolated-codec-process.mjs'),path.join(temp,'lib/isolated-codec-process.mjs'));
  fs.writeFileSync(path.join(temp,'loopback-guard.mjs'),guard);
  fs.mkdirSync(path.join(temp,'python-guard'));
  fs.writeFileSync(path.join(temp,'python-guard/sitecustomize.py'),`import socket\n_original_connect=socket.socket.connect\ndef _connect(self,address):\n    if isinstance(address,tuple) and address[0] not in ('localhost','127.0.0.1','::1'):\n        raise OSError('packed-rehearsal-egress-denied')\n    return _original_connect(self,address)\nsocket.socket.connect=_connect\n`);
  const env={...base,...ports,NODE_ENV:'production',NODE_OPTIONS:`--import=${path.join(temp,'loopback-guard.mjs')}`,PYTHONPATH:path.join(temp,'python-guard'),READINESS_ISOLATED_PG:'1',READINESS_EGRESS_GUARD:'1',
    DATABASE_URL:`postgresql://packed@127.0.0.1:${pgPort}/postgres`,SESSION_SECRET:randomBytes(48).toString('hex'),MAXCORE_LOCAL:'1',PDIM_FORCE_REMOTE:'0',MAXCORE_SERVING_RELEASE:'live-awareness',
    MAXCORE_PRIVATE_STATE_DIR:path.join(temp,'state'),LOCAL_PDIM_STORE_FILE:path.join(temp,'pdim.json'),ENABLE_BACKUPS:'false',ENABLE_FAN_DELIVERY_WORKER:'false',ACME_ENABLED:'false',DNS_NODE_LOCAL:'0',DISABLE_CLUSTER:'true',DB_POOL_SIZE:'2',
    APP_PORT:ports.PORT,APP_URL:`http://localhost:${ports.PORT}`,PUBLIC_APP_URL:`http://localhost:${ports.PORT}`,NODE_CLUSTER_WORKERS:'1',MAXCORE_LOCAL_CLUSTER_WORKERS:'1',DEPLOY_START_BUDGET_SECONDS:'360'};
  app=spawn('bash',['start.sh'],{cwd:cold,env,detached:true,stdio:['ignore',appLog,appLog]});
  owned=createOwnedProcessTracker(app.pid);
  ownershipPoll=setInterval(()=>owned.capture(),250);ownershipPoll.unref();
  evidence.startup='running'; evidence.health=await wait('/api/health',r=>r.status===200,300000);
  await wait('/api/csrf-token',r=>r.status===200&&typeof r.body.csrfToken==='string',180000);
  const registry='shared/social-platform-optimization.json';
  const registryBytes=fs.readFileSync(path.join(cold,registry));
  const sourceRegistry=fs.readFileSync(path.join(root,registry));
  const registryHash=bytes=>createHash('sha256').update(bytes).digest('hex');
  evidence.runtimeAssets={platformRegistry:{hashMatches:registryHash(registryBytes)===registryHash(sourceRegistry),revision:JSON.parse(registryBytes).revision,sha256:registryHash(registryBytes)}};
  evidence.frontend=await request('/'); evidence.anonymousAuth=await request('/api/auth/me'); evidence.protectedApi=await request('/api/projects');
  // Observe the actual capability gate. A weak checkpoint must remain503;
  // recording it as ready would conceal the exact release blocker being tested.
  await new Promise(r=>setTimeout(r,15000));
  evidence.maxcoreLiveness=await wait('/healthz',r=>r.status===200&&r.body?.ok===true,180000,ports.MAXCORE_LOCAL_PORT);
  evidence.modelLiveness=await wait('/health',r=>r.status===200&&r.body?.status==='healthy',180000,ports.MODEL_API_PORT);
  evidence.maxcoreReadiness=await wait('/api/system/readiness',r=>r.status===200||r.status===503,180000,ports.MAXCORE_LOCAL_PORT);
  evidence.modelReadiness=await wait('/ready',r=>r.status===200||r.status===503,180000,ports.MODEL_API_PORT);
  evidence.readinessRequestBudgetMs=10000;
  await wait('/api/ready',r=>{
    evidence.readiness=r;
    evidence.readinessGate=inspectColdRuntimeReadiness(evidence);
    return evidence.readinessGate.accepted;
  },180000);
  evidence.modelState.capability=evidence.modelReadiness.status===200?'pass':'not_ready';
  evidence.restored=Object.fromEntries(['node_modules','python_runtime','external/maxcore','external/pdim','dist/index.mjs','dist/deployment/executive.mjs','bin/boosterstate',registry].map(file=>[file,fs.existsSync(path.join(cold,file))]));
  if(Object.values(evidence.restored).some(value=>!value)) throw Error('A required packed runtime artifact was not restored');
  if(evidence.protectedApi.status!==401) throw Error('Anonymous protected API did not reject access');
  evidence.startup='pass'; evidence.productionReady=evidence.readiness.status===200;
} catch(error) {evidence.error=error.message; evidence.startup='fail';process.exitCode=1;}
finally {
  if(app?.pid) {
    try {
      evidence.processCleanup=await owned.stop({graceMs:32000,descendantGraceMs:2000});
      if(evidence.processCleanup.remaining.length)throw Error('Owned cold runtime descendants are still running');
    } catch(error) {evidence.cleanupError=error.message;process.exitCode=1;}
  }
  clearInterval(ownershipPoll);
  if(client) await client.end().catch(()=>{});
  if(postgresStarted) try{run('pg_ctl',['-D',path.join(temp,'pg'),'-m','immediate','-w','stop'],base);}catch(error){evidence.cleanupError=error.message;process.exitCode=1;}
  fs.closeSync(appLog);
  if(!evidence.cleanupError)fs.rmSync(temp,{recursive:true,force:true});
  evidence.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'packed-acceptance.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({startup:evidence.startup,productionReady:evidence.productionReady,error:evidence.error}));
}
