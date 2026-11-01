"""Static factory topology must preserve declarations and fail closed on ambiguity."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(os.environ.get('MAXBOOSTER_FACTORY_REPO_ROOT', Path(__file__).resolve().parents[2]))
HELPER = Path(os.environ.get('PYTHON_FACTORY_MOUNTS_CANDIDATE', ROOT / 'scripts/testing/python_factory_mounts.py'))
REGISTER = Path(os.environ.get('PLATFORM_REGISTER_CANDIDATE', ROOT / 'scripts/testing/platform-register.py'))
spec = importlib.util.spec_from_file_location('reviewed_factory_mounts', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
spec = importlib.util.spec_from_file_location('factory_register_candidate', REGISTER)
register = importlib.util.module_from_spec(spec)
spec.loader.exec_module(register)

ROUTES = '''\
from fastapi import APIRouter

def build():
    router = APIRouter(prefix="/api")

    @router.get("/thing")
    def handler():
        return {"ok": True}

    return router
'''
APP = '''\
from fastapi import FastAPI
from routes import build as factory
app = FastAPI()
app.include_router(factory(), prefix="/v2")
'''


def parse(files):
    return {file: ast.parse(textwrap.dedent(text)) for file, text in files.items()}


def contexts(app=APP, routes=ROUTES, extra=None):
    files = {'external/app.py': app, 'external/routes.py': routes, **(extra or {})}
    return helper.python_factory_mounts(parse(files))


def actual_rows(files):
    with tempfile.TemporaryDirectory(prefix='python-factory-source-') as directory:
        root = Path(directory)
        for file, text in files.items():
            target = root / file
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(textwrap.dedent(text))
        previous = register.ROOT
        try:
            register.ROOT = root
            return register.python_routes(sorted(files))
        finally:
            register.ROOT = previous


def consumer_items(rows):
    """Execute the actual consumer AST, not a duplicate test implementation."""
    tree = ast.parse(REGISTER.read_text())
    main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
    ingest = next(node for node in main.body if isinstance(node, ast.For)
                  and ast.unparse(node.iter) == 'python + native_routes(source)')
    enrich = next(node for node in main.body if isinstance(node, ast.For)
                  and ast.unparse(node.target) == 'item' and ast.unparse(node.iter) == 'routes')
    namespace = dict(register.__dict__)
    from collections import defaultdict
    namespace.update(python=rows, native_routes=lambda paths: [], source=[], routes=[], unknown=[],
                     candidates_by_source=defaultdict(list), literal_url_tests=defaultdict(set),
                     execution={}, route_by_location=defaultdict(list))
    exec(compile(ast.fix_missing_locations(ast.Module(body=[ingest, enrich], type_ignores=[])), str(REGISTER), 'exec'), namespace)
    return namespace['routes'], namespace['unknown']


class FactoryMounts(unittest.TestCase):
    def test_direct_import_alias_and_prefixes(self):
        found, diagnostics = contexts()
        self.assertEqual(diagnostics, [])
        self.assertEqual(len(found), 1)
        row = next(iter(found.values()))[0]
        self.assertEqual((row['routerPrefix'], row['includeRouterPrefix']), ('/api', '/v2'))
        self.assertEqual(row['processScope'], 'python-app:external/app.py::app')
        self.assertFalse(row['mountConditional'])
        self.assertEqual(row['runtimeAvailability'], 'UNVERIFIED')

    def test_constructor_alias_is_resolved_in_its_lexical_scope(self):
        found, _ = contexts(routes=ROUTES.replace('import APIRouter', 'import APIRouter as Router').replace('= APIRouter(', '= Router('))
        self.assertEqual(len(found), 1)

    def test_same_module_factory_and_relative_import(self):
        same = 'from fastapi import FastAPI\n' + ROUTES + '\napp = FastAPI()\napp.include_router(build())\n'
        found, _ = helper.python_factory_mounts(parse({'external/app.py': same}))
        self.assertEqual(len(found), 1)
        found, _ = contexts(app=APP.replace('from routes', 'from .routes'))
        self.assertEqual(len(found), 1)

    def test_assigned_router_and_optional_none_remain_conditional(self):
        app = APP.replace('app.include_router(factory(), prefix="/v2")', 'candidate = factory()\nif candidate is not None:\n    app.include_router(candidate, prefix="/v2")')
        routes = ROUTES.replace('    router =', '    if disabled:\n        return None\n    router =', 1)
        found, _ = contexts(app=app, routes=routes)
        row = next(iter(found.values()))[0]
        self.assertTrue(row['mountConditional'])
        self.assertIn('factory-may-return-none', {condition['kind'] for condition in row['mountConditions']})
        self.assertIn('if', {condition['kind'] for condition in row['mountConditions']})

    def test_optional_fastapi_none_fallback_requires_same_import_try(self):
        optional = ROUTES.replace('from fastapi import APIRouter', 'try:\n    from fastapi import APIRouter\nexcept ImportError:\n    APIRouter = None')
        found, _ = contexts(routes=optional)
        self.assertTrue(next(iter(found.values()))[0]['mountConditional'])
        unrelated = ROUTES.replace('from fastapi import APIRouter', 'from fastapi import APIRouter\ntry:\n    fail()\nexcept ImportError:\n    APIRouter = None')
        self.assertFalse(contexts(routes=unrelated)[0])

    def test_conditional_application_constructor_import_is_retained(self):
        app = APP.replace('from fastapi import FastAPI', 'try:\n    from fastapi import FastAPI\nexcept ImportError:\n    FastAPI = None')
        found, _ = contexts(app=app)
        self.assertTrue(next(iter(found.values()))[0]['mountConditional'])
        self.assertIn('try', {item['kind'] for item in next(iter(found.values()))[0]['mountConditions']})
        self.assertFalse(contexts(app=APP.replace('FastAPI()', 'FastAPI(**options)'))[0])

    def test_module_app_and_router_binding_shadowing_reject(self):
        variants = {
            'app-reassignment': (APP + '\napp = Fake()\n', ROUTES),
            'app-multitarget': (APP.replace('app = FastAPI()', 'app = other = FastAPI()'), ROUTES),
            'app-method-replacement': (APP + '\napp.include_router = replacement\n', ROUTES),
            'factory-reassignment': (APP + '\nfactory = replacement\n', ROUTES),
            'constructor-reassignment': (APP, ROUTES.replace('\ndef build', '\nAPIRouter = Fake\n\ndef build')),
            'constructor-parameter': (APP, ROUTES.replace('def build():', 'def build(APIRouter):')),
            'router-parameter': (APP, ROUTES.replace('def build():', 'def build(router):')),
            'router-reassignment': (APP, ROUTES.replace('    return router', '    router = Fake()\n    return router')),
            'router-delete': (APP, ROUTES.replace('    return router', '    del router\n    return router')),
            'router-named-expression': (APP, ROUTES.replace('    return router', '    (router := Fake())\n    return router')),
            'router-with-binding': (APP, ROUTES.replace('    return router', '    with context() as router:\n        pass\n    return router')),
            'router-match-binding': (APP, ROUTES.replace('    return router', '    match data:\n        case router:\n            pass\n    return router')),
            'router-attribute-replacement': (APP, ROUTES.replace('    return router', '    router.get = replacement\n    return router')),
            'router-setattr': (APP, ROUTES.replace('    return router', '    setattr(router, "get", replacement)\n    return router')),
            'router-alias': (APP, ROUTES.replace('    return router', '    alias = router\n    return router')),
            'router-nested-mutation': (APP, ROUTES.replace('    return router', '    router.routes.clear()\n    return router')),
            'router-non-decorator': (APP, ROUTES.replace('    return router', '    router.get("/not-a-decorator")\n    return router')),
            'router-exec': (APP, ROUTES.replace('    return router', '    exec(code)\n    return router')),
        }
        for label, (app, routes) in variants.items():
            with self.subTest(label=label): self.assertFalse(contexts(app=app, routes=routes)[0])

    def test_nested_scope_shadowing_does_not_replace_outer_bindings(self):
        routes = ROUTES.replace('    return router', '    def unrelated(APIRouter):\n        router = None\n        return router\n    return router')
        app = APP + '\nclass Container:\n    FastAPI = Fake\n\ndef later():\n    app = Fake()\n'
        found, _ = contexts(app=app, routes=routes)
        self.assertEqual(len(found), 1)

    def test_decorated_async_generator_early_or_implicit_return_factories_reject(self):
        variants = {
            'decorated': ROUTES.replace('def build():', '@replacement\ndef build():'),
            'async': ROUTES.replace('def build():', 'async def build():'),
            'generator': ROUTES.replace('    return router', '    yield router\n    return router'),
            'implicit-return': ROUTES.replace('    return router', '    if ready:\n        return router'),
            'early-router': ROUTES.replace('    @router.get', '    if ready:\n        return router\n    @router.get'),
            'other-return': ROUTES.replace('    return router', '    if ready:\n        return Fake()\n    return router'),
        }
        for label, routes in variants.items():
            with self.subTest(label=label): self.assertFalse(contexts(routes=routes)[0])

    def test_deferred_loop_comprehension_with_match_mounts_reject(self):
        include = 'app.include_router(factory(), prefix="/v2")'
        variants = [
            'def later():\n    ' + include,
            'class Later:\n    ' + include,
            'for item in rows:\n    ' + include,
            'while ready:\n    ' + include,
            'with context():\n    ' + include,
            '[' + include + ' for item in rows]',
            'match value:\n    case 1:\n        ' + include,
            'try:\n    ' + include + '\nexcept* ValueError:\n    pass',
        ]
        for replacement in variants:
            with self.subTest(replacement=replacement): self.assertFalse(contexts(app=APP.replace(include, replacement))[0])

    def test_ordinary_if_and_try_mounts_record_conditions(self):
        include = 'app.include_router(factory(), prefix="/v2")'
        for replacement in ['if enabled:\n    ' + include, 'try:\n    '+include+'\nexcept ValueError:\n    pass']:
            found, _ = contexts(app=APP.replace(include, replacement))
            self.assertTrue(next(iter(found.values()))[0]['mountConditional'])

    def test_invalid_prefix_and_dynamic_spreads_reject(self):
        for suffix in ['prefix=prefix', 'prefix="bad"', 'prefix="/bad/"', '**options', 'prefix="/ok", **options']:
            with self.subTest(suffix=suffix): self.assertFalse(contexts(app=APP.replace('prefix="/v2"', suffix))[0])
        for value in ['"/bad/"', 'prefix', '42', '"' + '/' + 'a'*2048 + '"']:
            with self.subTest(prefix=value): self.assertFalse(contexts(routes=ROUTES.replace('"/api"', value))[0])
        self.assertFalse(contexts(app=APP.replace('factory()', 'factory(*arguments)'))[0])

    def test_constructor_and_factory_call_before_import_reject(self):
        self.assertFalse(contexts(app=APP.replace('from fastapi import FastAPI\n', '') + '\nfrom fastapi import FastAPI\n')[0])
        app = APP.replace('from routes import build as factory\n', '').replace('app.include_router(factory(), prefix="/v2")', 'candidate = factory()\nfrom routes import build as factory\napp.include_router(candidate)')
        self.assertFalse(contexts(app=app)[0])

    def test_ambiguous_packages_and_reexport_cycles_reject(self):
        self.assertFalse(contexts(extra={'external/routes/__init__.py': ROUTES})[0])
        cycle = {'external/routes.py': 'from cycle import build', 'external/cycle.py': 'from routes import build'}
        self.assertFalse(helper.python_factory_mounts(parse({'external/app.py': APP, **cycle}))[0])
        # Importlib/sys.path probing must not guess an ancestor same-name file.
        self.assertFalse(helper.python_factory_mounts(parse({'external/pkg/app.py': APP, 'external/routes.py': ROUTES}))[0])

    def test_router_lifecycle_decorator_preserves_direct_route_topology(self):
        routes = ROUTES.replace('    @router.get', '    @router.on_event("startup")\n    async def startup():\n        await engine.start()\n\n    @router.get')
        found, _ = contexts(routes=routes)
        self.assertEqual(len(found), 2)
        rows, _ = actual_rows({'external/app.py': APP, 'external/routes.py': routes})
        # on_event is a lifecycle declaration, not an HTTP route.
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['path'], '/v2/api/thing')

    def test_source_is_never_executed_and_unicode_prefix_preserved(self):
        routes = 'raise RuntimeError("must not import source")\n' + ROUTES.replace('"/api"', '"/música/音楽"')
        found, _ = contexts(routes=routes)
        self.assertEqual(next(iter(found.values()))[0]['routerPrefix'], '/música/音楽')

    def test_finite_file_budget_fails_closed(self):
        found, diagnostics = helper.python_factory_mounts({str(index): ast.Module(body=[], type_ignores=[]) for index in range(4097)})
        self.assertFalse(found)
        self.assertEqual(diagnostics[0]['kind'], 'python-factory-analysis-budget')

    def test_importlib_consumer_loads_paired_helpers_without_sys_path(self):
        with tempfile.TemporaryDirectory(prefix='factory-importlib-consumer-') as directory:
            root = Path(directory)
            for file, text in {'external/app.py': APP, 'external/routes.py': ROUTES}.items():
                target = root / file
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
            code = """
