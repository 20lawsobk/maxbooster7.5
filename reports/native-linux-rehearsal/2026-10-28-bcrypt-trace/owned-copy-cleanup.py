from pathlib import Path
import datetime,hashlib,json,os,shutil,subprocess,time
ROOT=Path('/workspace/maxbooster7.5');OUT=ROOT/'reports/native-linux-rehearsal/2026-10-28-bcrypt-trace';OWNED=Path('/tmp/maxbooster-linux-u3f69z18')
assert OWNED.is_dir() and not OWNED.is_symlink() and OWNED.parent==Path('/tmp')
assert OWNED.stat().st_uid==os.getuid()
assert json.loads((ROOT/'reports/native-linux-rehearsal/2026-10-27/ownership.json').read_text())['ownedRoot']==str(OWNED)
source=json.loads((OUT/'source-hashes.json').read_text())
assert all(hashlib.sha256((ROOT/n).read_bytes()).hexdigest()==h for n,h in source.items())
assert all(hashlib.sha256((OWNED/'project'/n).read_bytes()).hexdigest()==h for n,h in source.items())
verified=[]
for name,expected in [('2026-10-28-final',68),('2026-10-28-bcrypt-trace',70)]:
 folder=ROOT/'reports/native-linux-rehearsal'/name;manifest=json.loads((folder/'manifest.json').read_text());assert len(manifest['artifacts'])==expected
 for item in manifest['artifacts']:
  p=ROOT/item['path'];assert p.is_file() and p.stat().st_size==item['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256']
 verified.append({'cohort':name,'artifactCount':expected,'allHashesAndSizesMatch':True,'manifestSha256':hashlib.sha256((folder/'manifest.json').read_bytes()).hexdigest()})
# Do not delete the downloaded runtime ZIP or any cache. Remove only specifically
# generated regular project/artifact trees from the verified owned root.
targets=[OWNED/n for n in ['project','out','out-prototype','out-prototype-sharp','out-final','out-bcrypt-fixed']]
assert all(p.is_dir() and not p.is_symlink() and p.parent==OWNED for p in targets)
# Scan references without dumping command lines, environments, descriptor targets
# or memory maps. The current checker/its ancestor shell necessarily mention the
# cleanup path; only those known checker ancestors are exempted.
ancestors=set();pid=os.getpid()
while pid>0 and pid not in ancestors:
 ancestors.add(pid)
 try:
  stat=Path(f'/proc/{pid}/stat').read_text();pid=int(stat[stat.rfind(')')+2:].split()[1])
 except (OSError,ValueError,IndexError):break
references=[];inaccessible=[]
for proc in Path('/proc').iterdir():
 if not proc.name.isdigit() or int(proc.name) in ancestors:continue
 found=set()
 try:
  for kind in ['cwd','exe','root']:
   try:
    link=os.readlink(proc/kind)
    if link==str(OWNED) or link.startswith(str(OWNED)+'/'):found.add(kind)
   except (FileNotFoundError,ProcessLookupError):pass
  try:
   if str(OWNED).encode() in (proc/'cmdline').read_bytes():found.add('command-reference')
  except (FileNotFoundError,ProcessLookupError):pass
  try:
   if str(OWNED) in (proc/'maps').read_text():found.add('memory-map')
  except (FileNotFoundError,ProcessLookupError):pass
  try:
   for fd in (proc/'fd').iterdir():
    try:
     link=os.readlink(fd)
     if link==str(OWNED) or link.startswith(str(OWNED)+'/'):found.add('descriptor')
    except (FileNotFoundError,ProcessLookupError):pass
  except (FileNotFoundError,ProcessLookupError):pass
 except PermissionError:
  inaccessible.append(int(proc.name))
 if found:references.append({'pid':int(proc.name),'referenceKinds':sorted(found)})
assert not references,f'Active references prevent owned cleanup: {references}'
# Restrict Docker to the managed local daemon; inspect only safe mount/state data.
env=dict(os.environ)
for k in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(k,None)
docker=['/usr/local/bin/docker','--host=unix:///var/run/docker.sock'];ids=subprocess.check_output([*docker,'ps','--all','--quiet'],env=env).decode().split();mounts=[]
if ids:
 for item in json.loads(subprocess.check_output([*docker,'inspect',*ids],env=env)):
  for m in item.get('Mounts',[]):
   if m.get('Source','')==str(OWNED) or m.get('Source','').startswith(str(OWNED)+'/'):mounts.append({'id':item['Id'],'running':item['State']['Running'],'destination':m['Destination']})
assert not mounts,'A container still references owned native inputs'
zip_path=OWNED/'downloads/electron-v43.8.3-linux-x64.zip';zip_hash=hashlib.sha256(zip_path.read_bytes()).hexdigest();assert zip_hash=='73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22'
free_before=shutil.disk_usage(OWNED).free;started=datetime.datetime.now(datetime.timezone.utc).isoformat();counts=[]
for target in targets:
 counts.append({'path':str(target),'generatedTreeRemoved':False})
 shutil.rmtree(target)
 counts[-1]['generatedTreeRemoved']=not target.exists()
free_after=shutil.disk_usage(OWNED).free
assert zip_path.is_file() and hashlib.sha256(zip_path.read_bytes()).hexdigest()==zip_hash
receipt={'schemaVersion':1,'startedAt':started,'scope':'Only six verified owned generated project/artifact trees; no source/runtime ZIP/caches/unknown paths removed','cohortsVerifiedBeforeCleanup':verified,'latestSixSourceHashesMatch':True,'ownedCopiedSixSourceHashesMatch':True,'activeProcessReferences':references,'inaccessibleProcEntries':inaccessible,'procCheckLimit':'Kernel/other-user protected process entries cannot be fully read; this receipt does not claim access to their private descriptors or memory maps','existingContainerMountReferences':mounts,'removed':counts,'tmpFreeBytesBefore':free_before,'tmpFreeBytesAfter':free_after,'observedTmpFreeIncreaseBytes':free_after-free_before,'preservedElectronZip':{'path':str(zip_path),'bytes':zip_path.stat().st_size,'sha256':zip_hash},'preservedOtherChildren':sorted(p.name for p in OWNED.iterdir()),'productionCertificationGranted':False}
(OUT/'owned-copy-cleanup.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'removedTrees':len(counts),'tmpFreeIncreaseGiB':round((free_after-free_before)/1024**3,3),'electronZipPreserved':True,'inaccessibleProcEntries':len(inaccessible)},indent=2))
