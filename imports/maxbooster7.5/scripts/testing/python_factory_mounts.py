"""Bounded source topology for direct FastAPI router factories; never imports app code."""
import ast
from collections import defaultdict
import json
from pathlib import Path


def python_factory_mounts(trees):
    """Resolve finite direct FastAPI factory mounts without importing source.

    Only unambiguous module applications, top-level synchronous factories and
    direct returned APIRouter bindings qualify. Unsupported data/control flow
    retains the original declared-only route; source topology is not runtime
    availability or behavioral acceptance.
    """
    parents, bindings, contexts, diagnostics = {}, {}, defaultdict(list), []
    # Fail closed for unexpectedly large/generated sources. No recursion across
    # imported factories is needed by this direct-mount contract.
    if len(trees) > 4096:
        return contexts, [{"kind": "python-factory-analysis-budget", "budget": "files", "limit": 4096}]
    nodes = 0
    for tree in trees.values():
        for _ in ast.walk(tree):
            nodes += 1
            if nodes > 2000000:
                return contexts, [{"kind": "python-factory-analysis-budget", "budget": "ast-nodes", "limit": 2000000}]
    for file, tree in trees.items():
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node): parents[(file, child)] = node

    def controls(file, node, stop=None):
        result = []
        child = node
        while (parent := parents.get((file, child))) is not None and parent is not stop:
            if isinstance(parent, ast.If):
                result.append({"file": file, "line": parent.lineno, "kind": "if" if child in parent.body else "else",
                               "expression": ast.unparse(parent.test)})
            elif isinstance(parent, ast.Try):
                branch = "try" if child in parent.body else "finally" if child in parent.finalbody else "else" if child in parent.orelse else "except"
                result.append({"file": file, "line": parent.lineno, "kind": branch})
            elif isinstance(parent, (ast.For, ast.AsyncFor, ast.While, ast.With, ast.AsyncWith, ast.Match, ast.comprehension, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.TryStar)):
                result.append({"file": file, "line": getattr(parent, "lineno", None), "kind": "unsupported-control"})
            elif isinstance(parent, ast.ExceptHandler):
                result.append({"file": file, "line": parent.lineno, "kind": "except-handler",
                               "expression": ast.unparse(parent.type) if parent.type else "BaseException"})
            child = parent
        return result

    def local_nodes(scope):
        def visit(node):
            yield node
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                # Bodies execute in their own lexical scope. Defaults,
                # decorators and bases execute in the enclosing scope.
                expressions = list(getattr(node, "decorator_list", [])) + list(getattr(node, "bases", []))
                if hasattr(node, "args"):
                    expressions += [*node.args.defaults, *(value for value in node.args.kw_defaults if value is not None)]
                for expression in expressions: yield from visit(expression)
                return
            for child in ast.iter_child_nodes(node): yield from visit(child)
        for statement in scope.body: yield from visit(statement)

    def stores(file, scope):
        key = file, scope
        if key in bindings: return bindings[key]
        found = defaultdict(list)
        if isinstance(scope, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = scope.args
            for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs, *([args.vararg] if args.vararg else []), *([args.kwarg] if args.kwarg else [])]:
                found[arg.arg].append(("parameter", arg, None))
        for node in local_nodes(scope):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                found[node.name].append(("definition", node, None))
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names: found[alias.asname or alias.name].append(("from", node, alias.name))
            elif isinstance(node, ast.Import):
                for alias in node.names: found[alias.asname or alias.name.split(".")[0]].append(("import", node, alias.name))
            elif isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del)):
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
        bindings[key] = found
        return found

    def constructor(file, scope, expression, wanted):
        if not isinstance(expression, ast.Name): return None
        options = stores(file, scope).get(expression.id, [])
        if not options and scope is not trees[file]: options = stores(file, trees[file]).get(expression.id, [])
        imports = [row for row in options if row[0] == "from" and row[1].module == "fastapi" and row[1].level == 0 and row[2] == wanted]
        if len(imports) != 1 or imports[0][1].lineno >= expression.lineno: return None
        for kind, node, value in options:
            if (kind, node, value) == imports[0]: continue
            # The Director's optional FastAPI import has an explicit None
            # fallback. Retain that availability condition rather than treating
            # arbitrary reassignments as the constructor binding.
            if not (kind == "assignment" and isinstance(value, ast.Constant) and value.value is None
                    and optional_import_fallback(file, imports[0][1], node)): return None
        return controls(file, imports[0][1], trees[file])

    def optional_import_fallback(file, imported, fallback):
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

    def escaped_router(file, factory, owner):
        allowed = {"get", "post", "put", "patch", "delete", "head", "options", "api_route", "route", "websocket", "on_event"}
        for node in local_nodes(factory):
            if not isinstance(node, ast.Name) or node.id != owner or not isinstance(node.ctx, ast.Load): continue
            parent = parents.get((file, node))
            if isinstance(parent, ast.Return) and parent.value is node: continue
            if isinstance(parent, ast.Attribute) and parent.value is node and parent.attr in allowed:
                call = parents.get((file, parent))
                handler = parents.get((file, call))
                if (isinstance(call, ast.Call) and call.func is parent
                        and isinstance(handler, (ast.FunctionDef, ast.AsyncFunctionDef))
                        and call in handler.decorator_list and handler in factory.body): continue
            # Aliases, container escapes, arbitrary helper/method calls and
            # nested attribute mutation need a wider ownership proof.
            return True
        return False

    def prefix(call):
        if any(keyword.arg is None for keyword in call.keywords): return None
        values = [keyword.value for keyword in call.keywords if keyword.arg == "prefix"]
        if len(values) > 1: return None
        value = values[0] if values else ast.Constant(value="")
        if not isinstance(value, ast.Constant) or not isinstance(value.value, str): return None
        text = value.value
        return text if len(text) <= 2048 and (not text or text.startswith("/") and not text.endswith("/")) else None

    def module_file(file, import_node):
        module = import_node.module or ""
        if not module or any(not part.isidentifier() for part in module.split(".")): return None
        origin = Path(file).parent
        if import_node.level:
            if import_node.level > len(origin.parts): return None
            base = origin
            for _ in range(import_node.level - 1): base = base.parent
            candidates = [base]
        else:
            # Absolute imports are admitted only under this entrypoint's
            # directory. Guessing arbitrary ancestor sys.path entries can bind
            # an unrelated same-named package.
            candidates = [origin]
        for base in candidates:
            target = base.joinpath(*module.split("."))
            matches = [str(target.with_suffix(".py")), str(target / "__init__.py")]
            hits = [name for name in matches if name in trees]
            if hits: return hits[0] if len(hits) == 1 else None
        return None

    factories = {}
    for file, tree in trees.items():
        for name, values in stores(file, tree).items():
            if len(values) != 1 or values[0][0] != "definition" or not isinstance(values[0][1], ast.FunctionDef): continue
            factory = values[0][1]
            # Nested/deferred factory definitions are not module exports.
            if parents.get((file, factory)) is not tree or factory.decorator_list: continue
            if any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in local_nodes(factory)): continue
            for statement in factory.body:
                if not isinstance(statement, (ast.Assign, ast.AnnAssign)) or not isinstance(statement.value, ast.Call): continue
                targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                if len(targets) != 1 or not isinstance(targets[0], ast.Name): continue
                owner = targets[0].id
                if (len(stores(file, factory).get(owner, [])) != 1 or mutated_receiver(factory, owner)
                        or escaped_router(file, factory, owner)): continue
                constructor_conditions = constructor(file, factory, statement.value.func, "APIRouter")
                router_prefix = prefix(statement.value)
                if constructor_conditions is None or router_prefix is None or statement.value.args: continue
                returns = [node for node in local_nodes(factory) if isinstance(node, ast.Return)]
                # One unconditional final router return prevents implicit None
                # and early returns before decorator registration.
                final = factory.body[-1]
                if not isinstance(final, ast.Return) or not isinstance(final.value, ast.Name) or final.value.id != owner: continue
                if any(isinstance(node.value, ast.Name) for node in returns if node is not final): continue
                if any(not (isinstance(node.value, ast.Name) and node.value.id == owner) and
                       not (node.value is None or isinstance(node.value, ast.Constant) and node.value.value is None) for node in returns): continue
                optional = [node for node in returns if not isinstance(node.value, ast.Name)]
                routes = []
                for handler in factory.body:
                    if not isinstance(handler, (ast.FunctionDef, ast.AsyncFunctionDef)): continue
                    for decorator in handler.decorator_list:
                        if (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)
                                and isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == owner):
                            routes.append(decorator)
                conditions = [*controls(file, factory, tree), *constructor_conditions]
                if unsupported_conditions(conditions): continue
                for node in optional:
                    conditions.extend(controls(file, node, factory))
                    conditions.append({"file": file, "line": node.lineno, "kind": "factory-may-return-none"})
                factories[(file, name)] = {"factory": factory, "owner": owner, "prefix": router_prefix,
                                          "routes": routes, "conditions": conditions}

    def called_factory(file, expression, include_line):
        if isinstance(expression, ast.Name):
            values = stores(file, trees[file]).get(expression.id, [])
            if len(values) != 1 or values[0][0] != "assignment": return None
            assignment = values[0][1]
            if assignment.lineno >= include_line or len(getattr(assignment, "targets", [assignment.target] if isinstance(assignment, ast.AnnAssign) else [])) != 1: return None
            expression = assignment.value
            assigned_conditions = controls(file, assignment, trees[file])
        else: assigned_conditions = []
        if not isinstance(expression, ast.Call) or not isinstance(expression.func, ast.Name): return None
        if any(isinstance(arg, ast.Starred) for arg in expression.args) or any(keyword.arg is None for keyword in expression.keywords): return None
        values = stores(file, trees[file]).get(expression.func.id, [])
        if len(values) != 1: return None
        kind, binding, exported = values[0]
        if binding.lineno >= expression.lineno: return None
        if kind == "definition": key = file, expression.func.id
        elif kind == "from":
            target = module_file(file, binding)
            key = target, exported
        else: return None
        descriptor = factories.get(key)
        if descriptor is None: return None
        return key, descriptor, [*assigned_conditions, *controls(file, binding, trees[file])]

    for file, tree in trees.items():
        apps = {}
        for name, values in stores(file, tree).items():
            if len(values) != 1 or values[0][0] != "assignment": continue
            node = values[0][1]
            if parents.get((file, node)) is not tree or not isinstance(node.value, ast.Call): continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if len(targets) != 1 or not isinstance(targets[0], ast.Name): continue
            app_conditions = constructor(file, tree, node.value.func, "FastAPI")
            if (not node.value.args and not any(keyword.arg is None for keyword in node.value.keywords)
                    and app_conditions is not None and not unsupported_conditions(app_conditions)
                    and not mutated_receiver(tree, name)):
                apps[name] = node, app_conditions
        if not apps: continue
        for node in local_nodes(tree):
            if (not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != "include_router"
                    or not isinstance(node.func.value, ast.Name) or node.func.value.id not in apps or len(node.args) != 1): continue
            mount_prefix = prefix(node)
            if mount_prefix is None: continue
            bound = called_factory(file, node.args[0], node.lineno)
            if bound is None: continue
            key, descriptor, import_conditions = bound
            application, app_conditions = apps[node.func.value.id]
            conditions = [*app_conditions, *import_conditions, *descriptor["conditions"], *controls(file, node, tree)]
            if unsupported_conditions(conditions) or node.lineno <= application.lineno: continue
            unique = {json.dumps(value, sort_keys=True): value for value in conditions}
            conditions = [unique[key] for key in sorted(unique)]
            for decorator in descriptor["routes"]:
                contexts[(key[0], decorator.lineno)].append({
                    "processScope": "python-app:" + file + "::" + node.func.value.id,
                    "routerPrefix": descriptor["prefix"], "includeRouterPrefix": mount_prefix,
                    "factory": {"file": key[0], "name": key[1], "line": descriptor["factory"].lineno},
                    "mountSource": {"file": file, "line": node.lineno}, "mountConditions": conditions,
                    "mountConditional": bool(conditions), "runtimeAvailability": "UNVERIFIED"})
    return contexts, diagnostics
