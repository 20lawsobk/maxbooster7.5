#!/usr/bin/env python3
"""Bounded, disposable recovery and read-only retained-evidence verification."""
import argparse
from pathlib import Path
import sys
from common import ROOT, run_command, source_revision, write_json

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/test-verification/operations')
    parser.add_argument('--python', default=sys.executable)
    args = parser.parse_args()
    rows = []
    for file, command in (
        ('scripts/testing/platform-register.py', [args.python, 'scripts/testing/platform-register.py', '--self-test']),
        ('external/maxcore/artifacts/ai-training-server/ai_model/maxcore/tests/load_test.py',
         [args.python, 'scripts/testing/run-engine-load.py', '--python', args.python, '--output', str(args.output.resolve() / 'engine-load')]),
        ('evaluations/maxcore-quality/verify_types.py', [args.python, 'evaluations/maxcore-quality/verify_types.py']),
        ('evaluations/maxcore-quality/verify_evidence.py', [args.python, 'evaluations/maxcore-quality/verify_evidence.py']),
        ('scripts/maxcore-isolated-recovery-acceptance.py', [args.python, 'scripts/maxcore-isolated-recovery-acceptance.py']),
        ('tests/payment-processing/run.mjs', ['node', 'tests/payment-processing/run.mjs']),
    ):
        row = run_command(command, args.output.resolve() / (Path(file).name + '.txt'), 180)
        row['file'] = file
        if file.endswith('/load_test.py'):
            row['operationalProfile'] = 'bounded-legacy-digital-gpu-numeric-dedup-v1'
            row['evidence'] = str(args.output.resolve() / 'engine-load/results.json')
        rows.append(row)
        write_json(args.output / 'results.json', {'sourceRevision': source_revision(), 'scope': __doc__, 'runs': rows})
        print(row['status'], file, flush=True)
    return int(any(row['exitCode'] != 0 for row in rows))

if __name__ == '__main__':
    raise SystemExit(main())
