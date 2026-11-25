import datetime, hashlib, json, os, pathlib, sys, tempfile
root=pathlib.Path('/workspace/maxbooster7.5')
sys.path.insert(0,str(root/'scripts/testing'))
from common import run_command, write_json, source_inputs
out=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)==2 else root/'reports/release-rehearsal/2026-10-27-final'
if (out/'summary.json').exists():
 raise RuntimeError('Evidence directory already contains an attempt; choose a new output directory')
out.mkdir(parents=True,exist_ok=True)
base={key:os.environ[key] for key in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','NPM_CONFIG_CAFILE') if os.environ.get(key)}
base.update(MAXCORE_SERVING_RELEASE='live-awareness',RELEASE_CAPSULE_THREADS='2',BOOSTERSTATE_PORTABLE_RUST_DIR='/workspace/.rust-toolchain/1.93.1')
base.setdefault('NODE_EXTRA_CA_CERTS','/etc/ssl/certs/ca-certificates.crt')
receipt={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Fresh credential-free publicbuildprofile; prepared portable payload and disposable local cold startup; no Replit deployment or global capacity claim','productionReady':False,'runs':[]}
receipt['sourceRevision']=__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
receipt['previousAttempt']='reports/release-rehearsal/2026-10-27/summary.json'
receipt['retainedAttempts']=['reports/release-rehearsal/2026-10-26/summary.json','reports/release-rehearsal/2026-10-27/summary.json']
receipt['inputScope']='Credential-free live-awareness public build; application/provider/database secrets are not forwarded'
driver=pathlib.Path(__file__).read_bytes()
(out/'execution-driver.py').write_bytes(driver)
receipt['executionDriverSha256']=hashlib.sha256(driver).hexdigest()
inputs=source_inputs()
receipt['sourceInputsSha256']=inputs['sha256']
write_json(out/'source-code-inputs.json',inputs)
write_json(out/'summary.json',receipt)
for label,command,timeout,env in [
 ('prepare',['npm','run','release:prepare'],1800,base),
 ('verify',['npm','run','release:verify'],180,base),
]:
 result=run_command(command,out/(label+'.txt'),timeout,extra_env=env)
 receipt['runs'].append(dict(result,id=label));write_json(out/'summary.json',receipt)
 print(label,result['status'],result['durationSeconds'],flush=True)
 if result['exitCode']!=0:
  receipt['status']='failed';receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();write_json(out/'summary.json',receipt);sys.exit(result['exitCode'])
manifest=json.loads((root/'.prepared-release/release.json').read_text())
source=json.dumps(manifest['source'],sort_keys=True,separators=(',',':')).encode()
receipt['release']={'createdAt':manifest['createdAt'],'sourceSha256':hashlib.sha256(source).hexdigest(),'sourceEntries':len(manifest['source']),'payloadEntries':len(manifest['payload']),'payloadBytes':sum(x['bytes'] for x in manifest['payload']),'buildEnvironment':manifest['buildEnvironment'],'modelServing':manifest['modelServing']}
write_json(out/'source-inputs.json',manifest['source'])
with tempfile.TemporaryDirectory(prefix='maxbooster-empty-public-state-') as state:
 result=run_command(['node','scripts/readiness-packed-acceptance.mjs',state,str(out/'cold')],out/'cold-runner.txt',1500)
 receipt['runs'].append(dict(result,id='cold'))
 coldpath=out/'cold/packed-acceptance.json'
 if coldpath.is_file():
  cold=json.loads(coldpath.read_text())
  receipt['coldStartup']=cold.get('startup');receipt['productionReady']=cold.get('productionReady',False)
  receipt['readinessScope']=cold.get('readinessGate')
 current=None
 if result['exitCode']==0:
  current=run_command(['npm','run','release:verify'],out/'verify-after-cold.txt',180,extra_env=base)
  receipt['runs'].append(dict(current,id='verify-after-cold'))
  receipt['preparedArtifactCurrentAfterCold']=current['exitCode']==0
 receipt['status']='passed_cold_payload_scope' if result['exitCode']==0 and current and current['exitCode']==0 else 'failed'
 receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 write_json(out/'summary.json',receipt)
 print('cold',result['status'],result['durationSeconds'],flush=True)
 sys.exit(result['exitCode'] or (current['exitCode'] if current else 0))
