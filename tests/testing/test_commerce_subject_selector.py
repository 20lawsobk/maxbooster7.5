"""Exercise the real legacy-commerce selector boundary without SQL or providers.

Run with Python unittest. These framework tests use an owned temporary project,
fixture import sentinel and intercepted child-process calls. They verify selection
and credential isolation, not the 14 production money-loop assertions. To review
an unlanded candidate, set MAXBOOSTER_SELECTOR_SOURCE_ROOT to its repository-shaped
root and MAXBOOSTER_SELECTOR_DEPENDENCY_ROOT to the installed checkout.
"""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE_ROOT = Path(os.environ.get('MAXBOOSTER_SELECTOR_SOURCE_ROOT', Path(__file__).resolve().parents[2]))
DEPENDENCY_ROOT = Path(os.environ.get('MAXBOOSTER_SELECTOR_DEPENDENCY_ROOT', SOURCE_ROOT))
SUBJECT = 'tests/unit/beat-sale-money-loop.test.ts'
CONFIG = 'vitest.beat-loop.config.ts'
NODE = shutil.which('node')

AUDIT_PRELOAD = '''
import childProcess from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[name] = () => {
    appendFileSync(process.env.FRAMEWORK_TRACE, JSON.stringify({operation:'unexpected-child', name}) + '\\n');
    throw new Error('Framework boundary: unexpected child process');
  };
}
syncBuiltinESMExports();
'''

SPAWN_PRELOAD = '''
import childProcess from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
const trace = entry => appendFileSync(process.env.FRAMEWORK_TRACE, JSON.stringify(entry) + '\\n');
const owned = new Map();
let nextPid = 40000;
childProcess.execFileSync = (binary, args) => {
  trace({operation:'schema-tool', args});
  const config = JSON.parse(readFileSync(args.find(value => value.startsWith('--config=')).slice(9), 'utf8'));
  mkdirSync(config.out, {recursive:true});
  writeFileSync(path.join(config.out, '0000_framework.sql'), '-- framework-only SQL transport sentinel');
};
childProcess.spawn = (binary, args, options) => {
  const child = new EventEmitter();
  child.pid = ++nextPid; child.exitCode = null; child.signalCode = null;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  owned.set(child.pid, child);
  trace({operation:'spawn', binary, args, environmentKeys:Object.keys(options.env).sort(),
    isolatedDatabase:options.env.READINESS_ISOLATED_PG === '1',
    egressGuard:options.env.READINESS_EGRESS_GUARD === '1',
    guardPreload:options.env.NODE_OPTIONS?.includes('loopback-guard.mjs') ?? false});
  if (binary === 'redis-server') {
    setImmediate(() => child.stdout.emit('data', Buffer.from('Ready to accept connections')));
  } else {
    setImmediate(() => { child.exitCode = 0; child.emit('close', 0, null); });
  }
  return child;
};
process.kill = (pid, signal) => {
  const child = owned.get(-pid);
  if (!child) throw new Error('Attempt to signal an unowned framework process');
  trace({operation:'signal', signal});
  setImmediate(() => { child.signalCode = signal; child.emit('exit', null, signal); });
  return true;
};
syncBuiltinESMExports();
'''


class CommerceSubjectSelectorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='commerce-selector-framework-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.adapter = self.root / 'scripts/testing/commerce-legacy-fixture.mjs'
        self.adapter.parent.mkdir(parents=True)
        shutil.copyfile(SOURCE_ROOT / 'scripts/testing/commerce-legacy-fixture.mjs', self.adapter)
        (self.root / SUBJECT).parent.mkdir(parents=True)
        (self.root / SUBJECT).write_text('// Owned framework subject sentinel, never executed as a product test.\n')
        (self.root / CONFIG).write_text((DEPENDENCY_ROOT / CONFIG).read_text())
        (self.root / 'node_modules').symlink_to(DEPENDENCY_ROOT / 'node_modules', target_is_directory=True)
        helper = self.root / 'tests/payment-processing/helpers-database-postgres.mjs'
        helper.parent.mkdir(parents=True)
        helper.write_text('''
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FRAMEWORK_TRACE, JSON.stringify({operation:'fixture-import'}) + '\\n');
export async function startDisposablePostgres() { throw new Error('Unreachable framework fixture'); }
throw new Error('Framework fixture import sentinel; no database was started');
''')
        self.helper = helper
        self.trace = self.root / 'trace.jsonl'
        self.tmp = self.root / 'owned-tmp'
        self.tmp.mkdir()
        self.preload = self.root / 'audit-preload.mjs'
        self.preload.write_text(AUDIT_PRELOAD)
        self.report = self.root / 'report.xml'

    def invoke(self, arguments, preload=None):
        env = {key: value for key, value in os.environ.items()
               if key in ('PATH', 'LD_LIBRARY_PATH', 'SystemRoot')}
        env.update({'HOME': str(self.root), 'TMPDIR': str(self.tmp), 'LANG': 'C', 'TZ': 'UTC',
                    'FRAMEWORK_TRACE': str(self.trace),
                    'NODE_OPTIONS': '--import=' + str(preload or self.preload),
                    'DATABASE_URL': 'framework-forbidden-inherited-database',
                    'STRIPE_SECRET_KEY': 'framework-forbidden-inherited-provider',
                    'SESSION_SECRET': 'framework-forbidden-inherited-session'})
        return subprocess.run([NODE, str(self.adapter), *map(str, arguments)], cwd=self.root,
                              env=env, capture_output=True, text=True, timeout=30)

    def assert_rejected_before_resources(self, arguments, message):
        result = self.invoke(arguments)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(message, result.stderr)
        self.assertFalse(self.trace.exists(), 'Rejected selection imported a fixture or spawned a child')
        self.assertEqual(list(self.tmp.iterdir()), [], 'Rejected selection allocated fixture temporary files')
        self.assertFalse(self.report.exists())
        self.assertNotIn('Legacy subject selection:', result.stdout)

    def selected(self):
        return [self.report, '--subject-file', SUBJECT]

    def test_missing_subject_selector_rejected(self):
        self.assert_rejected_before_resources([self.report], 'Pass exactly --subject-file')

    def test_relative_report_rejected(self):
        self.assert_rejected_before_resources(['report.xml', '--subject-file', SUBJECT], 'absolute JUnit report path')

    def test_absolute_subject_rejected(self):
        self.assert_rejected_before_resources([self.report, '--subject-file', self.root / SUBJECT], 'registered repository-relative')

    def test_traversal_subject_rejected(self):
        self.assert_rejected_before_resources([self.report, '--subject-file', '../' + SUBJECT], 'registered repository-relative')

    def test_unregistered_subject_rejected(self):
        self.assert_rejected_before_resources([self.report, '--subject-file', 'tests/unit/other.test.ts'], 'registered repository-relative')

    def test_unknown_duplicate_or_ignored_arguments_rejected(self):
        for extra in (['--ignored'], ['--subject-file', SUBJECT], ['--config', CONFIG]):
            with self.subTest(extra=extra):
                self.assert_rejected_before_resources([*self.selected(), *extra], 'Pass exactly --subject-file')

    def test_missing_registered_file_rejected(self):
        (self.root / SUBJECT).unlink()
        self.assert_rejected_before_resources(self.selected(), 'ENOENT')

    def test_symlink_redirection_outside_repository_rejected(self):
        with tempfile.TemporaryDirectory(prefix='commerce-selector-outside-') as outside:
            external = Path(outside) / 'subject.ts'
            external.write_text('// outside owned fixture')
            (self.root / SUBJECT).unlink()
            (self.root / SUBJECT).symlink_to(external)
            self.assert_rejected_before_resources(self.selected(), 'without symlink redirection')

    def test_config_include_mismatch_rejected(self):
        config = self.root / CONFIG
        config.write_text(config.read_text().replace(SUBJECT, 'tests/unit/other.test.ts'))
        self.assert_rejected_before_resources(self.selected(), 'include does not execute the selected subject')

    def test_selection_changing_or_dynamic_config_rejected(self):
        original = (self.root / CONFIG).read_text()
        alternatives = {
            'exclude': original.replace('test: {', 'test: { exclude: ["**/*"],'),
            'root': original.replace('defineConfig({', 'defineConfig({ root: "other",'),
            'spread': original.replace('test: {', 'test: { ...other,'),
            'dynamic-include': original.replace('include: ["' + SUBJECT + '"]', 'include: subjects'),
            'duplicate-include': original.replace('test: {', 'test: { include: ["other"],'),
            'wrong-defineConfig-import': original.replace('from "vitest/config"', 'from "other"'),
            'extra-config-code': 'const ignored = {};\n' + original,
        }
        for kind, source in alternatives.items():
            with self.subTest(kind=kind):
                (self.root / CONFIG).write_text(source)
                self.assert_rejected_before_resources(self.selected(), 'Vitest')

    def test_validated_subject_drives_actual_spawn_and_owned_cleanup(self):
        # Deliberately intercepted framework transports; these are not SQL tests.
        self.helper.write_text('''
import { appendFileSync } from 'node:fs';
const trace = entry => appendFileSync(process.env.FRAMEWORK_TRACE, JSON.stringify(entry) + '\\n');
trace({operation:'fixture-import'});
export async function startDisposablePostgres() {
  trace({operation:'fixture-start'});
  return {pool:{options:{user:'framework',host:'/owned/framework/socket'},
    async query() { trace({operation:'sql-transport'}); return {rows:[]}; }},
    async stop() { trace({operation:'fixture-stop'}); }};
}
''')
        (self.root / 'shared').mkdir()
        (self.root / 'shared/schema.ts').write_text('// framework schema transport')
        (self.root / 'migrations').mkdir()
        (self.root / 'scripts/readiness-egress-guard.mjs').write_text('import { syncBuiltinESMExports } from "node:module";\n')
        preload = self.root / 'spawn-preload.mjs'
        preload.write_text(SPAWN_PRELOAD)
        result = self.invoke(self.selected(), preload=preload)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = [json.loads(line) for line in self.trace.read_text().splitlines()]
        spawns = [row for row in rows if row['operation'] == 'spawn']
        self.assertEqual(len(spawns), 2)
        child = spawns[1]
        self.assertEqual(child['args'][:5], ['node_modules/vitest/vitest.mjs', 'run', SUBJECT, '--config', CONFIG])
        self.assertTrue(child['isolatedDatabase'] and child['egressGuard'] and child['guardPreload'])
        for spawn in spawns:
            self.assertTrue({'DATABASE_URL', 'STRIPE_SECRET_KEY', 'SESSION_SECRET', 'FRAMEWORK_TRACE'}.isdisjoint(spawn['environmentKeys']))
        selection = json.loads(next(line.removeprefix('Legacy subject selection: ') for line in result.stdout.splitlines()
                                    if line.startswith('Legacy subject selection: ')))
        self.assertEqual(selection['subject'], SUBJECT)
        for file, key in ((SUBJECT, 'subjectSha256'), (CONFIG, 'configSha256'),
                          ('scripts/testing/commerce-legacy-fixture.mjs', 'adapterSha256')):
            self.assertEqual(selection[key], hashlib.sha256((self.root / file).read_bytes()).hexdigest())
        self.assertEqual(selection['command'][1:], child['args'])
        self.assertIn({'operation': 'fixture-stop'}, rows)
        self.assertIn('Fixture cleanup complete:', result.stdout)
        self.assertEqual(list(self.tmp.iterdir()), [])
        self.assertFalse(self.report.exists(), 'Framework interception must not fabricate a product JUnit receipt')

    def test_runner_forwards_recorded_subject_and_strips_application_credentials(self):
        module = runpy.run_path(str(SOURCE_ROOT / 'scripts/testing/run-commerce.py'))
        module['main'].__globals__['ROOT'] = self.root
        calls = []

        class StoppedProcess:
            returncode = 1
            def communicate(self, timeout):
                return 'Framework stopped before any real fixture execution', None

        def popen(command, **kwargs):
            calls.append((command, kwargs))
            return StoppedProcess()

        def check_output(command, **kwargs):
            if command[1:2] == ['-p']:
                return '22\n'
            if command[1:] == ['--version']:
                return 'v22.0.0\n'
            if command == ['git', 'rev-parse', 'HEAD']:
                return 'framework-only-revision\n'
            raise AssertionError('Unexpected process command')

        output = self.root / 'runner-output'
        with patch.object(sys, 'argv', ['run-commerce.py', '--output', str(output), '--only', 'legacy-beat']), \
             patch.object(module['shutil'], 'which', return_value=NODE), \
             patch.object(module['subprocess'], 'check_output', side_effect=check_output), \
             patch.object(module['subprocess'], 'Popen', side_effect=popen), \
             patch.dict(os.environ, {'DATABASE_URL': 'framework-forbidden', 'STRIPE_SECRET_KEY': 'framework-forbidden',
                                     'NODE_OPTIONS': '--framework-forbidden'}, clear=False), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(module['main'](), 1)
        self.assertEqual(len(calls), 1)
        command, options = calls[0]
        record = json.loads((output / 'results.json').read_text())['commands'][0]
        self.assertEqual(record['path'], SUBJECT)
        self.assertEqual(command[-2:], ['--subject-file', record['path']])
        self.assertEqual(record['command'], command[1:])
        self.assertEqual(record['status'], 'failed')
        self.assertTrue({'DATABASE_URL', 'STRIPE_SECRET_KEY', 'NODE_OPTIONS'}.isdisjoint(options['env']))
        self.assertTrue(options['start_new_session'])


if __name__ == '__main__':
    unittest.main()
