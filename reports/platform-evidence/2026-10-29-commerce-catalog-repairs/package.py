from pathlib import Path
import datetime
import difflib
import hashlib
import importlib.util
import json
import shutil
import subprocess

WORK=Path(__file__).resolve().parent
REPO=Path('/workspace/maxbooster7.5')
files={
 'scripts/testing/commerce-legacy-fixture.mjs':WORK/'selector/candidate/scripts/testing/commerce-legacy-fixture.mjs',
 'scripts/testing/run-commerce.py':WORK/'selector/candidate/scripts/testing/run-commerce.py',
 'scripts/testing/generate-catalog.py':WORK/'catalog/candidate/scripts/testing/generate-catalog.py',
 'tests/testing/test_commerce_subject_selector.py':WORK/'selector/candidate/tests/testing/test_commerce_subject_selector.py',
 'tests/testing/test_catalog_snapshot_ownership.py':WORK/'catalog/candidate/tests/testing/test_catalog_snapshot_ownership.py',
}
sha=lambda data:hashlib.sha256(data).hexdigest()
patch=[]; entries=[]
for relative,source in files.items():
 target=WORK/'candidate'/relative
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(source,target)
 original=REPO/relative
 before=original.read_bytes() if original.is_file() else None
 after=target.read_bytes()
 if before is not None:
  tracked=subprocess.check_output(['git','show',f'HEAD:{relative}'],cwd=REPO)
  if before!=tracked: raise RuntimeError('Root input changed before packaging: '+relative)
 patch.append(f'diff --git a/{relative} b/{relative}\n')
 if before is None: patch.append('new file mode 100644\n')
 patch.extend(difflib.unified_diff((before or b'').decode().splitlines(keepends=True),after.decode().splitlines(keepends=True),
  fromfile='a/'+relative if before is not None else '/dev/null',tofile='b/'+relative))
 entries.append({'path':relative,'operation':'modify' if before is not None else 'add',
  'beforeSha256':sha(before) if before is not None else None,'afterSha256':sha(after),'candidate':str(target.relative_to(WORK))})
(WORK/'source.patch').write_text(''.join(patch))
spec=importlib.util.spec_from_file_location('commerce_package_common',REPO/'scripts/testing/common.py')
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
source=common.source_inputs()
framework=json.loads((WORK/'selector/receipts/verification.json').read_text())
census=json.loads((WORK/'catalog/receipts/actual-census.json').read_text())
regressions=json.loads((WORK/'catalog/receipts/regressions.json').read_text())
manifest={'schemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),
 'sourceInputsSha256':source['sha256'],'sourceInputCount':len(source['files']),
 'rootMutations':False,'sourcePatch':'source.patch','sourcePatchSha256':sha((WORK/'source.patch').read_bytes()),'files':entries,
 'selectorReceipt':'selector/receipts/verification.json','catalogCensusReceipt':'catalog/receipts/actual-census.json',
 'catalogRegressionReceipt':'catalog/receipts/regressions.json',
 'metrics':{'targetedEvidenceOccurrences':14,'targetedCatalogOwnershipGaps':1,'selectorTopLevelTestsPassed':12,
 'selectorSubtestsPassed':10,'catalogRegressionTestsPassed':6,'realMoneyLoopCasesRerun':0,
 'acceptedNewFeatureEvidence':0,'greenPagesAdded':0},
 'remaining':['Parent hash-guarded landing of exactly the three scripts and two tests',
 'Real 14-case owned PostgreSQL/Redis legacy-beat execution with sanitized environment and current source binding',
 'Fresh frozen full master/source-evidence reconciliation; no transfer of historical PASS status'],
 'productionReady':False}
(WORK/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
check=subprocess.run(['git','apply','--check',str(WORK/'source.patch')],cwd=REPO,capture_output=True,text=True)
(WORK/'patch-check.txt').write_text(check.stdout+check.stderr+f'git apply --check exitCode={check.returncode}\n')
if check.returncode: raise SystemExit(check.returncode)
print(json.dumps({'manifest':str(WORK/'manifest.json'),'patch':str(WORK/'source.patch'),'patchSha256':manifest['sourcePatchSha256'],
 'sourceInputsSha256':source['sha256'],'files':entries,'patchCheckExitCode':check.returncode},indent=2))
