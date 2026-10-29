"""Real subprocesses exercise producer-time byte/nonce/count binding."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/testing'))
MODULE = ROOT / 'scripts/testing/run-all.py'
spec = importlib.util.spec_from_file_location('coverage_parent_candidate', MODULE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

CHILD = r'''
import datetime,hashlib,json,os,pathlib,sys,time
root=pathlib.Path(os.environ['C5_FIXTURE_OUTPUT']);reporter=pathlib.Path(os.environ['C5_FIXTURE_REPORTER']);mode=os.environ.get('C5_FIXTURE_MODE','pass');junit=root/'root/coverage-unit.junit.xml';outcome=pathlib.Path(os.environ['MAXBOOSTER_TEST_COVERAGE_OUTCOME']);junit.parent.mkdir(parents=True,exist_ok=True);outcome.parent.mkdir(parents=True,exist_ok=True)
start=datetime.datetime.now(datetime.timezone.utc).isoformat();run_id=os.environ['MAXBOOSTER_TEST_COVERAGE_RUN_ID'];failed=mode=='assertion-failure';skipped=mode=='skip';total=1
if mode not in {'missing-junit','stale-junit','symlink-junit'}:
 body='<failure message="expected failure"/>' if failed else '<skipped/>' if skipped else ''
 junit.write_text('<testsuites tests="1" failures="'+str(int(failed))+'" errors="0"><testsuite name="owned" tests="1" failures="'+str(int(failed))+'" errors="0" skipped="'+str(int(skipped))+'"><testcase classname="owned" name="actual child">'+body+'</testcase></testsuite></testsuites>')
 if mode=='forged-root-count':junit.write_text(junit.read_text().replace('tests="1"','tests="2"',1))
 if mode=='forged-suite-count':junit.write_text(junit.read_text().replace('name="owned" tests="1"','name="owned" tests="2"'))
 if mode=='stale-mtime':os.utime(junit,ns=(1,1))
 if mode=='oversized-junit':junit.write_bytes(b'x'*(32*1024*1024+1))
if mode not in {'missing-outcome','stale-outcome'}:
 data=dict(schemaVersion=1,kind='actual-public-Vitest-onTestRunEnd',runId=run_id,repositoryRoot=os.environ['C5_FIXTURE_REPOSITORY'],reporterSha256=hashlib.sha256(reporter.read_bytes()).hexdigest(),runtime=dict(node='22.23.3',v8='12.4.254.21-node.57'),initializedAt=start,startedAt=start,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),reason='failed' if failed else 'passed',unhandledErrorCount=int(mode in {'unhandled','unhandled-exit-zero'}),moduleErrorCount=0,testCaseErrorCount=int(failed),testModuleCount=1,missingModules=[],unexpectedModules=[],testCaseCounts=dict(total=1,passed=int(not failed and not skipped),failed=int(failed),skipped=int(skipped),pending=0),moduleStates=dict(passed=int(not failed and not skipped),failed=int(failed),skipped=int(skipped),pending=0,queued=0))
 data['selectedModules']=['owned.test.ts'];data['modules']=[dict(file='owned.test.ts',state='failed' if failed else 'skipped' if skipped else 'passed',testCaseCounts=dict(data['testCaseCounts']),errorCount=0)]
 if mode=='invalid-schema-type':data['schemaVersion']=True
 if mode=='invalid-reason':data['reason']=[]
 if mode=='invalid-module-state':data['modules'][0]['state']={}
 if mode=='wrong-nonce':data['runId']='not-this-command'
 if mode=='wrong-reporter':data['reporterSha256']='0'*64
 if mode=='mismatched-counts':data['testCaseCounts'].update(total=2771,passed=2771)
 if mode=='outcome-before-command':data['startedAt']='2020-01-01T00:00:00Z'
 if mode=='outcome-after-command':data['finishedAt']='2099-01-01T00:00:00Z'
 if mode=='timezone-absent':data['startedAt']='2026-01-01T00:00:00'
 if mode=='missing-module':data['selectedModules'].append('missing.test.ts');data['missingModules']=['missing.test.ts']
 if mode=='unexpected-module':data['selectedModules']=[];data['unexpectedModules']=['owned.test.ts']
 if mode=='forged-module-counts':data['modules'][0]['testCaseCounts'].update(total=2,passed=2)
 if mode=='forged-module-identity':data['modules'][0]['file']='foreign.test.ts'
 if mode=='forged-module-errors':data['modules'][0]['errorCount']=1
 if mode=='missing-module-list':del data['modules']
 if mode=='invalid-runtime':data['runtime']={}
 if mode=='missing-initialized':del data['initializedAt']
 if mode=='invalid-module-count':data['moduleStates']['passed']=2
 if mode=='boolean-count':data['unhandledErrorCount']=False
 if mode=='interrupted':data['reason']='interrupted'
 if mode=='array-outcome':data=[]
 outcome.write_text(json.dumps(data))
if mode=='reporter-changed':reporter.write_text('mutated while child ran')
sys.exit(1 if failed or mode in {'unhandled','threshold'} else 0)
'''


class CoverageCommandBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='c5-binding-')
        self.directory = Path(self.temp.name)
        self.output = self.directory / 'output'
        self.reporter = self.directory / 'reporter.mjs'
        self.reporter.write_text('// fixture reporter bytes\n')
        self.child = self.directory / 'child.py'
        self.child.write_text(CHILD)

    def tearDown(self):
        self.temp.cleanup()

    def execute(self, mode='pass'):
        environment = {'C5_FIXTURE_OUTPUT': str(self.output), 'C5_FIXTURE_REPORTER': str(self.reporter),
                       'C5_FIXTURE_REPOSITORY': str(runner.ROOT), 'C5_FIXTURE_MODE': mode}
        return runner.run_coverage_command([sys.executable, str(self.child), '--reporter=' + str(self.reporter)],
            self.directory / 'child.txt', 10, self.output, extra_env=environment, reporter_path=self.reporter)

    def test_real_child_binds_exact_fresh_junit_and_public_outcome_bytes(self):
        result = self.execute()
        proof = result['coverageEvidence']
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(proof['status'], 'bound')
        self.assertTrue(proof['validForAdmission'])
        self.assertEqual(proof['junit']['counts'], {'total': 1, 'passed': 1, 'failed': 0, 'errors': 0, 'skipped': 0})
        for key in ['junit', 'outcome']:
            artifact = Path(proof[key]['path'])
            self.assertEqual(proof[key]['sha256'], hashlib.sha256(artifact.read_bytes()).hexdigest())
            self.assertTrue(int(proof['parentWindow']['startedAtNs']) <= int(proof[key]['mtimeNs']) <= int(proof['parentWindow']['finishedAtNs']))
        self.assertEqual(proof['runId'], proof['outcome']['data']['runId'])

    def test_bound_hash_rejects_subsequent_one_vs_2771_replacement(self):
        result = self.execute('mismatched-counts')
        self.assertEqual(result['coverageEvidence']['status'], 'invalid')
        self.assertIn('counts disagree', result['coverageEvidence']['error'])
        original = self.execute()['coverageEvidence']['junit']
        target = Path(original['path'])
        target.write_bytes(target.read_bytes().replace(b'actual child', b'forged case'))
        self.assertNotEqual(hashlib.sha256(target.read_bytes()).hexdigest(), original['sha256'])

    def test_each_invocation_has_fresh_nonce_and_rewritten_identical_xml_is_bound(self):
        first = self.execute()['coverageEvidence']
        second = self.execute()['coverageEvidence']
        self.assertEqual(first['status'], 'bound')
        self.assertEqual(second['status'], 'bound')
        self.assertNotEqual(first['runId'], second['runId'])
        self.assertEqual(first['junit']['sha256'], second['junit']['sha256'])

    def test_threshold_exit_is_retained_without_becoming_an_assertion_failure(self):
        result = self.execute('threshold')
        self.assertEqual(result['exitCode'], 1)
        self.assertEqual(result['coverageEvidence']['status'], 'bound')
        self.assertTrue(result['coverageEvidence']['validForAdmission'])
        self.assertEqual(result['status'], 'failed')

    def test_unhandled_error_with_passing_junit_is_bound_but_never_eligible(self):
        result = self.execute('unhandled')
        self.assertEqual(result['coverageEvidence']['status'], 'bound')
        self.assertEqual(result['coverageEvidence']['junit']['counts']['passed'], 1)
        self.assertEqual(result['coverageEvidence']['outcome']['data']['unhandledErrorCount'], 1)
        self.assertFalse(result['coverageEvidence']['validForAdmission'])

    def test_unhandled_with_zero_exit_still_fails_guard_without_coercing_exit(self):
        result = self.execute('unhandled-exit-zero')
        self.assertEqual(result['exitCode'], 0)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['coverageEvidence']['status'], 'bound')
        self.assertFalse(result['coverageEvidence']['validForAdmission'])

    def test_real_assertion_failure_is_retained_without_eligibility(self):
        result = self.execute('assertion-failure')
        proof = result['coverageEvidence']
        self.assertEqual(result['exitCode'], 1)
        self.assertEqual(proof['status'], 'bound')
        self.assertFalse(proof['validForAdmission'])
        self.assertEqual(proof['junit']['counts']['failed'], 1)

    def test_skips_and_interruption_are_never_eligible(self):
        for mode in ['skip', 'interrupted', 'missing-module', 'unexpected-module']:
            with self.subTest(mode=mode):
                result = self.execute(mode)
                self.assertEqual(result['coverageEvidence']['status'], 'bound')
                self.assertFalse(result['coverageEvidence']['validForAdmission'])

    def test_real_child_rejections(self):
        modes = ['missing-junit', 'missing-outcome', 'wrong-nonce', 'wrong-reporter', 'mismatched-counts',
                 'forged-root-count', 'forged-suite-count', 'stale-mtime', 'outcome-before-command',
                 'outcome-after-command', 'timezone-absent', 'invalid-module-count', 'boolean-count',
                 'reporter-changed', 'oversized-junit', 'forged-module-counts', 'forged-module-identity',
                 'forged-module-errors', 'missing-module-list', 'invalid-runtime', 'missing-initialized', 'invalid-schema-type', 'invalid-reason',
                 'invalid-module-state', 'array-outcome']
        for mode in modes:
            with self.subTest(mode=mode):
                # Fresh owned output for each child prevents previous failures from
                # satisfying a different missing-artifact control.
                self.output = self.directory / ('output-' + mode)
                self.reporter.write_text('// fixture reporter bytes\n')
                result = self.execute(mode)
                self.assertEqual(result['coverageEvidence']['status'], 'invalid')
                self.assertFalse(result['coverageEvidence']['validForAdmission'])
                self.assertEqual(result['status'], 'failed')

    def test_unchanged_previous_junit_and_outcome_rejected(self):
        self.execute()
        for mode in ['stale-junit', 'stale-outcome']:
            with self.subTest(mode=mode):
                self.assertEqual(self.execute(mode)['coverageEvidence']['status'], 'invalid')

    def test_symlink_artifact_and_parent_are_rejected_before_child(self):
        target = self.directory / 'target.xml'
        target.write_text('private fixture sentinel')
        (self.output / 'root').mkdir(parents=True)
        (self.output / 'root/coverage-unit.junit.xml').symlink_to(target)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.execute()
        self.assertEqual(target.read_text(), 'private fixture sentinel')
        (self.output / 'root/coverage-unit.junit.xml').unlink()
        (self.output / 'root').rmdir()
        (self.output / 'root').symlink_to(self.directory, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            self.execute()

    def test_command_must_select_outcome_reporter_exactly_once(self):
        for arguments in [[], ['--reporter=' + str(self.reporter)] * 2]:
            with self.subTest(arguments=arguments):
                with self.assertRaisesRegex(ValueError, 'exactly one'):
                    runner.run_coverage_command([sys.executable, str(self.child), *arguments], self.directory / 'bad.txt',
                        2, self.output, reporter_path=self.reporter)
                self.assertFalse((self.directory / 'bad.txt').exists())


if __name__ == '__main__':
    unittest.main()
