#!/usr/bin/env python3
"""Rerun every isolated test group, retaining failures and blocked coverage."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from common import ROOT, run_command, source_revision, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group', action='append', choices=('root', 'node', 'python', 'commerce', 'subsystems', 'browser', 'http', 'pages', 'checks'), help='Repeat to select groups; default runs all')
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
        ('root', 'ci', ['npm', 'run', 'test:ci'], 1200),
        ('root', 'additional', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.additional.config.ts', '--reporter=verbose', '--reporter=junit', '--outputFile=' + str(output / 'root/additional.junit.xml')], 180),
        ('node', 'node', [args.python, 'scripts/testing/run-node-suites.py', '--output', str(output / 'node')], 2400),
        ('python', 'python', [args.python, 'scripts/testing/run-python-suites.py', '--python', args.python, '--output', str(output / 'python'), '--docs', str(output / 'python/suites.md')], 2400),
        ('commerce', 'commerce', [args.python, 'scripts/testing/run-commerce.py', '--output', str(output / 'commerce')], 900),
        ('subsystems', 'subsystems', subsystems, 1200),
        ('browser', 'browser', ['node', '--test', '--test-concurrency=1', *browser], 300),
        ('http', 'http', ['node', 'scripts/testing/integration-browser.mjs'], 2400),
        ('pages', 'pages', ['node', 'scripts/testing/page80-acceptance.mjs'], 900),
        ('checks', 'types', ['npm', 'run', 'check'], 900),
        ('checks', 'lint', ['npm', 'run', 'lint'], 900),
        ('checks', 'build', ['npm', 'run', 'build'], 900),
        ('checks', 'audit', ['npm', 'run', 'security:audit'], 300),
    ]
    selected = set(args.group or [group for group, _, _, _ in jobs])
    jobs = [job for job in jobs if job[0] in selected]
    if args.plan:
        print(json.dumps([{'group': group, 'id': name, 'command': command, 'timeoutSeconds': timeout} for group, name, command, timeout in jobs], indent=2))
        return 0
    output.mkdir(parents=True, exist_ok=True)
    (output / 'root').mkdir(exist_ok=True)
    report = {'sourceRevision': source_revision(), 'scope': 'Isolated groups; live provider, destructive, long-running and hardware checks remain explicit in the catalog', 'selectedGroups': sorted(selected), 'runs': [], 'productionReady': False}
    # Test subprocesses get tool paths only. Never inherit application keys/URLs.
    for group, name, command, timeout in jobs:
        env = {}
        if group in ('http', 'pages'):
            env['MAXBOOSTER_TEST_REPORT_DIR'] = str(output / 'integration-browser' / ('http' if group == 'http' else 'page80'))
            env['MAXBOOSTER_PYTHON'] = args.python
        if group == 'subsystems' or name == 'audit':
            # Dependencies may be fetched through the approved platform proxy.
            for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CARGO_HTTP_CAINFO', 'NODE_EXTRA_CA_CERTS', 'NPM_CONFIG_CAFILE'):
                if os.environ.get(key): env[key] = os.environ[key]
            if name == 'audit' and not env.get('NODE_EXTRA_CA_CERTS'):
                trust = env.get('SSL_CERT_FILE', '/etc/ssl/certs/ca-certificates.crt')
                if Path(trust).is_file(): env['NODE_EXTRA_CA_CERTS'] = trust
        result = run_command(command, output / 'orchestration' / (name + '.txt'), timeout, extra_env=env)
        result.update(group=group, id=name)
        report['runs'].append(result)
        write_json(output / 'orchestration/results.json', report)
        if group == 'root' and name == 'ci' and (ROOT / 'test-results.xml').is_file():
            (output / 'root/unit.junit.xml').write_bytes((ROOT / 'test-results.xml').read_bytes())
        print(f"{result['status']}: {group}/{name} (exit {result['exitCode']})", flush=True)
    failed = any(row['exitCode'] != 0 for row in report['runs'])
    report['status'] = 'failed' if failed else 'executed_groups_passed'
    report['allTestsPassed'] = False if failed else None  # Excluded coverage is never inferred to pass.
    write_json(output / 'orchestration/results.json', report)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
