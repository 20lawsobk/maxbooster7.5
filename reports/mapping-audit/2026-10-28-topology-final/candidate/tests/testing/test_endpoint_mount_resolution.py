"""The actual registry consumer must retain source topology uncertainty."""
import ast
import importlib.util
import os
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('PLATFORM_REGISTER_CANDIDATE', ROOT / 'scripts/testing/platform-register.py'))
TREE = ast.parse(SOURCE.read_text())
SPEC = importlib.util.spec_from_file_location('endpoint_mount_candidate', SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def actual_consumer_predicate(field='mountResolved', scopes=None):
    for loop in ast.walk(TREE):
        if not isinstance(loop, ast.For) or ast.unparse(loop.target) != 'raw':
            continue
        if ast.unparse(loop.iter) != "audit.get('backendRoutes', [])":
            continue
        for statement in loop.body:
            if not isinstance(statement, ast.Assign) or not isinstance(statement.value, ast.Dict):
                continue
            for key, value in zip(statement.value.keys, statement.value.values):
                if isinstance(key, ast.Constant) and key.value == field:
                    prelude = ast.parse("file=raw['file'];line=raw['line'];path=raw.get('fullPath')or raw.get('rawPath')").body if field == 'id' else []
                    function = ast.FunctionDef(name='actual', args=ast.arguments(posonlyargs=[], args=[ast.arg(arg='raw')], kwonlyargs=[], kw_defaults=[], defaults=[]), body=prelude+[ast.Return(value=value)], decorator_list=[])
                    compiled = compile(ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[])), str(SOURCE), 'exec')
                    namespace = {'bool': bool, 'identifier': MODULE.identifier, 'route_scopes': scopes or {}}
                    if hasattr(MODULE, 'audit_mount_resolved'):
                        namespace['audit_mount_resolved'] = MODULE.audit_mount_resolved
                    if hasattr(MODULE, 'audit_route_identity'):
                        namespace['audit_route_identity'] = MODULE.audit_route_identity
                    exec(compiled, namespace)
                    return namespace['actual']
    raise AssertionError('Actual backend audit ingestion predicate was not found')


class MountResolutionConsumer(unittest.TestCase):
    def test_high_confidence_mounted_path_is_retained(self):
        self.assertIs(actual_consumer_predicate()({'fullPath': '/api/export/jobs/:id', 'confidence': 'high'}), True)

    def test_medium_confidence_mounted_path_is_retained(self):
        self.assertIs(actual_consumer_predicate()({'fullPath': '/api/alias', 'confidence': 'medium'}), True)

    def test_unmounted_fallback_path_never_becomes_a_resolved_mount(self):
        self.assertIs(actual_consumer_predicate()({'fullPath': '/leaf', 'rawPath': '/leaf', 'confidence': 'unmounted-or-unresolved'}), False)

    def test_unknown_confidence_cannot_claim_a_verified_mount(self):
        self.assertIs(actual_consumer_predicate()({'fullPath': '/computed', 'confidence': 'unknown'}), False)

    def test_missing_full_path_remains_unresolved(self):
        self.assertIs(actual_consumer_predicate()({'rawPath': '/leaf', 'confidence': 'high'}), False)

    def test_existing_unique_source_route_identity_is_unchanged(self):
        raw = {'file': 'server/routes/child.ts', 'line': 5, 'method': 'GET', 'fullPath': '/same/leaf', 'processScope': 'main-app'}
        scopes = {(raw['file'], raw['line'], raw['method'], raw['fullPath']): {'main-app'}}
        self.assertEqual(actual_consumer_predicate('id', scopes)(raw), MODULE.identifier('api', raw['file'], raw['line'], raw['method'], raw['fullPath']))

    def test_same_source_url_in_distinct_processes_has_distinct_actual_consumer_ids(self):
        main = {'file': 'server/routes/child.ts', 'line': 5, 'method': 'GET', 'fullPath': '/same/leaf', 'processScope': 'main-app'}
        sidecar = {**main, 'processScope': 'standalone:server/sidecar.ts'}
        scopes = {(main['file'], main['line'], main['method'], main['fullPath']): {'main-app', sidecar['processScope']}}
        consume = actual_consumer_predicate('id', scopes)
        self.assertNotEqual(consume(main), consume(sidecar))


if __name__ == '__main__':
    unittest.main()
