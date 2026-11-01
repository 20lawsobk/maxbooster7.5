import datetime, hashlib, json, os, pathlib, sys, tempfile, subprocess
root=pathlib.Path('/workspace/maxbooster7.5')
sys.path.insert(0,str(root/'scripts/testing'))
from common import run_command, write_json, source_inputs, sanitize
out=pathlib.Path(sys.argv[1]).resolve() if len(sys.argv)==2 else root/'reports/release-rehearsal/2026-10-27-runtime-uploads-final'
if (out/'summary.json').exists():
 raise RuntimeError('Evidence directory already contains an attempt; choose a new output directory')
out.mkdir(parents=True,exist_ok=True)
base={key:os.environ[key] for key in ('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','NPM_CONFIG_CAFILE') if os.environ.get(key)}
base.update(MAXCORE_SERVING_RELEASE='live-awareness',RELEASE_CAPSULE_THREADS='4',BOOSTERSTATE_PORTABLE_RUST_DIR='/workspace/.rust-toolchain/1.93.1')
base.setdefault('NODE_EXTRA_CA_CERTS','/etc/ssl/certs/ca-certificates.crt')
receipt={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Fresh credential-free publicbuildprofile; prepared portable payload and disposable local cold startup; no Replit deployment or global capacity claim','productionReady':False,'runs':[]}
receipt['sourceRevision']=__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
receipt['previousAttempt']='reports/release-rehearsal/2026-10-27-analytics-dependencies-final/summary.json'
receipt['retainedAttempts']=['reports/release-rehearsal/2026-10-26/summary.json','reports/release-rehearsal/2026-10-27/summary.json','reports/release-rehearsal/2026-10-27-final/summary.json','reports/release-rehearsal/2026-10-27-platform-final/summary.json','reports/release-rehearsal/2026-10-27-published-guard-final/summary.json','reports/release-rehearsal/2026-10-27-analytics-dependencies-final/summary.json']
receipt['inputScope']='Credential-free live-awareness public build; application/provider/database secrets are not forwarded'
driver=pathlib.Path(__file__).read_bytes()
(out/'execution-driver.py').write_bytes(driver)
receipt['executionDriverSha256']=hashlib.sha256(driver).hexdigest()
write_json(out/'summary.json',receipt)
inputs=None
def admitted_snapshot(label):
 command=['node','--import','tsx','--input-type=module','-e',
  "import {inventory,sourceIncluded} from './script/lib/releaseInventory.ts'; console.log(JSON.stringify(await inventory(process.cwd(),sourceIncluded)));" ]
 logfile=out/('admitted-'+label+'-observation.txt')
 observed=run_command(command,logfile,180)
 receipt.setdefault('admittedObservations',[]).append(dict(observed,id=label))
 if observed['exitCode']:
  raise RuntimeError('Admitted inventory observation failed; no partial identity accepted')
 value=json.loads(logfile.read_text())
 write_json(out/('admitted-'+label+'.json'),value)
 receipt['admitted'+label.title()+'Sha256']=hashlib.sha256((out/('admitted-'+label+'.json')).read_bytes()).hexdigest()
 return value
admitted_before=None
receipt['admittedSnapshotScope']='Full release-admitted inventory immediately before command and after final command/failure; separate from preparer in-memory snapshot'
def finish(code):
 try:
  after=source_inputs()
  write_json(out/'source-code-inputs-after.json',after)
  receipt['sourceInputsAfterSha256']=after['sha256']
  receipt['sourceInputsUnchanged']=inputs is not None and inputs['sha256']==after['sha256']
 except Exception as error:
  receipt['sourceInputsAfterError']=sanitize(str(error))
  receipt['sourceInputsUnchanged']=False
  code=code or 1
 try:
  admitted_after=admitted_snapshot('after')
  before_by={value['path']:value for value in admitted_before or []}
  after_by={value['path']:value for value in admitted_after}
  changes={'comparison':'complete' if admitted_before is not None else 'unavailable_before',
   'added':[after_by[key] for key in sorted(after_by.keys()-before_by.keys())] if admitted_before is not None else None,
   'removed':[before_by[key] for key in sorted(before_by.keys()-after_by.keys())] if admitted_before is not None else None,
   'changed':[{'path':key,'before':before_by[key],'after':after_by[key]} for key in sorted(before_by.keys()&after_by.keys()) if before_by[key]!=after_by[key]] if admitted_before is not None else None}
  write_json(out/'admitted-diff.json',changes)
  receipt['admittedInputsUnchanged']=admitted_before is not None and not any(changes[key] for key in ('added','removed','changed'))
  if not receipt['admittedInputsUnchanged']:
   receipt['status']='failed_admitted_source_drift' if admitted_before is not None else 'failed_admitted_observation'
   code=code or 1
 except Exception as error:
  receipt['admittedAfterError']=sanitize(str(error))
  receipt['admittedInputsUnchanged']=False
  code=code or 1
 if not receipt['sourceInputsUnchanged']:
  receipt['status']='failed_source_drift' if inputs is not None and 'sourceInputsAfterSha256' in receipt else 'failed_source_observation'
  code=code or 1
 receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 write_json(out/'summary.json',receipt)
 sys.exit(code)
def execute():
 global inputs,admitted_before
 inputs=source_inputs()
 receipt['sourceInputsSha256']=inputs['sha256']
 write_json(out/'source-code-inputs.json',inputs)
 admitted_before=admitted_snapshot('before')
 write_json(out/'summary.json',receipt)
 for label,command,timeout,env in [
  ('prepare',['npm','run','release:prepare'],1800,base),
  ('verify',['npm','run','release:verify'],180,base),
 ]:
  result=run_command(command,out/(label+'.txt'),timeout,extra_env=env)
  receipt['runs'].append(dict(result,id=label));write_json(out/'summary.json',receipt)
  print(label,result['status'],result['durationSeconds'],flush=True)
  if result['exitCode']!=0:
   receipt['status']='failed'
   return result['exitCode']
 manifest=json.loads((root/'.prepared-release/release.json').read_text())
 write_json(out/'release-manifest.json',manifest)
 receipt['releaseManifestSha256']=hashlib.sha256((out/'release-manifest.json').read_bytes()).hexdigest()
 source=json.dumps(manifest['source'],sort_keys=True,separators=(',',':')).encode()
 receipt['release']={'createdAt':manifest['createdAt'],'sourceSha256':hashlib.sha256(source).hexdigest(),'sourceEntries':len(manifest['source']),'payloadEntries':len(manifest['payload']),'payloadBytes':sum(x['bytes'] for x in manifest['payload']),'buildEnvironment':manifest['buildEnvironment'],'modelServing':manifest['modelServing']}
 write_json(out/'source-inputs.json',manifest['source'])
 with tempfile.TemporaryDirectory(prefix='maxbooster-empty-public-state-') as state:
  result=run_command(['node','scripts/readiness-packed-acceptance.mjs',state,str(out/'cold')],out/'cold-runner.txt',1500)
  receipt['runs'].append(dict(result,id='cold'))
  coldpath=out/'cold/packed-acceptance.json'
  if coldpath.is_file():
   cold=json.loads(coldpath.read_text())
   receipt['coldStartup']=cold.get('startup');receipt['coldReportedProductionReady']=cold.get('productionReady',False)
   receipt['readinessScope']=cold.get('readinessGate')
  current=None
  if result['exitCode']==0:
   current=run_command(['npm','run','release:verify'],out/'verify-after-cold.txt',180,extra_env=base)
   receipt['runs'].append(dict(current,id='verify-after-cold'))
   receipt['preparedArtifactCurrentAfterCold']=current['exitCode']==0
  receipt['status']='passed_cold_payload_scope' if result['exitCode']==0 and current and current['exitCode']==0 else 'failed'
  write_json(out/'summary.json',receipt)
  print('cold',result['status'],result['durationSeconds'],flush=True)
  return result['exitCode'] or (current['exitCode'] if current else 0)

code=1
try:
 code=execute()
except Exception as error:
 receipt['status']='failed_driver_exception'
 receipt['driverError']={'type':type(error).__name__,'message':sanitize(str(error))}
finally:
 finish(code)
