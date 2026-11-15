#!/usr/bin/env python3
"""Rerun every isolated test group, retaining failures and blocked coverage."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ElementTree
from common import ROOT, coverage_parse_exclusions, run_command, source_inputs, source_revision, write_json

def _artifact_signature(path):
    """Observe an old artifact without following symlink ancestors."""
    path = Path(path).absolute()
    for member in (*reversed(path.parents), path):
        if member.is_symlink():
            raise ValueError('Coverage artifact has a symlink ancestor')
    try:
        value = path.stat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(value.st_mode):
        raise ValueError('Coverage artifact is not a regular file')
    return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _fresh_artifact(path, before, started_ns, finished_ns, maximum_bytes=32 * 1024 * 1024):
    """Bind stable bytes created by this child window, retaining an exact SHA."""
    observed = _artifact_signature(path)
    if observed is None or observed == before:
        raise ValueError('Coverage artifact is absent or unchanged from before the command')
    if not started_ns <= observed[3] <= finished_ns:
        raise ValueError('Coverage artifact mtime is outside the parent command window')
    if observed[2] > maximum_bytes:
        raise ValueError('Coverage artifact exceeds the bounded input size')
    descriptor = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(descriptor, 'rb') as stream:
        initial = os.fstat(stream.fileno())
        data = stream.read(maximum_bytes + 1)
        final = os.fstat(stream.fileno())
    identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
    if len(data) > maximum_bytes or identity(initial) != identity(final) or identity(final) != observed or _artifact_signature(path) != observed:
        raise ValueError('Coverage artifact changed while its bytes were captured')
    return data, {'path': str(Path(path).absolute()), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                  'mtimeNs': str(observed[3]), 'fresh': True}


def _junit_counts(data):
    """Check Vitest's root, every suite and every leaf instead of trusting totals."""
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('Coverage JUnit must not contain declarations or entities')
    root = ElementTree.fromstring(data)
    if root.tag != 'testsuites' or not list(root) or any(suite.tag != 'testsuite' for suite in root):
        raise ValueError('Coverage JUnit must contain Vitest test suites')

    def counter(element, key, optional=False):
        raw = element.attrib.get(key, '0' if optional else '')
        if not re.fullmatch(r'(?:0|[1-9][0-9]*)', raw):
            raise ValueError('Coverage JUnit has an invalid integer counter')
        return int(raw)

    totals = {'total': 0, 'passed': 0, 'failed': 0, 'errors': 0, 'skipped': 0}
    for suite in root:
        counts = dict.fromkeys(totals, 0)
        cases = list(suite)
        if any(case.tag not in {'testcase', 'properties', 'system-out', 'system-err'} for case in cases):
            raise ValueError('Coverage JUnit has unsupported nested suite elements')
        for case in (case for case in cases if case.tag == 'testcase'):
            counts['total'] += 1
            outcomes = [child.tag for child in case if child.tag in {'failure', 'error', 'skipped'}]
            if len(outcomes) > 1:
                raise ValueError('Coverage JUnit has ambiguous leaf outcomes')
            counts[{'failure': 'failed', 'error': 'errors', 'skipped': 'skipped'}.get(outcomes[0] if outcomes else '', 'passed')] += 1
        for key, attribute in [('total', 'tests'), ('failed', 'failures'), ('errors', 'errors'), ('skipped', 'skipped')]:
            if counter(suite, attribute, optional=attribute == 'skipped') != counts[key]:
                raise ValueError('Coverage JUnit suite counters disagree with leaf outcomes')
        for key in totals:
            totals[key] += counts[key]
    for key, attribute in [('total', 'tests'), ('failed', 'failures'), ('errors', 'errors'), ('skipped', 'skipped')]:
        # Vitest 4.1.12 omits the root skipped attribute; every suite and leaf
        # still supplies and verifies the exact count. Validate it if supplied.
        if attribute == 'skipped' and attribute not in root.attrib:
            continue
        if counter(root, attribute, optional=attribute == 'skipped') != totals[key]:
            raise ValueError('Coverage JUnit root counters disagree with leaf outcomes')
    if totals['total'] == 0:
        raise ValueError('Coverage JUnit contains no actual test cases')
    return totals


