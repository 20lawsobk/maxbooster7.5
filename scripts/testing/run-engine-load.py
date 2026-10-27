#!/usr/bin/env python3
"""Bounded execution of the existing numeric DigitalGPU/dedup scale benchmark.

The 90M value remains a projection. This profile executes 40 cold graph calls,
500 contention calls, 400 serial and 160 threaded cache calls, plus one priming
call; it starts no app/server and blocks all socket connections.
"""
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

from common import ROOT, run_command, source_revision, write_json

SERVER = ROOT / 'external/maxcore/artifacts/ai-training-server'
BENCHMARK = SERVER / 'ai_model/maxcore/tests/load_test.py'
PROFILE = {'LOAD_TARGET': '90000000', 'LOAD_UNIQUE': '40', 'LOAD_THREADS': '8',
           'LOAD_CONC': '500', 'LOAD_SAMPLE': '400', 'LOAD_MT': '160',
           # The unchanged benchmark's engine-audit semantics target this
           # backend's *.engine counters, not the newer silicon_simt default.
           'MAXCORE_BACKEND': 'digital_gpu', 'MAXCORE_NUM_STREAMS': '1'}
GUARD = '''import socket
def deny(*args, **kwargs):
    raise OSError('isolated engine load: socket connections are disabled')
socket.socket.connect=deny
socket.socket.connect_ex=deny
socket.socket.sendto=deny
'''


def observed_result(log):
    def literal(label):
        match = re.search(re.escape(label) + r'\s*(\{[^\n]*\})', log)
        value = ast.literal_eval(match.group(1)) if match else None
        if value is not None and (not isinstance(value, dict) or not all(
                isinstance(key, str) and isinstance(count, (int, float)) and not isinstance(count, bool)
                for key, count in value.items())):
            raise ValueError('Unexpected benchmark counter format')
        return value
    cold = re.search(r'\[Phase 0\] (\d+) unique real graph computes .* correctness OK=(True|False)', log)
    fast = re.search(r'executed fast-path operations: single-thread=(\d+) multi-thread=(\d+)', log)
    sources = literal('sources:')
    engine = literal('engine kernels used:')
    fallbacks = literal('ENGINE FALLBACKS:')
    audit = {
        'coldGraphCalls': int(cold[1]) if cold else None,
        'numericReferenceMatches': cold[2] == 'True' if cold else False,
        'contentionSources': sources,
        'contentionCalls': sum(sources.values()) if sources is not None else None,
        'serialCacheCalls': int(fast[1]) if fast else None,
        'threadedCacheCalls': int(fast[2]) if fast else None,
        'engineCounters': engine,
        'engineFallbackCounters': fallbacks,
        'singleFlightNoDuplicateComputes': 'any key computed twice? False (max per-key computes=1)' in log,
        'reportedPass': 'RESULT: PASS' in log,
        'uncaughtThreadFailure': 'Exception in thread' in log,
    }
    reasons = []
    if audit['coldGraphCalls'] != 40 or not audit['numericReferenceMatches']:
        reasons.append('Cold real-graph/reference validation did not complete for all 40 inputs')
    if audit['contentionCalls'] != 500:
        reasons.append('Contention phase did not complete exactly 500 calls')
    if audit['serialCacheCalls'] != 400 or audit['threadedCacheCalls'] != 160:
        reasons.append('Fast-path operation counts did not match the bounded profile')
    if not audit['singleFlightNoDuplicateComputes']:
        reasons.append('Single-flight correctness was not demonstrated')
    if not engine or sum(engine.values()) <= 0 or fallbacks is None or sum(fallbacks.values()) != 0:
        reasons.append('Required positive engine activity and zero fallback evidence was absent')
    if not audit['reportedPass'] or audit['uncaughtThreadFailure']:
        reasons.append('Benchmark failed or an uncaught worker exception occurred')
    return audit, reasons


