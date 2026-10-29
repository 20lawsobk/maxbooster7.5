#!/usr/bin/env python3
"""Rerun every isolated test group, retaining failures and blocked coverage."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from common import ROOT, coverage_parse_exclusions, run_command, source_inputs, source_revision, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group', action='append', choices=('root', 'coverage', 'node', 'python', 'commerce', 'subsystems', 'browser', 'http', 'pages', 'load', 'operations', 'checks', 'providers'), help='Repeat to select groups; default runs all enabled groups')
    parser.add_argument('--stripe-test-api', action='store_true', help='Enable dedicated Stripe TEST API journeys, including owned sandbox mutations and cleanup; never uses application Stripe credentials')
    parser.add_argument('--python', default=sys.executable, help='Prepared Python interpreter with testing requirements')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/test-verification')
    parser.add_argument('--rust-toolchain', type=Path)
    parser.add_argument('--go-path', type=Path)
    parser.add_argument('--go-cache', type=Path)
    parser.add_argument('--plan', action='store_true', help='Print commands without execution')
    args = parser.parse_args()
    output = args.output.resolve()
    browser = ['tests/auth-session-transient-browser.test.mjs', 'tests/local-media-renderer-browser.test.mjs',
               'tests/storefront-hook-transition.test.mjs', 'tests/studio-load-save-guard.test.mjs', 'tests/studio-plugin-audio-browser.test.mjs']
    subsystems = [args.python, 'scripts/testing/run-subsystems.py', '--output', str(output / 'subsystems'), '--include-pdim-smoke', '--include-rust-concurrency']
    for flag, value in (('--rust-toolchain', args.rust_toolchain), ('--go-path', args.go_path), ('--go-cache', args.go_cache)):
        if value:
            subsystems += [flag, str(value.resolve())]
    jobs = [
        ('checks', 'build', ['npm', 'run', 'build'], 900),
        ('root', 'ci', ['npm', 'run', 'test:ci'], 1200),
        ('root', 'additional', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.additional.config.ts', '--reporter=verbose', '--reporter=junit', '--outputFile=' + str(output / 'root/additional.junit.xml')], 180),
        ('coverage', 'coverage', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.platform.config.ts', '--reporter=junit', '--outputFile=' + str(output / 'root/coverage-unit.junit.xml')], 1200),
        ('node', 'desktop-transport-setup', ['node', 'scripts/patch-electron-builder-transport.mjs'], 60),
        ('node', 'node', [args.python, 'scripts/testing/run-node-suites.py', '--output', str(output / 'node')], 2400),
        ('python', 'python', [args.python, 'scripts/testing/run-python-suites.py', '--python', args.python, '--coverage', '--output', str(output / 'python'), '--docs', str(output / 'python/suites.md')], 2400),
        ('commerce', 'commerce', [args.python, 'scripts/testing/run-commerce.py', '--output', str(output / 'commerce')], 900),
        ('subsystems', 'subsystems', subsystems, 1200),
        ('browser', 'browser', ['node', '--test', '--test-concurrency=1', *browser], 300),
        ('http', 'http', ['node', 'scripts/testing/integration-browser.mjs'], 2400),
        ('pages', 'pages', ['node', 'scripts/testing/page80-acceptance.mjs'], 900),
        ('load', 'bounded-http-load', ['node', 'scripts/testing/page80-acceptance.mjs', '--http-load'], 900),
        ('operations', 'operations', [args.python, 'scripts/testing/run-operations.py', '--python', args.python, '--output', str(output / 'operations')], 900),
        ('checks', 'types', ['npm', 'run', 'check'], 900),
        ('checks', 'lint', ['npm', 'run', 'lint'], 900),
        ('checks', 'audit', ['npm', 'audit', '--omit=dev', '--audit-level=high', '--json'], 300),
    ]
    if args.stripe_test_api:
        jobs.append(('providers', 'stripe-test-api', ['node', 'tests/payment-processing/real-stripe-api.mjs'], 900))
    if args.group and 'providers' in args.group and not args.stripe_test_api:
        parser.error('The providers group requires --stripe-test-api and dedicated sandbox credentials')
    selected = set(args.group or [group for group, _, _, _ in jobs])
    jobs = [job for job in jobs if job[0] in selected]
    if selected & {'http', 'pages', 'load'} and 'checks' not in selected:
        build_group = next(group for group in ('pages', 'http', 'load') if group in selected)
        jobs.insert(0, (build_group, 'frontend-build', ['npm', 'run', 'build'], 900))
    if args.plan:
        print(json.dumps([{'group': group, 'id': name, 'command': command, 'timeoutSeconds': timeout} for group, name, command, timeout in jobs], indent=2))
        return 0
    output.mkdir(parents=True, exist_ok=True)
    (output / 'root').mkdir(exist_ok=True)
    report = {'sourceRevision': source_revision(), 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'scope': 'Isolated groups; live provider, destructive, long-running and hardware checks remain explicit in the catalog', 'selectedGroups': sorted(selected), 'runs': [], 'productionReady': False}
    before_inputs = source_inputs()
    write_json(output / 'orchestration/source-inputs.json', before_inputs)
    report['sourceInputsSha256'] = before_inputs['sha256']
    catalog = run_command([args.python, 'scripts/testing/generate-catalog.py'], output / 'orchestration/catalog.txt', 120)
    report['catalog'] = catalog
    # Test subprocesses get tool paths only. Never inherit application keys/URLs.
    for group, name, command, timeout in jobs:
        env = {}
        unit_before = (ROOT / 'test-results.xml').stat().st_mtime_ns if (ROOT / 'test-results.xml').is_file() else None
        if group == 'coverage': env['MAXBOOSTER_TEST_COVERAGE_DIR'] = str(output / 'coverage')
        if group in ('http', 'pages', 'load'):
            env['MAXBOOSTER_TEST_REPORT_DIR'] = str(output / 'integration-browser' / {'http': 'http', 'pages': 'page80', 'load': 'http-load'}[group])
            env['MAXBOOSTER_PYTHON'] = args.python
        if group == 'subsystems' or name == 'audit' or group == 'providers':
            # Dependencies may be fetched through the approved platform proxy.
            for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CARGO_HTTP_CAINFO', 'NODE_EXTRA_CA_CERTS', 'NPM_CONFIG_CAFILE'):
                if os.environ.get(key): env[key] = os.environ[key]
            if name == 'audit' and not env.get('NODE_EXTRA_CA_CERTS'):
                trust = env.get('SSL_CERT_FILE', '/etc/ssl/certs/ca-certificates.crt')
                if Path(trust).is_file(): env['NODE_EXTRA_CA_CERTS'] = trust
        if group == 'providers':
            for key in ('STRIPE_TEST_SECRET', 'STRIPE_TEST_CLIENT'):
                if os.environ.get(key): env[key] = os.environ[key]
            if not env.get('NODE_EXTRA_CA_CERTS') and Path('/etc/ssl/certs/ca-certificates.crt').is_file():
                env['NODE_EXTRA_CA_CERTS'] = '/etc/ssl/certs/ca-certificates.crt'
        result = run_command(command, output / 'orchestration' / (name + '.txt'), timeout, extra_env=env)
        result.update(group=group, id=name)
        if group == 'coverage':
            result['coverageParseExclusions'] = coverage_parse_exclusions((ROOT / result['log']).read_text())
            if result['coverageParseExclusions']:
                result['status'] = 'failed'  # Preserve the subprocess's actual exitCode.
        report['runs'].append(result)
        write_json(output / 'orchestration/results.json', report)
        if group == 'root' and name == 'ci' and (ROOT / 'test-results.xml').is_file() and (ROOT / 'test-results.xml').stat().st_mtime_ns != unit_before:
            (output / 'root/unit.junit.xml').write_bytes((ROOT / 'test-results.xml').read_bytes())
            result['unitReportFresh'] = True
        elif group == 'root' and name == 'ci':
            result['unitReportFresh'] = False
        if group == 'browser':
            text = (ROOT / result['log']).read_text()
            counts = {key: int(value) for key, value in re.findall(r'^# (tests|pass|fail|skipped) (\d+)\s*$', text, re.M)}
            write_json(output / 'integration-browser/browser-run.json', {'sourceRevision': source_revision(), 'files': browser, 'exitCode': result['exitCode'], 'counts': counts, 'log': result['log']})
        if name == 'audit':
            try:
                audit = json.loads((ROOT / result['log']).read_text())
            except ValueError:
                audit = {'error': {'summary': 'Audit service did not return valid JSON; inspect the retained log'}}
            write_json(output / 'root/dependency-audit.json', {'command': command, 'exitCode': result['exitCode'], 'tlsVerification': True, 'result': audit})
        if group == 'providers':
            source = ROOT / '.local/payment-processing/real-stripe-report.json'
            if source.is_file() and source.stat().st_mtime >= datetime.datetime.fromisoformat(result['startedAt']).timestamp():
                provider = json.loads(source.read_text())
                # The runner's self-tested diagnostic sanitizer owns these
                # fields. Do not publish previous account/resource history.
                retained = {key: provider.get(key) for key in ('schemaVersion', 'startedAt', 'finishedAt', 'testAccountLivemode', 'webhookIsolation', 'tests', 'resources', 'cleanup', 'summary', 'coverageNotes')}
                retained['scope'] = 'Dedicated Stripe TEST API only; not application routes or a Replit deployment check'
                retained['commandReceipt'] = result
                write_json(output / 'providers/stripe-test-api.json', retained)
        print(f"{result['status']}: {group}/{name} (exit {result['exitCode']})", flush=True)
    after_inputs = source_inputs()
    report['sourceInputsUnchanged'] = before_inputs['sha256'] == after_inputs['sha256']
    report['changedSourceInputs'] = sorted(name for name in set(before_inputs['files']) | set(after_inputs['files'])
        if before_inputs['files'].get(name) != after_inputs['files'].get(name))
    report['postprocessing'] = []
    post = [
        ('summary', [args.python, 'scripts/testing/summarize-results.py', '--input', str(output)]),
        ('platform', [args.python, 'scripts/testing/platform-register.py', '--input', str(output), '--output', str(output)]),
        ('remediation', [args.python, 'scripts/testing/remediation.py', '--input', str(output), '--output', str(output)]),
        ('completion-plan', [args.python, 'scripts/testing/generate-platform-plan.py', '--input', str(output / 'platform-register.json'), '--output', str(output / 'completion-plan.json'), '--require-page-work']),
        ('final-summary', [args.python, 'scripts/testing/summarize-results.py', '--input', str(output)]),
    ]
    for name, command in post:
        if name in ('platform', 'remediation') and not args.group: command += ['--strict']
        result = run_command(command, output / 'orchestration' / (name + '.txt'), 180)
        result['id'] = name
        report['postprocessing'].append(result)
        write_json(output / 'orchestration/results.json', report)
        print(f"{result['status']}: {name} (exit {result['exitCode']})", flush=True)
    failed = not report['sourceInputsUnchanged'] or catalog['exitCode'] != 0 or any(row['exitCode'] != 0 or row.get('coverageParseExclusions') for row in report['runs'] + report['postprocessing'])
    report['status'] = 'failed' if failed else 'executed_groups_passed'
    report['allTestsPassed'] = False if failed else None  # Excluded coverage is never inferred to pass.
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write_json(output / 'orchestration/results.json', report)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
