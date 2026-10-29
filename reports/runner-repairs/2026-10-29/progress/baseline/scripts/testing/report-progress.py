#!/usr/bin/env python3
"""Report counted launch acceptance, separately from code implementation.

python scripts/testing/report-progress.py --output reports/progress/current
Exit 0 means a current, internally consistent measurement, not launch approval.
Exit 1 means historical/stale evidence; exit 2 means missing/invalid evidence.
No thresholds, page declarations, acceptance statuses or coverage are changed.
"""
import argparse
from collections import Counter
import datetime
from decimal import Decimal, ROUND_DOWN
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


class InvalidEvidence(ValueError):
    pass


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def integer(value, label):
    if type(value) is not int or value < 0:
        raise InvalidEvidence(f"{label}: expected a nonnegative integer")
    return value


def fraction(done, total):
    integer(done, 'completed'); integer(total, 'total')
    if done > total:
        raise InvalidEvidence('Completed count exceeds denominator')
    return {'completed': done, 'total': total,
            'percent': float(Decimal(done) * 100 / Decimal(total)) if total else None}


def unique_rows(rows, label):
    if not isinstance(rows, list) or any(not isinstance(row, dict) or not row.get('id') for row in rows):
        raise InvalidEvidence(f'{label}: expected identified rows')
    result = {row['id']: row for row in rows}
    if len(result) != len(rows):
        raise InvalidEvidence(f'{label}: duplicate identity')
    return result


def measure(readiness, register, plan, coverage, summary, *, current, reasons):
    """Pure counter reconciliation. Stale observations never receive current credit."""
    pages = unique_rows(readiness['pages'], 'readiness pages')
    registered_pages = unique_rows(register['pages'], 'registered pages')
    if len(pages) != 80 or pages.keys() != registered_pages.keys():
        raise InvalidEvidence('Exactly the same 80 pages must be retained')
    colors = dict(Counter(row['productionReadinessStatus'] for row in pages.values()))
    if readiness['summary']['colors'] != colors:
        raise InvalidEvidence('Page color summary/count mismatch')
    green = colors.get('GREEN', 0)
    if any(row['productionReadinessStatus'] not in {'GREEN', 'YELLOW', 'RED'} for row in pages.values()):
        raise InvalidEvidence('Unknown page readiness status')
    integer(readiness['summary']['pages'], 'readiness page count')
    integer(readiness['summary']['greenPages'], 'readiness green count')
    if readiness['summary']['pages'] != 80 or readiness['summary']['greenPages'] != green:
        raise InvalidEvidence('Page summary/count mismatch')
    checks = unique_rows([check for collection in ('pages', 'backendRoutes', 'interactions')
                          for row in register[collection] for check in row['requiredChecks']], 'required checks')
    passed_checks = sum(row['status'] == 'PASS' for row in checks.values())
    integer(register['summary']['requiredChecks'], 'required-check count')
    integer(register['summary']['unverifiedChecks'], 'unverified-check count')
    if (register['summary']['requiredChecks'] != len(checks)
            or register['summary']['unverifiedChecks'] != len(checks) - passed_checks):
        raise InvalidEvidence('Required-check summary/count mismatch')
    work = unique_rows(plan['workItems'], 'plan work')
    work_status = {key: row['status'] for key, row in work.items()}
    if work_status != readiness['workItemAcceptanceStatus']:
        raise InvalidEvidence('Plan/readiness work-status mismatch')
    integer(plan['summary']['workItems'], 'plan work count')
    integer(readiness['summary']['retainedExistingWorkItems'], 'retained work count')
    if plan['summary']['workItems'] != len(work) or readiness['summary']['retainedExistingWorkItems'] != len(work):
        raise InvalidEvidence('Plan work denominator mismatch')
    if any(key not in work or work[key]['status'] != row['status'] for key, row in checks.items()):
        raise InvalidEvidence('Required-check/plan status mismatch')
    allowed = {'PASS', 'FAIL', 'UNVERIFIED', 'STALE', 'BLOCKED'}
    if any(row['status'] not in allowed for row in list(work.values()) + list(checks.values())):
        raise InvalidEvidence('Unknown acceptance status')
    domains = {'frontend', 'backend', 'integration', 'database', 'ai', 'qa', 'accessibility', 'deployment'}
    for key, page in pages.items():
        if page['productionReadinessStatus'] != 'GREEN': continue
        gates = page.get('gates', {})
        related = {key, *registered_pages[key].get('uiInteractionIds', []),
                   *registered_pages[key].get('backendRouteIds', [])}
        related_checks = [row for check_id, row in checks.items() if check_id.split('/', 1)[0] in related]
        if (readiness.get('sourceFreshness', {}).get('status') != 'PASS'
                or set(gates) != domains or any(value != 'PASS' for value in gates.values())
                or page.get('blockers') or page.get('globalBlockerIds') or page.get('pendingExactPageWorkItemIds')
                or not related_checks or any(row['status'] != 'PASS' for row in related_checks)
                or page.get('requiredRegisteredChecks') != len(related_checks)
                or page.get('verifiedRegisteredChecks') != len(related_checks)):
            raise InvalidEvidence(f'{key}: Green contradicts its source, gates, checks or blockers')
    observed = {
        'greenPages': fraction(green, len(pages)),
        'requiredCheckAcceptance': fraction(passed_checks, len(checks)),
        'planWorkAcceptance': fraction(sum(row['status'] == 'PASS' for row in work.values()), len(work)),
        'coverage': {},
    }
    coverage_groups = [row for row in summary['groups'] if row['group'] == 'coverage']
    if len(coverage_groups) != 1:
        raise InvalidEvidence('Exactly one canonical coverage group is required')
    for metric in ('lines', 'statements', 'functions', 'branches'):
        row = coverage['total'][metric]
        counts = fraction(row['covered'], row['total'])
        canonical = row['pct']
        if type(canonical) not in (int, float) or not 0 <= canonical <= 100:
            raise InvalidEvidence(f'{metric}: invalid canonical percent')
        expected = (Decimal(row['covered']) * 100 / Decimal(row['total'])).quantize(
            Decimal('0.01'), rounding=ROUND_DOWN) if row['total'] else Decimal(100)
        if Decimal(str(canonical)) != expected:
            raise InvalidEvidence(f'{metric}: canonical percent disagrees with raw counters')
        if coverage_groups[0]['totals'][metric] != row:
            raise InvalidEvidence(f'{metric}: summary/coverage counter mismatch')
        observed['coverage'][metric] = {**counts, 'canonicalPercent': canonical}
    return {
        'schemaVersion': 1,
        'measurementStatus': 'CURRENT' if current else 'STALE',
        'implementationCompletionPercent': None,
        'implementationCompletionMeaning': 'No verified whole-product implementation denominator exists; acceptance, pages and code coverage are distinct measurements.',
        'sourceFreshnessReasons': reasons,
        'lastMeasured': observed,
        'currentVerified': observed if current else None,
        'workStatusCounts': dict(sorted(Counter(work_status.values()).items())),
        'productionReady': (current and green == 80 and readiness.get('productionReady') is True
                            and summary.get('productionReady') is True),
        'masterStatus': summary['status'],
        'testGroupObservations': [{key: row[key] for key in ('group', 'status', 'counts', 'fileCounts', 'countScope') if key in row}
                                  for row in summary['groups']],
        'testCountMeaning': 'Original per-group scopes retained; groups overlap and no unique platform-wide test total is calculated.',
        'meaning': 'Numerators count exact PASS/Green receipts only; planned/source-present/rendered/skipped work is not completed work. Percentages are not interchangeable or averaged.',
    }


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect(repo, base, readiness_dir):
    previous = sys.dont_write_bytecode
    try:
        sys.dont_write_bytecode = True
        return _collect(repo, base, readiness_dir)
    finally:
        sys.dont_write_bytecode = previous


