"""Read-only replay of the current evidence gate; no application modules execute."""
from pathlib import Path
import sys, importlib.util, json, hashlib, datetime, time, collections, shlex
import xml.etree.ElementTree as ET
ROOT=Path('/workspace/maxbooster7.5')
OUT=Path('/workspace/onboarding-results/evidence-gap-trace')
sys.path.insert(0,str(ROOT/'scripts/testing'))
import common
source=ROOT/'scripts/testing/platform-register.py'
spec=importlib.util.spec_from_file_location('gap_trace_register',source);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
incoming=ROOT/'reports/test-verification'
protected=[source, ROOT/'scripts/testing/summarize-results.py', ROOT/'scripts/testing/generate-catalog.py',incoming/'case-results.json',incoming/'python/results.json',incoming/'commerce/results.json',incoming/'orchestration/results.json',incoming/'orchestration/source-inputs.json',incoming/'coverage/coverage-final.json',incoming/'platform-register.json',incoming/'completion-plan.json']
before={str(p.relative_to(ROOT)):sha(p)for p in protected}
inputs_before=common.source_inputs()
lines=source.read_text().splitlines()
reject_lines={i+1:reason for i,line in enumerate(lines)for reason in ['case-not-passed-in-bound-xml','unbound-default-file-producer']if 'rejected["'+reason+'"]'in line}
assert len(reject_lines)==2
records=[]
def tracer(frame,event,arg):
 if frame.f_code.co_filename!=str(source)or frame.f_code.co_name!='collect_current_passing_cases':return None
 if event=='line'and frame.f_lineno in reject_lines:
  l=frame.f_locals;case=l['case'];case_rows=l['case_rows'];index=next(i for i,value in enumerate(case_rows)if value is case)
  r={'traceIndex':len(records)+1,'caseResultIndex':index,'reason':reject_lines[frame.f_lineno],'gateSourceLine':frame.f_lineno,'case':dict(case),'identity':list(l['identity']),'artifact':str(l.get('artifact')),'defaultFile':l.get('default_file')}
  if r['reason']=='unbound-default-file-producer':
   entries=l['entries'];same=[e for e in entries if isinstance(e,dict)and e.get('file'if case['group']=='python'else'path')==case['file']]
   r['sameFileProducerEntries']=[{k:e.get(k)for k in ['file','path','sourceSha256','command','exitCode','status','junit']}for e in same]
  records.append(r)
 return tracer
started=time.monotonic();sys.settrace(tracer)
try:passed,state=mod.collect_current_passing_cases(incoming,inputs_before,root=ROOT)
finally:sys.settrace(None)
elapsed=time.monotonic()-started
assert collections.Counter(r['reason']for r in records)==collections.Counter({'case-not-passed-in-bound-xml':90,'unbound-default-file-producer':14}),state
raw_cases=json.loads((incoming/'case-results.json').read_text());xml_cache={}
for r in records:
 assert raw_cases[r['caseResultIndex']]==r['case']
 if r['reason']=='case-not-passed-in-bound-xml':
  key=(r['artifact'],r['defaultFile'])
  if key not in xml_cache:
   found=[]
   def collect(e,stack=()):
    if e.tag=='testsuite':stack=(*stack,e.get('name',''))
    if e.tag=='testcase':
     identity=(r['defaultFile']or e.get('file')or(stack[-1]if stack else ''),e.get('name'))
     status='failed'if any(e.find(t)is not None for t in ['failure','error'])else'skipped'if e.find('skipped')is not None else'passed'
     found.append({'identity':list(identity),'className':e.get('classname'),'suiteStack':list(stack),'status':status,'rawAttributes':dict(e.attrib)})
    else:
     for c in e:collect(c,stack)
   collect(ET.parse(r['artifact']).getroot());xml_cache[key]=found
  matches=[x for x in xml_cache[key]if x['identity']==r['identity'][1:]]
  r['rawXmlOccurrences']=matches;r['rawOccurrenceCount']=len(matches);r['rawOutcomeCounts']=dict(collections.Counter(x['status']for x in matches))
  r['distinctQualifiedScopes']=len({(tuple(x['suiteStack']),x['className'])for x in matches})
  r['classification']='ambiguous-unqualified-identity-distinct-scopes'if len(matches)>1 and r['distinctQualifiedScopes']>1 else'duplicate-fully-qualified-raw-identity'if len(matches)>1 else'raw-identity-not-found'if not matches else'raw-passing-status-not-proven'
 else:
  file=r['case']['file'];diagnostics=[]
  for e in r['sameFileProducerEntries']:
   command=e.get('command')
   try:argv=shlex.split(command)if isinstance(command,str)else command
   except ValueError:argv=None
   p=Path(e.get('junit')or'');p=p if p.is_absolute()else incoming/r['case']['group']/p
   diagnostics.append({'sourceHashMatches':e.get('sourceSha256')==inputs_before['files'].get(file),'exitIsIntegerZero':type(e.get('exitCode'))is int and e['exitCode']==0,'artifactMatches':p.resolve()==Path(r['artifact']).resolve(),'exactFileTokenPresent':isinstance(argv,list)and file in argv,'tokenizedCommand':argv,'fileContainsWhitespace':any(c.isspace()for c in file)})
  r['producerDiagnostics']=diagnostics
  r['classification']='lossy-unquoted-command-path-with-whitespace'if diagnostics and all(d['sourceHashMatches']and d['exitIsIntegerZero']and d['artifactMatches']and not d['exactFileTokenPresent']and d['fileContainsWhitespace']for d in diagnostics)else'other-unbound-producer-metadata'
after={str(p.relative_to(ROOT)):sha(p)for p in protected};inputs_after=common.source_inputs()
assert before==after and inputs_before==inputs_after
receipt={'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only diagnostic replay of the current evidence gate; no application startup, new product execution, source/counter modification or PASS transfer','sourceRevision':common.source_revision(),'currentCommonSha256':inputs_before['sha256'],'commonUnchanged':inputs_before==inputs_after,'protectedArtifactsBefore':before,'protectedArtifactsAfter':after,'protectedArtifactsUnchanged':before==after,'rejectionCounts':dict(collections.Counter(r['reason']for r in records)),'classifications':dict(collections.Counter(r['classification']for r in records)),'observedPassingCases':len(passed),'actualReplaySeconds':round(elapsed,3),'gateState':{k:state.get(k)for k in ['status','sourceInputsMatchCurrent','rejectedEvidence','passingCases']},'productionReady':False,'newAcceptedEvidence':0}
(OUT/'rejected-cases.json').write_text(json.dumps(records,indent=2,ensure_ascii=False)+'\n');(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items()if k not in ['protectedArtifactsBefore','protectedArtifactsAfter']}))
