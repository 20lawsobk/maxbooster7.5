import json
import copy
import os
import signal
import time
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from verify import METRIC_LIMITS, REQUIRED, digest, generated_path, observe, read, run, source_identity, validate, write
from repair import changes, protected, repair

class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        self.state = self.base / 'state'
        self.state.mkdir()
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        subprocess.run(['git','-C',str(self.root),'-c','user.name=Test','-c','user.email=test@example.test','commit','--allow-empty','-qm','initial'],check=True)
        self.policy = self.base / 'policy.json'
        self.config = {'target':98,'artifact_contract_argv':[sys.executable,'-c','pass'],'gates':{k:{'argv':[sys.executable,'-c','pass']} for k in REQUIRED}}
        for name, limits in METRIC_LIMITS.items():
            values = {key: bounds.get('min', bounds.get('max')) for key, bounds in limits.items()}
            self.config['gates'][name] = {'argv': None, 'limits': copy.deepcopy(limits),
                'evidence_argv': [sys.executable, '-c',
                    "from pathlib import Path; import sys; Path(sys.argv[1]).write_text(sys.argv[2])",
                    '{evidence}', json.dumps(values)]}
        write(self.policy,self.config)
    def test_missing_gates_rejected(self):
        del self.config['gates']['security']
        with self.assertRaises(ValueError): validate(self.config)
    def test_threshold_cannot_drop(self):
        self.config['target']=50
        with self.assertRaises(ValueError): validate(self.config)
    def test_all_pass(self):
        self.assertTrue(observe(self.root,self.policy,self.state,{})['ready'])
    def test_missing_evidence_blocks(self):
        self.config['gates']['performance']={'argv':None,'limits':METRIC_LIMITS['performance']}
        write(self.policy,self.config)
        report=observe(self.root,self.policy,self.state,{})
        self.assertFalse(report['ready'])
        self.assertEqual(report['gates']['performance']['status'],'UNVERIFIED')
    def test_failed_command_blocks(self):
        self.config['gates']['security']={'argv':[sys.executable,'-c','raise SystemExit(1)']}
        write(self.policy,self.config)
        self.assertFalse(observe(self.root,self.policy,self.state,{})['ready'])
    def test_mutation_invalidates_evidence(self):
        self.config['gates']['build']={'argv':[sys.executable,'-c',"open('source.txt','w').write('mutation')"]}
        write(self.policy,self.config)
        self.assertFalse(observe(self.root,self.policy,self.state,{})['unchanged'])
    def test_numeric_threshold(self):
        self.config['gates']['performance']={'argv':None,'limits':METRIC_LIMITS['performance'],
            'evidence_argv':[sys.executable,'-c',"import pathlib; pathlib.Path(__import__('sys').argv[1]).write_text('{\"api_p95_ms\": 251, \"page_load_seconds\": 1}')",'{evidence}']}
        write(self.policy,self.config)
        self.assertEqual(observe(self.root,self.policy,self.state,{})['gates']['performance']['status'],'FAIL')
    def test_timeout(self):
        result=run([sys.executable,'-c','import time; time.sleep(30)'],self.root,self.state/'timeout.log',0.05)
        self.assertEqual(result['exit'],124)
    def test_missing_executable(self):
        self.assertEqual(run(['/no/such/executable'],self.root,self.state/'missing.log',1)['exit'],127)
    def test_repair_candidate_is_verified_and_source_untouched(self):
        self.config['gates']['build']={'argv':[sys.executable,'-c',"from pathlib import Path; assert Path('fixed.txt').exists()"]}
        self.config['repair_argv']=[sys.executable,'-c',"from pathlib import Path; Path('fixed.txt').write_text('fixed')"]
        write(self.policy,self.config)
        observe(self.root,self.policy,self.state,{})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,0)
        self.assertFalse((self.root/'fixed.txt').exists())
        outcomes=list(self.state.glob('*-evidence/outcome.json'))
        self.assertEqual(len(outcomes),1)
        self.assertTrue(read(outcomes[0])['ready'])
    def test_protected_change_is_rejected(self):
        self.config['repair_argv']=[sys.executable,'-c',"from pathlib import Path; Path('tests').mkdir(); Path('tests/fake.py').write_text('pass')"]
        write(self.policy,self.config)
        observe(self.root,self.policy,self.state,{})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,4)
    def test_fixed_metric_limits_cannot_be_removed_or_weakened(self):
        for name in METRIC_LIMITS:
            weakened = copy.deepcopy(self.config)
            weakened['gates'][name] = {'argv': [sys.executable, '-c', 'pass']}
            with self.assertRaises(ValueError):
                validate(weakened)
        weakened = copy.deepcopy(self.config)
        weakened['gates']['coverage']['limits']['lines']['min'] = 94
        with self.assertRaises(ValueError):
            validate(weakened)
    def test_evidence_cannot_override_failed_prerequisite(self):
        self.config['gates']['performance']['argv'] = [sys.executable, '-c', 'raise SystemExit(1)']
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertEqual(report['gates']['performance']['status'], 'FAIL')
    def test_numeric_policy_validation(self):
        for value in (True, float('nan'), float('inf'), '600'):
            invalid = copy.deepcopy(self.config)
            invalid['gates']['build']['timeout'] = value
            with self.assertRaises(ValueError): validate(invalid)
        for command in ('echo unsafe', [], [3], ['bad\0arg']):
            invalid = copy.deepcopy(self.config)
            invalid['gates']['performance']['evidence_argv'] = command
            with self.assertRaises(ValueError): validate(invalid)
    def test_boolean_metric_rejected(self):
        self.config['gates']['performance']['evidence_argv'][-1] = json.dumps(
            {'api_p95_ms': True, 'page_load_seconds': 1})
        write(self.policy, self.config)
        self.assertEqual(observe(self.root, self.policy, self.state, {})['gates']['performance']['status'], 'FAIL')
    def test_policy_mutation_invalidates_and_preserves_used_digest(self):
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; import sys; p=Path(sys.argv[1]); p.write_text(p.read_text()+' ')" , str(self.policy)]
        write(self.policy, self.config)
        before = digest(self.policy)
        report = observe(self.root, self.policy, self.state, {})
        self.assertFalse(report['ready'])
        self.assertFalse(report['unchanged'])
        self.assertEqual(report['policy_sha256'], before)
    def test_snapshot_tracks_file_modes_and_whitespace_paths(self):
        path = self.root / ' leading space and newline\n'
        path.write_text('source')
        before = source_identity(self.root)
        path.chmod(0o755)
        self.assertNotEqual(before, source_identity(self.root))
    def test_rename_out_of_protected_directory_retains_deleted_path(self):
        (self.root / 'tests').mkdir()
        (self.root / 'tests' / 'original.py').write_text('test')
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git','-C',str(self.root),'-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','test'],check=True)
        subprocess.run(['git', '-C', str(self.root), 'mv', 'tests/original.py', 'hidden.py'], check=True)
        self.assertIn('tests/original.py', changes(self.root))
        self.assertTrue(protected('tests/original.py'))
        self.assertTrue(protected('server/authorization.test.ts'))
        self.assertTrue(protected('nested/AGENTS.md'))
    def test_stale_foreign_report_is_rejected(self):
        self.config['repair_argv'] = [sys.executable, '-c', 'pass']
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        report['root'] = '/another/repo'
        write(self.state / 'latest.json', report)
        with self.assertRaises(ValueError): repair(self.root, self.state, self.policy, 1)
    def test_adapter_commit_is_rejected(self):
        self.config['repair_argv'] = ['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
            'commit', '--allow-empty', '-m', 'must not commit']
        write(self.policy, self.config)
        observe(self.root, self.policy, self.state, {})
        self.assertEqual(repair(self.root, self.state, self.policy, 1), 4)
    def test_newly_passing_gate_cannot_regress_on_next_attempt(self):
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; assert Path('first.txt').exists()"]
        self.config['gates']['features']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; assert Path('second.txt').exists()"]
        self.config['repair_argv'] = [sys.executable, '-c',
            "from pathlib import Path; import json,sys; attempt=json.loads(Path(sys.argv[1]).read_text())['attempt']; "
            "Path('first.txt').write_text('fixed') if attempt == 1 else "
            "(Path('first.txt').unlink(), Path('second.txt').write_text('fixed'))", '{request}']
        write(self.policy, self.config)
        observe(self.root, self.policy, self.state, {})
        self.assertEqual(repair(self.root, self.state, self.policy, 3), 4)
        outcome = read(next(self.state.glob('*-evidence/outcome.json')))
        self.assertEqual(outcome['attempt'], 2)
        self.assertIn('build', outcome['regressions'])
    def test_repeated_candidate_stops_before_attempt_budget(self):
        self.config['gates']['features']['argv'] = [sys.executable, '-c', 'raise SystemExit(1)']
        self.config['repair_argv'] = [sys.executable, '-c',
            "from pathlib import Path; Path('same.txt').write_text('same')"]
        write(self.policy, self.config)
        observe(self.root, self.policy, self.state, {})
        self.assertEqual(repair(self.root, self.state, self.policy, 3), 4)
        self.assertIn('Repeated candidate', read(next(self.state.glob('*-evidence/blocked.json')))['reason'])
    def test_generated_build_outputs_do_not_invalidate_source(self):
        (self.root / 'dist').mkdir()
        (self.root / 'dist/build-complete.json').write_text('old')
        (self.root / 'artifacts/api-server/dist').mkdir(parents=True)
        (self.root / 'artifacts/api-server/dist/index.js').write_text('old')
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git','-C',str(self.root),'-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','generated'],check=True)
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; Path('dist/build-complete.json').write_text('new'); "
            "Path('artifacts/api-server/dist/index.js').write_text('new')"]
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertTrue(report['unchanged'])
        self.assertTrue(report['ready'])
        self.assertEqual(report['artifact_contract']['manifest_sha256'], digest(self.root / 'dist/build-complete.json'))
    def test_fixture_dist_and_unknown_dist_remain_source(self):
        self.assertFalse(generated_path('tests/fixtures/deployment-versions/current/dist/index.js'))
        self.assertFalse(generated_path('tests/fixtures/node_modules/mock/index.js'))
        self.assertFalse(generated_path('server/dist/important.js'))
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; p=Path('tests/fixtures/example/dist'); p.mkdir(parents=True); (p/'fixture.js').write_text('changed')"]
        write(self.policy, self.config)
        self.assertFalse(observe(self.root, self.policy, self.state, {})['unchanged'])
    def test_only_exact_generated_endpoint_reports_are_excluded(self):
        for name in ('reports/endpoint-audit.json', 'reports/endpoint-audit.md'):
            self.assertTrue(generated_path(name))
        for name in ('reports/endpoint-audit-source.json', 'reports/endpoint-audit.md.py',
                     'reports/endpoint-audit.json/source.py', 'reports/endpoint-audit.py',
                     'reports/fixtures/endpoint-audit.json', 'reports/other-report.json'):
            self.assertFalse(generated_path(name))
        (self.root / 'reports').mkdir()
        (self.root / 'reports/endpoint-audit.json').write_text('old')
        (self.root / 'reports/endpoint-audit.md').write_text('old')
        source = self.root / 'reports/endpoint-audit-source.json'
        source.write_text('source')
        before = source_identity(self.root)
        (self.root / 'reports/endpoint-audit.json').write_text('regenerated')
        (self.root / 'reports/endpoint-audit.md').write_text('regenerated')
        self.assertEqual(before, source_identity(self.root))
        source.write_text('source mutation')
        self.assertNotEqual(before, source_identity(self.root))
    def test_generated_cache_exclusions_are_explicit(self):
        self.assertTrue(generated_path('node_modules/.cache/result.js'))
        self.assertTrue(generated_path('external/maxcore/artifacts/api-server/node_modules/example/index.js'))
        self.assertTrue(generated_path('dns-os/.cache/result.json'))
        self.assertFalse(generated_path('server/.cache/source.json'))
        self.assertFalse(generated_path('tests/fixtures/example/.cache/source.json'))
    def test_failed_or_unconfigured_artifact_contract_blocks_readiness(self):
        self.config['artifact_contract_argv'] = [sys.executable, '-c', 'raise SystemExit(1)']
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertFalse(report['ready'])
        self.assertEqual(report['artifact_contract']['status'], 'FAIL')
        self.config['artifact_contract_argv'] = None
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertFalse(report['ready'])
        self.assertEqual(report['artifact_contract']['status'], 'UNVERIFIED')
    def test_stronger_coverage_requirement_is_preserved(self):
        for bounds in self.config['gates']['coverage']['limits'].values(): bounds['min'] = 100
        validate(self.config)
        self.assertTrue(all(bounds['min'] == 100 for bounds in self.config['gates']['coverage']['limits'].values()))
        # Fixture producer still emits95: the stronger policy must reject it.
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertEqual(report['gates']['coverage']['status'], 'FAIL')
    def test_generated_dirty_checkout_still_allows_source_repair(self):
        (self.root / 'dist').mkdir()
        (self.root / 'dist/build-complete.json').write_text('old')
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git','-C',str(self.root),'-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','generated'],check=True)
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; Path('dist/build-complete.json').write_text('rebuilt'); assert Path('fixed.txt').exists()"]
        self.config['repair_argv'] = [sys.executable, '-c',
            "from pathlib import Path; Path('fixed.txt').write_text('fixed')"]
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertTrue(report['unchanged'])
        self.assertEqual(repair(self.root, self.state, self.policy, 1), 0)
        self.assertFalse((self.root / 'fixed.txt').exists())
    def test_artifact_contract_regression_stops_repair(self):
        self.config['gates']['features']['argv'] = [sys.executable, '-c', 'raise SystemExit(1)']
        self.config['artifact_contract_argv'] = [sys.executable, '-c',
            "from pathlib import Path; assert not Path('broken.txt').exists()"]
        self.config['repair_argv'] = [sys.executable, '-c',
            "from pathlib import Path; Path('broken.txt').write_text('bad artifact')"]
        write(self.policy, self.config)
        observe(self.root, self.policy, self.state, {})
        self.assertEqual(repair(self.root, self.state, self.policy, 1), 4)
        outcome = read(next(self.state.glob('*-evidence/outcome.json')))
        self.assertIn('artifact_contract', outcome['regressions'])
    def test_gate_evidence_destinations_are_outside_checkout(self):
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; import os; "
            "report=Path(os.environ['MAXBOOSTER_TEST_REPORT_DIR']); report.mkdir(parents=True); "
            "(report/'result.json').write_text('evidence'); "
            "assert not str(report).startswith(str(Path.cwd()) + '/')"]
        write(self.policy, self.config)
        report = observe(self.root, self.policy, self.state, {})
        self.assertTrue(report['unchanged'])
        self.assertTrue(list(self.state.glob('run-*/build/result.json')))
    def test_sigterm_cleans_up_active_command(self):
        marker = self.state / 'child.pid'
        self.config['gates']['build']['argv'] = [sys.executable, '-c',
            "from pathlib import Path; import os,sys,time; Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(30)", str(marker)]
        write(self.policy, self.config)
        coordinator = subprocess.Popen([sys.executable, str(Path(__file__).with_name('verify.py')),
            '--root', str(self.root), '--policy', str(self.policy), '--state', str(self.state)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(lambda: coordinator.kill() if coordinator.poll() is None else None)
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(marker.exists(), 'Gate process did not start')
        child_pid = int(marker.read_text())
        os.kill(coordinator.pid, signal.SIGTERM)
        coordinator.wait(timeout=5)
        self.assertNotEqual(coordinator.returncode, 0)
        self.assertEqual(read(self.state / 'latest.json')['state'], 'RUNNING')
        self.assertFalse(read(self.state / 'latest.json')['ready'])
        with self.assertRaises(ProcessLookupError): os.kill(child_pid, 0)
    def test_repair_unconfigured(self):
        write(self.state/'latest.json',{'gates':{'build':{'status':'FAIL'}}})
        result=subprocess.run([sys.executable,str(Path(__file__).with_name('repair.py')),
            '--root',str(self.root),'--policy',str(self.policy),'--state',str(self.state)])
        self.assertEqual(result.returncode,3)

if __name__=='__main__': unittest.main()
