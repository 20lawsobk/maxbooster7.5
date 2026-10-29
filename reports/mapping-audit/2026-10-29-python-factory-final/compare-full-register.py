from pathlib import Path
import hashlib, importlib.util, json
R=Path('/workspace/maxbooster7.5');B=Path(__file__).resolve().parent
old=json.loads((R/'reports/test-verification/platform-register.json').read_text())
new=json.loads((B/'registry/platform-register.json').read_text())
oldchecks={c['id']for k in ['pages','interactions','backendRoutes']for r in old[k]for c in r['requiredChecks']}
newchecks={c['id']for k in ['pages','interactions','backendRoutes']for r in new[k]for c in r['requiredChecks']}
checks={
 'all80PagesPreserved':len(new['pages'])==80 and {r['id']for r in old['pages']}=={r['id']for r in new['pages']},
 'all8374ControlsPreserved':len(new['interactions'])==8374 and {r['id']for r in old['interactions']}=={r['id']for r in new['interactions']},
 'all2909BackendIdsPreserved':len(new['backendRoutes'])==2909 and {r['id']for r in old['backendRoutes']}=={r['id']for r in new['backendRoutes']},
 'all932ContractsPreserved':len(new['frontendContracts'])==932 and {r['id']for r in old['frontendContracts']}=={r['id']for r in new['frontendContracts']},
 'all33549CheckIdsPreserved':len(oldchecks)==len(newchecks)==33549 and oldchecks==newchecks,
 'all170UnknownRecordsByteEquivalent':len(new['unknownMappings'])==170 and old['unknownMappings']==new['unknownMappings'],
 'allOriginalCoverageRecordsPreserved':old['sourceCoverage']==new['sourceCoverage'],
}
spec=importlib.util.spec_from_file_location('outside_platform_plan',R/'scripts/testing/generate-platform-plan.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
supplements=[json.loads((R/'docs/testing'/name).read_text())for name in ['platform-page-work-01-40.json','platform-page-work-41-80.json']]
plan=m.build_plan(new,supplements,m.repository_files(R),80,True,hashlib.sha256((B/'registry/platform-register.json').read_bytes()).hexdigest())
oldplan=json.loads((R/'reports/test-verification/completion-plan.json').read_text())
oldwork={r['id']for r in oldplan['workItems']};newwork={r['id']for r in plan['workItems']}
oldmapping={r['id']for r in oldplan['workItems']if r['kind']=='mapping-resolution'}
newmapping={r['id']for r in plan['workItems']if r['kind']=='mapping-resolution'}
checks.update(allOldWorkIdsRetained=oldwork<=newwork,all170MappingWorkIdsPreserved=len(oldmapping)==len(newmapping)==170 and oldmapping==newmapping,all2162SectionsRetained=plan['summary']['businessSectionTasks']==2162,all12972DimensionsRetained=plan['summary']['businessDimensionSteps']==12972)
receipt={'scope':'Outside candidate source inventory/full plan proof only. Existing master is stale after newly landed source changes; no prior passing assertions promoted.','checks':checks,'beforeSummary':old['summary'],'afterSummary':new['summary'],'oldWorkItems':len(oldwork),'candidateWorkItems':len(newwork),'removedWorkIds':sorted(oldwork-newwork),'addedWorkIds':sorted(newwork-oldwork),'candidatePlanSummary':plan['summary'],'productionReady':False}
(B/'full-register-preservation.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'checks':checks,'beforeWork':len(oldwork),'afterWork':len(newwork),'addedWork':len(newwork-oldwork),'removedWork':len(oldwork-newwork),'summary':new['summary']}))
raise SystemExit(int(not all(checks.values())))
