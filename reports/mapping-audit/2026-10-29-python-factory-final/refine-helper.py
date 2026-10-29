from pathlib import Path
p=Path(__file__).with_name('python_factory_mounts.py')
s=p.read_text()
s='''"""Bounded source topology for direct FastAPI router factories; never imports app code."""
import ast
from collections import defaultdict
import json
from pathlib import Path


'''+s
s=s.replace('    parents, bindings, contexts, diagnostics = {}, {}, defaultdict(list), []','''    parents, bindings, contexts, diagnostics = {}, {}, defaultdict(list), []
    # Fail closed for unexpectedly large/generated sources. No recursion across
    # imported factories is needed by this direct-mount contract.
    if len(trees) > 4096:
        return contexts, [{"kind": "python-factory-analysis-budget", "budget": "files", "limit": 4096}]
    nodes = 0
    for tree in trees.values():
        for _ in ast.walk(tree):
            nodes += 1
            if nodes > 2000000:
                return contexts, [{"kind": "python-factory-analysis-budget", "budget": "ast-nodes", "limit": 2000000}]''')
s=s.replace('''            elif isinstance(parent, ast.ExceptHandler):''','''            elif isinstance(parent, (ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Match, ast.comprehension)):
                result.append({"file": file, "line": getattr(parent, "lineno", None), "kind": "unsupported-control"})
            elif isinstance(parent, ast.ExceptHandler):''')
s=s.replace('''            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                return''','''            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                # Bodies execute in their own lexical scope. Defaults,
                # decorators and bases execute in the enclosing scope.
                expressions = list(getattr(node, "decorator_list", [])) + list(getattr(node, "bases", []))
                if hasattr(node, "args"):
                    expressions += [*node.args.defaults, *(value for value in node.args.kw_defaults if value is not None)]
                for expression in expressions: yield from visit(expression)
                return''')
a=s.index('            elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):')
b=s.index('        bindings[key] = found',a)
s=s[:a]+'''            elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
                parent = parents.get((file, node))
                if isinstance(parent, (ast.Assign, ast.AnnAssign)):
                    found[node.id].append(("assignment", parent, parent.value))
                else:
                    found[node.id].append(("non-simple-binding", node, None))
            elif isinstance(node, ast.ExceptHandler) and node.name:
                found[node.name].append(("exception", node, None))
            elif isinstance(node, (ast.MatchAs, ast.MatchStar)) and node.name:
                found[node.name].append(("pattern", node, None))
            elif isinstance(node, ast.MatchMapping) and node.rest:
                found[node.rest].append(("pattern", node, None))
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                for name in node.names: found[name].append(("dynamic-scope", node, None))
''' +s[b:]
s=s.replace('''        for kind, node, value in options:
            if (kind, node, value) == imports[0]: continue''','''        for kind, node, value in options:
            if (kind, node, value) == imports[0]: continue''')
s=s.replace('''                    and any(item["kind"] == "except-handler" and item.get("expression") in {"ImportError", "ModuleNotFoundError"}
                            for item in controls(file, node, trees[file]))): return None''','''                    and optional_import_fallback(file, imports[0][1], node)): return None''')
needle='    def prefix(call):\n'
insert='''    def optional_import_fallback(file, imported, fallback):
        # A None fallback is admissible only in an ImportError handler of the
        # SAME try statement as the sole FastAPI import, not an unrelated try.
        cursor = imported
        while (parent := parents.get((file, cursor))) is not None:
            if isinstance(parent, ast.Try) and cursor in parent.body:
                expected = parent
                break
            cursor = parent
        else: return False
        cursor = fallback
        while (parent := parents.get((file, cursor))) is not None:
            if isinstance(parent, ast.ExceptHandler):
                exception = parent.type
                return (parents.get((file, parent)) is expected and isinstance(exception, ast.Name)
                        and exception.id in {"ImportError", "ModuleNotFoundError"})
            cursor = parent
        return False

    def unsupported_conditions(values):
        return any(value["kind"] == "unsupported-control" for value in values)

    def mutated_receiver(scope, owner):
        # Replacing methods, using setattr/exec, or passing a live router to an
        # unknown registration-time call invalidates this narrow proof.
        for node in local_nodes(scope):
            if isinstance(node, (ast.Attribute, ast.Subscript)) and isinstance(node.ctx, (ast.Store, ast.Del)):
                base = node.value
                if isinstance(base, ast.Name) and base.id == owner: return True
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in {"exec", "eval"}: return True
                values = [*node.args, *(keyword.value for keyword in node.keywords)]
                if any(isinstance(value, ast.Name) and value.id == owner for value in values):
                    # Returning the binding is safe; passing it to arbitrary
                    # code is outside a direct APIRouter factory contract.
                    return True
        return False

'''
s=s.replace(needle,insert+needle)
s=s.replace('''        if not module or any(part in {"", ".", ".."} for part in module.split(".")): return None''','''        if not module or any(not part.isidentifier() for part in module.split(".")): return None''')
s=s.replace('''            candidates = [origin, *origin.parents]''','''            # Absolute imports are admitted only under this entrypoint's
            # directory. Guessing arbitrary ancestor sys.path entries can bind
            # an unrelated same-named package.
            candidates = [origin]''')
s=s.replace('''            if parents.get((file, factory)) is not tree: continue''','''            if parents.get((file, factory)) is not tree or factory.decorator_list: continue
            if any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in local_nodes(factory)): continue''')
s=s.replace('''                if len(stores(file, factory).get(owner, [])) != 1: continue''','''                if len(stores(file, factory).get(owner, [])) != 1 or mutated_receiver(factory, owner): continue''')
s=s.replace('''                if not any(isinstance(node.value, ast.Name) and node.value.id == owner for node in returns): continue''','''                # One unconditional final router return prevents implicit None
                # and early returns before decorator registration.
                final = factory.body[-1]
                if not isinstance(final, ast.Return) or not isinstance(final.value, ast.Name) or final.value.id != owner: continue
                if any(isinstance(node.value, ast.Name) for node in returns if node is not final): continue''')
s=s.replace('''                conditions = [*controls(file, factory, tree), *constructor_conditions]''','''                conditions = [*controls(file, factory, tree), *constructor_conditions]
                if unsupported_conditions(conditions): continue''')
s=s.replace('''        if not isinstance(expression, ast.Call) or not isinstance(expression.func, ast.Name): return None''','''        if not isinstance(expression, ast.Call) or not isinstance(expression.func, ast.Name): return None
        if any(isinstance(arg, ast.Starred) for arg in expression.args) or any(keyword.arg is None for keyword in expression.keywords): return None''')
s=s.replace('''        if len(values) != 1: return None
        kind, binding, exported = values[0]''','''        if len(values) != 1: return None
        kind, binding, exported = values[0]
        if binding.lineno >= include_line: return None''')
s=s.replace('''            if not node.value.args and constructor(file, tree, node.value.func, "FastAPI") is not None: apps[name] = node''','''            if (not node.value.args and constructor(file, tree, node.value.func, "FastAPI") is not None
                    and not mutated_receiver(tree, name)):
                apps[name] = node''')
# mutated_receiver on apps would reject app.include_router(router_name) based live arg? owner=app, notrouter good.
s=s.replace('''            conditions = [*import_conditions, *descriptor["conditions"], *controls(file, node, tree)]''','''            conditions = [*import_conditions, *descriptor["conditions"], *controls(file, node, tree)]
            if unsupported_conditions(conditions) or node.lineno <= apps[node.func.value.id].lineno: continue''')
p.write_text(s)
