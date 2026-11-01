#!/usr/bin/env python3
"""Reconcile final evidence without counting historical failures as new runs."""
import argparse
from collections import Counter
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
from common import ROOT, source_revision, write_json


def read(file, fallback=None):
    return json.loads(file.read_text()) if file.is_file() else fallback


def xml_cases(file, group, default_file=None):
    cases = []
    if not file.is_file(): return cases
    root = ET.parse(file).getroot()
    def collect(element, suite_name=''):
        name = element.get('name', '') if element.tag == 'testsuite' else suite_name
        if element.tag == 'testcase':
            case = element
            failure = case.find('failure')
            if failure is None: failure = case.find('error')
            status = 'failed' if failure is not None else 'skipped' if case.find('skipped') is not None else 'passed'
            cases.append({'group': group, 'file': default_file or case.get('file') or name,
                          'name': case.get('name'), 'status': status,
                          'message': failure.get('message', '')[:500] if failure is not None else None,
                          'junit': str(file.relative_to(ROOT)) if file.is_relative_to(ROOT) else str(file)})
            return
        for child in element:
            collect(child, name)
    # Node emits root-level cases alongside nested suites. Retain both once.
    collect(root)
    return cases


def coverage_contract_cases(file):
    # These real database suites run only in the instrumented configuration.
    # Retain their unique assertions without repeating every ordinary unit case.
    return [row for row in xml_cases(file, 'coverage-contracts')
            if row['file'].startswith('tests/coverage/')]


