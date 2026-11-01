from pathlib import Path
import hashlib,json,datetime,subprocess,tempfile
root=Path('/workspace/maxbooster7.5');source=root/'external/maxcore/artifacts/ai-training-server';out=Path(__file__).resolve().parent
paths=[source/'ai_model/retrieval/test_pipeline.py',source/'ai_model/retrieval/test_phase4.py']
def inventory():
 base=source/'uploads'
 return {p.relative_to(base).as_posix():{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'mode':p.stat().st_mode&0o777} for p in sorted(base.rglob('*')) if p.is_file()}
before=inventory();(out/'source-uploads-before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[['/workspace/.cloud-python/bin/python','-m','pytest','-q','-p','no:cacheprovider','--import-mode=importlib',str(paths[0]),str(paths[1]),'--junitxml='+str(out/'pytest.xml')],['/workspace/.cloud-python/bin/python','-u','-m','ai_model.retrieval.test_pipeline'],['/workspace/.cloud-python/bin/python','-u','-m','ai_model.retrieval.test_phase4'],['/workspace/.cloud-python/bin/python',str(out/'late-import-probe.py')],['/workspace/.cloud-python/bin/python',str(out/'failure-cleanup-probe.py')]]
runs=[]
for number,cmd in enumerate(commands,1):
 with tempfile.TemporaryDirectory(prefix='maxcore-retrieval-proof-') as home:
  env={'PATH':'/workspace/.cloud-tools/node_modules/.bin:/usr/bin:/bin','HOME':home,'TMPDIR':home,'LANG':'C.UTF-8','PYTHONPATH':str(source),'PYTHONDONTWRITEBYTECODE':'1','OMP_NUM_THREADS':'1'}
  start=datetime.datetime.now(datetime.timezone.utc).isoformat();p=subprocess.run(cmd,cwd=source,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180);log=f'run-{number}.txt';(out/log).write_bytes(p.stdout);remaining=list(Path(home).glob('maxcore-retrieval-test-*'));runs.append({'command':cmd,'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'log':log,'logSha256':hashlib.sha256(p.stdout).hexdigest(),'sourceUploadsUnchanged':inventory()==before,'remainingOwnedTemporaryRoots':[str(x) for x in remaining]});print(json.dumps({k:runs[-1][k] for k in ['exitCode','sourceUploadsUnchanged','remainingOwnedTemporaryRoots']}),flush=True)
after=inventory();(out/'source-uploads-after.json').write_text(json.dumps(after,indent=2)+'\n')
receipt={'schemaVersion':1,'scope':'Actual canonical retrieval pytest plus documented module entrypoints and late-import/exception cleanup probes; real rendering/retrieval into owned temporary directories','driverSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'sourceHashes':{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},'runs':runs,'sourceUploadFilesBefore':len(before),'sourceUploadFilesAfter':len(after),'sourceUploadsUnchanged':before==after,'allRunsPassed':all(r['exitCode']==0 and r['sourceUploadsUnchanged'] and not r['remainingOwnedTemporaryRoots'] for r in runs),'productionReady':False,'beforeLeakEvidence':'../../2026-10-27-analytics-dependencies-final/source-drift-diagnosis.json'}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'allRunsPassed':receipt['allRunsPassed'],'files':len(before)}))
