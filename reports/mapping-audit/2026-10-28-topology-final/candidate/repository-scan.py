from pathlib import Path
import os, shutil, hashlib, json, subprocess, time, datetime
B=Path(__file__).resolve().parent
R=Path('/workspace/maxbooster7.5')
D=B/'repository-fixture';D.mkdir(exist_ok=True)
ignore={'node_modules','dist','build','.git'}
files=[]
for start in [R/'server',R/'client/src']:
 for root,dirs,names in os.walk(start):
  dirs[:]=[d for d in dirs if d not in ignore]
  for n in names:
   p=Path(root)/n
   if p.suffix not in {'.ts','.tsx','.js','.jsx'}:continue
   rel=p.relative_to(R);target=D/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
   files.append({'path':rel.as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(B/'repository-source-inputs.json').write_text(json.dumps({'files':files},indent=2)+'\n')
commands=[]
for name,script in [('before',R/'scripts/audit-endpoints.mjs'),('after',B/'scripts/audit-endpoints.mjs')]:
 start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 p=subprocess.run(['/workspace/.cloud-tools/node_modules/.bin/node',str(script),'--static'],cwd=D,env={'PATH':os.environ['PATH'],'HOME':str(D),'TMPDIR':str(D)},capture_output=True,text=True,timeout=180)
 (B/f'repository-{name}.txt').write_text(p.stdout+p.stderr)
 commands.append({'name':name,'script':str(script),'scriptSha256':hashlib.sha256(script.read_bytes()).hexdigest(),'startedAt':at,'durationSeconds':time.monotonic()-start,'exitCode':p.returncode})
 if p.returncode:raise SystemExit(p.returncode)
 shutil.copyfile(D/'reports/endpoint-audit.json',B/f'repository-{name}.json')
unchanged=all(hashlib.sha256((R/f['path']).read_bytes()).hexdigest()==f['sha256'] for f in files)
(B/'repository-scan-receipt.json').write_text(json.dumps({'schemaVersion':1,'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'scope':'Actual copied server/client source static topology only; no server or provider invoked','productionReady':False,'commands':commands,'sourceFiles':len(files),'sourceUnchanged':unchanged},indent=2)+'\n')
print(json.dumps({'commands':commands,'sourceFiles':len(files),'sourceUnchanged':unchanged}))
