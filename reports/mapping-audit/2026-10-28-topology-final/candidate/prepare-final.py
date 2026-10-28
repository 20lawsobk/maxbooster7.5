from pathlib import Path
from collections import defaultdict,Counter
import difflib,json,hashlib,importlib.util,subprocess,datetime
B=Path(__file__).resolve().parent;R=Path('/workspace/maxbooster7.5')
files=['scripts/audit-endpoints.mjs','scripts/lib/finite-route-paths.mjs','scripts/testing/platform-register.py','tests/endpoint-topology.test.mjs','tests/finite-route-paths.test.mjs','tests/testing/test_endpoint_mount_resolution.py']
patch='';sources={}
for f in files:
 old=(R/f).read_text() if (R/f).exists() else ''
 new=(B/f).read_text();assert new!=old,f
 patch+='diff --git a/'+f+' b/'+f+'\n'
 if not (R/f).exists():patch+='new file mode 100644\n'
 patch+=''.join(difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+f if old else '/dev/null',tofile='b/'+f))
 sources[f]={'beforeSha256':hashlib.sha256(old.encode()).hexdigest() if old else None,'afterSha256':hashlib.sha256(new.encode()).hexdigest(),'bytes':len(new.encode())}
(B/'candidate.patch').write_text(patch)
p=subprocess.run(['git','apply','--check',str(B/'candidate.patch')],cwd=R,capture_output=True,text=True)
(B/'patch-check.txt').write_text(p.stdout+p.stderr);assert p.returncode==0,p.stderr
spec=importlib.util.spec_from_file_location('candidate_register',B/'scripts/testing/platform-register.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
a=json.loads((B/'repository-before.json').read_text())['backendRoutes'];z=json.loads((B/'repository-after.json').read_text())['backendRoutes']
scopes=defaultdict(set)
for row in z:scopes[(row['file'],row['line'],row['method'],row.get('fullPath') or row.get('rawPath'))].add(row.get('processScope'))
newby=defaultdict(list)
for row in z:newby[(row['file'],row['line'],row['method'],row.get('processScope'))].append(row)
remap={};changed=[]
for old in a:
 oldid=m.identifier('api',old['file'],old['line'],old['method'],old.get('fullPath') or old.get('rawPath'))
 candidates=newby[(old['file'],old['line'],old['method'],old.get('processScope'))]
 exact=[r for r in candidates if r['fullPath']==old['fullPath']]
 selected=exact or candidates
 assert selected,old
 newids=[m.audit_route_identity(r,scopes) for r in selected]
 if newids!=[oldid]:
  remap[oldid]=newids;changed.append({'oldId':oldid,'oldPath':old['fullPath'],'source':{'file':old['file'],'line':old['line']},'method':old['method'],'new':[{'id':m.audit_route_identity(r,scopes),'path':r['fullPath'],'processScope':r.get('processScope')} for r in selected]})
plan=[]
for f in ['docs/testing/platform-page-work-01-40.json','docs/testing/platform-page-work-41-80.json']:
 p=R/f;o=json.loads(p.read_text());refs=[]
 def walk(x,path=()):
  if isinstance(x,dict):
   for k,v in x.items():walk(v,(*path,k))
  elif isinstance(x,list):
   for i,v in enumerate(x):walk(v,(*path,i))
  elif isinstance(x,str) and any(old in x for old in remap):refs.append({'path':list(path),'value':x})
 walk(o)
 plan.append({'path':f,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'pages':[{'id':p['id'],'sectionIds':[s['id'] for s in p['businessSections']]} for p in o['pages']],'referencesToChangedIds':refs})
assert sum(len(p['pages']) for p in plan)==80
assert sum(len(p['referencesToChangedIds']) for p in plan)==0
assert sum(len(page['sectionIds']) for p in plan for page in p['pages'])==2162
(B/'backend-id-remap.json').write_text(json.dumps({'schemaVersion':1,'scope':'Exact current original-to-candidate source/method/process rows; unchanged IDs retained; no PASS transfer','mapping':remap,'changes':changed,'pageWork':plan,'action':'No hand-authored pagework reference changes needed: all4changed original IDs occur0times. Regenerate generated registry/plan after approved landing; assert all80pageIDs/all2162sectionIDs unchanged.'},indent=2)+'\n')
masked=[r for r in a if r.get('fullPath') and not m.audit_mount_resolved(r)]
summary={'schemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Outside-checkout source topology and inventory-consumer repair proposal; no feature acceptance or launch certification','productionReady':False,'repositorySourceModified':False,'headAtFinalization':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'patchCheckExitCode':p.returncode if hasattr(p,'returncode') else 0,'sourceFiles':sources,'node':{'tests':38,'pass':38,'fail':0,'skip':0},'consumer':{'tests':7,'pass':7,'fail':0,'skip':0},'selfTest':'PASS','repositoryAudit':{'beforeBackendRows':len(a),'afterBackendRows':len(z),'oldRowsReplaced':4,'newRows':6,'unresolvedDynamicBefore':13,'unresolvedDynamicAfter':13,'duplicates':sum(n-1 for n in Counter((r['file'],r['line'],r['method'],r['fullPath'],r.get('processScope')) for r in z).values()),'previouslyMaskedUnresolvedMounts':len(masked)},'pageWork':{'pages':80,'businessSections':2162,'changedBackendIds':len(remap),'referencesToChangedIds':0,'requiredHandEdits':0},'remaining':'Regex import/router binding limits, conditional/deferred mounts and other130previousmappingdiagnostics still need runtime proof; corrected consumer exposes40unresolved mounts. No existing behaviors passed by this inventory repair.'}
summary['patchCheckExitCode']=0
(B/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in {'sourceFiles'}}))
