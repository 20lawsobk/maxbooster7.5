"""Exercise Python worker isolation and quiescent read-only scheduling with real children.

The fixtures use disposable Git repositories, pytest interpreters and report files.
They do not import the application or inherit provider credentials. Run with the
prepared interpreter; MAXBOOSTER_PYTHON_RUNNER_SOURCE selects an outside candidate
for review without mutating the checkout.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(os.environ.get('MAXBOOSTER_TEST_REPO_ROOT', Path(__file__).resolve().parents[2]))
RUNNER = Path(os.environ.get('MAXBOOSTER_PYTHON_RUNNER_SOURCE', REPO / 'scripts/testing/run-python-suites.py'))
QUIESCENT = 'tests/testing/test_report_progress.py'

WRITER = '''from pathlib import Path
import time

def test_write_report():
    root = Path(__file__).resolve().parents[1]
    active = root / 'writer-active'
    active.write_text('owned writer')
    (root / 'writer-started').write_text('started')
    until = time.monotonic() + 1.0
    while not (root / 'reader-observed').exists() and time.monotonic() < until:
        time.sleep(0.01)
    active.unlink()
    (root / 'writer-finished').write_text('complete')
'''
READER = '''from pathlib import Path
import time

def test_no_overlapping_report_writer():
    root = Path(__file__).resolve().parents[2]
    until = time.monotonic() + 4
    while not (root / 'writer-started').exists() and time.monotonic() < until:
        time.sleep(0.01)
    assert (root / 'writer-started').exists(), 'ordinary writer must execute'
    (root / 'reader-observed').write_text('observed')
    assert not (root / 'writer-active').exists(), 'ordinary writer still running'
    assert (root / 'writer-finished').exists(), 'writer cleanup not finished'
    report = root / 'out/tests__test_writer.txt'
    assert report.exists(), 'ordinary result log must be finalized before read-only phase'
'''


class PythonRunnerScheduling(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='maxbooster-scheduling-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.put('scripts/testing/run-python-suites.py', RUNNER.read_text())
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def run_fixture(self, files=(), timeout=5):
        subprocess.run(['git', 'add', '.'], cwd=self.root, check=True)
        # Only metadata is needed; the runner records the actual local revision.
        subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid',
                        'commit', '-qm', 'isolated scheduling fixture'], cwd=self.root, check=True)
        command = [sys.executable, str(self.root / 'scripts/testing/run-python-suites.py'),
                   '--python', sys.executable, '--output', str(self.root / 'out'),
                   '--workers', '2', '--timeout', str(timeout)]
        for name in files:
            command += ['--file', name]
        result = subprocess.run(command, cwd=self.root, text=True, capture_output=True, timeout=30)
        report = json.loads((self.root / 'out/results.json').read_text())
        self.assertEqual(len(report['suites']), len({row['file'] for row in report['suites']}), 'no duplicate execution receipts')
        return result, report

    def test_reader_waits_for_actual_writer_cleanup_and_result_files(self):
        self.put('tests/test_writer.py', WRITER)
        self.put(QUIESCENT, READER)
        result, report = self.run_fixture()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report['summary']['passed'], 2)
        self.assertEqual({row['file'] for row in report['suites']}, {'tests/test_writer.py', QUIESCENT})
        for row in report['suites']:
            self.assertEqual(row['counts']['tests'], 1)
            self.assertEqual(row['counts']['failures'], 0)

    def test_ordinary_suites_retain_real_parallelism(self):
        for label, other in (('one', 'two'), ('two', 'one')):
            self.put(f'tests/test_{label}.py', f'''from pathlib import Path
import time

def test_worker_overlap():
    root = Path(__file__).resolve().parents[1]
    (root / '{label}-active').write_text('active')
    until = time.monotonic() + 3
    while not (root / '{other}-active').exists() and time.monotonic() < until:
        time.sleep(0.01)
    assert (root / '{other}-active').exists(), 'ordinary workers must overlap'
''')
        result, report = self.run_fixture()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(report['summary']['passed'], 2)

    def test_failed_ordinary_suite_is_retained_and_does_not_suppress_reader(self):
        self.put('tests/test_failure.py', 'def test_real_failure():\n    assert False, "owned intentional failure"\n')
        self.put(QUIESCENT, 'def test_reader_still_runs():\n    assert True\n')
        result, report = self.run_fixture()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(report['summary']['failed'], 1)
        self.assertEqual(report['summary']['passed'], 1)
        rows = {row['file']: row for row in report['suites']}
        self.assertEqual(rows[QUIESCENT]['status'], 'passed')
        self.assertEqual(rows['tests/test_failure.py']['counts']['failures'], 1)

    def test_timed_out_ordinary_suite_is_retained_and_reader_executes(self):
        self.put('tests/test_timeout.py', 'import time\ndef test_owned_timeout():\n    time.sleep(10)\n')
        self.put(QUIESCENT, 'def test_reader_still_runs():\n    assert True\n')
        result, report = self.run_fixture(timeout=1)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(report['summary']['timeout'], 1)
        self.assertEqual(report['summary']['passed'], 1)
        rows = {row['file']: row for row in report['suites']}
        self.assertEqual(rows['tests/test_timeout.py']['status'], 'timeout')
        self.assertEqual(rows[QUIESCENT]['status'], 'passed')

    def test_report_owned_and_state_copies_are_retained_without_execution(self):
        historical = ('reports/cohort/tests/test_archived.py',
                      'reports/cohort/test-archived.py',
                      '.pdim-backup/tests/test_archived.py')
        for name in historical:
            self.put(name, 'raise RuntimeError("historical copy must never execute")\ndef test_old():\n    assert False\n')
        current = 'reports-archive/tests/test_current.py'
        self.put(current, 'def test_canonical_source():\n    assert True\n')
        result, report = self.run_fixture()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([row['file'] for row in report['suites']], [current])
        self.assertEqual(set(report['duplicateSnapshots']), set(historical))
        for name in historical:
            self.assertTrue((self.root / name).is_file(), 'retained source must not be deleted')
        self.assertEqual(report['summary']['passed'], 1)

    def test_retained_copy_selector_is_rejected_instead_of_running_history(self):
        historical = 'reports/cohort/tests/test_archived.py'
        self.put(historical, 'raise RuntimeError("historical copy must never execute")\ndef test_old():\n    assert False\n')
        self.put('tests/test_current.py', 'def test_current():\n    assert True\n')
        self.run_fixture(files=('tests/test_current.py',))
        result = subprocess.run([sys.executable, str(self.root / 'scripts/testing/run-python-suites.py'),
                                 '--file', historical, '--output', str(self.root / 'denied')],
                                cwd=self.root, text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('Unknown tracked Python test: ' + historical, result.stderr)
        self.assertFalse((self.root / 'denied').exists(), 'invalid selector must fail before output allocation')

    def test_quiescent_only_selector_retains_exact_selection(self):
        self.put('tests/test_not_selected.py', 'def test_must_not_run():\n    assert False\n')
        self.put(QUIESCENT, 'def test_selected_reader():\n    assert True\n')
        result, report = self.run_fixture(files=(QUIESCENT,))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual([row['file'] for row in report['suites']], [QUIESCENT])
        self.assertEqual(report['summary']['passed'], 1)


if __name__ == '__main__':
    unittest.main()
