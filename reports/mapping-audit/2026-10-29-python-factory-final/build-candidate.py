from pathlib import Path
import ast, hashlib, json, difflib
B=Path(__file__).resolve().parent
R=Path('/workspace/maxbooster7.5')
p=R/'scripts/testing/platform-register.py'
source=p.read_text();tree=ast.parse(source)
f=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='python_routes')
lines=source.splitlines(keepends=True);old=''.join(lines[f.lineno-1:f.end_lineno])
new=old.replace('    rows, unknown = [], []','    rows, unknown, trees = [], [], {}').replace('        owners = {}','        trees[file] = tree\n        owners = {}')
new=new.replace('    return rows, unknown','''    mounted, mount_unknown = _FACTORY.python_factory_mounts(trees)
    expanded = []
    for row in rows:
        contexts = mounted.get((row["file"], row["line"]), [])
        if not contexts:
            expanded.append(row)
            continue
        if len(contexts) != 1:
            # Preserve the original declaration and all its acceptance checks.
            # Multiple process-specific instances need an explicit identity
            # contract rather than arbitrarily selecting or merging a mount.
            expanded.append(row)
            mount_unknown.append({"kind": "python-factory-multiple-mounts", "file": row["file"], "line": row["line"],
                                  "contexts": contexts})
            continue
        context = contexts[0]
        resolved_path = context["includeRouterPrefix"] + context["routerPrefix"] + row["path"] if isinstance(row["path"], str) else None
        expanded.append({**row, **context, "declaredPath": row["path"], "path": resolved_path,
                         "declarationSubjectId": identifier("api", row["file"], row["line"], row["method"], row["path"]),
                         "pathResolved": resolved_path is not None,
                         "mountResolved": resolved_path is not None and not context["mountConditional"],
                         "confidence": "source-proven conditional factory mount" if context["mountConditional"] else "source-proven factory mount; runtime unverified"})
    return expanded, unknown + mount_unknown''')
candidate=source.replace(old,new)
loader_anchor = '_JUNIT_SPEC.loader.exec_module(_JUNIT)\n'
loader = ('_FACTORY_SPEC = importlib.util.spec_from_file_location("maxbooster_python_factory_mounts", Path(__file__).with_name("python_factory_mounts.py"))\n'
          '_FACTORY = importlib.util.module_from_spec(_FACTORY_SPEC)\n'
          '_FACTORY_SPEC.loader.exec_module(_FACTORY)\n')
assert source.count(loader_anchor) == 1
candidate = candidate.replace(loader_anchor, loader_anchor + loader)

oldloop='''    python, python_unknown = python_routes(source); unknown += python_unknown
    for raw in python + native_routes(source):
        routes.append({"id": identifier("api", raw["file"], raw["line"], raw["method"], raw["path"]),
                       "method": raw["method"], "path": raw["path"], "source": location(raw["file"], raw["line"]),
                       "processScope": raw["processScope"], "confidence": raw["confidence"], "mountResolved": raw["mountResolved"],
                       "origin": "python-decorator-ast" if raw["file"].endswith(".py") else "native-source-declaration"})'''
newloop='''    python, python_unknown = python_routes(source); unknown += python_unknown
    for raw in python + native_routes(source):
        # Factory prefix resolution enriches an existing declaration; it does
        # not erase or replace its original subject/check identities.
        item = {"id": raw.get("declarationSubjectId") or identifier("api", raw["file"], raw["line"], raw["method"], raw["path"]),
                "method": raw["method"], "path": raw["path"], "source": location(raw["file"], raw["line"]),
                "processScope": raw["processScope"], "confidence": raw["confidence"], "mountResolved": raw["mountResolved"],
                "origin": "python-decorator-ast" if raw["file"].endswith(".py") else "native-source-declaration"}
        for key in ("declaredPath", "declarationSubjectId", "pathResolved", "routerPrefix", "includeRouterPrefix", "factory",
                    "mountSource", "mountConditions", "mountConditional", "runtimeAvailability"):
            if key in raw: item[key] = raw[key]
        routes.append(item)'''
assert oldloop in candidate;candidate=candidate.replace(oldloop,newloop)
oldunknown='''        if not item["mountResolved"]: unknown.append({"kind": "unverified-route-mount", "subjectId": item["id"], **item["source"], "declaredPath": item["path"]})'''
newunknown='''        if not item["mountResolved"] or item.get("runtimeAvailability") == "UNVERIFIED":
            # Source topology does not close runtime-mount acceptance. Retain
            # the original warning bytes so existing mapping work IDs survive.
            unknown.append({"kind": "unverified-route-mount", "subjectId": item["id"], **item["source"],
                            "declaredPath": item.get("declaredPath", item["path"])})'''
assert oldunknown in candidate;candidate=candidate.replace(oldunknown,newunknown)
ast.parse(candidate)
(B/'platform-register.next.py').write_text(candidate)
patch=''.join(difflib.unified_diff(source.splitlines(keepends=True),candidate.splitlines(keepends=True),fromfile='a/scripts/testing/platform-register.py',tofile='b/scripts/testing/platform-register.py'))
helper=(B/'python_factory_mounts.py').read_text()
patch+=''.join(difflib.unified_diff([],helper.splitlines(keepends=True),fromfile='/dev/null',tofile='b/scripts/testing/python_factory_mounts.py'))
tests=(B/'test_python_factory_mounts.py').read_text()
patch+=''.join(difflib.unified_diff([],tests.splitlines(keepends=True),fromfile='/dev/null',tofile='b/tests/testing/test_python_factory_mounts.py'))
(B/'candidate-source.patch').write_text(patch)
(B/'base.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'candidateSha256':hashlib.sha256(candidate.encode()).hexdigest(),'rootHead':__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()},indent=2)+'\n')
print('built',len(patch.splitlines()),'patchlines')
