"""Read-only frozen-master identity and raw-baseline review; output stays outside repo."""
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path('/workspace/maxbooster7.5')
OUT = Path('/workspace/onboarding-results/master-8a9-review')
EXPECTED = '8a9b638c6c1ce1b46a19501ee4a48893497c2518'
ARCHIVE = ROOT / 'reports/test-verification/history/2026-10-28-10d19267-master/master-evidence.tar.gz'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def checks(reg):
    return {check['id'] for key in ('pages', 'interactions', 'backendRoutes')
            for row in reg[key] for check in row['requiredChecks']}


def sections(plan):
    return {(page, section['id']) for page, data in plan['businessPageWork'].items()
            for section in data['businessSections']}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tarfile.open(ARCHIVE, 'r:gz') as archive:
        old = {}
        original_hashes = {}
        for key, name in [('register', 'platform-register.json'), ('plan', 'completion-plan.json'),
                          ('inputs', 'orchestration/source-inputs.json')]:
            raw = archive.extractfile(name).read()
            original_hashes[name] = sha(raw)
            old[key] = json.loads(raw)
    base = ROOT / 'reports/test-verification'
    master = json.loads((base / 'orchestration/results.json').read_text())
    if master.get('sourceRevision') != EXPECTED or not master.get('finishedAt'):
        raise SystemExit('Current 8a9 master is not complete; no final review emitted')
    paths = {'master': base / 'orchestration/results.json', 'register': base / 'platform-register.json',
             'plan': base / 'completion-plan.json', 'inputs': base / 'orchestration/source-inputs.json',
             'coverage': base / 'coverage/coverage-final.json', 'coverageSummary': base / 'coverage/coverage-summary.json',
             'rawManifest': base / 'coverage/raw-p1/manifest.json'}
    raw_inputs = {key: path.read_bytes() for key, path in paths.items()}
    new = {key: json.loads(raw) for key, raw in raw_inputs.items()}
    assertions = {}
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assertions['expectedHead'] = head == EXPECTED
    assertions['unchangedMasterSource'] = (master.get('sourceInputsUnchanged') is True
        and not master.get('changedSourceInputs') and master.get('sourceInputsSha256') == new['inputs']['sha256'])
    spec = importlib.util.spec_from_file_location('review_common', ROOT / 'scripts/testing/common.py')
    common = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(common)
    assertions['actualSourceMatches'] = common.source_inputs() == new['inputs']
    spec = importlib.util.spec_from_file_location('review_plan', ROOT / 'scripts/testing/generate-platform-plan.py')
    plan_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(plan_module)
    plan_module.validate_plan(new['register'], new['plan'])
    assertions['newPlanSchemaValid'] = new['plan']['registryDigest'] == plan_module.digest(new['register'])
    deltas = {}
    for label, before, after in [
        ('pages', {row['id'] for row in old['register']['pages']}, {row['id'] for row in new['register']['pages']}),
        ('controls', {row['id'] for row in old['register']['interactions']}, {row['id'] for row in new['register']['interactions']}),
        ('backend', {row['id'] for row in old['register']['backendRoutes']}, {row['id'] for row in new['register']['backendRoutes']}),
        ('frontendContracts', {row['id'] for row in old['register']['frontendContracts']}, {row['id'] for row in new['register']['frontendContracts']}),
        ('requiredChecks', checks(old['register']), checks(new['register'])),
        ('businessSections', sections(old['plan']), sections(new['plan'])),
        ('workItems', {row['id'] for row in old['plan']['workItems']}, {row['id'] for row in new['plan']['workItems']}),
        ('sourceInputs', set(old['inputs']['files']), set(new['inputs']['files'])),
    ]:
        missing, added = sorted(before - after), sorted(after - before)
        deltas[label] = {'before': len(before), 'after': len(after), 'missing': missing, 'added': added}
        assertions[label + 'Retained'] = not missing
    old_unknown = sorted(canonical(row) for row in old['register']['unknownMappings'])
    new_unknown = sorted(canonical(row) for row in new['register']['unknownMappings'])
    assertions['unknownObligationsRetainedExactly'] = old_unknown == new_unknown
    assertions['all80Pages'] = len(new['register']['pages']) == 80
    assertions['all2162Sections'] = len(sections(new['plan'])) == 2162
    manifest = new['rawManifest']
    files = manifest['files']
    assertions['nineRawOriginals'] = len(files) == len({row['file'] for row in files}) == 9
    assertions['rawRootAndContract'] = (manifest['contract']['repositoryRoot'] == str(ROOT)
        and manifest['contract']['runtime'] == manifest['runtime']
        and manifest['contractSha256'] == sha(canonical(manifest['contract']).encode()))
    assertions['rawIsUnmerged'] = manifest['mergedIntoGlobalCoverage'] is False and manifest['counterMutation'] is False
    coverage_run = next(row for row in master['runs'] if row['id'] == 'coverage')
    start = datetime.datetime.fromisoformat(coverage_run['startedAt']).timestamp()
    end = start + coverage_run['durationSeconds']
    raw_rows = []
    for row in files:
        path = paths['rawManifest'].parent / row['name']
        valid = (path.is_file() and path.stat().st_size == row['bytes'] and sha(path.read_bytes()) == row['sha256']
                 and sha((ROOT / row['file']).read_bytes()) == row['sourceSha256']
                 and str(ROOT / row['file']) in new['coverage']
                 and start - 2 <= path.stat().st_mtime <= end + 2)
        raw_rows.append({'file': row['file'], 'validBytesSourceWindow': valid})
    assertions['rawBytesSourceAndWindow'] = all(row['validBytesSourceWindow'] for row in raw_rows)
    assertions['coverageSummaryFileCount'] = len(new['coverage']) == len(new['coverageSummary']) - 1
    final = {'schemaVersion': 1, 'scope': 'Read-only independent retention and raw-baseline receipt review; no counter merge or launch approval',
             'sourceRevision': EXPECTED, 'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'assertions': assertions, 'allReviewAssertionsPass': all(assertions.values()), 'deltas': deltas,
             'rawOriginals': raw_rows, 'coverageFiles': len(new['coverage']), 'coverageTotals': new['coverageSummary']['total'],
             'actualMasterStatus': master['status'], 'masterFinishedAt': master['finishedAt'],
             'commands': [{key: row.get(key) for key in ('id', 'group', 'status', 'exitCode', 'durationSeconds')}
                          for row in master['runs'] + master.get('postprocessing', [])],
             'evidenceSha256': {str(path.relative_to(ROOT)): sha(raw_inputs[key]) for key, path in paths.items()},
             'originalArchiveSha256': sha(ARCHIVE.read_bytes()), 'originalMembersSha256': original_hashes,
             'productionReady': False}
    (OUT / 'retention-and-raw-baseline.json').write_text(json.dumps(final, indent=2) + '\n')
    print(json.dumps({'allReviewAssertionsPass': final['allReviewAssertionsPass'], 'checks': len(assertions),
                      'deltas': {key: {k: row[k] for k in ('before', 'after')} for key, row in deltas.items()},
                      'coverageFiles': final['coverageFiles'], 'actualMasterStatus': master['status']}))
    return int(not final['allReviewAssertionsPass'])


if __name__ == '__main__':
    raise SystemExit(main())