def _coverage_outcome(data, run_id, reporter_sha256, counts, parent_started_ns, parent_finished_ns):
    outcome = json.loads(data)
    if not isinstance(outcome, dict):
        raise ValueError('Coverage outcome must be an object')
    if type(outcome.get('schemaVersion')) is not int or outcome.get('schemaVersion') != 1 or outcome.get('kind') != 'actual-public-Vitest-onTestRunEnd' or outcome.get('runId') != run_id:
        raise ValueError('Coverage outcome does not belong to the parent command nonce')
    if outcome.get('repositoryRoot') != str(ROOT) or outcome.get('reporterSha256') != reporter_sha256:
        raise ValueError('Coverage outcome source/reporter identity changed')
    if not isinstance(outcome.get('reason'), str) or outcome.get('reason') not in {'passed', 'failed', 'interrupted'}:
        raise ValueError('Coverage outcome lacks the public test-run-end reason')

    def integer(value):
        return type(value) is int and value >= 0

    for field in ['unhandledErrorCount', 'moduleErrorCount', 'testCaseErrorCount', 'testModuleCount']:
        if not integer(outcome.get(field)):
            raise ValueError('Coverage outcome has an invalid error/module count')
    if outcome['testModuleCount'] < 1:
        raise ValueError('Coverage outcome contains no actual test modules')
    actual = outcome.get('testCaseCounts')
    if not isinstance(actual, dict) or set(actual) != {'total', 'passed', 'failed', 'skipped', 'pending'} or not all(integer(value) for value in actual.values()) or sum(actual[key] for key in actual if key != 'total') != actual['total']:
        raise ValueError('Coverage outcome test counters are inconsistent')
    if (actual['total'], actual['passed'], actual['failed'], actual['skipped'] + actual['pending']) != (counts['total'], counts['passed'], counts['failed'] + counts['errors'], counts['skipped']):
        raise ValueError('Coverage public outcome and JUnit test counts disagree')
    states = outcome.get('moduleStates')
    if not isinstance(states, dict) or set(states) != {'passed', 'failed', 'skipped', 'pending', 'queued'} or not all(integer(value) for value in states.values()) or sum(states.values()) != outcome['testModuleCount']:
        raise ValueError('Coverage module states are inconsistent')
    runtime = outcome.get('runtime')
    if not isinstance(runtime, dict) or set(runtime) != {'node', 'v8'} or not all(isinstance(value, str) and value for value in runtime.values()):
        raise ValueError('Coverage outcome lacks the actual runtime identity')

    def module_names(value):
        if not isinstance(value, list) or any(not isinstance(name, str) or not name or name.startswith('/') or '\\' in name or any(part in {'', '.', '..'} for part in name.split('/')) for name in value) or len(value) != len(set(value)):
            raise ValueError('Coverage outcome has invalid/duplicate module identities')
        return set(value)

    selected = module_names(outcome.get('selectedModules'))
    modules = outcome.get('modules')
    if not isinstance(modules, list) or len(modules) != outcome['testModuleCount']:
        raise ValueError('Coverage outcome module details are incomplete')
    completed = module_names([module.get('file') if isinstance(module, dict) else None for module in modules])
    derived_counts = dict.fromkeys(actual, 0)
    derived_states = dict.fromkeys(states, 0)
    derived_errors = 0
    for module in modules:
        if set(module) != {'file', 'state', 'testCaseCounts', 'errorCount'} or not isinstance(module['state'], str) or module['state'] not in states or not integer(module['errorCount']):
            raise ValueError('Coverage outcome has invalid module detail fields')
        module_counts = module['testCaseCounts']
        if not isinstance(module_counts, dict) or set(module_counts) != set(actual) or not all(integer(value) for value in module_counts.values()) or sum(module_counts[key] for key in module_counts if key != 'total') != module_counts['total']:
            raise ValueError('Coverage module test counts are inconsistent')
        for key in actual:
            derived_counts[key] += module_counts[key]
        derived_states[module['state']] += 1
        derived_errors += module['errorCount']
    if derived_counts != actual or derived_states != states or derived_errors != outcome['moduleErrorCount']:
        raise ValueError('Coverage module details disagree with aggregate counts')
    if module_names(outcome.get('missingModules')) != selected - completed or module_names(outcome.get('unexpectedModules')) != completed - selected:
        raise ValueError('Coverage selected/completed module identities do not reconcile')
    try:
        initialized = datetime.datetime.fromisoformat(outcome['initializedAt'].replace('Z', '+00:00'))
        started = datetime.datetime.fromisoformat(outcome['startedAt'].replace('Z', '+00:00'))
        finished = datetime.datetime.fromisoformat(outcome['finishedAt'].replace('Z', '+00:00'))
        if initialized.tzinfo is None or started.tzinfo is None or finished.tzinfo is None:
            raise ValueError('Coverage outcome timestamps lack timezone')
        init_ns = int(initialized.timestamp() * 1_000_000_000)
        start_ns, finish_ns = int(started.timestamp() * 1_000_000_000), int(finished.timestamp() * 1_000_000_000)
    except (KeyError, TypeError, AttributeError, OverflowError) as error:
        raise ValueError('Coverage outcome has invalid timestamps') from error
    if not parent_started_ns <= init_ns <= start_ns <= finish_ns <= parent_finished_ns:
        raise ValueError('Coverage public outcome is outside the parent command window')
    ready = not outcome['missingModules'] and not outcome['unexpectedModules'] and outcome['reason'] == 'passed' and actual['passed'] == actual['total'] and outcome['unhandledErrorCount'] == 0 and outcome['moduleErrorCount'] == 0 and outcome['testCaseErrorCount'] == 0 and states['passed'] == outcome['testModuleCount']
    return outcome, ready


