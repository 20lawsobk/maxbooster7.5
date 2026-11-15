#!/usr/bin/env python3
"""Read-only candidate checks; never promote retained/candidate XML into master proof."""
from collections import Counter
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True

BASE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', type=Path, default=Path('/workspace/maxbooster7.5'))
ROOT = parser.parse_args().repo.resolve()
spec = importlib.util.spec_from_file_location('candidate_junit_identity', BASE / 'proposed/scripts/testing/junit_evidence.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
baseline = json.loads((BASE / 'baseline.json').read_text())
for name, expected_hash in baseline['oldCohortUntouched'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected_hash
trace = json.loads((ROOT / 'reports/platform-evidence/2026-10-28-rejected-case-trace/entries.json').read_text())
sites = json.loads((BASE / 'raw/vitest/sites.json').read_text())
files = sorted({site['file'] for site in sites})
assert len(files) == 10 and len(sites) == 15

source_guards = []
for file in files:
    before = (BASE / 'baseline-source' / file).read_bytes()
    after = (BASE / 'proposed' / file).read_bytes()
    restored = after.decode()
    selected = [site for site in sites if site['file'] == file]
    for site in selected:
        literal = site['titleSource']
        edited = literal[:-1] + ' [row %#]' + literal[-1]
        assert restored.count(edited) == 1
        restored = restored.replace(edited, literal, 1)
    assert restored.encode() == before
    assert (ROOT / file).read_bytes() in (before, after)
    source_guards.append({'file':file, 'changedTitleSites':len(selected), 'beforeSha256':hashlib.sha256(before).hexdigest(),
                          'afterSha256':hashlib.sha256(after).hexdigest(), 'titleOnlyByteRestoration':True})

def rows(path):
    return [(case.get('classname'), case.get('name'),
             'failed' if case.find('failure') is not None or case.find('error') is not None
             else 'skipped' if case.find('skipped') is not None else 'passed')
            for case in ET.parse(path).getroot().iter('testcase')]

before = rows(BASE / 'raw/vitest/before.junit.xml')
after = rows(BASE / 'raw/vitest/after.junit.xml')
strip_index = lambda name: re.sub(r' \[row \d+\]$', '', name)
assert Counter(before) == Counter((file, strip_index(name), status) for file, name, status in after)
assert len(before) == len(after) == 173
assert all(status == 'passed' for _, _, status in after)
assert all(count == 1 for count in Counter((file,name) for file,name,_ in after).values())
vitest_cohort = [row for row in trace if row['classification'] == 'parameterized-title-collision']
old_identities = Counter(tuple(row['identity'][1:]) for row in vitest_cohort)
assert len(vitest_cohort) == 64
before_counts = Counter((file,name) for file,name,_ in before)
assert all(before_counts[identity] == count for identity,count in old_identities.items())
resolved = [(file,name) for file,name,_ in after if (file,strip_index(name)) in old_identities]
assert len(resolved) == len(set(resolved)) == 64
renamed = sum(strip_index(name) != name for _,name,_ in after)
assert renamed == 82  # All rows at the 15 declarations gain an index; 64 were ambiguous.

python_cohort = [row for row in trace if row['classification'] == 'python-class-scope-loss']
assert len(python_cohort) == 26
python_files = sorted({row['case']['file'] for row in python_cohort})
python_rows = []
for file in python_files:
    xml = BASE / 'raw/maxcore' / (file.replace('/', '__').removesuffix('.py') + '.xml')
    python_rows.extend(reader.read_cases(xml, 'python', file))
assert len(python_rows) == 151
assert all(row['status'] == 'passed' for row in python_rows)
assert all(count == 1 for count in Counter((row['file'],row['name']) for row in python_rows).values())
python_old = Counter(tuple(row['identity'][1:]) for row in python_cohort)
python_qualified = [row for row in python_rows if (row['file'],row['rawName']) in python_old]
assert len(python_qualified) == 26
assert all(row['name'] == row['className'] + '::' + row['rawName'] for row in python_qualified)
assert Counter((row['file'],row['rawName']) for row in python_qualified) == python_old
assert all(row['name'] == row['rawName'] for row in python_rows if row not in python_qualified)
maxcore_receipt = json.loads((BASE / 'raw/maxcore/receipt.json').read_text())
assert maxcore_receipt['subjectInputsUnchanged'] is True
assert maxcore_receipt['sourceInputsBefore'] == maxcore_receipt['sourceInputsAfter']

# Compatibility check only: these retained HTTP records remain historical proof.
# The current master still requires its actual source-window execution to admit them.
mapping = json.loads((ROOT / 'tests/platform-acceptance-map.json').read_text())
http = {}
for check in mapping['checks']:
    cases = check.get('cases', [check])
    for case in cases:
        identity = (case.get('group'),case.get('testFile'),case.get('caseName'))
        if identity[0] == 'http': http[identity] = case
assert len(http) == 8
old_cases = json.loads((BASE / 'raw/http-compatibility/case-results.json').read_text())
compatibility = []
for identity in http:
    bound = [case for case in old_cases if (case.get('group'),case.get('file'),case.get('name')) == identity]
    assert bound and all(case['status'] == 'passed' for case in bound)
    for case in bound:
        xml = BASE / 'raw/http-compatibility' / case['junit']
        decoded = reader.read_cases(xml,'http')
        leaves = [row for row in decoded if (row['file'],row['name']) == identity[1:]]
        assert len(leaves) == 1 and leaves[0]['status'] == 'passed'
    compatibility.append({'identity':identity,'caseNameUnchanged':True})

framework = json.loads((BASE / 'raw/framework/framework-sealed-receipt.json').read_text())
assert type(framework['exitCode']) is int and framework['exitCode'] == 0 and framework['timedOut'] is False
assert framework['candidateInputsUnchanged'] is True
assert framework['candidateInputsBefore'] == framework['candidateInputsAfter']
assert hashlib.sha256((BASE / 'raw/framework/framework-sealed.log').read_bytes()).hexdigest() == framework['logSha256']
for file, expected_hash in framework['candidateInputsAfter'].items():
    source = BASE / 'proposed' / file
    if not source.is_file(): source = ROOT / file
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected_hash
framework_rows = rows(BASE / 'raw/framework/framework-sealed.junit.xml')
assert len(framework_rows) == 99 and all(status == 'passed' for _, _, status in framework_rows)

result = {'scope':'Outside candidate validation only; no current master or acceptance promotion',
          'vitest':{'sourceFiles':10,'declarations':15,'beforeLeaves':len(before),'afterLeaves':len(after),
                    'renamedParameterizedLeaves':renamed,'formerlyAmbiguousRows':64,'nowUniqueRows':len(resolved),
                    'allLeafInputsCallbacksAssertionsAndStatusesBytePreserved':True,'sourceGuards':source_guards},
          'python':{'sourceFiles':2,'leaves':151,'formerlyAmbiguousRows':26,'nowUniqueRows':len(python_qualified),
                    'uniqueExistingNamesPreserved':125,'copiedSubjectInputsUnchanged':True,
                    'qualifiedRows':[{key:row[key] for key in ('file','rawName','name','className','suiteNames','status')} for row in python_qualified]},
          'httpCompatibility':compatibility,
          'frameworkPassed':99,'frameworkFailed':0,
          'targetedAmbiguousRows':90,'targetedAmbiguousRowsResolved':90,
          'canonicalEvidenceChanged':False,'globalReadinessClaim':False}
(BASE / 'validation-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({key:value for key,value in result.items() if key not in ('vitest','python','httpCompatibility')}))
print('Vitest: 173 -> 173 leaves; 64/64 old collisions resolved; 82 indexed rows; 15 literal-only edits.')
print('Python: 151/151 pass; 26/26 scope collisions resolved; 125 unique old names retained.')
print('HTTP: 8/8 exact mapped names unchanged. No master evidence promoted.')