def _collect(repo, base, readiness_dir):
    paths = {
        'readiness': readiness_dir / 'status.json', 'readinessManifest': readiness_dir / 'manifest.json',
        'register': base / 'platform-register.json', 'plan': base / 'completion-plan.json',
        'coverage': base / 'coverage/coverage-summary.json', 'summary': base / 'summary.json',
        'master': base / 'orchestration/results.json', 'sourceInputs': base / 'orchestration/source-inputs.json',
    }
    docs, input_hashes = {}, {}
    for key, path in paths.items():
        raw = path.read_bytes()
        input_hashes[key] = hashlib.sha256(raw).hexdigest()
        docs[key] = json.loads(raw)
    audit = load_module(repo / 'scripts/testing/launch-readiness-audit.py', 'progress_launch_audit')
    common = load_module(repo / 'scripts/testing/common.py', 'progress_test_common')
    audit.validate_inventory(docs['register'], docs['plan'])
    current_inputs = common.source_inputs()
    fresh = audit.source_freshness(docs['register'], plan=docs['plan'])
    master_fresh = audit.master_evidence_freshness(base, current_inputs)
    reasons = []
    if fresh['status'] != 'PASS': reasons.append('Actual source or bound evidence differs from the recorded launch inventory')
    if master_fresh['status'] != 'PASS': reasons.append('Completed unchanged master source receipt does not match current inputs')
    if docs['readiness']['sourceFreshness']['status'] != 'PASS': reasons.append('Recorded readiness audit is stale')
    manifest = docs['readinessManifest']
    for label in ('register', 'plan'):
        path = paths[label]
        key = str(path.relative_to(repo)) if path.is_relative_to(repo) else str(path)
        if manifest.get('inputs', {}).get(key) != input_hashes[label]:
            raise InvalidEvidence(f'Readiness manifest no longer binds {label}')
    status_entries = [row for row in manifest.get('artifacts', []) if row.get('path') == 'status.json']
    if len(status_entries) != 1 or status_entries[0].get('sha256') != input_hashes['readiness']:
        raise InvalidEvidence('Readiness status is missing or changed from its artifact manifest')
    epochs = {docs[key].get('sourceRevision') for key in ('readiness', 'register', 'plan', 'master')}
    if len(epochs) != 1 or not next(iter(epochs)) or docs['summary'].get('sourceBaseline') not in epochs:
        raise InvalidEvidence('Measured artifact source epochs disagree')
    if any(sha(path) != input_hashes[key] for key, path in paths.items()):
        raise InvalidEvidence('Measured artifacts changed during collection')
    after_inputs = common.source_inputs()
    if after_inputs != current_inputs:
        reasons.append('Source inputs changed during measurement')
    report = measure(docs['readiness'], docs['register'], docs['plan'], docs['coverage'], docs['summary'],
                     current=not reasons, reasons=reasons)
    report.update({
        'measuredSourceRevision': next(iter(epochs)),
        'measuredSourceInputsSha256': docs['sourceInputs'].get('sha256'),
        'currentSourceInputsSha256': after_inputs['sha256'],
        'masterStartedAt': docs['master'].get('startedAt'), 'masterFinishedAt': docs['master'].get('finishedAt'),
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'evidenceSha256': {str(path.relative_to(repo)) if path.is_relative_to(repo) else str(path): input_hashes[key]
                           for key, path in paths.items()},
    })
    return report


