import copy
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

from admin_release import MANIFEST, collect, finalize
from verify import METRIC_LIMITS, REQUIRED, observe, read, target_ready, validate, write

PRODUCER = r'''
import json, pathlib, sys
request=json.loads(pathlib.Path(sys.argv[1]).read_text())
artifacts=pathlib.Path(request['artifacts'])
(artifacts/'run.json').write_text(json.dumps({'fixture':'controlled acceptance fixture'}))
out={k:request[k] for k in ('schema','id','nonce','head','source_sha256','manifest_sha256')}
out['environment']='isolated-fixture'
out['criteria']={k:{'status':'PASS','evidence':['run.json']} for k in request['manifest']['required_criteria']}
out['metrics']={k:v['min'] for k,v in request['manifest']['numeric_limits'].items()}
behavior=sys.argv[3]
if behavior=='stale': out['nonce']='old'
if behavior=='missing': del out['criteria']['admin_session']
if behavior=='skipped': out['criteria']['admin_session']['status']='UNVERIFIED'
if behavior=='slow': out['metrics']['api_p95_ms']=251
if behavior=='boolean': out['metrics']['security_critical']=False
if behavior=='symlink':
 (artifacts/'run.json').unlink()
 (artifacts/'run.json').symlink_to(sys.argv[1])
pathlib.Path(sys.argv[2]).write_text(json.dumps(out))
if behavior=='exit': raise SystemExit(1)
if behavior=='source_mutation': pathlib.Path('source.txt').write_text('changed by acceptance')
'''


class AdminReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.report = {'gates': {key: {'status': 'PASS'} for key in read(MANIFEST)['mandatory_source_gates']},
                       'unchanged': True, 'artifact_contract': {'status': 'PASS'}, 'ready': False}

    def measure(self, behavior='pass'):
        session = self.base / behavior
        session.mkdir()
        config = {'admin_release_argv': [sys.executable, '-c', PRODUCER, '{request}', '{evidence}', behavior]}
        return collect(self.base, session, config, 'fixture-head', 'fixture-source')

    def test_unconfigured_acceptance_remains_unverified(self):
        result = collect(self.base, self.base, {}, 'h', 's')
        self.assertEqual(result['status'], 'UNVERIFIED')
        self.assertFalse(finalize(result, self.report)['ready'])

    def test_private_readiness_separate_from_public_coverage(self):
        result = finalize(self.measure(), self.report)
        self.assertTrue(result['ready'])
        self.assertFalse(result['public_release_ready'])
        self.assertEqual(len(result['criteria']), 63)
        self.assertTrue(target_ready({**self.report, 'active_release': result}))

    def test_missing_stale_skipped_invalid_and_failed_evidence_never_pass(self):
        for behavior in ('stale', 'missing', 'skipped', 'slow', 'boolean', 'symlink', 'exit'):
            with self.subTest(behavior=behavior):
                result = finalize(self.measure(behavior), self.report)
                self.assertEqual(result['status'], 'FAIL')
                self.assertFalse(result['ready'])

    def test_security_start_and_artifact_failures_still_block_admin(self):
        measured = self.measure()
        for field in ('security', 'start'):
            report = copy.deepcopy(self.report)
            report['gates'][field]['status'] = 'FAIL'
            self.assertFalse(finalize(copy.deepcopy(measured), report)['ready'])
        report = copy.deepcopy(self.report)
        report['artifact_contract']['status'] = 'FAIL'
        self.assertFalse(finalize(copy.deepcopy(measured), report)['ready'])
        self.assertFalse(finalize(copy.deepcopy(measured), {**self.report, 'unchanged': False})['ready'])

    def test_public_success_cannot_override_failed_admin_acceptance(self):
        self.assertFalse(target_ready({'ready': True, 'active_release': {'ready': False}}))

    def test_admin_policy_contract_rejects_missing_binding_placeholder(self):
        config = read(Path(__file__).with_name('policy.json'))
        validate(config)
        config['admin_release_argv'] = [sys.executable, '-c', 'pass', '{evidence}']
        with self.assertRaises(ValueError): validate(config)

    def test_full_coordinator_reports_admin_and_public_decisions_separately(self):
        root = self.base / 'repo'
        root.mkdir()
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        subprocess.run(['git', '-C', str(root), '-c', 'user.name=Test', '-c',
                        'user.email=test@example.test', 'commit', '--allow-empty', '-qm', 'fixture'], check=True)
        config = {'active_release': 'admin-private', 'target': 98,
                  'artifact_contract_argv': [sys.executable, '-c', 'pass'],
                  'gates': {k: {'argv': [sys.executable, '-c', 'pass']} for k in REQUIRED},
                  'admin_release_argv': [sys.executable, '-c', PRODUCER, '{request}', '{evidence}', 'pass']}
        for name, limits in METRIC_LIMITS.items():
            values = {k: bounds['min'] for k, bounds in limits.items()}
            if name == 'coverage': values['lines'] = 13.21
            config['gates'][name] = {'limits': limits, 'evidence_argv': [sys.executable, '-c',
                'import pathlib,sys; pathlib.Path(sys.argv[1]).write_text(sys.argv[2])', '{evidence}', json.dumps(values)]}
        policy = self.base / 'policy.json'
        state = self.base / 'observed'
        state.mkdir()
        write(policy, config)
        report = observe(root, policy, state, {})
        self.assertFalse(report['ready'])
        self.assertEqual(report['gates']['coverage']['status'], 'FAIL')
        self.assertTrue(report['active_release']['ready'])
        self.assertTrue(target_ready(report))
        config['admin_release_argv'][-1] = 'source_mutation'
        write(policy, config)
        report = observe(root, policy, state, {})
        self.assertFalse(report['unchanged'])
        self.assertFalse(report['active_release']['ready'])


if __name__ == '__main__':
    unittest.main()
