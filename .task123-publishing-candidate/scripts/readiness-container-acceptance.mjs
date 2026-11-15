// Actual production image rehearsal; no deployment or inherited app secrets.
// env -i PATH="$PATH" HOME=/tmp HTTP_PROXY="$HTTP_PROXY" HTTPS_PROXY="$HTTPS_PROXY" \
//   node scripts/readiness-container-acceptance.mjs MODEL_STATE_ROOT OUTPUT_DIRECTORY
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawnFixtureCommand} from './lib/fixture-command-input.mjs';
import {inspectColdRuntimeReadiness} from './lib/cold-runtime-readiness.mjs';

const forbidden = Object.keys(process.env).filter(key => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|REDIS|STRIPE|RESEND|SENDGRID|TWILIO|AWS|SENTRY|TOKEN|SECRET|KEY|NODE_OPTIONS/i.test(key));
if (forbidden.length) throw Error(`Refusing inherited credentials/configuration: ${forbidden.join(', ')}`);
if (process.argv.length !== 4) throw Error('Expected public model state root and output directory');
const root=process.cwd(), models=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync('/tmp/readiness-container-');
const id=randomBytes(6).toString('hex'), network=`maxbooster-proof-${id}`;
const db=`maxbooster-db-${id}`, app=`maxbooster-app-${id}`, image=`maxbooster-proof:${id}`;
const dockerConfig=path.join(temp,'docker-config');fs.mkdirSync(dockerConfig,{mode:0o700});
const commandEnv={PATH:process.env.PATH,HOME:temp,DOCKER_CONFIG:dockerConfig,MAXCORE_SERVING_RELEASE:'live-awareness',
  ...(process.env.HTTP_PROXY?{HTTP_PROXY:process.env.HTTP_PROXY}:{}),
  ...(process.env.HTTPS_PROXY?{HTTPS_PROXY:process.env.HTTPS_PROXY}:{})};
