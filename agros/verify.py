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
import subprocess
import sys
import time
import uuid

REQUIRED = {'build', 'types', 'lint', 'unit', 'integration', 'e2e', 'regression',
            'security', 'coverage', 'accessibility', 'performance', 'features',
            'operations', 'documentation', 'start'}

def read(path):
    return json.loads(Path(path).read_text())

def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

def run(argv, root, log, timeout):
    """No shell interpolation; bound runtime and terminate the complete process group."""
    start = time.monotonic()
    with open(log, 'wb') as output:
        os.chmod(log, 0o600)
        try:
            child = subprocess.Popen(argv, cwd=root, stdout=output, stderr=subprocess.STDOUT,
                                     start_new_session=True)
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

def validate(config):
    gates = config['gates']
    if set(gates) != REQUIRED:
        raise ValueError('Policy must define exactly all required gates')
    for gate in gates.values():
        command = gate.get('argv')
        if command is not None and (not isinstance(command, list) or not command or
                                    not all(isinstance(x, str) and x for x in command)):
            raise ValueError('argv must be null or a nonempty string array')
        if not 1 <= gate.get('timeout', 600) <= 3600:
            raise ValueError('Gate timeout must be 1..3600 seconds')
    if not 98 <= config.get('target', 98) <= 100:
        raise ValueError('Readiness target must be 98..100')

def snapshot(root):
    paths = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
    result = {}
    for name in paths:
        path = root / name
        if name:
            result[name] = ('symlink:' + os.readlink(path)) if path.is_symlink() else (digest(path) if path.is_file() else 'missing')
    return result

def observe(root, policy, state, memory):
    config = read(policy)
    validate(config)
    session = state / ('run-' + uuid.uuid4().hex)
    session.mkdir(mode=0o700)
    head = git(root, 'rev-parse', 'HEAD')
    before = snapshot(root)
    results = {}
    # Historical failure probability per second determines ordering only, never skipping.
    def priority(name):
        history = memory.get(name, {})
        return -(1 + history.get('failures', 0)) / max(1, history.get('seconds', 1))
    for name in sorted(REQUIRED, key=priority):
        gate = config['gates'][name]
        result = {'status': 'UNVERIFIED', 'reason': 'No evidence producer configured'}
        if gate.get('argv'):
            detail = run(gate['argv'], root, session / (name + '.log'), gate.get('timeout', 600))
            result = {'status': 'PASS' if detail['exit'] == 0 else 'FAIL', **detail,
                      'log': str(session / (name + '.log'))}
            # Numerical gates must generate fresh machine-readable evidence in this run.
            if gate.get('limits'):
                # Producer receives a unique destination via an explicit argv placeholder.
                result = {'status': 'UNVERIFIED', 'reason': 'Use evidence_argv for metric gates'}
        if gate.get('evidence_argv'):
            evidence = session / (name + '.json')
            argv = [x.replace('{evidence}', str(evidence)) for x in gate['evidence_argv']]
            detail = run(argv, root, session / (name + '-metrics.log'), gate.get('timeout', 600))
            result = {'status': 'FAIL', **detail, 'reason': 'Missing or invalid metric evidence'}
            try:
                values = read(evidence)
                passed = detail['exit'] == 0 and bool(gate.get('limits'))
                for key, limit in gate.get('limits', {}).items():
                    value = values[key]
                    passed = passed and type(value) in (int, float) and math.isfinite(value)
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
    unchanged = head == git(root, 'rev-parse', 'HEAD') and before == snapshot(root)
    score = round(100 * sum(x['status'] == 'PASS' for x in results.values()) / len(REQUIRED), 2)
    report = {'schema': 1, 'head': head, 'policy_sha256': digest(policy), 'created': time.time(),
              'root': str(root), 'unchanged': unchanged, 'gates': results, 'score': score,
              'ready': unchanged and all(x['status'] == 'PASS' for x in results.values()) and score >= config.get('target', 98)}
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
        previous = None
        for cycle in range(args.cycles):
            report = observe(root, policy, state, memory)
            if report['ready']:
                return 0
            fingerprint = hashlib.sha256(json.dumps(report['gates'], sort_keys=True,
                default=str).encode()).hexdigest()
            # repair exits nonzero if no validated candidate can progress.
            if not args.repair or cycle + 1 == args.cycles or fingerprint == previous:
                break
            previous = fingerprint
            code = subprocess.call([sys.executable, str(Path(__file__).with_name('repair.py')),
                '--root', str(root), '--policy', str(policy), '--state', str(state),
                '--attempts', str(args.cycles - cycle - 1)])
            if code:
                break
            # Repairs remain isolated candidates. Never pretend the source checkout improved.
            break
    return 2

if __name__ == '__main__':
    sys.exit(main())
