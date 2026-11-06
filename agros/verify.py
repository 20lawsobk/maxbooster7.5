#!/usr/bin/env python3
"""AGROS evidence collector and bounded verification/repair coordinator (Python 3.11+)."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
import uuid

REQUIRED = {'build', 'types', 'lint', 'unit', 'integration', 'e2e', 'regression',
            'security', 'coverage', 'accessibility', 'performance', 'features',
            'operations', 'documentation', 'start'}
METRIC_LIMITS = {
    'coverage': {key: {'min': 95, 'max': 100} for key in ('lines', 'branches', 'functions', 'statements')},
    'accessibility': {'violations': {'min': 0, 'max': 0}},
    'performance': {'api_p95_ms': {'min': 0, 'max': 250},
                    'page_load_seconds': {'min': 0, 'max': 2}},
}

# Observed generated output locations, intentionally not **/dist: fixture
# distributions and unknown directories remain source inputs. See repository
# scripts/testing/common.py and scripts/start-production.mjs for provenance.
GENERATED_FILES = {'reports/endpoint-audit.json', 'reports/endpoint-audit.md'}
GENERATED_PREFIXES = (
    'dist/', 'artifacts/api-server/dist/', 'artifacts/dashboard/dist/',
    'artifacts/mockup-sandbox/dist/', 'dns-os/services/dns-api/dist/',
    'lib/api-client-react/dist/', 'lib/api-zod/dist/', 'lib/db/dist/',
    'external/maxcore/artifacts/api-server/dist/',
    'external/maxcore/artifacts/dashboard/dist/',
    'external/maxcore/artifacts/mockup-sandbox/dist/',
    'external/maxcore/lib/api-client-react/dist/',
    'external/maxcore/lib/api-zod/dist/', 'external/maxcore/lib/db/dist/',
    '.cache/',
)
DEPENDENCY_ROOTS = ('', 'dns-node/', 'dns-os/', 'dns-os/services/dns-api/',
    'tls-proxy/', 'electron/', 'external/maxcore/', 'external/pdim/',
    'artifacts/api-server/', 'artifacts/dashboard/', 'artifacts/mockup-sandbox/',
    'lib/api-client-react/', 'lib/api-zod/', 'lib/db/',
    'external/maxcore/artifacts/api-server/', 'external/maxcore/artifacts/dashboard/',
    'external/maxcore/artifacts/mockup-sandbox/', 'external/maxcore/lib/api-client-react/',
    'external/maxcore/lib/api-zod/', 'external/maxcore/lib/db/')
GENERATED_PREFIXES += tuple(root + name + '/' for root in DEPENDENCY_ROOTS
                            for name in ('node_modules', '.cache'))

def generated_path(name):
    # Keep fixture code, including fixture dist and dependency-shaped directories.
    if name.startswith('tests/fixtures/'):
        return False
    return name in GENERATED_FILES or any(name == prefix.rstrip('/') or name.startswith(prefix)
                                          for prefix in GENERATED_PREFIXES)


def read(path):
    return json.loads(Path(path).read_text())

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    with open(temporary, 'x', opener=lambda name, flags: os.open(name, flags, 0o600)) as output:
        output.write(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)

def digest(path):
    value = hashlib.sha256()
    with open(path, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

def run(argv, root, log, timeout, extra_env=None):
    """No shell interpolation; bound runtime and terminate the complete process group."""
    start = time.monotonic()
    with open(log, 'wb') as output:
        os.chmod(log, 0o600)
        try:
            child = subprocess.Popen(argv, cwd=root, stdout=output, stderr=subprocess.STDOUT,
                                     start_new_session=True, env={**os.environ, **(extra_env or {})})
        except OSError as error:
            output.write(str(error).encode())
            return {'exit': 127, 'seconds': 0}
        try:
            code = child.wait(timeout=timeout)
        except BaseException as error:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            if not isinstance(error, subprocess.TimeoutExpired):
                raise
            code = 124
        finally:
            # Also reap background descendants left by an exited parent.
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGKILL)
    return {'exit': code, 'seconds': round(time.monotonic() - start, 3)}

def valid_argv(command):
    return isinstance(command, list) and bool(command) and all(
        isinstance(item, str) and item and '\0' not in item for item in command)

def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)

def validate(config):
    if not isinstance(config, dict):
        raise ValueError('Policy must be an object')
    gates = config.get('gates')
    if not isinstance(gates, dict) or set(gates) != REQUIRED:
        raise ValueError('Policy must define exactly all required gates')
    for name, gate in gates.items():
        if not isinstance(gate, dict):
            raise ValueError('Each gate must be an object')
        for key in ('argv', 'evidence_argv'):
            if gate.get(key) is not None and not valid_argv(gate[key]):
                raise ValueError(key + ' must be null or a nonempty string array')
        if gate.get('evidence_argv') and not any('{evidence}' in x for x in gate['evidence_argv']):
            raise ValueError('evidence_argv must include {evidence}')
        timeout = gate.get('timeout', 600)
        if not finite_number(timeout) or not 1 <= timeout <= 3600:
            raise ValueError('Gate timeout must be 1..3600 seconds')
        limits = gate.get('limits', {})
        if not isinstance(limits, dict):
            raise ValueError('Metric limits must be an object')
        for key, limit in limits.items():
            if not isinstance(limit, dict) or not limit or set(limit) - {'min', 'max'}:
                raise ValueError('Each metric requires min and/or max')
            if not all(finite_number(value) for value in limit.values()):
                raise ValueError('Metric thresholds must be finite numbers')
            if limit.get('min', -math.inf) > limit.get('max', math.inf):
                raise ValueError('Metric minimum exceeds maximum')
        for key, floor in METRIC_LIMITS.get(name, {}).items():
            configured = limits.get(key, {})
            if ('min' in floor and configured.get('min', -math.inf) < floor['min'] or
                    'max' in floor and configured.get('max', math.inf) > floor['max']):
                raise ValueError('Cannot weaken required ' + name + '.' + key + ' limits')
    target = config.get('target', 98)
    if not finite_number(target) or not 98 <= target <= 100:
        raise ValueError('Readiness target must be 98..100')
    if config.get('artifact_contract_argv') is not None and not valid_argv(config['artifact_contract_argv']):
        raise ValueError('artifact_contract_argv must be null or a nonempty string array')
    if config.get('repair_argv') is not None and not valid_argv(config['repair_argv']):
        raise ValueError('repair_argv must be null or a nonempty string array')
    timeout = config.get('repair_timeout', 1800)
    if not finite_number(timeout) or not 1 <= timeout <= 3600:
        raise ValueError('Repair timeout must be 1..3600 seconds')

def snapshot(root):
    # Avoid strip()/line parsing: Git paths can contain spaces and newlines.
    paths = subprocess.check_output(['git', '-C', str(root), 'ls-files',
        '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
    result = {}
    for name in paths:
        if not name or generated_path(name):
            continue
        path = root / name
        try:
            mode = path.lstat().st_mode
            content = ('symlink:' + os.readlink(path)) if stat.S_ISLNK(mode) else (
                digest(path) if stat.S_ISREG(mode) else 'non-file')
            result[name] = [stat.S_IMODE(mode), content]
        except FileNotFoundError:
            result[name] = ['missing']
    return result

def source_identity(root):
    return hashlib.sha256(json.dumps(snapshot(root), sort_keys=True).encode()).hexdigest()

def observe(root, policy, state, memory):
    pinned_policy = digest(policy)
    config = read(policy)
    validate(config)
    # An interrupted scan must not leave a previous ready report usable.
    write(state / 'latest.json', {'schema': 1, 'state': 'RUNNING', 'ready': False, 'created': time.time()})
    session = state / ('run-' + uuid.uuid4().hex)
    session.mkdir(mode=0o700)
    head = git(root, 'rev-parse', 'HEAD')
    before = source_identity(root)
    results = {}
    # Historical failure probability per second determines ordering only, never skipping.
    def priority(name):
        history = memory.get(name, {})
        return -(1 + history.get('failures', 0)) / max(1, history.get('seconds', 1))
    for name in sorted(REQUIRED, key=lambda name: (priority(name), name)):
        gate = config['gates'][name]
        result = {'status': 'UNVERIFIED', 'reason': 'No evidence producer configured'}
        command_passed = True
        # Existing isolated runners honor these destinations; retain evidence
        # outside Git-visible source rather than excluding reports wholesale.
        evidence_env = {'MAXBOOSTER_TEST_REPORT_DIR': str(session / name),
                        'MAXBOOSTER_TEST_COVERAGE_DIR': str(session / 'coverage')}
        if gate.get('argv'):
            detail = run(gate['argv'], root, session / (name + '.log'), gate.get('timeout', 600), evidence_env)
            command_passed = detail['exit'] == 0
            result = {'status': 'PASS' if command_passed else 'FAIL', **detail,
                      'log': str(session / (name + '.log'))}
            # Numerical gates must generate fresh machine-readable evidence in this run.
            if gate.get('limits') and command_passed:
                # Producer receives a unique destination via an explicit argv placeholder.
                result = {'status': 'UNVERIFIED', 'reason': 'Use evidence_argv for metric gates'}
        if gate.get('evidence_argv'):
            evidence = session / (name + '.json')
            argv = [x.replace('{evidence}', str(evidence)) for x in gate['evidence_argv']]
            detail = run(argv, root, session / (name + '-metrics.log'), gate.get('timeout', 600), evidence_env)
            result = {'status': 'FAIL', **detail, 'reason': 'Missing or invalid metric evidence'}
            try:
                if evidence.is_symlink():
                    raise ValueError('Evidence must be a fresh regular file')
                values = read(evidence)
                passed = command_passed and detail['exit'] == 0 and bool(gate.get('limits')) and isinstance(values, dict)
                for key, limit in gate.get('limits', {}).items():
                    value = values[key]
                    passed = passed and finite_number(value)
                    passed = passed and ('min' not in limit or value >= limit['min'])
                    passed = passed and ('max' not in limit or value <= limit['max'])
                result = {'status': 'PASS' if passed else 'FAIL', **detail, 'evidence': str(evidence)}
            except (OSError, ValueError, KeyError, TypeError):
                pass
        results[name] = result
        old = memory.setdefault(name, {'failures': 0, 'runs': 0, 'seconds': 1})
        old['runs'] += 1
        old['failures'] += result['status'] != 'PASS'
        old['seconds'] = result.get('seconds', old['seconds'])
    artifact_contract = {'status': 'UNVERIFIED', 'reason': 'No artifact contract validator configured'}
    if config.get('artifact_contract_argv'):
        log = session / 'artifact-contract.log'
        detail = run(config['artifact_contract_argv'], root, log, 600)
        artifact_contract = {'status': 'PASS' if detail['exit'] == 0 else 'FAIL',
                             **detail, 'log': str(log)}
        contract = root / 'dist/build-complete.json'
        if contract.is_file():
            artifact_contract['manifest_sha256'] = digest(contract)
    unchanged = (head == git(root, 'rev-parse', 'HEAD') and before == source_identity(root)
                 and pinned_policy == digest(policy))
    score = round(100 * sum(x['status'] == 'PASS' for x in results.values()) / len(REQUIRED), 2)
    report = {'schema': 1, 'state': 'COMPLETED', 'head': head, 'policy_sha256': pinned_policy, 'source_sha256': before, 'created': time.time(),
              'root': str(root), 'unchanged': unchanged, 'gates': results, 'score': score,
              'source_scope': 'Git-visible inputs excluding explicit generated output/dependency prefixes; fixtures retained',
              'artifact_contract': artifact_contract,
              'ready': unchanged and artifact_contract['status'] == 'PASS' and all(x['status'] == 'PASS' for x in results.values()) and score >= config.get('target', 98)}
    write(session / 'report.json', report)
    write(state / 'latest.json', report)
    write(state / 'learning.json', memory)
    print(json.dumps({'report': str(session / 'report.json'), 'score': score, 'ready': report['ready']}), flush=True)
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.')
    parser.add_argument('--policy', default=str(Path(__file__).with_name('policy.json')))
    parser.add_argument('--state', required=True, help='Private directory outside repository')
    parser.add_argument('--cycles', type=int, default=1)
    parser.add_argument('--repair', action='store_true')
    args = parser.parse_args()
    root, state, policy = Path(args.root).resolve(), Path(args.state).resolve(), Path(args.policy).resolve()
    if state == root or root in state.parents:
        parser.error('State directory must be outside repository')
    if not 1 <= args.cycles <= 20:
        parser.error('cycles must be 1..20')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(state / 'lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        memory = read(state / 'learning.json') if (state / 'learning.json').exists() else {}
        report = observe(root, policy, state, memory)
        if report['ready']:
            return 0
        if args.repair and args.cycles > 1:
            # The repair coordinator owns the bounded candidate loop. Never turn
            # candidate success into a false success for the original checkout.
            from repair import repair
            with open(state / 'repair.lock', 'w') as repair_lock:
                fcntl.flock(repair_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                repair(root, state, policy, args.cycles - 1)
    return 2

def cancel(signum, frame):
    raise KeyboardInterrupt('Cancelled by signal ' + str(signum))

if __name__ == '__main__':
    signal.signal(signal.SIGTERM, cancel)
    sys.exit(main())
