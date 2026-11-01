#!/usr/bin/env python3
"""Reproduce selector red/green framework verification outside canonical evidence."""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

WORK=Path(__file__).resolve().parent
REPO=Path(os.environ.get('MAXBOOSTER_REPO', '/workspace/maxbooster7.5')).resolve()
CANDIDATE=WORK/'candidate'
OUT=WORK/'receipts'
OUT.mkdir(exist_ok=True)
NODE=Path('/workspace/.cloud-tools/node_modules/.bin/node')
PYTHON=Path('/workspace/.cloud-python/bin/python')
if not NODE.exists():
 import shutil
 NODE=Path(shutil.which('node'))
if not PYTHON.exists(): PYTHON=Path(sys.executable)

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
relative=['scripts/testing/commerce-legacy-fixture.mjs','scripts/testing/run-commerce.py',
          'vitest.beat-loop.config.ts','tests/unit/beat-sale-money-loop.test.ts',
          'tests/payment-processing/helpers-database-postgres.mjs']
protected=relative+['reports/test-verification/case-results.json',
 'reports/test-verification/platform-register.json','reports/test-verification/completion-plan.json',
 'reports/test-verification/commerce/results.json','reports/test-verification/commerce/legacy-beat.xml',
 'reports/test-verification/coverage/coverage-final.json']
before={p:sha(REPO/p) for p in protected if (REPO/p).is_file()}
receipt={'schemaVersion':1,'startedAt':now(),'scope':'Owned framework selection tests; intercepted SQL/process transports are not product money-loop evidence',
 'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
 'nodeVersion':subprocess.check_output([str(NODE),'--version'],text=True).strip(),
 'originalHashes':{p:sha(REPO/p) for p in relative},
 'candidateHashes':{str(p.relative_to(CANDIDATE)):sha(p) for p in sorted(CANDIDATE.rglob('*')) if p.is_file() and '__pycache__' not in p.parts},
 'commands':[]}
for label, source, expected in [('baseline',REPO,1),('candidate',CANDIDATE,0)]:
 env={key:os.environ[key] for key in ('PATH','HOME','LD_LIBRARY_PATH','LANG','TZ') if key in os.environ}
 env['PATH']=str(NODE.parent)+os.pathsep+env.get('PATH','/usr/bin:/bin')
 env['MAXBOOSTER_SELECTOR_SOURCE_ROOT']=str(source)
 env['MAXBOOSTER_SELECTOR_DEPENDENCY_ROOT']=str(REPO)
 xml=OUT/f'framework-{label}.xml'
 command=[str(PYTHON),'-m','pytest',str(CANDIDATE/'tests/testing/test_commerce_subject_selector.py'),
          '-q','--tb=short',f'--junitxml={xml}','-p','no:cacheprovider']
 started=time.monotonic()
 run=subprocess.run(command,cwd=WORK,env=env,capture_output=True,text=True,timeout=120)
 log=OUT/f'framework-{label}.pytest.txt'
 log.write_text(run.stdout+run.stderr)
 receipt['commands'].append({'id':label,'command':command,'selectionSource':str(source),
  'exitCode':run.returncode,'expectedExitCode':expected,'passed':run.returncode==expected,
  'durationSeconds':round(time.monotonic()-started,3),'log':log.name,'logSha256':sha(log),
  'junit':xml.name if xml.exists() else None,'junitSha256':sha(xml) if xml.exists() else None})
syntax=subprocess.run([str(NODE),'--check',str(CANDIDATE/'scripts/testing/commerce-legacy-fixture.mjs')],capture_output=True,text=True)
receipt['syntax']={'nodeExitCode':syntax.returncode,'nodeOutput':syntax.stdout+syntax.stderr,'python':[]}
for p in sorted(CANDIDATE.rglob('*.py')):
 ast.parse(p.read_text(),filename=str(p))
 receipt['syntax']['python'].append({'path':str(p.relative_to(CANDIDATE)),'passed':True})
receipt['protectedRootBefore']=before
receipt['protectedRootAfter']={p:sha(REPO/p) for p in before}
receipt['protectedRootUnchanged']=receipt['protectedRootBefore']==receipt['protectedRootAfter']
receipt['finishedAt']=now()
receipt['frameworkPassed']=all(c['passed'] for c in receipt['commands']) and syntax.returncode==0 and receipt['protectedRootUnchanged']
receipt['productCasesRerun']=0
receipt['productionReady']=False
(OUT/'verification.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'frameworkPassed':receipt['frameworkPassed'],'protectedRootUnchanged':receipt['protectedRootUnchanged'],
 'commands':[{k:c[k] for k in ('id','exitCode','expectedExitCode','passed')} for c in receipt['commands']],
 'productCasesRerun':0},indent=2))
raise SystemExit(0 if receipt['frameworkPassed'] else 1)
