from pathlib import Path
import subprocess,tempfile,json,hashlib,sys,datetime
root=Path('/workspace/maxbooster7.5');source=root/'external/maxcore/artifacts/ai-training-server';out=Path(__file__).resolve().parent;label=sys.argv[1]
code="""from ai_model.retrieval import test_pipeline,test_phase4

def test_actual_pipeline_false_check():
    test_pipeline._check('owned pipeline false condition',False)

def test_actual_phase4_false_check():
    test_phase4._check('owned phase4 false condition',False)
"""
with tempfile.TemporaryDirectory(prefix='retrieval-negative-oracle-') as home:
 probe=Path(home)/'test_actual_retrieval_oracles.py';probe.write_text(code)
 env={'PATH':'/usr/bin:/bin','HOME':home,'TMPDIR':home,'LANG':'C.UTF-8','PYTHONPATH':str(source),'PYTHONDONTWRITEBYTECODE':'1','OMP_NUM_THREADS':'1'}
 command=['/workspace/.cloud-python/bin/python','-m','pytest','-q','-p','no:cacheprovider','--import-mode=importlib',str(probe),'--junitxml='+str(out/(label+'.xml'))]
 start=datetime.datetime.now(datetime.timezone.utc).isoformat();result=subprocess.run(command,cwd=source,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120);(out/(label+'.txt')).write_bytes(result.stdout)
 receipt={'schemaVersion':1,'scope':'Two actual module _check(False) invocations in a private pytest child; probes contain no extra assertions or substitute checker','command':command,'startedAt':start,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':result.returncode,'probeSource':code,'outputSha256':hashlib.sha256(result.stdout).hexdigest(),'sourceHashes':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source/'ai_model/retrieval/test_pipeline.py',source/'ai_model/retrieval/test_phase4.py']},'productionReady':False};(out/(label+'.json')).write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'label':label,'exitCode':result.returncode,'tail':result.stdout.decode()[-160:]}))
