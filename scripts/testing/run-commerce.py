#!/usr/bin/env python3
"""Run credential-free commerce tests with per-file TAP, JUnit and JSON evidence.

Requires Node 22+, npm dependencies, PostgreSQL server tools, Redis and FFmpeg.
Remote Stripe modes and the Stripe.js browser fixture are recorded as not run.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def counts(path):
    if not path.is_file():
        return None
    try:
        tree = ET.parse(path)
        cases = tree.findall('.//testcase')
        return {'tests': len(cases), 'failures': sum(c.find('failure') is not None for c in cases),
                'errors': sum(c.find('error') is not None for c in cases),
                'skipped': sum(c.find('skipped') is not None for c in cases)}
    except ET.ParseError:
        return None


def redact(text):
    text = re.sub(r'\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9_]+', '[REDACTED_KEY]', text)
    return re.sub(r'\b(?:pi|seti|cs)_[A-Za-z0-9]+_secret_[A-Za-z0-9_]+', '[REDACTED_CLIENT_SECRET]', text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/test-verification/commerce')
    parser.add_argument('--only', help='Select a payment basename, legacy-beat, or provider-report-summary')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    node = shutil.which('node')
    if not node:
        parser.error('Node is required')
    major = int(subprocess.check_output([node, '-p', 'process.versions.node.split(".")[0]'], text=True).strip())
    if major < 22:
        parser.error('Node 22 or newer is required')
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    files = sorted(p for p in (ROOT / 'tests/payment-processing').glob('*.mjs') if 'node:test' in p.read_text())
    report = {'schemaVersion': 1, 'sourceRevision': source, 'startedAt': now(),
              'nodeVersion': subprocess.check_output([node, '--version'], text=True).strip(),
              'boundary': 'No inherited application keys, DB URL, NODE_OPTIONS or provider credentials; disposable local SQL only',
              'commands': [], 'blocked': [], 'selection': args.only}
    with tempfile.TemporaryDirectory(prefix='commerce-suite-home-') as home:
        env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': home, 'LANG': 'C', 'TZ': 'UTC', 'CI': '1',
               'MAXBOOSTER_TEST_PYTHON': os.sys.executable}
        if os.environ.get('LD_LIBRARY_PATH'):
            env['LD_LIBRARY_PATH'] = os.environ['LD_LIBRARY_PATH']
        jobs = [(p.stem, str(p.relative_to(ROOT)), [node, '--test', '--test-concurrency=1',
                 '--test-reporter=tap', '--test-reporter-destination=stdout', '--test-reporter=junit',
                 f'--test-reporter-destination={output / (p.stem + ".xml")}', str(p.relative_to(ROOT))]) for p in files]
        jobs.append(('legacy-beat', 'tests/unit/beat-sale-money-loop.test.ts', [node,
                     'scripts/testing/commerce-legacy-fixture.mjs', str(output / 'legacy-beat.xml')]))
        jobs.append(('provider-report-summary', 'tests/payment-processing/real-stripe-api.mjs', [node,
                     'tests/payment-processing/real-stripe-api.mjs', '--self-test-summary']))
        if args.only and not any(args.only in (name, Path(file).name) for name, file, _ in jobs):
            parser.error('--only did not match a commerce suite')
        for name, file, command in jobs:
            if args.only and args.only not in (name, Path(file).name):
                continue
            started = time.monotonic()
            log = output / (name + '.txt')
            proc = subprocess.Popen(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            timed_out = False
            try:
                text, _ = proc.communicate(timeout=300)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    text, _ = proc.communicate(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    text, _ = proc.communicate()
            log.write_text(redact(text))
            junit = output / (name + '.xml')
            if junit.exists():
                junit.write_text(redact(junit.read_text()))
            parsed_counts = counts(junit)
            self_check = name == 'provider-report-summary'
            status = 'timeout' if timed_out else 'passed' if proc.returncode == 0 and (parsed_counts is not None or self_check) else 'failed'
            result = {'id': name, 'path': file, 'command': command[1:], 'status': status,
                      'exitCode': proc.returncode, 'durationSeconds': round(time.monotonic() - started, 3),
                      'counts': parsed_counts, 'log': log.name, 'junit': junit.name if junit.exists() else None}
            if self_check:
                result['assertionFormat'] = 'Bundled CLI self-check; its exit code verifies result aggregation and redaction; no JUnit cases fabricated'
            if proc.returncode == 0 and parsed_counts is None and not self_check:
                result['evidenceError'] = 'The command produced no parseable JUnit evidence'
            report['commands'].append(result)
            print(f'{name}: {result["status"]} {result["counts"]}', flush=True)
            (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    for file in ('real-stripe-api.mjs', 'inbound-real-stripe.mjs', 'real-stripe-topup.mjs', 'browser-fixture.mjs'):
        report['blocked'].append({'path': 'tests/payment-processing/' + file, 'status': 'not_run',
            'mode': 'remote-provider execution (not the offline report self-check)',
            'reason': 'Requires an explicitly selected isolated Stripe TEST account and creates remote test objects; provider mutations excluded from this credential-free rerun'})
    report['finishedAt'] = now()
    report['summary'] = {key: sum(r['status'] == key for r in report['commands']) for key in ('passed', 'failed', 'timeout')}
    report['summary']['remoteNotRun'] = len(report['blocked'])
    report['productionReady'] = False
    (output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    return 1 if report['summary']['failed'] or report['summary']['timeout'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
