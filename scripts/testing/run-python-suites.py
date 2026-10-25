#!/usr/bin/env python3
"""Discover and run canonical Python tests with disposable state and bounded time.

Runs each file in a fresh interpreter. Live-server/load/production smoke tools
are inventoried as blocked rather than pointed at the developer's application.
No inherited application credentials or serving state are passed to children.
"""
from __future__ import annotations

import argparse
import ast
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MAXCORE = ROOT / 'external/maxcore/artifacts/ai-training-server'
LIVE_FILES = {
    'test_all_endpoints.py': 'Mutates a live model server, including training/admin routes; requires a disposable server and explicit test credentials.',
    'test_awareness_and_quality.py': 'Requires a running generation-capable isolated MaxCore model server; live quality is not established by fixtures.',
    'test_content_endpoints.py': 'Requires a running generation-capable isolated MaxCore model server; includes media generation.',
    'test_smoke_load.py': 'Live concurrent generation/load benchmark requires an isolated generation-capable model server.',
    'test_w6_90m.py': '90M-model throughput and quality benchmark requires an isolated model server and bounded resource budget.',
    'test_veo_parity.py': 'Live video/image generation parity suite targets fixed model port 9878 and requires operational generation.',
}
OPERATIONAL = {
    'endpoint_load_test.py': 'Live endpoint load generator, not an offline unit suite; requires disposable operational model server.',
    'load_test.py': '90M-scale CPU/concurrency benchmark; no bounded unit-test contract or isolated service fixture.',
    'benchmark_gpu_native.py': 'Native kernel performance benchmark; separate opt-in performance experiment, not an assertion suite.',
    'benchmark_vs_reference_gpu.py': 'Native/reference CPU/GPU performance comparison; no calibrated GPU hardware in this environment.',
    'awareness-public-read-smoke.py': 'Reads live public feeds and needs proxy/TLS networking. Kept outside the no-egress test run.',
    'dns-production-smoke.py': 'Requires a new user/network namespace (unshare -Urn) and a current built DNS artifact.',
    'npm-start-isolated-smoke.py': 'Requires disposable production fixture and isolated user/network namespace; never run against the workspace DB.',
    'production-restart-smoke.py': 'Runs two production start/stop cycles; requires disposable fixture and network namespace.',
    'pdim-retained-inventory.py': 'Read-only operator inventory of retained state; not an assertion suite and must not read private state in an offline run.',
    'harness.py': 'Shared chaos harness; not standalone tests.',
    'scenarios.py': 'Injects Redis/PostgreSQL failures; requires a disposable service topology and explicit fault-injection isolation.',
    'prepare-production-fixture.py': 'Fixture preparation utility, not standalone tests.',
    'production_fixture_support.py': 'Fixture safety helper module, exercised by test_production_fixture_support.py.',
}

GUARD = '''import ipaddress, socket
_connect=socket.socket.connect
_connect_ex=socket.socket.connect_ex
_sendto=socket.socket.sendto
def _check(address):
    if not isinstance(address, tuple): return
    host, port=address[:2]
    try: loopback=ipaddress.ip_address(host).is_loopback
    except ValueError: loopback=host == 'localhost'
    if not loopback or int(port) < 10000:
        raise OSError('offline Python test guard: only ephemeral loopback fixture ports are allowed')
def _guard_connect(self,address):
    _check(address); return _connect(self,address)
def _guard_connect_ex(self,address):
    _check(address); return _connect_ex(self,address)
def _guard_sendto(self,data,*args):
    _check(args[-1]); return _sendto(self,data,*args)
socket.socket.connect=_guard_connect
socket.socket.connect_ex=_guard_connect_ex
socket.socket.sendto=_guard_sendto
'''


