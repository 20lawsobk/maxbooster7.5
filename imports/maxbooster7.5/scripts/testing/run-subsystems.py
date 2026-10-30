#!/usr/bin/env python3
"""Rerun canonical native/imported subsystem checks without application secrets."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
PROXY_SELECTORS = ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
                   'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CARGO_HTTP_CAINFO')


def run_suite(name, command, cwd, env, output, timeout, sources):
    started = time.monotonic()
    raw = output / (name + '.txt')
    timed_out = False
    with raw.open('w') as log:
        try:
            child = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                     stderr=subprocess.STDOUT, start_new_session=True)
        except FileNotFoundError as error:
            log.write(f'Missing test prerequisite: {error.filename}\n')
            return dict(id=name, status='blocked', exitCode=None,
                        command=command, cwd=str(cwd.relative_to(ROOT)),
                        sourceFiles=sources, stdoutFile=raw.name,
                        reason='Required executable is not installed')
        try:
            code = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(child.pid, signal.SIGKILL)
            code = child.wait()
    text = re.sub(r'\x1b\[[0-9;]*m', '', raw.read_text(errors='replace'))
    raw.write_text(text.replace(str(ROOT), '<repository>'))
    result = dict(id=name, status='failed' if code else 'passed', exitCode=code,
                  timedOut=timed_out, seconds=round(time.monotonic()-started, 3),
                  command=command, cwd=str(cwd.relative_to(ROOT)) or '.',
                  sourceFiles=sources, stdoutFile=raw.name)
    result['sourceSha256'] = {source: hashlib.sha256((ROOT/source).read_bytes()).hexdigest()
                              for source in sources}
    if name == 'rust-boosterstate':
        result['passedTests'] = sum(map(int, re.findall(r'test result: ok\. (\d+) passed;', text)))
    elif name == 'go-dns':
        events = [json.loads(line) for line in text.splitlines() if line.startswith('{')]
        result['passedTests'] = sum(e.get('Action') == 'pass' and 'Test' in e for e in events)
    elif name == 'pdim-erasure':
        match = re.search(r'across (\d+) loss scenarios', text)
        result['passedScenarios'] = int(match[1]) if match and not code else 0
    elif name == 'rust-cleanup-concurrency':
        match = re.search(r'# pass (\d+)', text)
        result['passedTests'] = int(match[1]) if match else 0
    elif name == 'pdim-http-load':
        fixture_result = output/'pdim-smoke-results.json'
        if fixture_result.is_file():
            detail = json.loads(fixture_result.read_text())
            result['passedTests'] = detail.get('passedTests', 0)
            result['totalTests'] = detail.get('totalTests')
            result['fixtureReport'] = fixture_result.name
    print(json.dumps({key: result[key] for key in ('id', 'status', 'exitCode', 'seconds')}), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'reports/test-verification/subsystems')
    parser.add_argument('--cargo-home', type=Path)
    parser.add_argument('--go-path', type=Path)
    parser.add_argument('--go-cache', type=Path)
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--rust-toolchain', type=Path, help='Optional verified portable Rust root for the opt-in publishing test')
    parser.add_argument('--include-rust-concurrency', action='store_true')
    parser.add_argument('--include-pdim-smoke', action='store_true', help='Run the original HTTP/load assertions against disposable PostgreSQL/fabric')
    args = parser.parse_args()
    output = args.output.resolve(); output.mkdir(parents=True, exist_ok=True)
    cache = ROOT/'.cache/testing/subsystems'; cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='maxbooster-subsystem-home-') as home:
        env = dict(PATH=os.environ.get('PATH', '/usr/bin:/bin'), HOME=home, LANG='C', CI='1')
        for key in (*PROXY_SELECTORS, 'LD_LIBRARY_PATH'):
            if key in os.environ:
                env[key] = os.environ[key]
        rust_env = {**env, 'CARGO_HOME': str((args.cargo_home or cache/'cargo').resolve()),
                    'CARGO_TARGET_DIR': str(cache/'target'), 'CARGO_BUILD_JOBS': '2'}
        go_env = {**env, 'GOTOOLCHAIN': 'local', 'GOMAXPROCS': '2',
                  'GOPATH': str((args.go_path or cache/'go').resolve()),
                  'GOCACHE': str((args.go_cache or cache/'go-cache').resolve())}
        if args.offline:
            go_env.update(GOPROXY='off', GOSUMDB='off')
        definitions = [
            ('rust-boosterstate', ['cargo', 'test', '--locked', '--all-targets',
                                  *(['--offline'] if args.offline else []), '--manifest-path', 'boosterstate/Cargo.toml'],
             ROOT, rust_env, 600, ['boosterstate/tests/runtime_dependency.rs']),
            ('go-dns', ['go', 'test', '-json', '-count=1', '-mod=readonly', './...'],
             ROOT/'dns-os/services/dns-authoritative', go_env, 300,
             ['dns-os/services/dns-authoritative/dependency_runtime_test.go']),
            ('pdim-erasure', ['node', '--import', 'tsx', 'external/pdim/artifacts/api-server/src/pocket-dimension/fabric/erasure/__rs_test.ts'],
             ROOT, env, 60, ['external/pdim/artifacts/api-server/src/pocket-dimension/fabric/erasure/__rs_test.ts']),
            ('maxcore-js-security', ['node', 'scripts/check-js-security-versions.js'],
             ROOT/'external/maxcore', env, 60, ['external/maxcore/scripts/check-js-security-versions.js']),
        ]
        if args.include_rust_concurrency:
            concurrency_env = {**env, 'RUN_RUST_TOOLCHAIN_TESTS': '1'}
            if args.rust_toolchain:
                concurrency_env['BOOSTERSTATE_PORTABLE_RUST_DIR'] = str(args.rust_toolchain.resolve())
            definitions.append(('rust-cleanup-concurrency', ['node', '--test', 'tests/deployment-rust-phase.test.mjs'],
                                ROOT, concurrency_env, 270, ['tests/deployment-rust-phase.test.mjs']))
        if args.include_pdim_smoke:
            definitions.append(('pdim-http-load', ['node', 'scripts/testing/run-pdim-smoke.mjs', str(output)],
                                ROOT, env, 420, ['external/pdim/scripts/src/smoke-load-test.ts']))
        results = [run_suite(name, cmd, cwd, scoped, output, limit, sources)
                   for name, cmd, cwd, scoped, limit, sources in definitions]
    report = dict(generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  scope='Canonical native/imported subsystem checks; no production database or provider credentials',
                  settings=dict(includeRustConcurrency=args.include_rust_concurrency,
                                includePdimSmoke=args.include_pdim_smoke, offline=args.offline,
                                portableRustSelected=args.rust_toolchain is not None),
                  results=results)
    (output/'results.json').write_text(json.dumps(report, indent=2)+'\n')
    return int(any(row['status'] != 'passed' for row in results))


if __name__ == '__main__':
    raise SystemExit(main())