def self_test():
    fixture = '''[Phase 0] 40 unique real graph computes in 1.0s (40/s) — correctness OK=True
sources: {'compute': 40, 'cache': 440, 'coalesced': 20}
single-flight guarantee — any key computed twice? False (max per-key computes=1)
executed fast-path operations: single-thread=400 multi-thread=160
engine kernels used: {'dgpu.gemm.engine': 160}
ENGINE FALLBACKS: {} (total=0)
RESULT: PASS
'''
    assert not observed_result(fixture)[1]
    for changed in (fixture.replace("'cache': 440", "'cache': 436"),
                    fixture.replace('multi-thread=160', 'multi-thread=156'),
                    fixture.replace("{'dgpu.gemm.engine': 160}", '{}'),
                    fixture.replace('ENGINE FALLBACKS: {}', "ENGINE FALLBACKS: {'dgpu.gemm.engine_fallback': 1}"),
                    fixture + '\nException in thread worker\n', ''):
        assert observed_result(changed)[1], 'Incomplete or failing evidence cannot pass'
    print('Engine-load evidence parser: positive and six fail-closed cases passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--python', default=sys.executable, help='Prepared Python interpreter with NumPy and repository runtime dependencies')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/test-verification/operations/engine-load')
    parser.add_argument('--repeats', type=int, choices=range(1, 11), default=1,
                        help='Independent disposable runs (default 1; choose 10 to verify repeatability)')
    parser.add_argument('--timeout', type=int, choices=range(10, 181), default=120, help='Owned process-group deadline per run, 10 to 180 seconds')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    inputs = [Path(__file__), BENCHMARK, SERVER / 'ai_model/maxcore/api.py',
              SERVER / 'ai_model/maxcore/backend/cpu_backend.py', SERVER / 'ai_model/maxcore/runtime/engine.py',
              SERVER / 'ai_model/maxcore/pdim/orchestrator.py', SERVER / 'ai_model/dedup_cache.py', SERVER / 'storage_client.py']
    hashes = {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in inputs}
    report = {'schemaVersion': 1, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'sourceRevision': source_revision(), 'sourceSha256': hashes,
              'file': str(BENCHMARK.relative_to(ROOT)), 'operationalProfile': 'bounded-legacy-digital-gpu-numeric-dedup-v1',
              'profileEnvironment': PROFILE, 'scope': __doc__,
              'network': 'All Python socket connections and UDP sends denied; no application/private provider credentials inherited',
              'storage': 'Disposable local SQLite/cache fallback; no live canonical PDIM, external storage or application database',
              'projection': {'targetRequests': 90_000_000, 'executedAtTargetScale': False,
                             'simultaneousNetworkClients': 0, 'workerThreads': 8,
                             'maximumConcurrentOrchestratorCalls': 8},
              'configuredOperationsPerRun': {'coldGraphCalls': 40, 'contentionCalls': 500,
                  'serialCacheCalls': 400, 'threadedCacheCalls': 160, 'cachePrimingCalls': 1, 'totalOrchestratorCalls': 1101},
              'limits': ['Numeric toy embedding/MLP graphs, not text/image/audio/video model quality or the full app',
                         'The selected legacy digital_gpu backend does not verify the current silicon_simt default',
                         'Cache throughput and projections do not prove 90M simultaneous requests or multi-host scaling'],
              'runs': [], 'productionReady': False}
    for index in range(args.repeats):
        with tempfile.TemporaryDirectory(prefix='maxcore-engine-load-') as directory:
            state = Path(directory)
            guard = state / 'guard'
            guard.mkdir()
            (guard / 'sitecustomize.py').write_text(GUARD)
            env = dict(PROFILE, PYTHONPATH=os.pathsep.join((str(guard), str(SERVER))),
                       PYTHONDONTWRITEBYTECODE='1', MAXCORE_PRIVATE_STATE_DIR=str(state / 'state'),
                       PDIM_RESULTS_DIR=str(state / 'results'), HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1',
                       OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1')
            row = run_command([args.python, 'ai_model/maxcore/tests/load_test.py'], output / f'run-{index + 1:02}.txt',
                              args.timeout, cwd=SERVER, extra_env=env)
        # Cleanup has completed before producing the receipt.
        log = (output / f'run-{index + 1:02}.txt').read_text()
        try:
            row['observed'], row['evidenceFailures'] = observed_result(log)
        except (ValueError, SyntaxError) as error:
            row['observed'], row['evidenceFailures'] = {}, [f'Invalid benchmark evidence: {error}']
        row['ownedStateRemoved'] = not state.exists()
        row['status'] = 'passed' if row['exitCode'] == 0 and not row['evidenceFailures'] and row['ownedStateRemoved'] else 'failed'
        report['runs'].append(row)
        report['status'] = 'passed' if all(run['status'] == 'passed' for run in report['runs']) else 'failed'
        report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(output / 'results.json', report)
        print(f"{row['status']}: engine profile {index + 1}/{args.repeats}; process exit {row['exitCode']}; contention={row['observed'].get('contentionCalls')}", flush=True)
    report['unchangedSources'] = all(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest for name, digest in hashes.items())
    if not report['unchangedSources']:
        report['status'] = 'failed'
    write_json(output / 'results.json', report)
    return int(report['status'] != 'passed')


if __name__ == '__main__':
    raise SystemExit(main())