def discover():
    tracked = subprocess.check_output(['git', 'ls-files', '*.py'], cwd=ROOT, text=True).splitlines()
    suites, duplicates = [], []
    for name in tracked:
        path = Path(name)
        if name.startswith('.pdim-scratch'):
            if path.name.startswith('test_'): duplicates.append(name)
            continue
        if path.name == '__init__.py': continue
        relevant = (path.name.startswith('test_') or name.startswith('tests/')
                    or '/tests/' in name and path.name in OPERATIONAL)
        if not relevant: continue
        tree = ast.parse((ROOT / name).read_text())
        cases = []
        def visit(nodes, prefix=''):
            for node in nodes:
                if isinstance(node, ast.ClassDef):
                    visit(node.body, prefix + node.name + '.')
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
                    cases.append({'name': prefix + node.name,
                                  'description': ast.get_docstring(node) or node.name.removeprefix('test_').replace('_', ' ')})
        visit(tree.body)
        reason = LIVE_FILES.get(path.name) or OPERATIONAL.get(path.name)
        if not cases and not reason and path.name != 'fsspec-advisories.py': continue
        suites.append({'file': name, 'description': ast.get_docstring(tree) or path.stem.replace('_', ' ').replace('-', ' '),
                       'cases': cases, 'blockedReason': reason, 'sourceSha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()})
    return suites, duplicates


def clean_environment(home, guard, suite):
    paths = [str(guard), str(ROOT), str(ROOT / 'tests')]
    if suite['file'].startswith('external/maxcore/'):
        paths = [str(guard), str(MAXCORE), str(MAXCORE / 'tests'), str(ROOT)]
    return {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(home), 'TMPDIR': str(home),
        'LANG': 'C.UTF-8', 'TZ': 'UTC', 'PYTHONPATH': os.pathsep.join(paths),
        'PYTHONDONTWRITEBYTECODE': '1', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD': '1',
        'MAXCORE_PRIVATE_STATE_DIR': str(home / 'state'), 'STORAGE_HTTP_URL': 'http://127.0.0.1:1',
        'MAXCORE_SERVING_RELEASE': 'live-awareness', 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1',
        'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1',
        **({'LD_LIBRARY_PATH': os.environ['LD_LIBRARY_PATH']} if os.environ.get('LD_LIBRARY_PATH') else {}),
        **({'ESPEAK_DATA_PATH': os.environ['ESPEAK_DATA_PATH']} if os.environ.get('ESPEAK_DATA_PATH') else {}),
    }


def junit_counts(file):
    if not file.exists(): return None
    root = ET.parse(file).getroot()
    entries = root.findall('testsuite') if root.tag == 'testsuites' else [root]
    return {key: sum(int(entry.get(key, 0)) for entry in entries) for key in ('tests', 'failures', 'errors', 'skipped')}


def run_suite(suite, output, interpreter, timeout):
    result = dict(suite)
    relative = suite['file']
    label = relative.replace('/', '__').removesuffix('.py')
    result['command'] = f'{shlex.quote(interpreter)} scripts/testing/run-python-suites.py --file {shlex.quote(relative)} --output {shlex.quote(str(output))}'
    if suite['blockedReason']:
        return result | {'status': 'blocked', 'exitCode': None, 'durationSeconds': 0}
    junit = output / f'{label}.xml'
    log = output / f'{label}.txt'
    args = [interpreter, '-m', 'pytest', '-q', '--import-mode=importlib', '-p', 'no:cacheprovider', str(ROOT / relative), f'--junitxml={junit}']
    if Path(relative).name == 'fsspec-advisories.py':
        args = [interpreter, str(ROOT / relative)]
    with tempfile.TemporaryDirectory(prefix='maxbooster-python-test-') as temporary:
        home = Path(temporary)
        guard = home / 'guard'; guard.mkdir(); (guard / 'sitecustomize.py').write_text(GUARD)
        env = clean_environment(home, guard, suite)
        started = time.monotonic()
        child = subprocess.Popen(args, cwd=ROOT if not relative.startswith('external/maxcore/') else MAXCORE,
                                 env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, start_new_session=True)
        expired = False
        try:
            text, _ = child.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            expired = True
            os.killpg(child.pid, signal.SIGKILL)
            text, _ = child.communicate()
        finally:
            # Only descendants in this test's newly created process group.
            try: os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        text = text.replace(str(ROOT), '<repo>').replace(temporary, '<scratch>')
        log.write_text(text[-524288:])
        counts = junit_counts(junit)
        if junit.exists():
            # Replacement markers must remain escaped in XML attributes/text.
            junit.write_text(junit.read_text().replace(str(ROOT), '&lt;repo&gt;').replace(temporary, '&lt;scratch&gt;'))
        status = 'timeout' if expired else 'passed' if child.returncode == 0 else 'empty' if child.returncode == 5 else 'failed'
        if counts and counts['skipped'] == counts['tests'] and not counts['errors'] and not counts['failures']:
            status = 'skipped'
        return result | {'status': status, 'exitCode': child.returncode, 'durationSeconds': round(time.monotonic() - started, 3),
                         'counts': counts, 'junit': junit.name if junit.exists() else None, 'log': log.name}


def write_documentation(report, target):
    counts = report['counts']
    lines = ['# Python tests', '',
             'These instructions cover canonical MaxCore, application security, evaluator-contract and Sophia runner tests. '
             'The generated scratch copies under `.pdim-scratch-external_maxcore-989/` are retained snapshots, not a second application to execute.', '',
             '## Setup', '',
             'Use Python 3.12 with the application dependencies from '
             '`external/maxcore/artifacts/ai-training-server/pyproject.toml` and its frozen `uv.lock`. '
             'The root `pyproject.toml` supplies the shared HTTP/security runtime dependencies. '
             'Use the normal application/cloud setup to install these; do not replace the verified CPU Torch wheel with an arbitrary wheel.', '',
             'Install the additional test transport/runner into that environment:', '',
             '```sh', 'python3 -m pip install -r scripts/testing/requirements.txt', '```', '',
             'The complete suite also uses Node 22.12+, a C/C++ compiler, ffmpeg/ffprobe, OpenSSL, '
             'Redis server/CLI and espeak-ng. Redis tests start their own temporary Unix-socket server. '
             'Missing optional tools produce explicit skipped tests; no production service credentials are needed.', '',
             '## Run', '', 'From the repository root, using the application Python interpreter:', '',
             '```sh', 'python3 scripts/testing/run-python-suites.py --list',
             'python3 scripts/testing/run-python-suites.py --output /tmp/maxbooster-python-results --docs /tmp/maxbooster-python-results.md',
             'python3 scripts/testing/run-python-suites.py --file tests/test_secure_http.py --output /tmp/maxbooster-python-single', '```', '',
             'Use `--python /path/to/python` to select another prepared interpreter, '
             '`--workers 1` to run serially, or `--timeout 180` to change the per-file timeout. '
             'The default is two workers and 120 seconds per file. A selected run writes only its selected suites; '
             'use a fresh output directory to preserve earlier reports.', '',
             'The runner creates a fresh interpreter, HOME and private model-state directory for each file, removes inherited application credentials, '
             'and allows only ephemeral loopback fixture connections. Fixed application ports and external network connections are refused. '
             'Each test process group is cleaned up, including after timeouts. The tool never starts training against live public/private records; '
             'small in-memory/disposable training fixtures exercise optimizer and checkpoint contracts.', '',
             '## Read the results', '',
             '`results.json` records the exact source digest, command, case descriptions, duration, exit code and status for every file. '
             'Each executed pytest file also has JUnit XML and a sanitized `.txt` console log. '
             'A direct assertion script such as fsspec has a log but no fabricated JUnit case count.', '',
             'A passing file may contain skipped cases; skips are counted separately. '
             'Blocked live/operational tools and helper modules are inventoried but never counted as passes. '
             'The runner exits nonzero for any failed, timed-out or unexpectedly empty executable suite. '
             'Its zero exit is a statement about the executed subset, not a claim that blocked journeys or production readiness passed.', '',
             '## Recorded run', '',
             f'- Source baseline: `{report["sourceRevision"]}`; individual `sourceSha256` fields bind test-file contents, including reviewed fixture updates.',
             f'- Files: {json.dumps(report["summary"], sort_keys=True)}.',
             f'- JUnit cases: {counts["tests"]}; failures: {counts["failures"]}; errors: {counts["errors"]}; skipped: {counts["skipped"]}.',
             '- Original model quality, live provider delivery and a production deployment are not certified by these tests.', '',
             '## Every Python suite', '',
             'The wrapper commands below reproduce the same isolated per-file execution. '
             'For blocked entries the command reports the missing prerequisite without contacting the running application. '
             'Live generation/load tools need a separately prepared disposable server at their documented ports; '
             'they must not be pointed at the developer or production server to make this report green.', '']
    for suite in report['suites']:
        description = suite['description'].split('\n\n')[0].replace('\n', ' ')
        lines += [f'### `{suite["file"]}`', '', description, '',
                  f'Status: **{suite["status"]}**. ' + (suite.get('blockedReason') or ''), '',
                  '```sh', f'python3 scripts/testing/run-python-suites.py --file {shlex.quote(suite["file"])} --output /tmp/maxbooster-python-single', '```', '']
        if suite.get('counts'):
            lines += [f'JUnit: {json.dumps(suite["counts"], sort_keys=True)}.', '']
        if suite['cases']:
            lines += ['<details>', '<summary>What each case checks</summary>', '']
            for case in suite['cases']:
                description = case['description'].split('\n\n')[0].replace('\n', ' ')
                lines += [f'- `{case["name"]}`: {description}']
            lines += ['', '</details>', '']
    target = Path(target); target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('\n'.join(lines) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--python', default=sys.executable, help='Interpreter with pytest and application dependencies installed')
    parser.add_argument('--file', action='append', help='Exact tracked path; repeat to select multiple suites')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/test-verification/python')
    parser.add_argument('--timeout', type=float, default=120, help='Per-file process-group timeout in seconds')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--docs', type=Path, help='Also write a per-file/case Markdown guide for this run')
    args = parser.parse_args()
    suites, duplicates = discover()
    if args.file:
        unknown = set(args.file) - {suite['file'] for suite in suites}
        if unknown: parser.error('Unknown tracked Python test: ' + ', '.join(sorted(unknown)))
        suites = [suite for suite in suites if suite['file'] in args.file]
    if args.list:
        print(json.dumps({'suites': suites, 'duplicateSnapshots': duplicates}, indent=2)); return 0
    if args.timeout <= 0: parser.error('--timeout must be positive')
    output = args.output.resolve(); output.mkdir(parents=True, exist_ok=True)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    results = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(run_suite, suite, output, args.python, args.timeout): suite for suite in suites}
        for future in as_completed(futures):
            result = future.result(); results.append(result)
            print(f'{result["status"]:8} {result["file"]}', flush=True)
    summary = {status: sum(result['status'] == status for result in results)
               for status in ('passed', 'failed', 'timeout', 'skipped', 'blocked', 'empty')}
    counts = {key: sum((result.get('counts') or {}).get(key, 0) for result in results) for key in ('tests', 'failures', 'errors', 'skipped')}
    report = {'schema': 1, 'startedAt': started, 'finishedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'interpreter': args.python, 'summary': summary, 'counts': counts,
              'isolation': 'Fresh interpreter and disposable HOME/state per file; no application credentials; only ephemeral loopback networking; child process group cleanup',
              'limits': 'Blocked/skip/timeout are not passes; fixture training does not establish generation quality or production readiness',
              'duplicateSnapshots': duplicates, 'suites': sorted(results, key=lambda result: result['file'])}
    (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    if args.docs: write_documentation(report, args.docs)
    print(json.dumps({'summary': summary, 'counts': counts}))
    return 1 if summary['failed'] or summary['timeout'] or summary['empty'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
