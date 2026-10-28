from pathlib import Path
import subprocess,json,hashlib,tarfile,os,datetime
root=Path('/workspace/maxbooster7.5');checked=0;manifests=0;members=0;errors=[];retained=set();other=[]
def check_file(p,row,label):
 global checked
 checked+=1
 try:
  b=p.read_bytes();retained.add(str(p.relative_to(root)))
  if isinstance(row.get('bytes'),int)and len(b)!=row['bytes']:errors.append({'path':label,'reason':'size-mismatch'})
  if row.get('sha256')and hashlib.sha256(b).hexdigest()!=row['sha256']:errors.append({'path':label,'reason':'hash-mismatch'})
 except Exception as e:errors.append({'path':label,'reason':type(e).__name__})
for mp in sorted((root/'reports').rglob('manifest.json')):
 try:m=json.loads(mp.read_text())
 except Exception as e:errors.append({'path':str(mp.relative_to(root)),'reason':type(e).__name__});continue
 rows=m.get('files',m.get('artifacts'))
 if rows is None and isinstance(m.get('archive'),dict)and isinstance(m.get('members'),list):
  a=m['archive'];p=mp.parent/a['path'];check_file(p,a,str(p.relative_to(root)));manifests+=1
  with tarfile.open(p,'r:gz')as tar:
   actual={x.name:x for x in tar if x.isfile()}
   if set(actual)!={x['path']for x in m['members']}:errors.append({'path':str(p.relative_to(root)),'reason':'archive-members-mismatch'})
   for row in m['members']:
    members+=1
    body=tar.extractfile(actual[row['path']]).read()
    if len(body)!=row['bytes']or hashlib.sha256(body).hexdigest()!=row['sha256']:errors.append({'path':str(p.relative_to(root))+'!'+row['path'],'reason':'archive-member-mismatch'})
  rows=m.get('selectedCopies',[])
 elif rows is None:
  other.append(str(mp.relative_to(root)));continue
 else:manifests+=1
 if isinstance(rows,dict):rows=[{'path':k,**(v if isinstance(v,dict)else {'sha256':v})}for k,v in rows.items()]
 if not isinstance(rows,list):errors.append({'path':str(mp.relative_to(root)),'reason':'unsupported-file-list'});continue
 for row in rows:
  if not isinstance(row,dict):errors.append({'path':str(mp.relative_to(root)),'reason':'invalid-row'});continue
  name=row.get('path',row.get('file'));wanted=row.get('sha256')
  if not name or not wanted:errors.append({'path':str(mp.relative_to(root)),'reason':'missing-file-identity'});continue
  p=Path(name)
  if not p.is_absolute():p=root/p if name.startswith(str(mp.parent.relative_to(root))+'/')else mp.parent/p
  check_file(p,row,name)
raw=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0');visible={n for n in raw if n and(root/n).is_file()};ignored=[]
for n in sorted(retained-visible):
 if subprocess.run(['git','check-ignore','-q','--',n],cwd=root).returncode==0:ignored.append(n)
keys=['DATABASE_URL','SESSION_SECRET','STRIPE_PUBLISHABLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','MAXCORE_ADMIN_KEY','STRIPE_TEST_SECRET','STRIPE_TEST_CLIENT'];values=list(set(os.environ[k].encode()for k in keys if len(os.environ.get(k,''))>=8));matches=[];large=[];unreadable=[];archive_secret_members=0
for n in sorted(visible|retained):
 p=root/n
 try:
  if p.stat().st_size>=100*1024*1024:large.append(n)
  b=p.read_bytes()
  if any(v in b for v in values):matches.append(n)
  if n.startswith('reports/')and n.endswith(('.tar.gz','.tgz')):
   with tarfile.open(p,'r:gz')as tar:
    for row in tar:
     if row.isfile():
      archive_secret_members+=1;body=tar.extractfile(row).read()
      if any(v in body for v in values):matches.append(n+'!'+row.name)
 except Exception as e:unreadable.append({'path':n,'reason':type(e).__name__})
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only retained-report hash/size/archive persistence and exact configured-value scan; not feature or launch approval','sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'manifestsChecked':manifests,'artifactFilesChecked':checked,'archiveMembersChecked':members,'artifactErrors':errors,'otherManifestSchemasNotGenericFileLists':other,'retainedFilesIgnoredByGit':ignored,'secretScan':{'files':len(visible|retained),'configuredValuesCompared':len(values),'decompressedArchiveMembers':archive_secret_members,'matchingFiles':matches,'unreadableFiles':unreadable,'filesAtOrAbove100MiB':large},'productionReady':False,'status':'PASS'if not(errors or matches or large or unreadable)else'FAIL'}
out=Path('/workspace/onboarding-results/final-10d-persistence-audit.json');out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in ['otherManifestSchemasNotGenericFileLists','secretScan']}));print(json.dumps(report['secretScan']));raise SystemExit(report['status']!='PASS')