def run_coverage_command(command, logfile, timeout, output, extra_env=None, reporter_path=None):
    """Parent-owned command receipt binds fresh JUnit and public lifecycle bytes."""
    output = Path(output).absolute()
    reporter = Path(reporter_path or ROOT / 'scripts/testing/coverage-outcome-reporter.mjs').absolute()
    reporter_argument = '--reporter=' + str(reporter)
    if command.count(reporter_argument) != 1:
        raise ValueError('Coverage command must select exactly one public outcome reporter')
    reporter_signature = _artifact_signature(reporter)
    if reporter_signature is None:
        raise ValueError('Coverage outcome reporter source is absent')
    reporter_sha256 = hashlib.sha256(reporter.read_bytes()).hexdigest()
    junit = output / 'root/coverage-unit.junit.xml'
    outcome = output / 'coverage/command-outcome.json'
    before = {'junit': _artifact_signature(junit), 'outcome': _artifact_signature(outcome)}
    run_id = str(uuid.uuid4())
    env = dict(extra_env or {})
    env.update(MAXBOOSTER_TEST_COVERAGE_DIR=str(output / 'coverage'),
               MAXBOOSTER_TEST_COVERAGE_OUTCOME=str(outcome), MAXBOOSTER_TEST_COVERAGE_RUN_ID=run_id)
    started_ns = time.time_ns()
    result = run_command(command, logfile, timeout, extra_env=env)
    finished_ns = time.time_ns()
    proof = {'schemaVersion': 1, 'kind': 'parent-bound-coverage-command-artifacts', 'runId': run_id,
             'parentWindow': {'startedAtNs': str(started_ns), 'finishedAtNs': str(finished_ns)},
             'reporter': {'path': str(reporter), 'sha256': reporter_sha256}, 'status': 'invalid', 'validForAdmission': False}
    result['coverageEvidence'] = proof
    try:
        junit_bytes, proof['junit'] = _fresh_artifact(junit, before['junit'], started_ns, finished_ns)
        counts = _junit_counts(junit_bytes)
        proof['junit']['counts'] = counts
        outcome_bytes, proof['outcome'] = _fresh_artifact(outcome, before['outcome'], started_ns, finished_ns)
        observed, ready = _coverage_outcome(outcome_bytes, run_id, reporter_sha256, counts, started_ns, finished_ns)
        if _artifact_signature(reporter) != reporter_signature or hashlib.sha256(reporter.read_bytes()).hexdigest() != reporter_sha256:
            raise ValueError('Coverage outcome reporter changed during command')
        proof['outcome']['data'] = observed
        proof['status'] = 'bound'
        proof['validForAdmission'] = ready and not result['timedOut'] and result['exitCode'] in (0, 1)
        if not proof['validForAdmission']:
            result['status'] = 'failed'
    except (OSError, ValueError, ElementTree.ParseError) as error:
        proof['error'] = str(error)
        result['status'] = 'failed'
    return result


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
        ('coverage', 'coverage', ['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.platform.config.ts', '--reporter=junit', '--reporter=' + str(ROOT / 'scripts/testing/coverage-outcome-reporter.mjs'), '--outputFile=' + str(output / 'root/coverage-unit.junit.xml')], 1200),
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
        execute = run_coverage_command if group == 'coverage' else run_command
        options = {'output': output} if group == 'coverage' else {}
        result = execute(command, output / 'orchestration' / (name + '.txt'), timeout, extra_env=env, **options)
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
    failed = not report['sourceInputsUnchanged'] or catalog['exitCode'] != 0 or any(row['exitCode'] != 0 or row.get('coverageParseExclusions') or row.get('coverageEvidence', {}).get('status') == 'invalid' or ('coverageEvidence' in row and not row['coverageEvidence']['validForAdmission']) for row in report['runs'] + report['postprocessing'])
    report['status'] = 'failed' if failed else 'executed_groups_passed'
    report['allTestsPassed'] = False if failed else None  # Excluded coverage is never inferred to pass.
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write_json(output / 'orchestration/results.json', report)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
