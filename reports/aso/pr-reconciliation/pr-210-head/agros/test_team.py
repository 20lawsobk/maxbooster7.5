"""Adversarial contracts for specialist dispatch using real local subprocesses."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import team
from verify import digest, git, read, source_identity, write


ADAPTER = r'''
import json, os, pathlib, sys
request_path, response_path, behavior = map(str, sys.argv[1:4])
request = json.loads(pathlib.Path(request_path).read_text())
response = pathlib.Path(response_path)
artifacts = pathlib.Path(request['artifact_directory'])
is_review = 'artifact_hashes' in request
if behavior == 'exit':
    raise SystemExit(7)
if behavior == 'silent':
    raise SystemExit(0)
if behavior == 'sleep':
    import time
    time.sleep(10)
if behavior in ('mutate', 'outside', 'protected'):
    name = {'mutate': 'src/service.py', 'outside': 'other.py', 'protected': 'tests/existing.test.py'}[behavior]
    path = pathlib.Path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('changed = True\n')
if behavior == 'commit':
    import subprocess
    subprocess.run(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.test',
                    'commit', '--allow-empty', '-qm', 'unapproved'], check=True)
if is_review:
    result = {key: request[key] for key in ('task_id', 'nonce', 'source_sha256')}
    result.update(schema=1, decision='REJECT' if behavior == 'reject' else 'ACCEPT',
                  reasons=['Examined independently generated check evidence'], artifact_hashes=request['artifact_hashes'])
    if behavior == 'artifact_mutation':
        (artifacts / 'evidence.json').write_text('{}')
else:
    (artifacts / 'evidence.json').write_text(json.dumps({'task_id': request['task_id'], 'measured': 42}))
    result = {key: request[key] for key in ('task_id', 'nonce', 'source_sha256')}
    result.update(schema=1, status='COMPLETE', summary='Inspected the controlled fixture',
                  completed_steps=list(range(1, len(request['task']['steps']) + 1)),
                  artifacts=['evidence.json'], acceptance=[{'criterion': i, 'status': 'PASS', 'evidence': ['evidence.json']}
                      for i in range(1, len(request['task']['acceptance']) + 1)])
    if behavior == 'stale':
        result['nonce'] = 'previous-invocation'
    if behavior == 'missing_steps':
        result['completed_steps'] = [1]
    if behavior == 'missing_acceptance':
        result['acceptance'] = []
    if behavior == 'traversal':
        result['artifacts'] = ['../request.json']
    if behavior == 'symlink':
        (artifacts / 'evidence.json').unlink()
        (artifacts / 'evidence.json').symlink_to(request_path)
response.write_text(json.dumps(result))
'''


class TeamTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        (self.root / 'src').mkdir()
        (self.root / 'src/service.py').write_text('original = True\n')
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        subprocess.run(['git', '-C', str(self.root), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.root), '-c', 'user.name=Test', '-c',
                        'user.email=test@example.test', 'commit', '-qm', 'fixture'], check=True)
        self.state = self.base / 'state'
        self.catalog_path = self.base / 'catalog.json'
        role = {'name': 'Fixture role', 'mission': 'Verify fixture',
                'responsibilities': ['Inspect exact fixture'], 'prohibited_actions': ['Do not deploy']}
        self.task = {'id': 'inspect', 'title': 'Inspect source', 'owner': 'engineer', 'reviewer': 'reviewer',
                     'scope': 'platform', 'depends_on': [], 'gates': ['features'], 'mode': 'analysis',
                     'inputs': ['Source fixture'], 'steps': ['Read source', 'Check invariant', 'Record evidence'],
                     'deliverables': ['Evidence JSON'], 'acceptance': ['Invariant is demonstrated'],
                     'validation': ['Independent checker verifies measured=42'], 'path_scopes': [],
                     'failure_route': 'engineer', 'max_minutes': 1}
        self.catalog = {'schema': 1, 'roles': {'engineer': role, 'reviewer': copy.deepcopy(role)},
                        'domains': [{'id': 'studio', 'name': 'Studio', 'journeys': ['Save a track'],
                                     'risks': ['Tenant access'], 'path_hints': ['src/*']}],
                        'templates': [copy.deepcopy(self.task)]}
        self.save_catalog()
        self.addCleanup(patch.stopall)
        patch.object(team, 'CATALOG', self.catalog_path).start()
        # The fixture catalog is the trusted controller input for this test run.
        patch.object(team, 'controller_identity', lambda: {'team.py': digest(Path(team.__file__)),
                                                         'catalog': digest(self.catalog_path)}).start()
        self.adapter = self.base / 'adapter.py'
        self.adapter.write_text(ADAPTER)
        self.settings = {'enabled': True,
                         'executors': {'engineer': self.argv('normal')},
                         'reviewers': {'reviewer': self.argv('normal')},
                         'checks': {'inspect': [[sys.executable, '-c',
                             "import json,pathlib,sys; assert json.loads((pathlib.Path(sys.argv[1])/'evidence.json').read_text())['measured']==42",
                             '{artifacts}']]},
                         'task_timeout': 5, 'review_timeout': 5, 'max_tasks': 24, 'max_seconds': 30}
        self.report = {'head': git(self.root, 'rev-parse', 'HEAD'),
                       'source_sha256': source_identity(self.root), 'unchanged': True,
                       'gates': {'features': {'status': 'FAIL'}, 'security': {'status': 'PASS'}},
                       'artifact_contract': {'status': 'PASS'}}

    def save_catalog(self):
        write(self.catalog_path, self.catalog)

    def argv(self, behavior):
        return [sys.executable, str(self.base / 'adapter.py'), '{request}', '{response}', behavior]

    def execute(self):
        return team.execute_plan(self.root, self.state, self.report, self.settings)

    def add_dependent(self, change=False):
        child = copy.deepcopy(self.task)
        child.update(id='implement', depends_on=['inspect'])
        if change:
            child.update(mode='change', path_scopes=['src/*'])
        self.catalog['templates'].append(child)
        self.settings['checks']['implement'] = copy.deepcopy(self.settings['checks']['inspect'])
        self.save_catalog()

    def assert_failed(self, reason=None):
        result = self.execute()
        self.assertEqual(result['status'], 'FAILED', result)
        self.assertFalse(result['production_ready'])
        if reason:
            self.assertIn(reason, result['reason'])
        return result

    def test_plan_expands_domain_and_dependency_closure(self):
        self.catalog['templates'][0].update(scope='domain', gates=['unit'])
        child = copy.deepcopy(self.catalog['templates'][0])
        child.update(id='accept', depends_on=['inspect'], gates=['features'])
        self.catalog['templates'].append(child)
        self.save_catalog()
        plan = team.build_plan(self.root, self.report)
        self.assertEqual(plan['task_count'], 2)
        self.assertEqual(plan['selected_count'], 2)
        self.assertEqual(plan['tasks'][1]['depends_on'], ['studio/inspect'])
        self.assertEqual(plan['tasks'][0]['observed_paths'], ['src/service.py'])
        self.assertFalse(plan['production_ready'])

    def test_catalog_rejects_cycles_unknown_roles_and_traversal(self):
        mutations = [lambda c: c['templates'][0].update(depends_on=['inspect']),
                     lambda c: c['templates'][0].update(owner='missing'),
                     lambda c: c['templates'][0].update(reviewer='engineer'),
                     lambda c: c['templates'][0].update(depends_on=['missing']),
                     lambda c: c['templates'][0].update(mode='change', path_scopes=['../secret']),
                     lambda c: c['templates'].append(copy.deepcopy(c['templates'][0]))]
        for mutate in mutations:
            candidate = copy.deepcopy(self.catalog)
            mutate(candidate)
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                team.validate_catalog(candidate)

    def test_settings_reject_invalid_limits_and_missing_response_placeholder(self):
        for key in ('task_timeout', 'review_timeout', 'max_tasks', 'max_seconds'):
            for value in (0, -1, True, float('nan'), '5'):
                settings = copy.deepcopy(self.settings)
                settings[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    team.validate_settings(settings)
        self.settings['executors']['engineer'] = [sys.executable, '-c', 'pass', '{request}']
        with self.assertRaises(ValueError):
            team.validate_settings(self.settings)

    def test_missing_adapter_and_check_block_without_false_completion(self):
        for field, key in (('executors', 'engineer'), ('reviewers', 'reviewer'), ('checks', 'inspect')):
            settings = copy.deepcopy(self.settings)
            del settings[field][key]
            with self.subTest(field=field):
                result = team.execute_plan(self.root, self.base / field, self.report, settings)
                self.assertEqual(result['status'], 'BLOCKED')
                self.assertEqual(result['counts']['DONE'], 0)
                self.assertFalse(result['production_ready'])

    def test_valid_owner_check_review_generates_bound_receipt(self):
        result = self.execute()
        self.assertEqual(result['status'], 'PASS', result)
        self.assertEqual(result['counts']['DONE'], 1)
        self.assertFalse(result['production_ready'])
        ledger = read(self.state / 'ledger.json')
        receipt = read(ledger['tasks']['platform/inspect']['receipt'])
        self.assertEqual(receipt['owner'], 'engineer')
        self.assertEqual(receipt['reviewer'], 'reviewer')
        self.assertEqual(receipt['checks'][0]['exit'], 0)
        self.assertNotEqual(receipt['worker']['nonce'], receipt['review']['nonce'])
        self.assertEqual(receipt['before_source_sha256'], receipt['after_source_sha256'])

    def test_dependency_handoffs_and_budget_resume(self):
        self.add_dependent()
        self.settings['max_tasks'] = 1
        result = self.execute()
        self.assertEqual(result['status'], 'BUDGET_EXHAUSTED', result)
        ledger = read(self.state / 'ledger.json')
        self.assertEqual(ledger['tasks']['platform/inspect']['state'], 'DONE')
        self.assertEqual(ledger['tasks']['platform/implement']['state'], 'PENDING')
        result = self.execute()
        self.assertEqual(result['status'], 'PASS', result)
        requests = [read(p) for p in (self.state / 'tasks/platform/implement').glob('*/request.json')]
        self.assertEqual(len(requests), 1)
        self.assertTrue(Path(requests[0]['handoffs']['platform/inspect']).is_file())

    def test_failed_prerequisite_prevents_dependent_dispatch(self):
        self.add_dependent()
        self.settings['executors']['engineer'] = self.argv('exit')
        self.assert_failed('exit 7')
        self.assertFalse((self.state / 'tasks/platform/implement').exists())

    def test_zero_exit_without_response_is_failure(self):
        self.settings['executors']['engineer'] = self.argv('silent')
        self.assert_failed()

    def test_stale_nonce_is_failure(self):
        self.settings['executors']['engineer'] = self.argv('stale')
        self.assert_failed('not bound')

    def test_missing_steps_and_acceptance_are_failures(self):
        for behavior in ('missing_steps', 'missing_acceptance'):
            self.settings['executors']['engineer'] = self.argv(behavior)
            result = team.execute_plan(self.root, self.base / behavior, self.report, self.settings)
            self.assertEqual(result['status'], 'FAILED', result)

    def test_artifact_traversal_and_symlink_are_failures(self):
        for behavior in ('traversal', 'symlink'):
            self.settings['executors']['engineer'] = self.argv(behavior)
            result = team.execute_plan(self.root, self.base / behavior, self.report, self.settings)
            self.assertEqual(result['status'], 'FAILED', result)

    def test_analysis_worker_cannot_mutate_source(self):
        self.settings['executors']['engineer'] = self.argv('mutate')
        self.assert_failed('Analysis worker modified source')

    def test_change_worker_must_stay_in_scope(self):
        self.catalog['templates'][0].update(mode='change', path_scopes=['src/*'])
        self.save_catalog()
        self.settings['executors']['engineer'] = self.argv('outside')
        self.assert_failed('outside its scope')

    def test_change_worker_cannot_weaken_protected_tests(self):
        self.catalog['templates'][0].update(mode='change', path_scopes=['tests/*'])
        self.save_catalog()
        self.settings['executors']['engineer'] = self.argv('protected')
        self.assert_failed('protected')

    def test_legitimate_source_change_receipt_pins_before_and_after(self):
        self.catalog['templates'][0].update(mode='change', path_scopes=['src/*'])
        self.save_catalog()
        self.settings['executors']['engineer'] = self.argv('mutate')
        result = self.execute()
        self.assertEqual(result['status'], 'PASS', result)
        record = read(self.state / 'ledger.json')['tasks']['platform/inspect']
        receipt = read(record['receipt'])
        self.assertNotEqual(receipt['before_source_sha256'], receipt['after_source_sha256'])
        self.assertEqual(receipt['changed_paths'], ['src/service.py'])
        self.assertFalse(receipt['production_ready'])

    def test_reviewer_cannot_mutate_source(self):
        self.settings['reviewers']['reviewer'] = self.argv('mutate')
        self.assert_failed('Read-only')

    def test_reviewer_cannot_mutate_artifact(self):
        self.settings['reviewers']['reviewer'] = self.argv('artifact_mutation')
        self.assert_failed('artifact changed')

    def test_rejection_blocks_completion(self):
        self.settings['reviewers']['reviewer'] = self.argv('reject')
        self.assert_failed('did not accept')

    def test_independent_checker_failure_blocks_review(self):
        self.settings['checks']['inspect'] = [[sys.executable, '-c', 'raise SystemExit(9)']]
        self.assert_failed('exit 9')
        self.assertEqual(list(self.state.glob('tasks/**/*review-response.json')), [])

    def test_checker_cannot_mutate_source(self):
        self.settings['checks']['inspect'] = [[sys.executable, '-c',
            "from pathlib import Path; Path('src/service.py').write_text('bad')"]]
        self.assert_failed('Read-only')

    def test_worker_cannot_commit(self):
        self.settings['executors']['engineer'] = self.argv('commit')
        self.assert_failed('Git HEAD')

    def test_timeout_bounds_worker(self):
        self.settings['task_timeout'] = 1
        self.settings['executors']['engineer'] = self.argv('sleep')
        self.assert_failed('exit 124')

    def test_resume_rejects_external_source_change(self):
        self.add_dependent()
        self.settings['max_tasks'] = 1
        self.execute()
        (self.root / 'src/service.py').write_text('outside edit')
        with self.assertRaisesRegex(ValueError, 'Cannot resume'):
            self.execute()

    def test_resume_rejects_catalog_or_configuration_change(self):
        self.execute()
        self.settings['max_tasks'] = 3
        with self.assertRaisesRegex(ValueError, 'Cannot resume'):
            self.execute()

    def test_resume_rejects_tampered_completed_artifact(self):
        self.execute()
        artifact = next(self.state.glob('tasks/**/evidence.json'))
        artifact.write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'evidence changed'):
            self.execute()

    def test_no_blind_retry_after_failure(self):
        self.settings['executors']['engineer'] = self.argv('exit')
        self.assert_failed()
        result = self.execute()
        self.assertEqual(result['status'], 'FAILED')
        self.assertEqual(read(self.state / 'ledger.json')['tasks']['platform/inspect']['attempts'], 1)

    def test_plan_override_cannot_remove_acceptance(self):
        plan = team.build_plan(self.root, self.report)
        plan['tasks'][0]['acceptance'] = []
        with self.assertRaisesRegex(ValueError, 'Plan does not match'):
            team.execute_plan(self.root, self.state, self.report, self.settings, plan)

    def test_state_cannot_be_inside_source(self):
        with self.assertRaisesRegex(ValueError, 'outside candidate'):
            team.execute_plan(self.root, self.root / 'state', self.report, self.settings)

    def test_completed_state_without_evidence_cannot_bypass_workers(self):
        self.execute()
        ledger = read(self.state / 'ledger.json')
        ledger['tasks']['platform/inspect'].pop('evidence')
        write(self.state / 'ledger.json', ledger)
        with self.assertRaisesRegex(ValueError, 'lacks bound receipt'):
            self.execute()

    def test_evidence_anchor_symlink_rejected(self):
        outside = self.base / 'outside'
        outside.mkdir()
        (outside / 'evidence.json').write_text('{}')
        link = self.base / 'artifacts'
        link.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'anchor'):
            team.regular_file(link / 'evidence.json', link)

    def test_missing_security_executor_blocks_feature_dispatch(self):
        security = copy.deepcopy(self.task)
        security.update(id='security', owner='reviewer', reviewer='engineer', gates=['security'])
        self.catalog['templates'].append(security)
        self.save_catalog()
        self.report['gates']['security']['status'] = 'FAIL'
        result = self.execute()
        self.assertEqual(result['status'], 'BLOCKED')
        self.assertEqual(result['counts']['DONE'], 0)
        self.assertFalse((self.state / 'tasks').exists())

    def test_domain_waits_for_explicit_platform_handoff(self):
        child = copy.deepcopy(self.task)
        child.update(id='journey', scope='domain', platform_requires=['inspect'], title='Inspect {domain}')
        self.catalog['templates'].append(child)
        self.save_catalog()
        plan = team.build_plan(self.root, self.report)
        self.assertEqual(plan['tasks'][1]['depends_on'], ['platform/inspect'])
        self.assertEqual(plan['tasks'][1]['title'], 'Inspect Studio')

    def test_release_waits_for_domains_and_cross_scope_cycles_fail(self):
        child = copy.deepcopy(self.task)
        child.update(id='journey', scope='domain', platform_requires=['inspect'])
        release = copy.deepcopy(self.task)
        release.update(id='release', domain_requires=['journey'])
        self.catalog['templates'] += [child, release]
        self.save_catalog()
        plan = team.build_plan(self.root, self.report)
        self.assertEqual(plan['tasks'][2]['depends_on'], ['studio/journey'])
        self.catalog['templates'][0]['domain_requires'] = ['journey']
        with self.assertRaisesRegex(ValueError, 'cross-scope'):
            team.validate_catalog(self.catalog)

    def test_admin_access_gap_is_security_blocker_despite_passing_dependency_audit(self):
        self.report['active_release'] = {'id': 'admin-private', 'ready': False,
                                        'criteria': {'private_access': {'status': 'FAIL'}}}
        plan = team.build_plan(self.root, self.report)
        self.assertIn('security', plan['blockers'])


if __name__ == '__main__':
    unittest.main()