def markdown(report):
    lines = ['# Counted production completion', '', f"Measurement: **{report['measurementStatus']}**.", '',
             'There is no estimated overall implementation percentage. These measured denominators remain separate.', '']
    if report['measurementStatus'] == 'UNAVAILABLE':
        return '\n'.join(lines + [report['error'], ''])
    lines += [f"Tested source: `{report['measuredSourceRevision']}`; master finished `{report['masterFinishedAt']}`.", '',
              '| Measurement | Verified at last run | Percentage |', '| --- | ---: | ---: |']
    measured = report['lastMeasured']
    for key, label in [('greenPages', 'Fully Green pages'), ('requiredCheckAcceptance', 'Required-check acceptance'),
                       ('planWorkAcceptance', 'Whole-plan work acceptance')]:
        row = measured[key]
        percent = 'undefined (zero denominator)' if row['percent'] is None else f"{row['percent']:.6f}%"
        lines.append(f"| {label} | {row['completed']}/{row['total']} | {percent} |")
    for key, row in measured['coverage'].items():
        raw = 'undefined (zero denominator)' if row['percent'] is None else f"{row['percent']:.6f}%"
        lines.append(f"| {key.capitalize()} coverage | {row['completed']}/{row['total']} | {raw} raw; {row['canonicalPercent']}% canonical |")
    lines += ['', 'These are acceptance and execution measurements, not equivalent estimates of implemented functionality.',
              'Test groups overlap; no combined unique test count is claimed.',
              'A current measurement does not imply a passing master or launch approval.']
    if report['measurementStatus'] != 'CURRENT':
        lines += ['', '**Historical measurements only. No previous PASS is credited to the current source.**',
                  *[f'- {reason}' for reason in report['sourceFreshnessReasons']]]
    return '\n'.join(lines) + '\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--input', type=Path, help='Canonical master output; defaults to repo/reports/test-verification')
    parser.add_argument('--readiness', type=Path, help='Readiness audit directory; defaults to repo/reports/launch-readiness/current')
    parser.add_argument('--output', type=Path, required=True, help='New or existing output directory for progress.json/progress.md')
    args = parser.parse_args(argv)
    repo = args.repo.resolve()
    try:
        report = collect(repo, args.input.resolve() if args.input else repo / 'reports/test-verification',
                         args.readiness.resolve() if args.readiness else repo / 'reports/launch-readiness/current')
        code = 0 if report['measurementStatus'] == 'CURRENT' else 1
    except (OSError, ValueError, KeyError, TypeError) as error:
        report = {'schemaVersion': 1, 'measurementStatus': 'UNAVAILABLE', 'currentVerified': None,
                  'implementationCompletionPercent': None, 'error': str(error), 'productionReady': False}
        code = 2
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'progress.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    (args.output / 'progress.md').write_text(markdown(report))
    print(json.dumps({key: report.get(key) for key in ('measurementStatus', 'measuredSourceRevision', 'productionReady', 'error')}))
    return code


if __name__ == '__main__':
    sys.exit(main())
