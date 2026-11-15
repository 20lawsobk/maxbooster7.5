from pathlib import Path
import ast,hashlib,json,difflib
B=Path(__file__).resolve().parent;R=Path('/workspace/maxbooster7.5');p=R/'scripts/testing/platform-register.py';source=p.read_text()
assert hashlib.sha256(source.encode()).hexdigest()=='f8c4e518a50cfb66cce48e4b305b1760df6729ffbacbdaccaddb0708ab106257'
tree=ast.parse(source);f=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='python_routes');lines=source.splitlines(keepends=True)
old=''.join(lines[f.lineno-1:f.end_lineno]);new=old.replace('    rows, unknown = [], []','    rows, unknown, trees = [], [], {}').replace('        owners = {}','        trees[file] = tree\n        owners = {}')
new=new.replace('    return rows, unknown','''    mounted, mount_unknown = python_factory_mounts(trees)
    expanded = []
    for row in rows:
        contexts = mounted.get((row["file"], row["line"]), [])
        if not contexts:
            expanded.append(row)
            continue
        for context in contexts:
            resolved_path = context["includeRouterPrefix"] + context["routerPrefix"] + row["path"] if isinstance(row["path"], str) else None
            expanded.append({**row, **context, "declaredPath": row["path"], "path": resolved_path,
                             "declarationSubjectId": identifier("api", row["file"], row["line"], row["method"], row["path"]),
                             "pathResolved": resolved_path is not None,
                             "mountResolved": resolved_path is not None and not context["mountConditional"],
                             "confidence": "source-proven conditional factory mount" if context["mountConditional"] else "source-proven factory mount; runtime unverified"})
    return expanded, unknown + mount_unknown''')
helper=(B/'python_factory_mounts.py').read_text();candidate=source.replace(old,helper+'\n\n'+new)
oldloop='''    python, python_unknown = python_routes(source); unknown += python_unknown
    for raw in python + native_routes(source):
        routes.append({"id": identifier("api", raw["file"], raw["line"], raw["method"], raw["path"]),
                       "method": raw["method"], "path": raw["path"], "source": location(raw["file"], raw["line"]),
                       "processScope": raw["processScope"], "confidence": raw["confidence"], "mountResolved": raw["mountResolved"],
                       "origin": "python-decorator-ast" if raw["file"].endswith(".py") else "native-source-declaration"})'''
newloop='''    python, python_unknown = python_routes(source); unknown += python_unknown
    other_routes = python + native_routes(source)
    other_id_counts = Counter((row["file"], row["line"], row["method"], row["path"]) for row in other_routes)
    for raw in other_routes:
        parts = (raw["file"], raw["line"], raw["method"], raw["path"])
        if other_id_counts[parts] > 1:
            parts += (raw["processScope"], json.dumps(raw.get("mountSource"), sort_keys=True))
        item = {"id": identifier("api", *parts),
                "method": raw["method"], "path": raw["path"], "source": location(raw["file"], raw["line"]),
                "processScope": raw["processScope"], "confidence": raw["confidence"], "mountResolved": raw["mountResolved"],
                "origin": "python-decorator-ast" if raw["file"].endswith(".py") else "native-source-declaration"}
        for key in ("declaredPath", "declarationSubjectId", "pathResolved", "routerPrefix", "includeRouterPrefix", "factory",
                    "mountSource", "mountConditions", "mountConditional", "runtimeAvailability"):
            if key in raw: item[key] = raw[key]
        routes.append(item)'''
assert oldloop in candidate;candidate=candidate.replace(oldloop,newloop);ast.parse(candidate)
(B/'platform-register.next.py').write_text(candidate)
patch=''.join(difflib.unified_diff(source.splitlines(keepends=True),candidate.splitlines(keepends=True),fromfile='a/scripts/testing/platform-register.py',tofile='b/scripts/testing/platform-register.py'))
(B/'candidate-source.patch').write_text(patch)
print(json.dumps({'before':hashlib.sha256(source.encode()).hexdigest(),'after':hashlib.sha256(candidate.encode()).hexdigest(),'helperLines':len(helper.splitlines()),'candidateBytes':len(candidate.encode())}))
