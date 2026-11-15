"""Independent read-only portable-release evidence audit; never grants launch approval."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT=Path('/workspace/maxbooster7.5')
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)==2 else Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts/testing'))
from common import clean_environment,source_inputs

def digest(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as stream:
  for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def compact(value):
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def loaded(name):return json.loads((OUT/name).read_text())

report={'schemaVersion':1,'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Read-only portable copied-payload provenance, exact admitted-source stability, archive hygiene and process-cleanup review; not a deployed/desktop/global launch certificate',
 'productionReady':False,'checks':{}}
try:
 summary=loaded('summary.json')
 report['summarySha256']=digest(OUT/'summary.json')
 report['sourceRevision']=summary['sourceRevision']
 checks=report['checks']
 checks['driver']=summary['executionDriverSha256']==digest(OUT/'execution-driver.py')
 expected=('prepare','verify','cold','verify-after-cold')
 runs=summary.get('runs',[])
 checks['exactCommandSequence']=tuple(run['id'] for run in runs)==expected
 for label in expected:
  matching=[run for run in runs if run['id']==label]
  checks[label+'RecordedExitAndLog']=len(matching)==1 and matching[0]['exitCode']==0 and digest(ROOT/matching[0]['log'])==matching[0]['logSha256']
 before_code=loaded('source-code-inputs.json');after_code=loaded('source-code-inputs-after.json')
 checks['codeBeforeRecordedDigest']=compact(before_code['files'])==before_code['sha256']==summary['sourceInputsSha256']
 checks['codeAfterRecordedDigest']=compact(after_code['files'])==after_code['sha256']==summary['sourceInputsAfterSha256']
 checks['codeInputUnchanged']=before_code==after_code and summary['sourceInputsUnchanged'] is True
 current_code=source_inputs()
 checks['currentCodeInputMatches']=current_code==before_code
 before=loaded('admitted-before.json');after=loaded('admitted-after.json');diff=loaded('admitted-diff.json')
 checks['admittedBeforeFileHash']=digest(OUT/'admitted-before.json')==summary['admittedBeforeSha256']
 checks['admittedAfterFileHash']=digest(OUT/'admitted-after.json')==summary['admittedAfterSha256']
 checks['admittedExactBeforeAfter']=before==after and summary['admittedInputsUnchanged'] is True
 checks['admittedCompleteEmptyDiff']=diff=={'comparison':'complete','added':[],'removed':[],'changed':[]}
 recorded_manifest=loaded('release-manifest.json')
 actual_manifest=json.loads((ROOT/'.prepared-release/release.json').read_text())
 checks['releaseManifestHash']=digest(OUT/'release-manifest.json')==summary['releaseManifestSha256']
 checks['recordedManifestMatchesPrepared']=recorded_manifest==actual_manifest
 checks['recordedSourceMatchesManifest']=loaded('source-inputs.json')==before==recorded_manifest['source']
 checks['recordedSourceDigest']=compact(recorded_manifest['source'])==summary['release']['sourceSha256']
 env=clean_environment('/tmp')
 command=['node','--import','tsx','--input-type=module','-e',"import {inventory,sourceIncluded} from './script/lib/releaseInventory.ts'; console.log(JSON.stringify({source:await inventory(process.cwd(),sourceIncluded),payload:await inventory(process.cwd()+'/.prepared-release/payload')}));"]
 result=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=180)
 if result.returncode:raise RuntimeError('Current inventory command failed: '+str(result.returncode))
 current=json.loads(result.stdout)
 checks['currentFullSourceMatches']=current['source']==before
 checks['currentPayloadMatchesManifest']=current['payload']==recorded_manifest['payload']
 checks['currentGitHeadMatches']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==summary['sourceRevision']
 payload=ROOT/'.prepared-release/payload'
 archive_counts={}
 for capsule in ('app_remainder','external_maxcore'):
  archive=payload/(capsule+'.pdim')
  expected_entry=[item for item in recorded_manifest['payload'] if item['path']==capsule+'.pdim']
  checks[capsule+'ArchiveHash']=len(expected_entry)==1 and digest(archive)==expected_entry[0]['sha256']
  result=subprocess.run(['tar','--zstd','-tf',str(archive)],cwd=ROOT,env=env,text=True,capture_output=True,timeout=180)
  if result.returncode:raise RuntimeError('Archive listing failed: '+capsule)
  members=[name.removeprefix('./').rstrip('/') for name in result.stdout.splitlines()]
  (OUT/(capsule+'-members.txt')).write_text(result.stdout)
  archive_counts[capsule]=len(members)
  checks[capsule+'SafeMembers']=all(not name.startswith('/') and '..' not in Path(name).parts for name in members)
  checks[capsule+'ScratchAbsent']=not any(part.startswith(('.pdim-scratch-','.pdim-cluster-test-')) for name in members for part in Path(name).parts)
  if capsule=='external_maxcore':
   checks['maxcoreRuntimeUploadsAbsent']=not any('/artifacts/ai-training-server/uploads/' in '/'+name+'/' for name in members)
   maxcore_manifest=json.loads((payload/'external_maxcore.manifest.json').read_text())
   checks['maxcoreUploadExclusionRecorded']='artifacts/ai-training-server/uploads' in maxcore_manifest.get('excludePaths',[])
  else:
   checks['runtimeRegistryPresent']='shared/social-platform-optimization.json' in members
   checks['migration0099Present']='migrations/0099_fabric_migration_journal.sql' in members
 checks['sourceScratchAbsent']=not any(part.startswith(('.pdim-scratch-','.pdim-cluster-test-')) for entry in before for part in Path(entry['path']).parts)
 checks['sourceRuntimeUploadsAbsent']=not any(entry['path']=='external/maxcore/artifacts/ai-training-server/uploads' or entry['path'].startswith('external/maxcore/artifacts/ai-training-server/uploads/') for entry in before)
 cold=loaded('cold/packed-acceptance.json')
 checks['coldStartupPassed']=cold.get('startup')=='pass'
 checks['ownedDescendantsCleaned']=isinstance(cold.get('processCleanup'),dict) and cold['processCleanup'].get('remaining')==[] and not cold.get('cleanupError')
 checks['preparedCurrentAfterCold']=summary.get('preparedArtifactCurrentAfterCold') is True
 checks['honestProductionScope']=summary.get('productionReady') is False
 report.update(sourceInventoryEntries=len(before),payloadInventoryEntries=len(recorded_manifest['payload']),
  payloadBytes=sum(entry['bytes'] for entry in recorded_manifest['payload']),archiveEntries=archive_counts,
  coldStartup=cold.get('startup'),coldReportedProductionReady=cold.get('productionReady'),readinessScope=cold.get('readinessGate'),processCleanup=cold.get('processCleanup'),
  runExitCodes={run['id']:run['exitCode'] for run in runs})
except Exception as error:
 report['auditError']={'type':type(error).__name__,'message':str(error)}
report['allChecksPass']=bool(report['checks']) and all(report['checks'].values()) and 'auditError' not in report
(OUT/'hygiene-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allChecksPass':report['allChecksPass'],'checks':len(report['checks']),'failed':[name for name,value in report['checks'].items() if not value],'auditError':report.get('auditError')}))
sys.exit(0 if report['allChecksPass'] else 1)
