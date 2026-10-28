#!/usr/bin/env python3
"""Read-only integrity checks for this immutable focused topology cohort."""
from pathlib import Path
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CHECKS = {}


def read(name):
    return json.loads((HERE / name).read_text())


def verify_manifest(base, manifest):
    artifacts = manifest.get('artifacts', {})
    if not isinstance(artifacts, dict) or not artifacts:
        return False
    for name, proof in artifacts.items():
        rel = Path(name)
        p = base / rel
        if rel.is_absolute() or '..' in rel.parts or p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(base.resolve()):
            return False
        data = p.read_bytes()
        if len(data) != proof['bytes'] or hashlib.sha256(data).hexdigest() != proof['sha256']:
            return False
    return True


CHECKS['manifestArtifacts'] = verify_manifest(HERE, read('manifest.json'))
CHECKS['immutableCandidateArtifacts'] = verify_manifest(HERE / 'candidate', read('candidate/manifest.json'))
CHECKS['exactAppliedPatch'] = hashlib.sha256((HERE / 'candidate/candidate.patch').read_bytes()).hexdigest() == 'bb12479dfde12508348a5d7b8a4e7373322b8f73d16ef23c23c09d98b979eb86'
old = read('historical-warning-requirements.json')
original = old['entries']
CHECKS['allOriginal130Requirements'] = len(original) == 130 and len({r['existingMappingId'] for r in original}) == 130 and len({r['existingWorkItemId'] for r in original}) == 130
CHECKS['originalWorkIdsAndAcceptance'] = all(r['existingWorkItemId'] == r['existingMappingId'] + '/resolve' and r['requiredFix'] and r['validationCriteria'] and r['productionAcceptanceCriteria'] and r['productionReady'] is False for r in original)
preservation = read('mapping-preservation.json')
CHECKS['all130OldIdsPreserved'] = set(r['existingMappingId'] for r in original) == set(preservation['originalMappingIds']) and set(preservation['originalMappingIds']) <= set(preservation['currentMappingIds'])
CHECKS['all40NewMountObligations'] = len(preservation['newUnresolvedMounts']) == 40 and len(preservation['currentMappingIds']) == 170 and all(r['workItemId'] == r['id'] + '/resolve' and r['requiredAction'] and r['productionAcceptance'] and r['originalUnknownEntry']['kind'] == 'unverified-route-mount' for r in preservation['newUnresolvedMounts'])
relations = read('candidate/backend-id-remap.json')
CHECKS['all4BackendTo6Relations'] = len(relations['mapping']) == 4 and sum(len(r) for r in relations['mapping'].values()) == 6
CHECKS['all24RequirementsTo35Relations'] = len(relations['requiredCheckMapping']) == 24 and sum(len(r) for r in relations['requiredCheckMapping'].values()) == 35
CHECKS['noHandEditedBackendRefsNeeded'] = all(not r['referencesToChangedIds'] for r in relations['pageWork'])
recorded_pages = {p['id']: set(p['sectionIds']) for row in relations['pageWork'] for p in row['pages']}
actual_pages = {}
for f in ['docs/testing/platform-page-work-01-40.json', 'docs/testing/platform-page-work-41-80.json']:
    for p in json.loads((ROOT / f).read_text())['pages']:
        actual_pages[p['id']] = {s['id'] for s in p['businessSections']}
CHECKS['all80PageIdsRetained'] = len(recorded_pages) == 80 and set(recorded_pages) == set(actual_pages)
CHECKS['all2162SectionIdsRetained'] = sum(map(len, recorded_pages.values())) == 2162 and all(v <= actual_pages[k] for k, v in recorded_pages.items())
raw = (HERE / 'integration/node.txt').read_text()
counts = {k: int(re.search(r'^# ' + k + r' (\d+)$', raw, re.M)[1]) for k in ['tests', 'pass', 'fail', 'skipped']}
CHECKS['actualIntegrated38NodePassed'] = counts == {'tests': 38, 'pass': 38, 'fail': 0, 'skipped': 0}
xml = ET.fromstring((HERE / 'integration/consumer.junit.xml').read_text())
suite = xml if xml.tag == 'testsuite' else xml.find('testsuite')
CHECKS['actualIntegrated7ConsumerPassed'] = suite is not None and all(suite.attrib.get(k) == v for k, v in {'tests': '7', 'failures': '0', 'errors': '0', 'skipped': '0'}.items())
CHECKS['actualExistingSelfTestPassed'] = (HERE / 'integration/selftest.txt').read_text().strip().startswith('PASS: platform parser preserves')
receipt = read('candidate/repository-scan-receipt.json')
CHECKS['actual1800CopiedSourcesUnchanged'] = receipt['sourceFiles'] == 1800 and receipt['sourceUnchanged'] is True and all(c['exitCode'] == 0 for c in receipt['commands'])
a = read('candidate/repository-before.json')
b = read('candidate/repository-after.json')
key = lambda row: (row['file'], row['line'], row['method'], row['fullPath'], row.get('processScope'))
old_routes = {key(r) for r in a['backendRoutes']}
new_routes = {key(r) for r in b['backendRoutes']}
CHECKS['exact4OldTo6CorrectRows'] = len(a['backendRoutes']) == 2391 and len(b['backendRoutes']) == 2393 and len(old_routes - new_routes) == 4 and len(new_routes - old_routes) == 6
CHECKS['allOther2387RowsRetained'] = len(old_routes & new_routes) == 2387
CHECKS['all13DynamicDiagnosticsRetained'] = len(a['unresolvedDynamic']) == 13 and a['unresolvedDynamic'] == b['unresolvedDynamic']
CHECKS['noNewDuplicateRouteTuples'] = len(new_routes) == len(b['backendRoutes'])
integrated = read('integration-receipt.json')
CHECKS['honestNotProductionReady'] = integrated['productionReady'] is False and preservation['productionReady'] is False and old['productionReady'] is False
CHECKS['actualRecordedSourceMatchedProposal'] = all(r['currentlyMatchesProposal'] and r['currentSha256'] == r['proposalSha256'] for r in integrated['sourceFiles'].values())
CHECKS['earlierHelperMatchesIndependentFailureHash'] = read('historical-helper/provenance.json')['matchesIndependentReviewSourceHash'] is True
bad_links = []
for p in [HERE / 'README.md', ROOT / 'docs/testing/mapping-blocker-trace.md']:
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', p.read_text()):
        target = target.split('#', 1)[0]
        if not target or re.match(r'[a-zA-Z]+:', target):
            continue
        if not (p.parent / target).is_file():
            bad_links.append({'file': str(p.relative_to(ROOT)), 'target': target})
CHECKS['allCurrentDocumentationLinksResolve'] = not bad_links
result = {'schemaVersion': 1, 'scope': 'Focused cohort identity, raw-result and artifact integrity only; not product or launch acceptance', 'checks': CHECKS, 'failed': [k for k, v in CHECKS.items() if not v], 'brokenLinks': bad_links, 'productionReady': False}
print(json.dumps(result, indent=2))
sys.exit(1 if result['failed'] else 0)
