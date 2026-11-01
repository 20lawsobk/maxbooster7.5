"""Behavior and malformed-evidence checks for the counted progress report."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('report-progress.py')
# Installed location is tests/testing/test_report_progress.py.
if not SCRIPT.exists():
    SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/testing/report-progress.py'
spec = importlib.util.spec_from_file_location('measured_progress', SCRIPT)
progress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(progress)


def fixture():
    pages = [{'id': f'page-{i}', 'productionReadinessStatus': 'RED'} for i in range(80)]
    check = {'id': 'page-0/access', 'status': 'PASS'}
    readiness = {
        'pages': pages, 'sourceFreshness': {'status': 'PASS'},
        'summary': {'pages': 80, 'greenPages': 0, 'colors': {'RED': 80}, 'retainedExistingWorkItems': 2},
        'workItemAcceptanceStatus': {'page-0/access': 'PASS', 'other/work': 'UNVERIFIED'},
        'productionReady': False,
    }
    register = {
        'pages': [{'id': p['id'], 'requiredChecks': [check] if i == 0 else []} for i, p in enumerate(pages)],
        'backendRoutes': [], 'interactions': [],
        'summary': {'requiredChecks': 1, 'unverifiedChecks': 0},
    }
    plan = {'workItems': [check, {'id': 'other/work', 'status': 'UNVERIFIED'}], 'summary': {'workItems': 2}}
    totals = {k: {'covered': 1, 'total': 3, 'skipped': 0, 'pct': 33.33}
              for k in ('lines', 'statements', 'functions', 'branches')}
    coverage = {'total': copy.deepcopy(totals)}
    summary = {'status': 'failed', 'groups': [{'group': 'coverage', 'totals': totals},
              {'group': 'root-unit', 'counts': {'passed': 10}},
              {'group': 'coverage-contracts', 'counts': {'passed': 10}}]}
    return readiness, register, plan, coverage, summary


class CountedProgressTests(unittest.TestCase):
    def measure(self, docs=None, current=True):
        return progress.measure(*(docs or fixture()), current=current, reasons=[] if current else ['Changed source'])

    def test_independent_denominators_and_no_invented_implementation_or_test_total(self):
        report = self.measure()
        self.assertIsNone(report['implementationCompletionPercent'])
        self.assertEqual(report['currentVerified']['greenPages'], {'completed': 0, 'total': 80, 'percent': 0})
        self.assertEqual(report['currentVerified']['requiredCheckAcceptance']['percent'], 100)
        self.assertEqual(report['currentVerified']['planWorkAcceptance']['percent'], 50)
        self.assertEqual(len(report['testGroupObservations']), 3)
        self.assertNotIn('totalTests', report)
        self.assertFalse(report['productionReady'])

    def test_green_color_requires_all_gates_checks_and_no_blockers(self):
        docs = fixture()
        page = docs[0]['pages'][0]
        page.update({'productionReadinessStatus': 'GREEN', 'gates': {domain: 'PASS' for domain in
                     ('frontend', 'backend', 'integration', 'database', 'ai', 'qa', 'accessibility', 'deployment')},
                     'requiredRegisteredChecks': 1, 'verifiedRegisteredChecks': 1})
        docs[0]['summary'].update({'greenPages': 1, 'colors': {'GREEN': 1, 'RED': 79}})
        self.assertEqual(self.measure(docs)['currentVerified']['greenPages']['completed'], 1)
        for label in ('gates', 'checks', 'blockers', 'source'):
            bad = copy.deepcopy(docs)
            if label == 'gates': bad[0]['pages'][0]['gates']['qa'] = 'UNVERIFIED'
            elif label == 'checks': bad[0]['pages'][0]['verifiedRegisteredChecks'] = 0
            elif label == 'blockers': bad[0]['pages'][0]['blockers'] = ['Unresolved provider delivery']
            else: bad[0]['sourceFreshness']['status'] = 'STALE'
            with self.subTest(label=label), self.assertRaises(progress.InvalidEvidence): self.measure(bad)

    def test_stale_keeps_only_historical_observation_and_no_current_pass_credit(self):
        report = self.measure(current=False)
        self.assertEqual(report['measurementStatus'], 'STALE')
        self.assertIsNone(report['currentVerified'])
        self.assertEqual(report['lastMeasured']['requiredCheckAcceptance']['completed'], 1)
        self.assertFalse(report['productionReady'])

    def test_raw_fraction_is_separate_from_istanbul_truncated_percent(self):
        value = self.measure()['lastMeasured']['coverage']['lines']
        self.assertAlmostEqual(value['percent'], 100 / 3)
        self.assertEqual(value['canonicalPercent'], 33.33)

    def test_missing_page_and_duplicate_page_cannot_reduce_eighty_page_target(self):
        for change in ('remove', 'duplicate'):
            docs = fixture()
            if change == 'remove': docs[0]['pages'].pop()
            else: docs[0]['pages'][1]['id'] = docs[0]['pages'][0]['id']
            with self.subTest(change=change), self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_summary_counts_must_equal_actual_rows(self):
        for document, key in ((0, 'greenPages'), (1, 'requiredChecks'), (2, 'workItems')):
            docs = fixture(); docs[document]['summary'][key] += 1
            with self.subTest(key=key), self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_boolean_counts_are_rejected(self):
        docs = fixture(); docs[1]['summary']['requiredChecks'] = True
        with self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_plan_and_readiness_statuses_must_agree(self):
        docs = fixture(); docs[0]['workItemAcceptanceStatus']['other/work'] = 'PASS'
        with self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_duplicate_check_identity_is_not_counted_twice(self):
        docs = fixture(); docs[1]['pages'][1]['requiredChecks'] = [docs[1]['pages'][0]['requiredChecks'][0]]
        with self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_coverage_overflow_negative_boolean_and_stale_summary_are_rejected(self):
        for key, value in (('covered', 4), ('covered', -1), ('covered', True), ('pct', 34)):
            docs = fixture(); docs[3]['total']['lines'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(progress.InvalidEvidence): self.measure(docs)
        docs = fixture(); docs[4]['groups'][0]['totals']['lines']['covered'] = 2
        with self.assertRaises(progress.InvalidEvidence): self.measure(docs)

    def test_zero_denominator_has_no_fabricated_completion_percent(self):
        self.assertEqual(progress.fraction(0, 0), {'completed': 0, 'total': 0, 'percent': None})
        with self.assertRaises(progress.InvalidEvidence): progress.fraction(1, 0)

    def test_real_collection_leaves_all_git_visible_files_unchanged(self):
        repo = SCRIPT.parents[2]
        if not (repo / 'scripts/testing/common.py').exists(): repo = Path.cwd()
        self.assertTrue((repo / 'scripts/testing/common.py').exists(), 'Run from the repository root')
        def snapshot():
            raw = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=repo)
            result = {}
            for name in sorted(set(raw.decode().split('\0')) - {''}):
                path = repo / name
                if path.exists() or path.is_symlink():
                    value = path.lstat()
                    result[name] = (value.st_mode, value.st_size, value.st_mtime_ns)
                else: result[name] = None
            return result
        before = snapshot()
        try:
            measured = progress.collect(repo, repo / 'reports/test-verification', repo / 'reports/launch-readiness/current')
        except progress.InvalidEvidence:
            # The canonical master executes this test before final reconciliation.
            # It must reject mixed old summaries/new execution, without writing
            # or turning that unfinished invocation into current acceptance.
            master = json.loads((repo / 'reports/test-verification/orchestration/results.json').read_text())
            self.assertFalse(master.get('finishedAt'), 'A completed inconsistent report must fail this check')
            self.assertNotIn(master.get('status'), {'failed', 'executed_groups_passed'})
        else:
            self.assertIn(measured['measurementStatus'], {'CURRENT', 'STALE'})
        self.assertEqual(snapshot(), before)

    def test_missing_input_cli_writes_unavailable_and_returns_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = subprocess.run([sys.executable, str(SCRIPT), '--repo', str(root), '--output', str(root / 'out')],
                                    text=True, capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 2, result.stderr)
            report = json.loads((root / 'out/progress.json').read_text())
            self.assertEqual(report['measurementStatus'], 'UNAVAILABLE')
            self.assertIsNone(report['currentVerified'])
            self.assertFalse(report['productionReady'])


if __name__ == '__main__':
    unittest.main()
