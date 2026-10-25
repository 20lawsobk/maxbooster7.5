#!/usr/bin/env python3
"""Reconcile final evidence without counting historical failures as new runs."""
import argparse
from collections import Counter
import datetime
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from common import ROOT, source_revision, write_json


def read(file, fallback=None):
    return json.loads(file.read_text()) if file.is_file() else fallback


def xml_cases(file, group, default_file=None):
    cases = []
    if not file.is_file(): return cases
    root = ET.parse(file).getroot()
    for suite in root.iter('testsuite'):
        name = suite.get('name', '')
        for case in suite.findall('testcase'):
            failure = case.find('failure')
            if failure is None: failure = case.find('error')
            status = 'failed' if failure is not None else 'skipped' if case.find('skipped') is not None else 'passed'
            cases.append({'group': group, 'file': default_file or case.get('file') or name,
                          'name': case.get('name'), 'status': status,
                          'message': failure.get('message', '')[:500] if failure is not None else None,
                          'junit': str(file.relative_to(ROOT)) if file.is_relative_to(ROOT) else str(file)})
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'reports/test-verification')
    args = parser.parse_args()
    base = args.input.resolve()
    inventory = read(base / 'test-inventory.json', {'entries': [], 'counts': {}})
    groups, cases, evidence = [], [], {}

    def record(file, status, proof):
        evidence.setdefault(file, []).append({'status': status, 'evidence': proof})

    for name in ('unit', 'additional'):
        path = base / 'root' / (name + '.junit.xml')
        subset = xml_cases(path, 'root-' + name)
        if not subset: continue
        cases += subset
        counts = Counter(row['status'] for row in subset)
        groups.append({'group': 'root-' + name, 'status': 'failed' if counts['failed'] else 'passed',
                       'counts': dict(counts), 'total': len(subset), 'countScope': 'JUnit cases'})
        for row in subset: record(row['file'], row['status'], row['junit'])

    node = read(base / 'node/results.json', {})
    if node:
        groups.append({'group': 'node', 'status': 'failed' if node['summary']['failedFiles'] else 'passed',
                       'fileCounts': node['summary'], 'countScope': 'TAP totals include parent tests; assertion scripts have process evidence only'})
        for row in node['runs']: record(row['file'], row['status'], row['log'])

    python = read(base / 'python/results.json', {})
    if python:
        groups.append({'group': 'python', 'status': 'failed' if python['summary']['failed'] else 'passed',
                       'files': python['summary'], 'counts': python['counts'],
                       'countScope': 'JUnit suite counters, including unittest subtests; helper/operational inventory is separate'})
        for row in python['suites']:
            record(row['file'], row['status'], 'reports/test-verification/python/' + (row.get('log') or 'results.json'))
            if row.get('junit'): cases += xml_cases(base / 'python' / row['junit'], 'python', row['file'])

    commerce = read(base / 'commerce/results.json', {})
    if commerce:
        commerce_cases = []
        for row in commerce['commands']:
            record(row['path'], row['status'], 'reports/test-verification/commerce/' + row['log'])
            if row.get('junit'): commerce_cases += xml_cases(base / 'commerce' / row['junit'], 'commerce', row['path'])
        cases += commerce_cases
        groups.append({'group': 'commerce', 'status': 'failed' if commerce['summary']['failed'] else 'passed',
                       'counts': dict(Counter(row['status'] for row in commerce_cases)), 'total': len(commerce_cases),
                       'commands': len(commerce['commands']), 'remoteNotRun': commerce['blocked'], 'countScope': 'JUnit leaf cases; offline CLI assertions counted as a command only'})

    subsystems = read(base / 'subsystems/results.json', {})
    if subsystems:
        groups.append({'group': 'subsystems', 'status': 'failed' if any(row['exitCode'] for row in subsystems['results']) else 'passed',
                       'commands': [{key: row[key] for key in ('id', 'status', 'exitCode', 'passedTests', 'passedScenarios') if key in row} for row in subsystems['results']],
                       'countScope': 'Per-command tests/scenarios; Rust cleanup overlaps one default Node case'})
        for row in subsystems['results']:
            for file in row['sourceFiles']: record(file, row['status'], 'reports/test-verification/subsystems/' + row['stdoutFile'])

    browser = read(base / 'integration-browser/browser-page80-summary.json', {})
    if browser:
        for group in ('browser', 'page80'):
            row = browser[group]
            groups.append({'group': group, 'status': 'failed' if row['failed'] else 'passed',
                           'passed': row['passed'], 'failed': row['failed'], 'scope': browser['scope']})
        for file in browser['browser']['files']: record(file, 'passed', 'reports/test-verification/integration-browser/browser.tap')
        record('scripts/testing/page80-acceptance.mjs', 'passed', 'reports/test-verification/integration-browser/page80/page80.json')

    http = read(base / 'integration-browser/http/summary.json', {})
    if http:
        subset = xml_cases(base / 'integration-browser/http/integration.junit.xml', 'http')
        cases += subset
        groups.append({'group': 'http', 'status': http['status'], 'counts': dict(Counter(row['status'] for row in subset)),
                       'total': len(subset), 'exitCode': http['exitCode'], 'countScope': '21 files; JUnit cases; dual-config cache tests also appear in root unit run'})
        for row in subset: record(row['file'], row['status'], row['junit'])

    feeds = read(base / 'root/public-feeds.json', {})
    if feeds:
        sources = feeds.get('result', {}).get('sources', [])
        groups.append({'group': 'public-feeds', 'status': 'passed' if feeds['exitCode'] == 0 else 'failed',
                       'exitCode': feeds['exitCode'], 'sources': sources, 'scope': feeds['scope']})
        record('tests/awareness-public-read-smoke.py', 'passed' if feeds['exitCode'] == 0 else 'failed', 'reports/test-verification/root/public-feeds.json')

    checks = read(base / 'final-checks/orchestration/results.json', {})
    if checks:
        groups.append({'group': 'checks', 'status': checks['status'], 'commands': checks['runs']})

    audit = read(base / 'root/dependency-audit.json', {})
    if audit:
        groups.append({'group': 'dependency-audit-recheck', 'status': 'passed' if audit['exitCode'] == 0 else 'failed',
                       'exitCode': audit['exitCode'], 'metadata': audit.get('result', {}).get('metadata'),
                       'error': audit.get('result', {}).get('error')})

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
    write_json(base / 'summary.json', report)
    write_json(base / 'file-status.json', coverage)
    write_json(base / 'case-results.json', cases)
    print(json.dumps({'status': report['status'], 'groups': len(groups), 'fileStatusCounts': report['fileStatusCounts']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