def write_markdown(report, coverage, cases, base, platform, remediation):
    lines = ['# Platform-wide master verification results', '',
             f"Generated: `{report['generatedAt']}`. Checkout baseline: `{report['sourceBaseline']}`.", '',
             '**The master gate remains open.** Passing groups and unresolved checks are reported separately. '
             'No production-readiness or complete-feature claim follows from a passing subset.', '',
             'Run the same sweep from a prepared checkout:', '', '```sh',
             'npm run test:master -- --python /path/to/prepared/python', '```', '',
             'Use [the setup guide](README.md) for dependencies and toolchain selectors, '
             '[the catalog](catalog.md) for every source test and command, '
             '[the platform register](../../reports/test-verification/platform-register.md) for every feature check, '
             '[the full platform plan](platform-completion-plan.md) for all 80 page and backend work ledgers, '
             'and [the generated fix checklist](../../reports/test-verification/remediation.md) for exact next actions.', '',
             '## Actual group outcomes', '', '| Group | Result | Measured scope |', '| --- | --- | --- |']
    for group in report['groups']:
        name = group['group']
        detail = ''
        counts = group.get('counts', {})
        if name == 'node':
            detail = f"{group['fileCounts']['files']} files; {group['fileCounts']['failedFiles']} failed files; TAP {json.dumps(group['fileCounts']['counts'])}"
        elif name == 'coverage':
            total = group.get('totals') or {}
            detail = '; '.join(f"{key}: {total[key]['pct']}%" for key in ('lines', 'statements', 'functions', 'branches') if key in total)
        elif counts:
            detail = ', '.join(f'{key}: {value}' for key, value in counts.items())
        elif name == 'subsystems':
            detail = '; '.join(f"{row['id']}: {row['status']}" for row in group['commands'])
        elif name == 'page80':
            detail = f"{group.get('decision')}; {len(group.get('failures', []))} final acceptance failures; individual browser observations remain in the raw evidence"
        elif name in ('checks', 'operations', 'master-commands', 'evidence-gates'):
            detail = '; '.join(f"{row.get('id', row.get('file', 'command'))}: exit {row['exitCode']}" for row in group['commands'])
        elif name == 'dependency-audit-recheck':
            detail = json.dumps(group.get('metadata') or group.get('error') or {})
        else:
            detail = group.get('scope', '')
        lines.append(f"| `{name}` | **{group['status']}** | {detail.replace('|', '/')} |")
    lines += ['', 'Group counts overlap. CI repeats some Node contracts; instrumented unit tests repeat the same '
              'assertions under coverage; HTTP also runs cross-pod cache tests. Node TAP can count parents while '
              'JUnit counts leaf cases. Python suite counters include unittest subtests. No inflated grand total is claimed.', '',
              '## Failures and unverified boundaries', '']
    failed = [row for row in cases if row['status'] == 'failed']
    by_file = Counter(row['file'] for row in failed)
    lines += ['| Source suite | Failed recorded cases |', '| --- | --- |']
    lines += [f'| `{file}` | {count} |' for file, count in by_file.most_common(35)]
    lines += ['', 'The full case list and exact assertion messages are in '
              '[case-results.json](../../reports/test-verification/case-results.json). '
              'Assertion failures may identify an implementation defect, obsolete fixture or unmet dependency; '
              'the remediation guide distinguishes confirmed observations from likely diagnoses.', '',
              'The strict master retains missing-source targets, browser-policy restrictions, unavailable semantic '
              'generation and provider/hardware prerequisites as unresolved work. It does not change expected '
              'statuses or substitute stubs to turn these into passes.', '',
              '## Platform coverage and required work', '',
              f"Source catalog: `{json.dumps(report['inventory'], sort_keys=True)}`.", '',
              f"File evidence status: `{json.dumps(report['fileStatusCounts'], sort_keys=True)}`.", '']
    if platform:
        lines += [f"Platform register: `{json.dumps(platform.get('summary', {}), sort_keys=True)}`.", '',
                  'Required behavior checks are a test plan, not a count of proven product bugs or necessarily '
                  'a count of missing test files. Existing tests can satisfy checks when their exact automated '
                  'evidence is linked. Static candidate matches and line execution alone do not establish '
                  'authorization, persistence, recovery or full UI behavior. No human approval/signature is required.', '']
    if remediation:
        lines += [f"Repair task categories: `{json.dumps(remediation.get('countsByKind', {}), sort_keys=True)}`.", '',
                  'The readable checklist is bounded for review; its JSON retains every task, location, '
                  'reproduction command and required proof.', '']
    lines += ['JavaScript/TypeScript coverage measures the instrumented unit run across frontend, backend, '
              'shared, DSP and imported source. It includes retained/unreached modules. Chromium execution '
              'and Python are separate measurements, not silently merged into the V8 percentage. Missing '
              'line/branch hits require targeted tests; even complete line execution is not proof of every business rule.', '',
              '## Provenance and replay', '',
              '- The baseline commit plus source hashes identify the tested working tree; no historical artifact is promoted to current evidence.',
              '- Initial failures are retained separately; final reconciliation reads only artifacts from this master invocation.',
              '- The earlier baseline sweep and its evidence are preserved in commit `4f9d419a`; newer upstream work was merged normally before the integrated rerun.',
              '- Production data, real financial transactions and private provider state are outside the isolated sweep. Unrun operational modes retain explicit prerequisites.',
              '- Reports, JUnit, TAP, machine case/file status, coverage maps and the source scripts are committed together. Duplicate generated HTML is reproducible.', '']
    target = ROOT / 'docs/testing/results.md'
    target.write_text('\n'.join(line.rstrip() for line in lines).rstrip() + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'reports/test-verification')
    args = parser.parse_args()
    base = args.input.resolve()
    # V8's optional mutable instrumenter bookkeeping is not FileCoverageData.
    # Preserve every source map and hit counter, while avoiding an oversized
    # duplicate of transient last/seen/name indexes in the durable artifact.
    istanbul = base / 'coverage/coverage-final.json'
    if istanbul.is_file():
        original = istanbul.read_bytes()
        data = json.loads(original)
        if any('meta' in value for value in data.values()):
            for value in data.values(): value.pop('meta', None)
            normalized = (json.dumps(data, separators=(',', ':')) + '\n').encode()
            istanbul.write_bytes(normalized)
            write_json(base / 'coverage/artifact-format.json', {
                'format': 'Istanbul FileCoverageData', 'removedOptionalField': 'meta',
                'preserved': ['path', 'statementMap', 'fnMap', 'branchMap', 's', 'f', 'b'],
                'originalBytes': len(original), 'bytes': len(normalized),
                'originalSha256': hashlib.sha256(original).hexdigest(),
                'sha256': hashlib.sha256(normalized).hexdigest(),
            })
    # Refresh discovery after newly added runner regression tests, then bind
    # only producer artifacts written during the current master invocation.
    subprocess.run([sys.executable, str(ROOT / 'scripts/testing/generate-catalog.py')], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    master = read(base / 'orchestration/results.json', {})
    started = datetime.datetime.fromisoformat(master['startedAt']).timestamp() if master.get('startedAt') else None

    def fresh(file):
        return file.is_file() and (started is None or file.stat().st_mtime >= started)

    def current(file, fallback=None):
        return read(file, fallback) if fresh(file) else fallback

    inventory = read(base / 'test-inventory.json', {'entries': [], 'counts': {}})
    groups, cases, evidence = [], [], {}

    def record(file, status, proof):
        evidence.setdefault(file, []).append({'status': status, 'evidence': proof})

    for name in ('unit', 'additional'):
        path = base / 'root' / (name + '.junit.xml')
        if name == 'unit' and not fresh(path) and fresh(base / 'root/coverage-unit.junit.xml'):
            path = base / 'root/coverage-unit.junit.xml'
        if not fresh(path):
            continue
        subset = xml_cases(path, 'root-' + name)
        if name == 'unit' and path.name == 'coverage-unit.junit.xml':
            subset = [row for row in subset if not row['file'].startswith('tests/coverage/')]
        if not subset: continue
        cases += subset
        counts = Counter(row['status'] for row in subset)
        groups.append({'group': 'root-' + name, 'status': 'failed' if counts['failed'] else 'passed',
                       'counts': dict(counts), 'total': len(subset), 'countScope': 'JUnit cases'})
        for row in subset: record(row['file'], row['status'], row['junit'])

    path = base / 'root/coverage-unit.junit.xml'
    if fresh(path):
        subset = coverage_contract_cases(path)
        if subset:
            cases += subset
            counts = Counter(row['status'] for row in subset)
            groups.append({'group': 'coverage-contracts', 'status': 'failed' if counts['failed'] else 'passed',
                           'counts': dict(counts), 'total': len(subset),
                           'countScope': 'Real database contracts instrumented in-process; assertions also run through Node entrypoints'})
            for row in subset: record(row['file'], row['status'], row['junit'])

    node = current(base / 'node/results.json', {})
    if node:
        groups.append({'group': 'node', 'status': 'failed' if node['summary']['failedFiles'] else 'passed',
                       'fileCounts': node['summary'], 'countScope': 'TAP totals include parent tests; assertion scripts have process evidence only'})
        for row in node['runs']: record(row['file'], row['status'], row['log'])

    python = current(base / 'python/results.json', {})
    if python:
        groups.append({'group': 'python', 'status': 'failed' if python['summary']['failed'] or python['summary'].get('timeout') else 'passed',
                       'files': python['summary'], 'counts': python['counts'],
                       'countScope': 'JUnit suite counters, including unittest subtests; helper/operational inventory is separate'})
        for row in python['suites']:
            record(row['file'], row['status'], 'reports/test-verification/python/' + (row.get('log') or 'results.json'))
            if row.get('junit'): cases += xml_cases(base / 'python' / row['junit'], 'python', row['file'])

    regression = current(base / 'runner-regressions/results.json', {})
    if regression:
        groups.append({'group': 'test-runner-regressions',
                       'status': 'failed' if regression['summary']['failed'] or regression['summary'].get('timeout') else 'passed',
                       'counts': regression['counts'], 'scope': 'Reporting-only follow-up after the complete master run'})
        for row in regression['suites']:
            record(row['file'], row['status'], 'reports/test-verification/runner-regressions/' + (row.get('log') or 'results.json'))
            if row.get('junit'): cases += xml_cases(base / 'runner-regressions' / row['junit'], 'test-runner-regressions', row['file'])

    commerce = current(base / 'commerce/results.json', {})
    if commerce:
        commerce_cases = []
        for row in commerce['commands']:
            record(row['path'], row['status'], 'reports/test-verification/commerce/' + row['log'])
            if row.get('junit'): commerce_cases += xml_cases(base / 'commerce' / row['junit'], 'commerce', row['path'])
        cases += commerce_cases
        provider_receipt = current(base / 'providers/stripe-test-api.json', {})
        remote_not_run = [row for row in commerce['blocked'] if not (
            provider_receipt and row['path'] == 'tests/payment-processing/real-stripe-api.mjs')]
        groups.append({'group': 'commerce', 'status': 'failed' if commerce['summary']['failed'] or commerce['summary'].get('timeout') else 'passed',
                       'counts': dict(Counter(row['status'] for row in commerce_cases)), 'total': len(commerce_cases),
                       'commands': len(commerce['commands']), 'remoteNotRun': remote_not_run, 'countScope': 'JUnit leaf cases; offline CLI assertions counted as a command only'})
        guide = ['# Commerce case index', '',
                 'Generated from the current command receipt and JUnit artifacts. These are leaf cases, including root-level Node cases and explicit skips.', '',
                 'Run each source file with the instructions in [commerce.md](commerce.md). The offline provider-report self-check is command evidence only.', '']
        for row in commerce['commands']:
            guide += [f"## `{row['path']}`", '', '```sh',
                      f"python3 scripts/testing/run-commerce.py --only {row['id']}", '```', '',
                      f"Command: **{row['status']}**; exit {row['exitCode']}.", '']
            guide += [f"- {case['status'].upper()}: {case['name']}" for case in commerce_cases if case['file'] == row['path']]
            guide += ['']
        (ROOT / 'docs/testing/commerce-cases.md').write_text('\n'.join(guide).rstrip() + '\n')

    if fresh(base / 'python/suites.md'):
        (ROOT / 'docs/testing/python.md').write_text((base / 'python/suites.md').read_text())

    subsystems = current(base / 'subsystems/results.json', {})
    if subsystems:
        groups.append({'group': 'subsystems', 'status': 'failed' if any(row['exitCode'] for row in subsystems['results']) else 'passed',
                       'commands': [{key: row[key] for key in ('id', 'status', 'exitCode', 'passedTests', 'passedScenarios') if key in row} for row in subsystems['results']],
                       'countScope': 'Per-command tests/scenarios; Rust cleanup overlaps one default Node case'})
        for row in subsystems['results']:
            for file in row['sourceFiles']: record(file, row['status'], 'reports/test-verification/subsystems/' + row['stdoutFile'])

    browser = current(base / 'integration-browser/browser-page80-summary.json', {})
    if browser:
        for group in ('browser', 'page80'):
            row = browser[group]
            groups.append({'group': group, 'status': 'failed' if row['failed'] else 'passed',
                           'passed': row['passed'], 'failed': row['failed'], 'scope': browser['scope']})
        for file in browser['browser']['files']: record(file, 'passed', 'reports/test-verification/integration-browser/browser.tap')
        record('scripts/testing/page80-acceptance.mjs', 'passed', 'reports/test-verification/integration-browser/page80/page80.json')

    browser_run = current(base / 'integration-browser/browser-run.json', {})
    if browser_run:
        groups.append({'group': 'browser', 'status': 'passed' if browser_run['exitCode'] == 0 else 'failed',
                       'counts': browser_run['counts'], 'exitCode': browser_run['exitCode']})
        for file in browser_run['files']: record(file, 'passed' if browser_run['exitCode'] == 0 else 'failed', browser_run['log'])
    pages = current(base / 'integration-browser/page80/page80.json', {})
    if pages and not browser:
        failures = pages.get('failures', [])
        groups.append({'group': 'page80', 'status': 'failed' if failures else 'passed',
                       'decision': pages.get('decision'), 'failures': failures,
                       'evidence': pages.get('evidence', {}), 'untested': pages.get('untested', [])})
        record('scripts/testing/page80-acceptance.mjs', 'failed' if failures else 'passed', 'reports/test-verification/integration-browser/page80/page80.json')

    http = current(base / 'integration-browser/http/summary.json', {})
    if http:
        subset = xml_cases(base / 'integration-browser/http/integration.junit.xml', 'http')
        cases += subset
        groups.append({'group': 'http', 'status': http['status'], 'counts': dict(Counter(row['status'] for row in subset)),
                       'total': len(subset), 'exitCode': http['exitCode'], 'countScope': '21 files; JUnit cases; dual-config cache tests also appear in root unit run'})
        for row in subset: record(row['file'], row['status'], row['junit'])

    load = current(base / 'integration-browser/http-load/page80.json', {})
    if load:
        failures = load.get('failures', [])
        groups.append({'group': 'bounded-http-load', 'status': 'failed' if failures else 'passed',
                       'decision': load.get('decision'), 'failures': failures,
                       'evidence': load.get('evidence', {}).get('httpLoad'),
                       'scope': 'One source application and disposable database; 10/20 workers for 20/10 seconds, not global capacity or soak proof'})
        record('scripts/testing/page80-acceptance.mjs', 'failed' if failures else 'passed', 'reports/test-verification/integration-browser/http-load/page80.json')

    feeds = current(base / 'root/public-feeds.json', {})
    if feeds:
        sources = feeds.get('result', {}).get('sources', [])
        groups.append({'group': 'public-feeds', 'status': 'passed' if feeds['exitCode'] == 0 else 'failed',
                       'exitCode': feeds['exitCode'], 'sources': sources, 'scope': feeds['scope']})
        record('tests/awareness-public-read-smoke.py', 'passed' if feeds['exitCode'] == 0 else 'failed', 'reports/test-verification/root/public-feeds.json')

    checks = current(base / 'final-checks/orchestration/results.json', {})
    check_runs = [row for row in master.get('runs', []) if row.get('group') == 'checks']
    if check_runs:
        checks = {'status': 'failed' if any(row['exitCode'] for row in check_runs) else 'passed', 'runs': check_runs}
    if checks:
        groups.append({'group': 'checks', 'status': checks['status'], 'commands': checks['runs']})

    audit = current(base / 'root/dependency-audit.json', {})
    if audit:
        groups.append({'group': 'dependency-audit-recheck', 'status': 'passed' if audit['exitCode'] == 0 else 'failed',
                       'exitCode': audit['exitCode'], 'metadata': audit.get('result', {}).get('metadata'),
                       'error': audit.get('result', {}).get('error')})

    provider = current(base / 'providers/stripe-test-api.json', {})
    if provider:
        receipt = provider.get('commandReceipt', {})
        groups.append({'group': 'stripe-test-api', 'status': 'passed' if receipt.get('exitCode') == 0 else 'failed',
                       'counts': provider.get('summary', {}).get('counts', {}),
                       'cleanupCounts': provider.get('summary', {}).get('cleanupCounts', {}),
                       'scope': provider.get('scope'), 'livemode': provider.get('testAccountLivemode')})
        for row in provider.get('tests', []):
            cases.append({'group': 'stripe-test-api', 'file': 'tests/payment-processing/real-stripe-api.mjs',
                          'name': row.get('scenario'), 'status': {'PASS': 'passed', 'FAIL': 'failed', 'SKIP': 'skipped', 'BLOCKED': 'blocked'}.get(row.get('status'), 'blocked'),
                          'message': ' '.join(str(value) for value in [row.get('summary'), *row.get('providerDiagnostic', {}).values()] if value), 'junit': None,
                          'evidence': 'reports/test-verification/providers/stripe-test-api.json'})
        record('tests/payment-processing/real-stripe-api.mjs', 'passed' if receipt.get('exitCode') == 0 else 'failed', 'reports/test-verification/providers/stripe-test-api.json')

    operations = current(base / 'operations/results.json', {})
    if operations:
        groups.append({'group': 'operations', 'status': 'failed' if any(row['exitCode'] for row in operations['runs']) else 'passed', 'commands': operations['runs']})
        for row in operations['runs']: record(row['file'], row['status'], row['log'])
    coverage = current(base / 'coverage/coverage-summary.json', {})
    if coverage:
        measured = next((row for row in master.get('runs', []) if row.get('group') == 'coverage'), {})
        groups.append({'group': 'coverage', 'status': 'failed' if measured.get('exitCode') or measured.get('coverageParseExclusions') else 'passed',
                       'totals': coverage.get('total'), 'files': len(coverage) - 1,
                       'parseExclusions': measured.get('coverageParseExclusions', []),
                       'scope': 'Instrumented JavaScript/TypeScript statements, branches and functions; not full business-flow proof'})
    if master.get('runs'):
        groups.append({'group': 'master-commands', 'status': 'failed' if any(row['exitCode'] or row.get('coverageParseExclusions') for row in master['runs']) else 'passed',
                       'commands': [{key: row[key] for key in ('group', 'id', 'exitCode', 'status', 'unitReportFresh', 'coverageParseExclusions') if key in row} for row in master['runs']]})
    if 'sourceInputsUnchanged' in master:
        groups.append({'group': 'source-integrity', 'status': 'passed' if master['sourceInputsUnchanged'] else 'failed',
                       'sha256': master.get('sourceInputsSha256'), 'changedFiles': master.get('changedSourceInputs', []),
                       'scope': 'Git-visible code/configuration inputs remained unchanged throughout execution'})

    gates = [row for row in master.get('postprocessing', []) if row.get('id') in ('platform', 'remediation', 'completion-plan')]
    if gates:
        groups.append({'group': 'evidence-gates', 'status': 'failed' if any(row['exitCode'] for row in gates) else 'passed',
                       'commands': [{key: row[key] for key in ('id', 'exitCode', 'status')} for row in gates]})
    coverage = []
    for entry in inventory['entries']:
        file = entry['path']; rows = evidence.get(file, [])
        statuses = {row['status'] for row in rows}
        if entry['category'] != 'test': status = 'support'
        elif 'failed' in statuses: status = 'failed'
        elif statuses & {'passed', 'passed_with_skips'}: status = 'executed'
        elif statuses: status = 'blocked_or_skipped'
        else: status = 'not_run'
        coverage.append({'file': file, 'group': entry['group'], 'status': status, 'sourceSha256': entry['sha256'],
                         'evidence': rows, 'prerequisites': entry['prerequisites'] if status == 'not_run' else []})
    report = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceBaseline': source_revision(),
              'scope': 'Final canonical evidence only; initial failures retained separately; no invented aggregate case total',
              'status': 'failed' if any(row['status'] == 'failed' for row in groups) else 'executed_groups_passed',
              'productionReady': False, 'inventory': inventory['counts'], 'groups': groups,
              'fileStatusCounts': dict(Counter(row['status'] for row in coverage)),
              'limits': ['Group counts overlap; Node parent tests differ from JUnit leaf cases',
                         'Operational/provider/hardware tests without disposable prerequisites were not run',
                         'Passing page renders and fixture journeys do not certify production quality or Replit deployment']}
    platform = current(base / 'platform-register.json', {})
    remediation = current(base / 'remediation.json', {})
    report['platform'] = platform.get('summary', {})
    report['remediation'] = {'status': remediation.get('status'), 'countsByKind': remediation.get('countsByKind')}
    write_json(base / 'summary.json', report)
    write_json(base / 'file-status.json', coverage)
    write_json(base / 'case-results.json', cases)
    write_markdown(report, coverage, cases, base, platform, remediation)
    print(json.dumps({'status': report['status'], 'groups': len(groups), 'fileStatusCounts': report['fileStatusCounts']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