import importlib.util, json, sys
from pathlib import Path
consumer = Path(sys.argv[1]).resolve()
assert str(consumer.parent) not in sys.path
assert not any(value.endswith('/scripts/testing') for value in sys.path)
spec = importlib.util.spec_from_file_location('isolated_factory_consumer', consumer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.ROOT = Path(sys.argv[2])
rows, unknown = module.python_routes(['external/app.py', 'external/routes.py'])
assert len(rows) == 1 and unknown == []
assert rows[0]['path'] == '/v2/api/thing'
assert rows[0]['runtimeAvailability'] == 'UNVERIFIED'
assert hasattr(module, '_JUNIT') and hasattr(module, '_FACTORY')
print(json.dumps({'rows': len(rows), 'path': rows[0]['path'], 'pairedHelpers': True}))
"""
            result = subprocess.run([sys.executable, '-I', '-c', code, str(REGISTER), str(root)],
                                    cwd=root, env={'PATH': os.defpath, 'LANG': 'C', 'TZ': 'UTC'},
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout), {'rows': 1, 'path': '/v2/api/thing', 'pairedHelpers': True})

    def test_actual_consumer_retains_declaration_check_and_unknown_identities(self):
        rows, unknown = actual_rows({'external/app.py': APP, 'external/routes.py': ROUTES})
        self.assertEqual(unknown, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['path'], '/v2/api/thing')
        self.assertEqual(rows[0]['declaredPath'], '/thing')
        expected = register.identifier('api', rows[0]['file'], rows[0]['line'], rows[0]['method'], '/thing')
        items, warnings = consumer_items(rows)
        self.assertEqual(items[0]['id'], expected)
        self.assertEqual({check['id'] for check in items[0]['requiredChecks']}, {expected + '/' + name for name in ['response-contract', 'access-policy', 'input-boundaries', 'tenant-boundary', 'dependency-failure']})
        self.assertTrue(items[0]['mountResolved'])
        self.assertEqual(items[0]['runtimeAvailability'], 'UNVERIFIED')
        self.assertEqual(warnings, [{'kind': 'unverified-route-mount', 'subjectId': expected, 'file': rows[0]['file'], 'line': rows[0]['line'], 'declaredPath': '/thing'}])

    def test_multiple_mounts_retain_original_declaration_and_explicit_unknown(self):
        app = APP + '\napp.include_router(factory(), prefix="/other")\n'
        rows, unknown = actual_rows({'external/app.py': app, 'external/routes.py': ROUTES})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['path'], '/thing')
        self.assertFalse(rows[0]['mountResolved'])
        self.assertEqual(unknown[0]['kind'], 'python-factory-multiple-mounts')
        self.assertEqual(len(unknown[0]['contexts']), 2)
        self.assertEqual({context['includeRouterPrefix'] for context in unknown[0]['contexts']}, {'/v2', '/other'})
        items, _ = consumer_items(rows)
        self.assertEqual(len({item['id'] for item in items}), len(items))

    def test_nonliteral_decorator_path_remains_unresolved(self):
        rows, _ = actual_rows({'external/app.py': APP, 'external/routes.py': ROUTES.replace('"/thing"', 'path')})
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['path'])
        self.assertFalse(rows[0]['pathResolved'])
        self.assertFalse(rows[0]['mountResolved'])


if __name__ == '__main__':
    unittest.main()
