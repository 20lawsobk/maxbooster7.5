"""Read-only final source/identity qualification review; scratch output only."""
import collections
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import time

ROOT = Path('/workspace/maxbooster7.5')
OUT = Path('/workspace/onboarding-results/master-5eb-review/identity')
BASE = ROOT / 'reports/test-verification'
SOURCE = '5eb416a04021f66c9bfc8af93997ec9fe8a55e31'

def read(path):
    return json.loads(path.read_text())

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

end = time.monotonic() + 3600
while time.monotonic() < end:
    try:
        master = read(BASE / 'orchestration/results.json')
        if master.get('sourceRevision') != SOURCE:
            raise ValueError('Canonical master source changed')
        if master.get('finishedAt'):
            break
    except (OSError, json.JSONDecodeError):
        pass
    time.sleep(10)
else:
    raise TimeoutError('Master did not complete within the independent review bound')

common = load('identity_review_common', ROOT / 'scripts/testing/common.py')
registry = load('identity_review_registry', ROOT / 'scripts/testing/platform-register.py')
current = common.source_inputs()
qualified, provenance = registry.collect_current_passing_cases(BASE, current, root=ROOT)
cases = read(BASE / 'case-results.json')
trace = read(ROOT / 'reports/platform-evidence/2026-10-28-rejected-case-trace/entries.json')
report = {'schemaVersion': 1, 'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'source': SOURCE, 'sourceInputsSha256': current['sha256'],
          'scope': 'Actual frozen-master leaf qualification and source preservation; not full product acceptance',
          'masterStatus': master.get('status'), 'masterFinishedAt': master.get('finishedAt'),
          'sourceInputsUnchanged': master.get('sourceInputsUnchanged'),
          'evidenceProvenance': {k: provenance.get(k) for k in ['status', 'sourceInputsMatchCurrent', 'passingCases', 'rejectedEvidence']},
          'checks': []}

def check(name, condition, **data):
    report['checks'].append({'check': name, 'status': 'PASS' if condition else 'FAIL', **data})

check('unchanged actual source binding', master.get('sourceInputsUnchanged') is True
      and master.get('sourceInputsSha256') == current['sha256']
      and provenance.get('status') == 'CURRENT' and provenance.get('sourceInputsMatchCurrent') is True)

vitest_trace = [x for x in trace if x.get('classification') == 'parameterized-title-collision']
python_trace = [x for x in trace if x.get('classification') == 'python-class-scope-collision']
commerce_trace = [x for x in trace if x.get('reason') == 'unbound-default-file-producer']
# Preserve the exact trace classification labels in case of future schema changes.
if len(python_trace) != 26:
    python_trace = [x for x in trace if x['case']['group'] == 'python']

original_vitest = collections.Counter(tuple(x['identity']) for x in vitest_trace)
actual_vitest = collections.defaultdict(list)
for case in cases:
    identity = (case.get('group'), case.get('file'), case.get('name'))
    if identity[0] != 'root-unit' or case.get('status') != 'passed':
        continue
    stripped = (identity[0], identity[1], re.sub(r' \[row \d+\]$', '', identity[2] or ''))
    if stripped in original_vitest:
        actual_vitest[stripped].append(identity)
vitest_ids = [identity for rows in actual_vitest.values() for identity in rows]
check('64 parameterized occurrences preserve original names modulo unique index and qualify',
      len(vitest_trace) == 64 and len(vitest_ids) == 64
      and all(len(actual_vitest[key]) == count for key, count in original_vitest.items())
      and len(set(vitest_ids)) == len(vitest_ids) and all(x in qualified for x in vitest_ids),
      originalOccurrences=len(vitest_trace), currentOccurrences=len(vitest_ids),
      qualifiedOccurrences=sum(x in qualified for x in vitest_ids))

python_expected = set()
for item in python_trace:
    for row in item['rawXmlOccurrences']:
        identity = item['identity']
        python_expected.add((identity[0], identity[1], row['className'] + '::' + identity[2]))
check('26 distinct Python class-scoped methods qualify without renaming source',
      len(python_trace) == 26 and len(python_expected) == 26 and python_expected <= qualified,
      originalOccurrences=len(python_trace), distinctQualifiedIdentities=len(python_expected),
      qualifiedIdentities=len(python_expected & qualified))

commerce_expected = {tuple(item['identity']) for item in commerce_trace}
commerce_result = read(BASE / 'commerce/results.json')
legacy = [row for row in commerce_result['commands'] if row['id'] == 'legacy-beat']
subject = 'tests/unit/beat-sale-money-loop.test.ts'
check('14 legacy-beat leaves qualify under actual consumed subject selection',
      len(commerce_trace) == 14 and len(commerce_expected) == 14 and commerce_expected <= qualified
      and len(legacy) == 1 and legacy[0]['exitCode'] == 0
      and legacy[0]['path'] == subject and legacy[0]['command'][-2:] == ['--subject-file', subject],
      originalOccurrences=len(commerce_trace), qualifiedIdentities=len(commerce_expected & qualified),
      command=legacy[0]['command'] if len(legacy) == 1 else None)

mappings = read(ROOT / 'tests/platform-acceptance-map.json')
entries = {row['path'] for row in read(BASE / 'test-inventory.json')['entries']}
platform = read(BASE / 'platform-register.json')
check_ids = {c['id'] for key in ['pages','backendRoutes','interactions'] for r in platform[key] for c in r['requiredChecks']}
resolved = []
for mapping in mappings['checks']:
    proof = registry.resolve_evidence_cases(mapping, check_ids=check_ids,
        platform_digest=platform['platformSourceDigest'], test_entries=entries,
        passed_cases=qualified, root=ROOT)
    resolved.append({'checkId': mapping['checkId'], 'resolvedCaseCount': len(proof) if proof else 0})
check('all nine candidate policy bundles resolve from exact current leaves',
      len(resolved) == 9 and sum(x['resolvedCaseCount'] for x in resolved) == 23
      and all(x['resolvedCaseCount'] > 0 for x in resolved), mappings=resolved)
report['allIndependentChecksPassed'] = all(x['status'] == 'PASS' for x in report['checks'])
report['productionReady'] = False
(OUT / 'final-identity-review.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'checks': [(x['check'],x['status']) for x in report['checks']],
                  'qualifiedCases': provenance.get('passingCases'),
                  'allIndependentChecksPassed': report['allIndependentChecksPassed']}))
sys.exit(0 if report['allIndependentChecksPassed'] else 1)