const pgImage='postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826';
const evidence={startedAt:new Date().toISOString(),scope:'Actual non-root production Docker image; isolated internal network, ephemeral schema and private copied public model state; no provider or production DB credentials',startup:'not_run'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(command,args,{input,inputFile,timeout=180000,quiet=false}={}) {
  const result=spawnFixtureCommand(command,args,{cwd:root,env:commandEnv,input,inputFile,encoding:'utf8',timeout,maxBuffer:16*1024*1024});
  // Never log command arguments: they may contain generated fixture credentials.
  if(!quiet)fs.appendFileSync(path.join(out,'container-setup.log'),`${command}: exit ${result.status}\n${result.stdout??''}${result.stderr??''}\n`);
  if(result.status!==0)throw Error(`${command} failed (${result.status}): ${(result.stderr??'').slice(-1200)}`);
  return result.stdout.trim();
}
const docker=(args,options)=>run('docker',args,options);
function request(route,port=5000,timeoutMs=4000) {
  const code=`const r=await fetch(${JSON.stringify(`http://127.0.0.1:${port}${route}`)},{signal:AbortSignal.timeout(${timeoutMs})});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text.slice(0,200)}console.log(JSON.stringify({status:r.status,body}));`;
  return JSON.parse(docker(['exec',app,'/app/.node_bin/node','--input-type=module','-e',code],{quiet:true,timeout:timeoutMs+6000}));
}
async function wait(route,predicate,port=5000,timeout=360000,requestTimeout=4000) {
  const until=Date.now()+timeout;let latest;
  while(Date.now()<until) {
    if(docker(['inspect','--format','{{.State.Running}}',app],{quiet:true})!=='true')throw Error('Cold image exited before health checks');
    try{latest=request(route,port,requestTimeout);if(predicate(latest))return latest;}catch{}
    await pause(2000);
  }
  throw Error(`Timed out waiting for ${route}; last status ${latest?.status}`);
}
try {
  run(process.execPath,['--import','tsx','-e',"import('./script/publish-release.ts').then(m=>m.verifyPreparedRelease(process.cwd()))"]);
  evidence.preparedArtifactIdentity='pass';
  evidence.engine=JSON.parse(docker(['version','--format','{{json .Server}}']));
  const buildArgs=['build','--build-arg','HTTP_PROXY','--build-arg','HTTPS_PROXY'];
  if(fs.existsSync('/etc/ssl/certs/ca-certificates.crt'))buildArgs.push('--secret','id=build_ca,src=/etc/ssl/certs/ca-certificates.crt');
  docker([...buildArgs,'-f','Dockerfile.prod','-t',image,'.'],{timeout:600000});
  const info=JSON.parse(docker(['image','inspect',image]))[0];
  evidence.image={tag:image,id:info.Id,size:info.Size,user:info.Config.User,command:info.Config.Cmd};
  if(info.Config.User!=='10001:10001'||JSON.stringify(info.Config.Cmd)!==JSON.stringify(['bash','start.sh']))throw Error('Image lost its non-root production startup contract');
  evidence.initialPayload=JSON.parse(docker(['run','--rm','--network','none',image,'/app/.node_bin/node','--input-type=module','-e',"import fs from 'node:fs';console.log(JSON.stringify({capsules:fs.existsSync('python_runtime.pdim')&&fs.existsSync('external_maxcore.pdim'),unpacked:fs.existsSync('node_modules')||fs.existsSync('python_runtime')||fs.existsSync('dist/index.mjs'),checkoutSource:fs.existsSync('server')||fs.existsSync('client'),node:process.version}))"]));
  if(!evidence.initialPayload.capsules||evidence.initialPayload.unpacked||evidence.initialPayload.checkoutSource)throw Error('Image is not a cold portable-payload image');
  docker(['network','create','--internal',network]);
  const password=randomBytes(24).toString('hex');
  docker(['run','-d','--name',db,'--network',network,'--network-alias','fixture-db','-e','POSTGRES_USER=packed','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=postgres',pgImage]);
  let dbReady=false;
  for(let i=0;i<60;i++){try{docker(['exec',db,'pg_isready','-U','packed'],{quiet:true});dbReady=true;break;}catch{await pause(500);}}
  if(!dbReady)throw Error('Disposable container PostgreSQL did not initialize');
  const databaseIp=docker(['inspect','--format',`{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,db],{quiet:true});
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(databaseIp))throw Error('Invalid private fixture database address');
  fs.mkdirSync(path.join(temp,'schema'));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');
  fs.writeFileSync(path.join(temp,'schema/schema.ts'),fs.readFileSync(path.join(root,'shared/schema.ts'),'utf8').replace('export * from "./readiness-schema";',''));
  fs.writeFileSync(path.join(temp,'drizzle.json'),JSON.stringify({dialect:'postgresql',schema:path.join(temp,'schema/schema.ts'),out:path.join(temp,'generated')}));
  run(process.execPath,['node_modules/drizzle-kit/bin.cjs','generate',`--config=${path.join(temp,'drizzle.json')}`]);
  const baselineMigrations=fs.readdirSync(path.join(temp,'generated')).filter(file=>file.endsWith('.sql')).sort();
  if(!baselineMigrations.length||baselineMigrations.some(file=>!fs.readFileSync(path.join(temp,'generated',file),'utf8').trim()))throw Error('Schema generator produced no usable SQL; exit zero alone does not establish a fixture schema');
  for(const file of baselineMigrations)docker(['exec','-i',db,'psql','-U','packed','-d','postgres','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync(path.join(temp,'generated',file),'utf8')});
  for(const file of fs.readdirSync(path.join(root,'migrations')).filter(file=>/^\d+.*\.sql$/.test(file)&&Number(file.split('_')[0])>=20).sort())docker(['exec','-i',db,'psql','-U','packed','-d','postgres','-v','ON_ERROR_STOP=1'],{input:fs.readFileSync(path.join(root,'migrations',file),'utf8')});
  fs.unlinkSync(path.join(temp,'node_modules'));evidence.ephemeralDatabase='pass';
  const fixture=path.join(temp,'fixture');fs.mkdirSync(fixture);
  const guard=fs.readFileSync(path.join(root,'scripts/readiness-egress-guard.mjs'),'utf8').split('for (const method of [')[0].replace('const allowedHosts = new Set([',`const allowedHosts = new Set([${JSON.stringify(databaseIp)},`)+'\nsyncBuiltinESMExports();\n';
  fs.writeFileSync(path.join(fixture,'guard.mjs'),guard);
  fs.mkdirSync(path.join(fixture,'lib'));
  fs.copyFileSync(path.join(root,'scripts/lib/isolated-codec-process.mjs'),path.join(fixture,'lib/isolated-codec-process.mjs'));
  fs.mkdirSync(path.join(fixture,'python'));
  fs.writeFileSync(path.join(fixture,'python/sitecustomize.py'),`import socket\n_original=socket.socket.connect\ndef _connect(self,address):\n    if isinstance(address,tuple) and address[0] not in ('localhost','127.0.0.1','::1',${JSON.stringify(databaseIp)}):\n        raise OSError('container-rehearsal-egress-denied')\n    return _original(self,address)\nsocket.socket.connect=_connect\n`);
  const state=path.join(temp,'state');fs.mkdirSync(state,{mode:0o700});fs.cpSync(models,path.join(state,'models'),{recursive:true,verbatimSymlinks:true});
  fs.rmSync(path.join(state,'models/candidate_registry/selected.json'),{force:true});
  evidence.modelState={mode:'private copied public state',selectedPointer:'cleared only in copy',immutableEvidenceRewritten:false};
  const env={DATABASE_URL:`postgresql://packed:${password}@${databaseIp}:5432/postgres`,SESSION_SECRET:randomBytes(48).toString('hex'),READINESS_ISOLATED_PG:'1',READINESS_EGRESS_GUARD:'1',NODE_OPTIONS:'--import=/tmp/fixture/guard.mjs',PYTHONPATH:'/tmp/fixture/python',
    MAXCORE_PRIVATE_STATE_DIR:'/var/lib/maxcore',MAXCORE_LOCAL:'1',PDIM_FORCE_REMOTE:'0',MAXCORE_SERVING_RELEASE:'live-awareness',LOCAL_PDIM_STORE_FILE:'/var/lib/maxcore/pdim.json',ENABLE_BACKUPS:'false',ENABLE_FAN_DELIVERY_WORKER:'false',ACME_ENABLED:'false',DNS_NODE_LOCAL:'0',DISABLE_CLUSTER:'true',DB_POOL_SIZE:'2',NODE_CLUSTER_WORKERS:'1',MAXCORE_LOCAL_CLUSTER_WORKERS:'1',DEPLOY_START_BUDGET_SECONDS:'360',PORT:'5000',APP_PORT:'5000',APP_URL:'http://localhost:5000',PUBLIC_APP_URL:'http://localhost:5000'};
  docker(['run','-d','--name',app,'--network',network,'--cap-drop','ALL','--security-opt','no-new-privileges','--cpus','2','--memory','6g',...Object.entries(env).flatMap(([key,value])=>['-e',`${key}=${value}`]),'--entrypoint','bash',image,'-c','while [ ! -e /tmp/rehearsal-ready ]; do sleep 0.2; done; exec bash start.sh']);
  // Header ownership is set while creating fixture archives, without granting
  // root/capabilities to the cold application process or mounting host paths.
  docker(['exec',app,'mkdir','-p','/tmp/fixture']);
  for(const [source,target,name] of [[fixture,'/tmp/fixture','fixture.tar'],[state,'/var/lib/maxcore','state.tar']]) {
    const archive=path.join(temp,name);
    run('tar',['--owner=10001','--group=10001','-C',source,'-cf',archive,'.']);
    docker(['cp','-a','-',`${app}:${target}`],{inputFile:archive});
    fs.unlinkSync(archive);
  }
  const mounts=JSON.parse(docker(['inspect','--format','{{json .Mounts}}',app]));
  if(mounts.length)throw Error('Cold application container unexpectedly has host/dependency mounts');
  evidence.checkoutDependencyFallback=false;evidence.internalNetwork=JSON.parse(docker(['network','inspect',network]))[0].Internal;
  if(!evidence.internalNetwork)throw Error('Rehearsal network permits external routing');
  docker(['exec',app,'touch','/tmp/rehearsal-ready']);evidence.startup='running';
  evidence.health=await wait('/api/health',r=>r.status===200);
  evidence.csrf=await wait('/api/csrf-token',r=>r.status===200&&typeof r.body.csrfToken==='string');
  // Do not persist the generated CSRF value in exported evidence.
  evidence.csrf={status:evidence.csrf.status,tokenPresent:true};
  evidence.frontend=request('/');evidence.anonymousAuth=request('/api/auth/me');evidence.protectedApi=request('/api/projects');
  evidence.maxcoreReadiness=await wait('/api/system/readiness',r=>r.status===200||r.status===503,8090);
  evidence.maxcoreLiveness=await wait('/healthz',r=>r.status===200&&r.body?.ok===true,8090);
  evidence.modelLiveness=await wait('/health',r=>r.status===200&&r.body?.status==='healthy',9878);
  evidence.modelReadiness=await wait('/ready',r=>r.status===200||r.status===503,9878);
  const platformHash=createHash('sha256').update(fs.readFileSync(path.join(root,'shared/social-platform-optimization.json'))).digest('hex');
  evidence.runtimeAssets={platformRegistry:JSON.parse(docker(['exec',app,'node','--input-type=module','-e',`import fs from 'node:fs';import{createHash}from'node:crypto';const raw=fs.readFileSync('shared/social-platform-optimization.json');const sha256=createHash('sha256').update(raw).digest('hex');console.log(JSON.stringify({hashMatches:sha256===${JSON.stringify(platformHash)},sha256,revision:JSON.parse(raw).revision}));`]))};
  // This endpoint combines a three-second local health-probe bound and a
  // five-second awareness bound; only this request receives a 10-second limit.
  evidence.readiness=await wait('/api/ready',r=>inspectColdRuntimeReadiness({...evidence,readiness:r}).accepted,5000,90000,10000);
  evidence.readinessContract=inspectColdRuntimeReadiness(evidence);
  evidence.restored=JSON.parse(docker(['exec',app,'node','--input-type=module','-e',"import fs from 'node:fs';console.log(JSON.stringify(Object.fromEntries(['node_modules','python_runtime','external/maxcore','external/pdim','dist/index.mjs','bin/boosterstate'].map(p=>[p,fs.existsSync(p)]))))"]));
  if(Object.values(evidence.restored).some(value=>!value)||evidence.protectedApi.status!==401||evidence.frontend.status!==200)throw Error('Cold image restoration/frontend/auth contract failed');
  evidence.egressGuard=docker(['exec',app,'node','--input-type=module','-e',"import net from 'node:net';try{net.connect({host:'api.stripe.com',port:443});process.exit(2)}catch(e){if(!String(e.message).includes('readiness-egress-denied'))throw e;console.log('external-tcp-denied')}"]);
  evidence.startup='pass';evidence.productionReady=evidence.readiness.status===200;evidence.modelCapability=evidence.modelReadiness.status===200?'pass':'not_ready';
}catch(error){evidence.startup='fail';evidence.error=error.message;process.exitCode=1;}
finally {
  try{fs.writeFileSync(path.join(out,'container-startup.log'),docker(['logs',app],{quiet:true}));}catch{}
  const cleanup=[];
  const cleanupCommands=[['rm','-fv',app],['rm','-fv',db],['network','rm',network]];
  if(evidence.startup!=='pass')cleanupCommands.push(['image','rm',image]);
  else evidence.image.retained=true;
  for(const args of cleanupCommands){try{docker(args,{quiet:true});cleanup.push({action:args.slice(0,2).join(' '),passed:true});}catch{cleanup.push({action:args.slice(0,2).join(' '),passed:false});}}
  evidence.cleanup=cleanup;fs.rmSync(temp,{recursive:true,force:true});evidence.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'container-acceptance.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({startup:evidence.startup,productionReady:evidence.productionReady,error:evidence.error}));
}
