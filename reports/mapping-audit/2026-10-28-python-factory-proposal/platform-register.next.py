#!/usr/bin/env python3
"""Index platform surfaces and require explicit behavioral evidence for closure.

This source inventory never treats a route match, import, line coverage or page
render as proof that a feature's business behavior passed.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter, defaultdict, deque
import datetime
import math
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "all"}

NODE_EXTRACTOR = r'''
const fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
const root=process.cwd(); const files=JSON.parse(fs.readFileSync(0,'utf8'));
const known=new Set(files), data={files:[],pages:[],interactions:[],routes:[],mounts:[],unknown:[]};
const interactive=new Set(['button','Button','form','Form','input','Input','select','Select','textarea','Textarea','a','Link','Checkbox','Switch','RadioGroup','Slider','SelectItem','DropdownMenuItem']);
function resolve(from, spec){
 let target;
 if(spec.startsWith('@/')) target='client/src/'+spec.slice(2);
 else if(spec.startsWith('@shared/')) target='shared/'+spec.slice(8);
 else if(spec.startsWith('.')) target=path.posix.normalize(path.posix.join(path.posix.dirname(from),spec));
 else if(spec.startsWith('client/')||spec.startsWith('server/')||spec.startsWith('shared/')||spec.startsWith('external/')) target=spec;
 else return null;
 const bare=target.replace(/\.(js|jsx|mjs|cjs)$/,'');
 for(const p of [target,bare+'.ts',bare+'.tsx',bare+'.js',bare+'.jsx',bare+'.mjs',target+'/index.ts',target+'/index.tsx',target+'/index.js']) if(known.has(p)) return p;
 return null;
}
function name(node){return node?.getText?.()||'';}
for(const file of files){
 const text=fs.readFileSync(file,'utf8'); const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const imports={}, deps=new Set(), references=new Set(), exports={}, routers={}, variables={}, bindings={};
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 function add(spec){const resolved=resolve(file,spec);if(resolved)deps.add(resolved);return resolved;}
 for(const stmt of sf.statements){
  if(ts.isImportDeclaration(stmt)&&ts.isStringLiteral(stmt.moduleSpecifier)){
   const target=add(stmt.moduleSpecifier.text);const clause=stmt.importClause;
   if(target&&clause){if(clause.name)imports[clause.name.text]={file:target,exportName:'default'};
    const b=clause.namedBindings;if(b&&ts.isNamedImports(b))for(const e of b.elements)imports[e.name.text]={file:target,exportName:e.propertyName?.text||e.name.text};}
  }
 }
 function scan(node){
  if(ts.isStringLiteralLike(node)){const target=resolve(file,node.text);if(target)references.add(target);}
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){
   variables[node.name.text]=node.initializer;
   const init=node.initializer;
   if(ts.isCallExpression(init)){
    const callee=name(init.expression);
    if(/(?:^|\.)(?:Router)$/.test(callee))routers[node.name.text]='router';
    else if(/^(express|fastify|Fastify)$/.test(callee))routers[node.name.text]='app';
    let dyn;
    function findImport(n){if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0]))dyn=add(n.arguments[0].text);ts.forEachChild(n,findImport);}
    findImport(init); if(dyn)bindings[node.name.text]=dyn;
   }
   if(node.parent?.parent?.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))exports[node.name.text]=node.name.text;
  }
  if(ts.isExportAssignment(node)&&ts.isIdentifier(node.expression))exports.default=node.expression.text;
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(node.arguments[0]))add(node.arguments[0].text);
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require'&&ts.isStringLiteral(node.arguments[0]))add(node.arguments[0].text);
  ts.forEachChild(node,scan);
 }
 scan(sf);
 function attrValue(attr){const v=attr.initializer;if(!v)return true;if(ts.isStringLiteral(v))return v.text;if(ts.isJsxExpression(v)&&v.expression&&ts.isStringLiteralLike(v.expression))return v.expression.text;return null;}
 function jsx(node){
  if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node)){
   const tag=name(node.tagName), attrs={},events=[],spreads=[];
   for(const a of node.attributes.properties){
    if(ts.isJsxSpreadAttribute(a)){spreads.push(line(a));continue;}
    const key=name(a.name);
    if(/^on[A-Z]/.test(key)){
     const expr=a.initializer&&ts.isJsxExpression(a.initializer)?a.initializer.expression:null;
     events.push({event:key,expressionKind:expr?ts.SyntaxKind[expr.kind]:'missing',handler:expr&&ts.isIdentifier(expr)?expr.text:null});
    }
    if(['data-testid','aria-label','name','id','type','role','href'].includes(key))attrs[key]=attrValue(a);
   }
   if(file==='client/src/App.tsx'&&tag==='Route'){
    const p=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&name(a.name)==='path');
    const c=node.attributes.properties.find(a=>ts.isJsxAttribute(a)&&name(a.name)==='component');
    const expr=c?.initializer&&ts.isJsxExpression(c.initializer)?c.initializer.expression:null;
    let component=expr&&ts.isIdentifier(expr)?expr.text:null;
    if(expr&&!component){function visit(n){if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&!component)component=name(n.tagName);ts.forEachChild(n,visit);}visit(expr);}
    const target=component&&(bindings[component]||imports[component]?.file);
    data.pages.push({path:p?attrValue(p):'*',component,sourceFile:target||file,registration:{file,line:line(node)},componentBindingResolved:Boolean(target),inlineComponent:Boolean(expr&&!ts.isIdentifier(expr))});
   }
   if(file.startsWith('client/src/')&&(events.length||interactive.has(tag))){
    data.interactions.push({file,line:line(node),column:sf.getLineAndCharacterOfPosition(node.getStart(sf)).character+1,tag,labels:attrs,eventBindings:events,spreadAttributeLines:spreads});
   }
  }
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
   const receiver=name(node.expression.expression), method=node.expression.name.text;
   const allowed=new Set(['get','post','put','patch','delete','head','options','all']);
   if(routers[receiver]&&allowed.has(method)){
    let arg=node.arguments[0];if(arg&&ts.isIdentifier(arg)&&variables[arg.text])arg=variables[arg.text];
    const literal=arg&&ts.isStringLiteralLike(arg)?arg.text:null;
    data.routes.push({file,line:line(node),method:method.toUpperCase(),path:literal,receiver,routerType:routers[receiver],confidence:literal?'router-declaration':'unresolved-path'});
    if(!literal)data.unknown.push({kind:'dynamic-backend-path',file,line:line(node),receiver,method:method.toUpperCase()});
   }
    if(routers[receiver]&&method==='use'){
    let prefix='',start=0;if(node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])){prefix=node.arguments[0].text;start=1;}
    for(const arg of node.arguments.slice(start)){
     if(ts.isIdentifier(arg)){
      const imp=imports[arg.text];
      if(imp)data.mounts.push({from:file+'::'+receiver,toFile:imp.file,toExport:imp.exportName,prefix,file,line:line(node)});
      else if(routers[arg.text])data.mounts.push({from:file+'::'+receiver,to:file+'::'+arg.text,prefix,file,line:line(node)});
     }
    }
   }
  }
  ts.forEachChild(node,jsx);
 }
 jsx(sf);
 const diagnostics=sf.parseDiagnostics.map(d=>({file,line:d.start==null?null:sf.getLineAndCharacterOfPosition(d.start).line+1,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 data.unknown.push(...diagnostics.map(d=>({kind:'parse-diagnostic',...d})));
 data.files.push({file,imports:Object.fromEntries(Object.entries(imports).map(([k,v])=>[k,v.file])),dependencies:[...deps],references:[...references],exports,routers});
}
process.stdout.write(JSON.stringify(data));
'''

CHECKS = {
    "page-states": "Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload.",
    "page-access": "Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary.",
    "page-persistence": "Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success.",
    "control-behavior": "Operate this exact control with real user events; assert the visible result and the intended handler/API request, including disabled and invalid-input behavior.",
    "control-failure": "Force the control's request/dependency to fail or time out; verify error/retry/cancel behavior and that no unconfirmed success or duplicate mutation is shown.",
    "response-contract": "Call the exact registered method/path and assert status, content type and response schema for successful, empty and nonexistent-resource cases as applicable.",
    "access-policy": "Establish and test this endpoint's declared anonymous/authenticated/admin policy; reject unauthorized requests without leaking protected data.",
    "input-boundaries": "Test actual path/query/body boundaries and malformed or excessive input; assert validation occurs before side effects. Record explicit non-applicability for absent inputs.",
    "tenant-boundary": "For scoped resources, use distinct fixture identities to prove ownership/tenant isolation on both reads and writes.",
    "dependency-failure": "Make each required database/storage/provider dependency fail or time out; assert an honest bounded failure and preserve retryable state.",
    "mutation-durability": "Verify the real mutation with durable readback/reopen, transaction rollback on failure, idempotent retries and concurrent delivery where applicable.",
    "deletion-durability": "Verify ownership, durable removal and retained/reference cleanup; repeated deletes and interrupted cleanup must not resurrect or erase another user's data.",
    "callback-integrity": "Verify applicable provider signature/state/nonce, replay and duplicate-event handling against the actual callback handler and stored state.",
    "readiness-truth": "Prove required child/dependency capability before ready=200; unloaded/unavailable capability must remain unavailable and recover only after actual readiness.",
    "artifact-integrity": "Validate the delivered artifact's declared format, decode/content constraints, ownership, durable bytes and retry/delivery receipt; distinguish procedural output from learned quality.",
    "dns-wire-contract": "Exercise actual DNS question/type/record handling, response RCODE/flags/TTL and serialized wire bytes; assert malformed-packet and unsupported-query behavior.",
}


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def identifier(prefix, *parts):
    return prefix + "-" + hashlib.sha256("\0".join(str(part) for part in parts).encode()).hexdigest()[:16]


def read_json(file, fallback):
    return json.loads(file.read_text()) if file.is_file() else fallback


def resolve_evidence_cases(mapping, *, check_ids, platform_digest, test_entries, passed_cases, root=ROOT):
    """Resolve an explicit conjunctive proof; source associations never count.

    Legacy links name one exact case. A ``cases`` bundle allows a requirement
    to be established by several cases, but every member must currently pass
    against the same platform digest and its unchanged, registered test file.
    """
    fields = ("testFile", "testSha256", "caseName", "group")
    if (not isinstance(mapping, dict) or not isinstance(mapping.get("checkId"), str) or mapping["checkId"] not in check_ids
            or mapping.get("platformSourceDigest") != platform_digest):
        return None
    if "cases" in mapping:
        if any(field in mapping for field in fields):
            return None  # Do not silently choose between two different proofs.
        cases = mapping["cases"]
        if not isinstance(cases, list) or not cases:
            return None
    else:
        cases = [mapping]
    resolved, seen = [], set()
    for case in cases:
        if not isinstance(case, dict) or any(not isinstance(case.get(field), str) or not case[field] for field in fields):
            return None
        file = case["testFile"]
        identity = (case["group"], file, case["caseName"])
        if file not in test_entries or identity in seen or identity not in passed_cases:
            return None
        try:
            if case["testSha256"] != digest(root / file):
                return None
        except (OSError, ValueError):
            return None
        resolved.append({field: case[field] for field in fields})
        seen.add(identity)
    return resolved



def collect_current_passing_cases(incoming, current_inputs, *, root=ROOT):
    """Bind leaf proofs to unchanged current inputs and their actual selected run.

    This runs during master postprocessing, before finishedAt/overall status
    exist. A failed global coverage threshold does not erase passing leaf cases.
    Regenerating case-results or editing an acceptance-map digest is not a run.
    """
    incoming, root = incoming.resolve(), root.resolve()
    rejected, artifacts, loaded = Counter(), {}, {}

    def load(file, fallback):
        if file in loaded: return loaded[file]
        try:
            value = read_json(file, fallback)
            if file.is_file(): artifacts[str(file)] = digest(file)
            loaded[file] = value
            return value
        except (OSError, ValueError, TypeError):
            rejected["unreadable-producer-artifact"] += 1
            return fallback

    def owned(reference):
        if not isinstance(reference, str) or not reference: return None
        file = Path(reference)
        if not file.is_absolute(): file = root / file
        try:
            file = file.resolve()
            return file if file.is_relative_to(incoming) and file.is_file() else None
        except (OSError, ValueError): return None

    def timestamp(value):
        try:
            date = datetime.datetime.fromisoformat(value)
            return date.timestamp() if date.tzinfo is not None else None
        except (TypeError, ValueError, OverflowError): return None

    # One second accommodates rounded command durations/filesystem precision;
    # it does not permit borrowing artifacts from a previous master invocation.
    def fresh(file, window):
        try:
            modified = file.stat().st_mtime if file is not None else -1
            return modified >= master_start and window[0] - 1 <= modified <= window[1] + 1
        except OSError: return False

    def command_window(row, parent):
        if not isinstance(row, dict): return None
        start, duration = timestamp(row.get("startedAt")), row.get("durationSeconds")
        code = row.get("exitCode")
        if (start is None or not isinstance(duration, (int, float)) or isinstance(duration, bool)
                or not math.isfinite(duration) or duration < 0 or type(code) is not int or code < 0
                or row.get("timedOut") is not False or row.get("coverageParseExclusions")
                or row.get("status") not in ({"passed", "passed_with_skips"} if code == 0 else {"failed"})
                or not isinstance(row.get("command"), list) or not row["command"]
                or any(not isinstance(part, str) for part in row["command"])):
            return None
        end = start + duration
        if start < parent[0] - 1 or end > parent[1] + 1: return None
        log = owned(row.get("log"))
        if not fresh(log, (start, end)) or not isinstance(row.get("logSha256"), str) or digest(log) != row["logSha256"]:
            return None
        artifacts[str(log)] = row["logSha256"]
        return start, end

    recorded = load(incoming / "orchestration/source-inputs.json", {})
    master = load(incoming / "orchestration/results.json", {})
    # This ledger legitimately gains postprocessing/final status after this
    # function returns. Bind its stable executed-run subset, not a transient hash.
    artifacts.pop(str(incoming / "orchestration/results.json"), None)
    current_inputs = current_inputs if isinstance(current_inputs, dict) else {}
    files = recorded.get("files") if isinstance(recorded, dict) else None
    calculated = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    source_current = (isinstance(files, dict) and bool(files) and files == current_inputs.get("files")
                      and recorded.get("sha256") == current_inputs.get("sha256") == calculated
                      and isinstance(master, dict) and master.get("sourceInputsSha256") == calculated
                      and master.get("sourceInputsUnchanged") is True and master.get("changedSourceInputs") == [])
    selected = master.get("selectedGroups") if isinstance(master, dict) else None
    master_start = timestamp(master.get("startedAt")) if isinstance(master, dict) else None
    state = {"status": "STALE_OR_MISSING", "sourceInputsMatchCurrent": bool(source_current),
             "currentSourceInputsSha256": current_inputs.get("sha256"), "recordedSourceInputsSha256": recorded.get("sha256") if isinstance(recorded, dict) else None,
             "selectedExecutedGroups": [], "rejectedEvidence": {}, "inputArtifactsSha256": artifacts,
             "meaning": "Only exact leaf proofs bound to unchanged current source and actual selected commands qualify; overall master/coverage/launch approval is separate."}
    if (not source_current or master_start is None or not isinstance(selected, list) or not selected
            or any(not isinstance(group, str) for group in selected) or len(set(selected)) != len(selected)):
        state["rejectedEvidence"] = {"missing-or-stale-current-execution": 1}
        return set(), state
    stable_binding = {key: master.get(key) for key in ("sourceRevision", "startedAt", "sourceInputsSha256",
                       "sourceInputsUnchanged", "changedSourceInputs", "selectedGroups", "runs")}
    state["executionBinding"] = stable_binding
    state["executionBindingSha256"] = hashlib.sha256(json.dumps(stable_binding, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    runs = master.get("runs", [])
    runs = runs if isinstance(runs, list) else []
    keys = Counter((row.get("group"), row.get("id")) for row in runs if isinstance(row, dict)
                   and isinstance(row.get("group"), str) and isinstance(row.get("id"), str))
    bound = {}
    for row in runs:
        if not isinstance(row, dict): continue
        key = row.get("group"), row.get("id")
        if not all(isinstance(part, str) for part in key) or keys[key] != 1 or key[0] not in selected: continue
        window = command_window(row, (master_start, float("inf")))
        if window: bound[key] = (window, row)
    state["selectedExecutedGroups"] = sorted({key[0] for key in bound})
    state["status"] = "CURRENT" if bound else "MISSING_EXECUTED_GROUPS"
    def unique_tap_passes(log):
        seen, passed = Counter(), set()
        for match in re.finditer(r"^(ok|not ok) \d+ - (.+?)(?: # (SKIP|TODO).*)?$", log.read_text(errors="replace"), re.M):
            seen[match.group(2)] += 1
            if match.group(1) == "ok" and not match.group(3): passed.add(match.group(2))
        return {name for name in passed if seen[name] == 1}

    def source_command(entry, file, group):
        command = entry.get("command")
        if group == "python" and isinstance(command, str):
            try: command = shlex.split(command)
            except ValueError: return False
        return isinstance(command, list) and file in command

    result, xml_cache = set(), {}
    group_runs = {"root-unit": ("root", "ci"), "root-additional": ("root", "additional"),
                  "coverage-contracts": ("coverage", "coverage"), "python": ("python", "python"),
                  "commerce": ("commerce", "commerce"), "http": ("http", "http")}
    case_rows = load(incoming / "case-results.json", [])
    if not isinstance(case_rows, list):
        rejected["malformed-case-results"] += 1
        case_rows = []
    for case in case_rows:
        if not isinstance(case, dict) or case.get("status") != "passed": continue
        identity = case.get("group"), case.get("file"), case.get("name")
        if not all(isinstance(part, str) and part for part in identity) or identity[1] not in files: continue
        artifact = owned(case.get("junit"))
        key = group_runs.get(identity[0])
        if identity[0] == "root-unit" and artifact and artifact.name == "coverage-unit.junit.xml": key = ("coverage", "coverage")
        if key not in bound or not fresh(artifact, bound[key][0]):
            rejected["unbound-or-stale-case-artifact"] += 1; continue
        default_file = None
        if identity[0] in {"python", "commerce"}:
            group = identity[0]
            producer_path = incoming / group / "results.json"
            producer = load(producer_path, {}) if fresh(producer_path, bound[key][0]) else {}
            entries = producer.get("suites" if group == "python" else "commands", []) if isinstance(producer, dict) else []
            entries = entries if isinstance(entries, list) else []
            matching = [entry for entry in entries if isinstance(entry, dict) and entry.get("file" if group == "python" else "path") == identity[1]
                        and isinstance(entry.get("junit"), str) and owned(str(incoming / group / entry["junit"])) == artifact
                        and type(entry.get("exitCode")) is int and entry["exitCode"] == 0
                        and source_command(entry, identity[1], group)
                        and (group != "python" or entry.get("sourceSha256") == files[identity[1]])]
            if len(matching) != 1:
                rejected["unbound-default-file-producer"] += 1; continue
            default_file = identity[1]
        cache_key = artifact, default_file
        if cache_key not in xml_cache:
            passed, occurrences = set(), Counter()
            try:
                def collect(element, suite=""):
                    name = element.get("name", "") if element.tag == "testsuite" else suite
                    if element.tag == "testcase":
                        identity = default_file or element.get("file") or name, element.get("name")
                        occurrences[identity] += 1
                        if not any(element.find(tag) is not None for tag in ("failure", "error", "skipped")):
                            passed.add(identity)
                    else:
                        for child in element: collect(child, name)
                collect(ET.parse(artifact).getroot())
                artifacts[str(artifact)] = digest(artifact)
            except (OSError, ET.ParseError): rejected["unreadable-case-xml"] += 1
            xml_cache[cache_key] = {identity for identity in passed if occurrences[identity] == 1}
        if identity[1:] in xml_cache[cache_key]: result.add(identity)
        else: rejected["case-not-passed-in-bound-xml"] += 1
    node_path = incoming / "node/results.json"
    if ("node", "node") in bound and fresh(node_path, bound[("node", "node")][0]):
        node = load(node_path, {})
        node_runs = node.get("runs", []) if isinstance(node, dict) else []
        node_runs = node_runs if isinstance(node_runs, list) else []
        occurrences = Counter(run["file"] for run in node_runs if isinstance(run, dict)
                              and isinstance(run.get("file"), str) and run["file"])
        duplicates = {file for file, count in occurrences.items() if count != 1}
        if duplicates: rejected["duplicate-node-file-execution"] += len(duplicates)
        for run in node_runs:
            if isinstance(run, dict) and isinstance(run.get("file"), str) and run["file"] in duplicates: continue
            if (not isinstance(run, dict) or not isinstance(run.get("file"), str) or run["file"] not in files
                    or type(run.get("exitCode")) is not int or run["exitCode"] != 0
                    or not isinstance(run.get("command"), list) or run["file"] not in run["command"]): continue
            if not command_window(run, bound[("node", "node")][0]):
                rejected["unbound-node-command"] += 1; continue
            result.update(("node", run["file"], name) for name in unique_tap_passes(owned(run["log"])))
    browser_path = incoming / "integration-browser/browser-page80-summary.json"
    if ("browser", "browser") in bound and fresh(browser_path, bound[("browser", "browser")][0]):
        window, run = bound[("browser", "browser")]
        browser_report = load(browser_path, {})
        browser = browser_report.get("browser", {}) if isinstance(browser_report, dict) else {}
        browser = browser if isinstance(browser, dict) else {}
        names, paths = browser.get("caseNames", []), browser.get("files", [])
        log = owned(str(browser_path.parent / browser["log"])) if isinstance(browser.get("log"), str) else None
        # Aggregate TAP cannot bind a case to one of several executed files.
        # Preserve the run but require per-file producer identity before linking.
        if (type(browser.get("exitCode")) is int and browser["exitCode"] == run["exitCode"] == 0
                and isinstance(names, list) and isinstance(paths, list) and len(names) == len(paths) == 1
                and isinstance(names[0], str) and isinstance(paths[0], str) and paths[0] in files
                and [part for part in run["command"] if part in files] == paths
                and fresh(log, window) and digest(log) == run["logSha256"]):
            result.update(("browser", paths[0], names[0]) for _ in [None] if names[0] in unique_tap_passes(log))
        else: rejected["unbound-browser-artifact"] += 1
    state["rejectedEvidence"] = dict(rejected)
    state["passingCases"] = len(result)
    return result, state

def audit_route_identity(route, scopes):
    path = route.get("fullPath") or route.get("rawPath")
    parts = (route["file"], route["line"], route["method"], path)
    # Preserve existing IDs unless the source declaration really represents
    # identical URLs in distinct application processes.
    if len(scopes.get(parts, ())) > 1:
        parts += (route.get("processScope"),)
    return identifier("api", *parts)


def audit_mount_resolved(route):
    """A fallback raw path does not establish a mounted endpoint."""
    return bool(route.get("fullPath")) and route.get("confidence") in {"high", "medium"}


def location(file, line):
    return {"file": file, "line": line}


def source_paths():
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    excluded = (".pdim-", "reports/", "docs/", "tests/", "evaluations/", "scripts/testing/", "node_modules/", "dist/", "ReleasePackage/", "archive-capsules/")
    return sorted(p for p in tracked if p and not p.startswith(excluded) and "/node_modules/" not in p
                  and not set(Path(p).parts) & {"tests", "__tests__", "__snapshots__", "test"}
                  and not Path(p).name.startswith(("test_", "test-")) and ".test." not in Path(p).name and ".spec." not in Path(p).name
                  and (ROOT / p).is_file())


def parsed_ts_paths(source, tests):
    suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
    return sorted({p for p in source + tests if Path(p).suffix in suffixes})


def python_factory_mounts(trees):
    """Resolve finite direct FastAPI factory mounts without importing source.

    Only unambiguous module applications, top-level synchronous factories and
    direct returned APIRouter bindings qualify. Unsupported data/control flow
    retains the original declared-only route; source topology is not runtime
    availability or behavioral acceptance.
    """
    parents, bindings, contexts, diagnostics = {}, {}, defaultdict(list), []
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
            elif isinstance(parent, ast.ExceptHandler):
                result.append({"file": file, "line": parent.lineno, "kind": "except-handler",
                               "expression": ast.unparse(parent.type) if parent.type else "BaseException"})
            child = parent
        return result

    def local_nodes(scope):
        def visit(node):
            yield node
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
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
            elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for target in targets:
                    for part in ast.walk(target):
                        if isinstance(part, ast.Name) and isinstance(part.ctx, ast.Store): found[part.id].append(("assignment", node, node.value))
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
                for part in ast.walk(node.target):
                    if isinstance(part, ast.Name) and isinstance(part.ctx, ast.Store): found[part.id].append(("iteration", node, None))
            elif isinstance(node, ast.AugAssign):
                for part in ast.walk(node.target):
                    if isinstance(part, ast.Name) and isinstance(part.ctx, ast.Store): found[part.id].append(("augmented", node, None))
            elif isinstance(node, ast.ExceptHandler) and node.name:
                found[node.name].append(("exception", node, None))
            elif isinstance(node, (ast.Global, ast.Nonlocal)):
                for name in node.names: found[name].append(("dynamic-scope", node, None))
            elif isinstance(node, ast.Delete):
                for target in node.targets:
                    for part in ast.walk(target):
                        if isinstance(part, ast.Name): found[part.id].append(("delete", node, None))
        bindings[key] = found
        return found

    def constructor(file, scope, expression, wanted):
        if not isinstance(expression, ast.Name): return None
        options = stores(file, scope).get(expression.id, [])
        if not options and scope is not trees[file]: options = stores(file, trees[file]).get(expression.id, [])
        imports = [row for row in options if row[0] == "from" and row[1].module == "fastapi" and row[1].level == 0 and row[2] == wanted]
        if len(imports) != 1: return None
        for kind, node, value in options:
            if (kind, node, value) == imports[0]: continue
            # The Director's optional FastAPI import has an explicit None
            # fallback. Retain that availability condition rather than treating
            # arbitrary reassignments as the constructor binding.
            if not (kind == "assignment" and isinstance(value, ast.Constant) and value.value is None
                    and any(item["kind"] == "except-handler" and item.get("expression") in {"ImportError", "ModuleNotFoundError"}
                            for item in controls(file, node, trees[file]))): return None
        return controls(file, imports[0][1], trees[file])

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
        if not module or any(part in {"", ".", ".."} for part in module.split(".")): return None
        origin = Path(file).parent
        if import_node.level:
            if import_node.level > len(origin.parts): return None
            base = origin
            for _ in range(import_node.level - 1): base = base.parent
            candidates = [base]
        else:
            candidates = [origin, *origin.parents]
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
            if parents.get((file, factory)) is not tree: continue
            for statement in factory.body:
                if not isinstance(statement, (ast.Assign, ast.AnnAssign)) or not isinstance(statement.value, ast.Call): continue
                targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
                if len(targets) != 1 or not isinstance(targets[0], ast.Name): continue
                owner = targets[0].id
                if len(stores(file, factory).get(owner, [])) != 1: continue
                constructor_conditions = constructor(file, factory, statement.value.func, "APIRouter")
                router_prefix = prefix(statement.value)
                if constructor_conditions is None or router_prefix is None or statement.value.args: continue
                returns = [node for node in local_nodes(factory) if isinstance(node, ast.Return)]
                if not any(isinstance(node.value, ast.Name) and node.value.id == owner for node in returns): continue
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
        values = stores(file, trees[file]).get(expression.func.id, [])
        if len(values) != 1: return None
        kind, binding, exported = values[0]
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
            if not node.value.args and constructor(file, tree, node.value.func, "FastAPI") is not None: apps[name] = node
        if not apps: continue
        for node in local_nodes(tree):
            if (not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != "include_router"
                    or not isinstance(node.func.value, ast.Name) or node.func.value.id not in apps or len(node.args) != 1): continue
            mount_prefix = prefix(node)
            if mount_prefix is None: continue
            bound = called_factory(file, node.args[0], node.lineno)
            if bound is None: continue
            key, descriptor, import_conditions = bound
            conditions = [*import_conditions, *descriptor["conditions"], *controls(file, node, tree)]
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


def python_routes(paths):
    rows, unknown, trees = [], [], {}
    for file in paths:
        if not file.endswith(".py") or not file.startswith(("server/", "external/")): continue
        try: tree = ast.parse((ROOT / file).read_text())
        except (SyntaxError, UnicodeError) as error:
            unknown.append({"kind": "python-parse-diagnostic", "file": file, "line": getattr(error, "lineno", None)})
            continue
        trees[file] = tree
        owners = {}
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                value = node.value
                if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id in ("FastAPI", "APIRouter", "Flask", "Blueprint"):
                    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                    for target in targets:
                        if isinstance(target, ast.Name): owners[target.id] = value.func.id
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): continue
            for decorator in node.decorator_list:
                if not isinstance(decorator, ast.Call) or not isinstance(decorator.func, ast.Attribute): continue
                owner = decorator.func.value.id if isinstance(decorator.func.value, ast.Name) else "unresolved"
                if owner not in owners: continue
                method = decorator.func.attr
                if method not in METHODS | {"api_route", "route", "websocket"}: continue
                arg = decorator.args[0] if decorator.args else None
                path = arg.value if isinstance(arg, ast.Constant) and isinstance(arg.value, str) else None
                methods = [method.upper()] if method in METHODS else ["WEBSOCKET" if method == "websocket" else "UNRESOLVED"]
                for keyword in decorator.keywords:
                    if keyword.arg == "methods":
                        try: methods = [str(item).upper() for item in ast.literal_eval(keyword.value)]
                        except (ValueError, TypeError): pass
                for verb in methods:
                    rows.append({"file": file, "line": decorator.lineno, "method": verb, "path": path,
                                 "processScope": "python-declared:" + file, "confidence": "declared-only; mount prefix unverified",
                                 "receiver": owner, "handler": node.name, "mountResolved": owners[owner] in ("FastAPI", "Flask")})
    mounted, mount_unknown = python_factory_mounts(trees)
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
    return expanded, unknown + mount_unknown


def native_routes(paths):
    rows = []
    for file in paths:
        if Path(file).suffix not in (".rs", ".go"): continue
        text = (ROOT / file).read_text(errors="replace")
        patterns = [(r'\.route\(\s*"([^"\n]+)"\s*,\s*(get|post|put|patch|delete|head|options)\s*\(', "rust-axum")]
        if file.endswith(".go"):
            patterns = [(r'\.HandleFunc\(\s*"([^"\n]+)"', "go-handler")]
        for pattern, kind in patterns:
            for match in re.finditer(pattern, text):
                path = match.group(1); method = match.group(2).upper() if kind == "rust-axum" else "UNRESOLVED"
                if kind == "go-handler" and not path.startswith("/"):
                    # The authoritative DNS multiplexer accepts DNS names, not HTTP paths.
                    rows.append({"file": file, "line": text.count("\n", 0, match.start()) + 1, "path": path,
                                 "method": "DNS", "processScope": kind + ":" + file, "confidence": "declared DNS handler", "mountResolved": True})
                else:
                    rows.append({"file": file, "line": text.count("\n", 0, match.start()) + 1, "path": path,
                                 "method": method, "processScope": kind + ":" + file, "confidence": "lexical declaration; mount/method completeness unverified", "mountResolved": kind == "rust-axum"})
    return rows


def import_closure(file, graph):
    visited, pending = set(), [file]
    while pending:
        name = pending.pop()
        if name in visited: continue
        visited.add(name)
        pending.extend(graph.get(name, []))
    return visited


def add_checks(subject, kinds, test_path, command):
    subject["requiredChecks"] = [{"id": subject["id"] + "/" + kind, "template": kind, "status": "UNVERIFIED"} for kind in kinds]
    subject["status"] = "UNVERIFIED"
    subject["addTest"] = {"suggestedPath": test_path, "command": command, "cwd": ".",
                          "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check."}


def backend_test_plan(subject, slug):
    origin = subject["origin"]
    if origin == "python-decorator-ast":
        file = f"external/maxcore/artifacts/ai-training-server/tests/test_{slug.replace('-', '_')}_acceptance.py"
        return file, f"python3 scripts/testing/run-python-suites.py --file {file}", "python-loopback-router"
    if origin == "native-source-declaration" and subject["source"]["file"].endswith(".rs"):
        file = f"boosterstate/tests/{slug.replace('-', '_')}_acceptance.rs"
        return file, f"cargo test --locked --manifest-path boosterstate/Cargo.toml --test {slug.replace('-', '_')}_acceptance", "native-rust"
    if origin == "native-source-declaration":
        folder = str(Path(subject["source"]["file"]).parent)
        file = folder + f"/{slug.replace('-', '_')}_acceptance_test.go"
        return file, f"go -C {folder} test -count=1 ./...", "native-go"
    if origin == "typescript-router-ast" and subject["source"]["file"].startswith("external/"):
        file = f"tests/{slug}-imported-api-acceptance.test.mjs"
        return file, f"node --import tsx --test {file}", "imported-api-loopback"
    file = f"tests/integration/{slug}-acceptance.test.ts"
    return file, f"node scripts/testing/integration-browser.mjs {file}", "main-http"


def coverage_records(directory):
    final = read_json(directory / "coverage-final.json", {})
    rows = []
    for original, data in sorted(final.items()):
        path = Path(original)
        try: file = str(path.relative_to(ROOT)) if path.is_absolute() else str(path)
        except ValueError: file = str(path)
        statements = data.get("s", {}); functions = data.get("f", {}); branches = data.get("b", {})
        uncovered_functions = []
        for key, hits in functions.items():
            if hits: continue
            function = data.get("fnMap", {}).get(key, {})
            uncovered_functions.append({"name": function.get("name"), "line": function.get("decl", function.get("loc", {})).get("start", {}).get("line")})
        uncovered_lines = sorted({data.get("statementMap", {}).get(key, {}).get("start", {}).get("line") for key, hits in statements.items() if not hits} - {None})
        rows.append({"file": file, "statements": {"covered": sum(bool(value) for value in statements.values()), "total": len(statements)},
                     "functions": {"covered": sum(bool(value) for value in functions.values()), "total": len(functions)},
                     "branches": {"covered": sum(bool(value) for values in branches.values() for value in values), "total": sum(len(values) for values in branches.values())},
                     "uncoveredFunctions": uncovered_functions, "uncoveredStatementLines": uncovered_lines,
                     "scope": "Actual V8/Istanbul execution coverage; not proof of business acceptance"})
    return rows


def render(report):
    summary = report["summary"]
    lines = ["# Platform feature and coverage register", "", "**Gate: " + report["gate"]["status"] + ".** " + report["gate"]["reason"], "",
             "This source register and the machine JSON distinguish declarations, static associations, actual line/function execution and explicit behavioral acceptance. No source match or page render is promoted to full feature verification.", "",
             "| Surface | Count |", "| --- | ---: |"]
    for key, value in summary.items(): lines.append(f"| {key} | {value} |")
    lines += ["", "## Routed pages", "", "Each row links to its source and names the next test to add. The JSON retains every exact required-check ID, reachable source file, UI control, API call and candidate test association.", "",
              "| Route | Component/source | Direct controls | API calls | Candidate tests | Acceptance | Next test |", "| --- | --- | ---: | ---: | ---: | --- | --- |"]
    for page in report["pages"]:
        source = page["source"]
        lines.append(f"| `{page['path']}` | `{page['component']}` — `{source['file']}:{source['line']}` | {len(page['uiInteractionIds'])} | {len(page['frontendContractIds'])} | {len(page['testCandidates'])} static candidates | {page['status']} | `{page['addTest']['suggestedPath']}` |")
    lines += ["", "## Backend domains", "", "Every method/path registration, source location, mount uncertainty and acceptance requirement is retained in `platform-register.json`. These counts include imported TypeScript/Python services and native service declarations; unresolved mounts are not assumed to be live paths.", "",
              "| Domain | Registrations | Source files | Checks not closed |", "| --- | ---: | ---: | ---: |"]
    by_domain = defaultdict(list)
    for route in report["backendRoutes"]: by_domain[route["domain"]].append(route)
    for domain, routes in sorted(by_domain.items()):
        lines.append(f"| `{domain}` | {len(routes)} | {len({r['source']['file'] for r in routes})} | {sum(c['status'] != 'PASS' for r in routes for c in r['requiredChecks'])} |")
    lines += ["", "## What to add when a feature is incomplete", "",
              "1. Locate the page/route/control ID in the JSON and open its exact source location. Use `testCandidates` only to find existing assertions; an import or a matching URL is not behavioral proof.",
              "2. Add a real assertion for each applicable required-check template below. Use the suggested test path and command attached to the subject. Use separate fixture users for access/tenant checks and real disposable storage for durability assertions.",
              "3. Run the scoped suite, retain its case result and source digests, then add an exact entry to the optional acceptance map. The gate accepts a link only when that exact case currently passed and the platform/test source digests still match.",
              "4. For `unknownMappings`, resolve the computed route/mount or runtime-generated UI declaration and add an explicit case; do not silently delete the declaration or lower assertions to close the register.", ""]
    for key, requirement in CHECKS.items(): lines += [f"- **`{key}`:** {requirement}"]
    lines += ["", "## Actual source execution coverage", ""]
    if report["sourceCoverage"]:
        lines += ["Coverage comes from the supplied V8/Istanbul `coverage-final.json`. Uncovered functions and statement lines are available per file in the JSON. A covered line can still have untested roles, inputs, business states and dependency failures.", "",
                  "| Source | Statements hit/total | Functions hit/total | Uncovered functions |", "| --- | ---: | ---: | ---: |"]
        uncovered = [row for row in report["sourceCoverage"] if row["uncoveredFunctions"] or row["uncoveredStatementLines"]]
        for row in sorted(uncovered, key=lambda value: (len(value["uncoveredFunctions"]), len(value["uncoveredStatementLines"])), reverse=True)[:50]:
            if not row["uncoveredFunctions"] and not row["uncoveredStatementLines"]: continue
            lines.append(f"| `{row['file']}` | {row['statements']['covered']}/{row['statements']['total']} | {row['functions']['covered']}/{row['functions']['total']} | {len(row['uncoveredFunctions'])} |")
        lines += ["", f"The table shows at most 50 files with the largest uncovered surfaces. All {len(report['sourceCoverage'])} measured files, exact function names and uncovered statement lines remain in the machine register."]
    else:
        lines += ["No readable Istanbul final coverage artifact was supplied. Source execution coverage remains UNVERIFIED; run the platform coverage configuration before claiming line/function coverage."]
    lines += ["", "## Limits", ""] + ["- " + text for text in report["limits"]]
    return "\n".join(lines) + "\n"


def self_test():
    """Exercise real parser behavior on source fixtures, without executing them."""
    with tempfile.TemporaryDirectory(prefix="platform-register-parser-") as temporary:
        root = Path(temporary)
        fixtures = {
            "client/src/App.tsx": 'import {lazy} from "react"; const Page=lazy(()=>import("@/pages/Page")); export default ()=> <><Route path="/page" component={Page}/><Route path="/inline" component={()=> <Page/>}/></>;',
            "client/src/pages/Page.tsx": 'export default ()=> <><Button onClick={save}>First</Button><Button onClick={save}>Second</Button><input name="title"/><div {...props}/></>;',
            "server/index.ts": 'import express from "express"; import router from "./routes"; const app=express(); app.use("/api",router); app.get("/health", handler);',
            "server/routes.ts": 'import {Router} from "express"; const router=Router(); router.post("/items",handler); router.get(computedPath(),handler); export default router;',
        }
        for file, text in fixtures.items():
            target = root / file; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text)
        extractor = NODE_EXTRACTOR.replace("require('typescript')", "require(" + json.dumps(str(ROOT / "node_modules/typescript")) + ")")
        result = subprocess.run(["node", "-e", extractor], cwd=root, input=json.dumps(sorted(fixtures)), capture_output=True, text=True, timeout=30)
        if result.returncode: raise AssertionError(result.stderr[-1000:])
        parsed = json.loads(result.stdout)
        assert len(parsed["pages"]) == 2
        assert all(page["sourceFile"] == "client/src/pages/Page.tsx" and page["componentBindingResolved"] for page in parsed["pages"])
        buttons = [row for row in parsed["interactions"] if row["tag"] == "Button"]
        assert len(buttons) == 2 and buttons[0]["column"] != buttons[1]["column"]
        assert buttons[0]["eventBindings"] == [{"event": "onClick", "expressionKind": "Identifier", "handler": "save"}]
        assert len(parsed["interactions"]) == 3  # Plain noninteractive div is not invented as a control.
        assert len(parsed["routes"]) == 3 and any(row["method"] == "POST" and row["path"] == "/items" for row in parsed["routes"])
        assert any(row["kind"] == "dynamic-backend-path" for row in parsed["unknown"])
        assert parsed["mounts"] == [{"from": "server/index.ts::app", "toFile": "server/routes.ts", "toExport": "default", "prefix": "/api", "file": "server/index.ts", "line": 1}]
    print("PASS: platform parser preserves page bindings, distinct controls/events, router mounts and unresolved paths without executing source")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "reports/test-verification", help="Existing catalog, file-status and case-results directory")
    parser.add_argument("--output", type=Path, help="Output directory; defaults to --input")
    parser.add_argument("--coverage", type=Path, help="Directory containing Istanbul coverage-final.json; default <input>/coverage")
    parser.add_argument("--acceptance-map", type=Path, default=ROOT / "tests/platform-acceptance-map.json")
    parser.add_argument("--strict", action="store_true", help="Exit 1 unless all source surfaces have passing exact-case evidence and no unresolved mappings")
    parser.add_argument("--self-test", action="store_true", help="Run isolated parser fixture assertions without a platform scan")
    args = parser.parse_args()
    if args.self_test: return self_test()
    incoming = args.input.resolve(); output = (args.output or incoming).resolve(); output.mkdir(parents=True, exist_ok=True)
    audit_file = ROOT / "reports/endpoint-audit.json"
    audit = read_json(audit_file, {})
    inventory = read_json(incoming / "test-inventory.json", {"entries": []})
    execution = {row["file"]: row for row in read_json(incoming / "file-status.json", [])}
    test_entries = {row["path"]: row for row in inventory["entries"] if row["category"] == "test"}
    source = source_paths(); ts_files = parsed_ts_paths(source, list(test_entries))
    node = subprocess.run(["node", "-e", NODE_EXTRACTOR], cwd=ROOT, input=json.dumps(ts_files), capture_output=True, text=True, timeout=120)
    if node.returncode:
        print("Platform AST extraction failed: " + node.stderr[-1200:], file=sys.stderr)
        return 2
    parsed = json.loads(node.stdout)
    graph = {row["file"]: row["dependencies"] for row in parsed["files"]}
    by_file = {row["file"]: row for row in parsed["files"]}
    test_refs = {}
    literal_url_tests = defaultdict(set)
    for file in test_entries:
        text = (ROOT / file).read_text(errors="replace")
        for match in re.finditer(r'''(['"`])(/[^'"`\r\n]+)\1''', text):
            literal_url_tests[match.group(2)].add(file)
        own = by_file.get(file, {})
        test_refs[file] = import_closure(file, graph) | set(own.get("references", []))
    candidates_by_source = defaultdict(list)
    for file, refs in test_refs.items():
        for target in refs:
            if target != file: candidates_by_source[target].append({"path": file, "association": "static-import-or-literal-source-reference", "executionStatus": execution.get(file, {}).get("status", "not_run")})

    source_hashes = {file: digest(ROOT / file) for file in source if Path(file).suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".json", ".toml", ".html", ".css", ".scss", ".sh", ".nix", ".yaml", ".yml", ".lock", ".mod", ".sum"} or file == ".replit"}
    platform_digest = hashlib.sha256(json.dumps(source_hashes, sort_keys=True).encode()).hexdigest()
    source_set = set(source)
    pages, interactions, routes, contracts, unknown = [], [], [], [], [row for row in parsed["unknown"] if row["file"] in source_set]

    for raw in parsed["interactions"]:
        if raw["file"] not in source_set: continue
        item = {"id": identifier("ui", raw["file"], raw["line"], raw["column"], raw["tag"], raw["eventBindings"]),
                "source": {**location(raw["file"], raw["line"]), "column": raw["column"]}, **{key: raw[key] for key in ("tag", "labels", "eventBindings", "spreadAttributeLines")},
                "testCandidates": candidates_by_source[raw["file"]]}
        slug = re.sub(r"[^a-z0-9]+", "-", Path(raw["file"]).stem.lower()).strip("-")
        target = f"tests/browser/{slug}.test.mjs"
        add_checks(item, ["control-behavior", "control-failure"], target, f"node --import tsx --test {target}")
        item["addTest"]["fixtureTemplate"] = "browser-control"
        interactions.append(item)
    interactions_by_file = defaultdict(list)
    for item in interactions: interactions_by_file[item["source"]["file"]].append(item["id"])

    registered = set()
    route_scopes = defaultdict(set)
    for raw in audit.get("backendRoutes", []):
        route_scopes[(raw["file"], raw["line"], raw["method"], raw.get("fullPath") or raw.get("rawPath"))].add(raw.get("processScope"))
    for raw in audit.get("backendRoutes", []):
        file = raw["file"]; line = raw["line"]; path = raw.get("fullPath") or raw.get("rawPath")
        item = {"id": audit_route_identity(raw, route_scopes), "method": raw["method"], "path": path,
                "source": location(file, line), "processScope": raw.get("processScope"), "confidence": raw.get("confidence"),
                "mountResolved": audit_mount_resolved(raw), "hasAuthMarker": raw.get("hasAuthMarker"), "origin": "main-endpoint-audit"}
        routes.append(item); registered.add((file, line, raw["method"]))
    # Resolve declared imported TypeScript mount graphs without pretending that
    # a router lacking an entrypoint is definitely mounted at the root.
    mount_edges = defaultdict(list); prefixes = defaultdict(set)
    for raw in parsed["mounts"]:
        if raw["file"] not in source_set: continue
        target = raw.get("to")
        if not target:
            target_file = by_file.get(raw["toFile"], {})
            exported = target_file.get("exports", {}).get(raw["toExport"])
            if exported: target = raw["toFile"] + "::" + exported
        if target:
            mount_edges[raw["from"]].append((target, raw["prefix"]))
        else: unknown.append({"kind": "unresolved-router-mount", **raw})
    pending = deque()
    for file, info in by_file.items():
        if file.startswith("tests/"): continue
        for router, kind in info["routers"].items():
            key = file + "::" + router
            if kind == "app": prefixes[key].add(""); pending.append((key, "", 0))
    while pending:
        key, prefix, depth = pending.popleft()
        if depth >= 12: continue
        for target, extra in mount_edges[key]:
            full = (prefix.rstrip("/") + "/" + extra.lstrip("/")).rstrip("/")
            if full not in prefixes[target]: prefixes[target].add(full); pending.append((target, full, depth + 1))
    for raw in parsed["routes"]:
        if raw["file"] not in source_set or (raw["file"], raw["line"], raw["method"]) in registered: continue
        key = raw["file"] + "::" + raw["receiver"]
        bases = prefixes.get(key) or {None}
        for base in sorted(bases, key=lambda value: value or ""):
            path = (base.rstrip("/") + "/" + raw["path"].lstrip("/")) if base is not None and raw["path"] else raw["path"]
            routes.append({"id": identifier("api", raw["file"], raw["line"], raw["method"], path, base),
                           "method": raw["method"], "path": path, "source": location(raw["file"], raw["line"]),
                           "processScope": "typescript-declared:" + raw["file"], "confidence": raw["confidence"],
                           "mountResolved": base is not None and bool(path), "origin": "typescript-router-ast"})
    python, python_unknown = python_routes(source); unknown += python_unknown
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
        routes.append(item)
    route_by_location = defaultdict(list)
    for item in routes:
        file = item["source"]["file"]; path = item["path"] or "<computed>"
        bits = [part for part in path.split("/") if part and part != "api"]
        item["domain"] = (item["origin"] + "/" + (bits[0] if bits else "root"))
        kinds = ["response-contract", "access-policy", "input-boundaries", "tenant-boundary", "dependency-failure"]
        if item["method"] == "DNS": kinds = ["dns-wire-contract", "input-boundaries", "dependency-failure"]
        if item["method"] in {"POST", "PUT", "PATCH", "DELETE"}: kinds.append("mutation-durability")
        if item["method"] == "DELETE": kinds.append("deletion-durability")
        if re.search(r"webhook|callback", path, re.I): kinds.append("callback-integrity")
        if re.search(r"ready|readiness|health", path, re.I): kinds.append("readiness-truth")
        if re.search(r"generat|audio|video|image|render", path, re.I): kinds.append("artifact-integrity")
        slug = re.sub(r"[^a-z0-9]+", "-", bits[0].lower() if bits else "root").strip("-")
        test_path, test_command, fixture = backend_test_plan(item, slug)
        add_checks(item, kinds, test_path, test_command)
        item["addTest"]["fixtureTemplate"] = fixture
        if fixture == "main-http":
            item["addTest"]["requiredConfigChanges"] = [f"Add {test_path} to test.include in vitest.integration.config.ts before selecting it with the isolated wrapper."]
        item["testCandidates"] = list(candidates_by_source[file])
        if item["path"]:
            present = {row["path"] for row in item["testCandidates"]}
            item["testCandidates"] += [{"path": test, "association": "exact-route-literal-only", "executionStatus": execution.get(test, {}).get("status", "not_run")}
                                       for test in sorted(literal_url_tests.get(item["path"], set()) - present)]
        if not item["mountResolved"]: unknown.append({"kind": "unverified-route-mount", "subjectId": item["id"], **item["source"], "declaredPath": item["path"]})
        route_by_location[(file, item["source"]["line"], item["method"])].append(item["id"])

    contracts_by_file = defaultdict(list)
    for raw in audit.get("frontendCalls", []):
        item = {"id": identifier("call", raw["file"], raw["line"], raw.get("method"), raw.get("path")),
                "source": location(raw["file"], raw["line"]), "method": raw.get("method"), "path": raw.get("path"),
                "topologyStatus": raw.get("status"), "methodConfidence": raw.get("methodConfidence"), "backendRouteIds": []}
        for match in raw.get("backendMatches", []): item["backendRouteIds"] += route_by_location.get((match["file"], match["line"], match["method"]), [])
        item["backendRouteIds"] = sorted(set(item["backendRouteIds"])); item["behavioralAcceptance"] = "UNVERIFIED"
        if not item["backendRouteIds"]: unknown.append({"kind": "frontend-api-contract-unmapped", "subjectId": item["id"], **item["source"], "method": item["method"], "path": item["path"]})
        contracts.append(item); contracts_by_file[raw["file"]].append(item)
    for raw in parsed["pages"]:
        file = raw["sourceFile"]; reachable = {file} if file == "client/src/App.tsx" else import_closure(file, graph)
        calls = [call for target in reachable for call in contracts_by_file[target]]
        source_line = raw["registration"]["line"] if file == "client/src/App.tsx" else 1
        page = {"id": identifier("page", raw["path"], raw["component"]), "path": raw["path"], "component": raw["component"],
                "source": location(file, source_line), "registration": raw["registration"], "componentBindingResolved": raw["componentBindingResolved"],
                "reachableSourceFiles": sorted(reachable), "uiInteractionIds": sorted({key for target in reachable for key in interactions_by_file[target]}),
                "frontendContractIds": sorted({call["id"] for call in calls}), "backendRouteIds": sorted({key for call in calls for key in call["backendRouteIds"]}),
                "testCandidates": candidates_by_source[file]}
        slug = re.sub(r"[^a-z0-9]+", "-", str(raw["path"]).lower()).strip("-") or "landing"
        target = f"tests/browser/{slug}-acceptance.test.mjs"
        add_checks(page, ["page-states", "page-access", "page-persistence"], target, f"node --import tsx --test {target}")
        page["addTest"]["fixtureTemplate"] = "browser-page"
        pages.append(page)

    source_coverage = coverage_records((args.coverage or incoming / "coverage").resolve())
    cases = read_json(incoming / "case-results.json", [])
    cases = cases if isinstance(cases, list) else []
    from common import source_inputs
    passed_cases, incoming_execution = collect_current_passing_cases(incoming, source_inputs(), root=ROOT)
    acceptance = read_json(args.acceptance_map, {"checks": []}); invalid_evidence = []
    mappings = list(acceptance.get("checks", []))
    # Test reporters may emit check IDs themselves. These automated links do
    # not require a separate manifest, reviewer identity or approval.
    for case in cases:
        if not isinstance(case, dict) or case.get("status") != "passed": continue
        reported_checks = case.get("platformChecks", case.get("checkIds", []))
        if not isinstance(reported_checks, list): continue
        for check_id in reported_checks:
            mappings.append({"checkId": check_id, "platformSourceDigest": case.get("platformSourceDigest"),
                             "testFile": case.get("file"), "testSha256": case.get("testSha256"),
                             "caseName": case.get("name"), "group": case.get("group")})
    checks_by_id = {check["id"]: check for subject in pages + routes + interactions for check in subject["requiredChecks"]}
    if len(checks_by_id) != sum(len(subject["requiredChecks"]) for subject in pages + routes + interactions):
        raise ValueError("Duplicate subject/check IDs: refusing to silently merge separate source declarations")
    for mapping in mappings:
        cases = resolve_evidence_cases(mapping, check_ids=checks_by_id, platform_digest=platform_digest,
                                       test_entries=test_entries, passed_cases=passed_cases)
        if cases:
            evidence = {"cases": cases, "mode": "all-cases-required"} if "cases" in mapping else cases[0]
            checks_by_id[mapping["checkId"]].update(status="PASS", evidence=evidence)
        else: invalid_evidence.append({"checkId": mapping.get("checkId") if isinstance(mapping, dict) else None,
                                      "reason": "Unknown check, changed source/test digest, or no exact passing case bound to current unchanged execution; see evidenceProvenance"})
    for subject in pages + routes + interactions:
        subject["status"] = "PASS" if all(check["status"] == "PASS" for check in subject["requiredChecks"]) else "UNVERIFIED"
    pending = sum(check["status"] != "PASS" for check in checks_by_id.values())
    reachable_ui = {key for page in pages for key in page["uiInteractionIds"]}
    for interaction in interactions:
        interaction["reachableFromRoutedPageImports"] = interaction["id"] in reachable_ui
    report = {"schemaVersion": 1, "sourceRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "platformSourceDigest": platform_digest, "sourceInputsSha256": source_hashes,
              "inputArtifactsSha256": {str(file.relative_to(ROOT)) if file.is_relative_to(ROOT) else str(file): digest(file)
                                       for file in (audit_file, incoming / "test-inventory.json", incoming / "file-status.json", incoming / "case-results.json") if file.is_file()},
              "summary": {"routedPageDeclarations": len(pages), "uiInteractionDeclarations": len(interactions), "backendRegistrations": len(routes),
                          "frontendApiContracts": len(contracts), "scannedTypeScriptJavaScriptFiles": len(parsed["files"]), "actualCoverageFiles": len(source_coverage),
                          "requiredChecks": len(checks_by_id), "unverifiedChecks": pending, "unknownMappings": len(unknown), "invalidEvidenceLinks": len(invalid_evidence)},
              "gate": {"status": "PASS" if not pending and not unknown and not invalid_evidence and source_coverage else "UNVERIFIED",
                       "reason": "All required checks need exact current passing-case links, resolved mappings and actual execution coverage; static source matches do not close feature acceptance."},
              "checkTemplates": CHECKS,
              "fixtureTemplates": {
                  "browser-control": "Use real Chromium events and the actual component. Supply controlled read/error data and verify actual requests, cancellation and visible states. Add the tracked node:test file; the canonical Node runner discovers it automatically.",
                  "browser-page": "Use the real page in an isolated app/browser fixture with separate users. Verify every applicable action and persisted outcome; a page render alone does not close business checks.",
                  "main-http": "Add the suggested file to vitest.integration.config.ts test.include. The isolated wrapper supplies disposable SQL/app and TEST_BASE_URL; never hardcode the developer port or database.",
                  "python-loopback-router": "Exercise the actual imported Python handler/router in a disposable fixture on an ephemeral loopback port, with generated local-channel auth where required. Do not import the unbounded full server, use live fixed ports, or fabricate model readiness/quality.",
                  "imported-api-loopback": "Use the actual imported Express router and disposable PostgreSQL/fabric. Follow run-pdim-smoke.mjs isolation and egress guards; do not start corpus download schedulers or aim mutations at a deployed service.",
                  "native-rust": "Use Cargo integration tests and temporary state. Start the verified sidecar on an ephemeral port when HTTP behavior is required; assert real durable/error behavior and stop only owned processes.",
                  "native-go": "Run the Go package's tests with in-memory DNS messages and temporary/listening fixture state as applicable. Assert wire response/security/error behavior; external authoritative DNS is a separate deployment check.",
              },
              "pages": pages, "backendRoutes": routes, "frontendContracts": contracts, "interactions": interactions,
              "sourceCoverage": source_coverage, "unknownMappings": unknown, "invalidEvidenceLinks": invalid_evidence,
              "evidenceProvenance": incoming_execution,
              "evidenceLinking": {"automaticCaseFields": ["platformChecks", "checkIds", "platformSourceDigest", "testSha256"],
                                  "optionalAcceptanceMap": str(args.acceptance_map.relative_to(ROOT)) if args.acceptance_map.is_relative_to(ROOT) else str(args.acceptance_map),
                                  "conjunctiveCaseBundles": "An explicit cases array requires every unique exact case to pass with the current test hash and shared platformSourceDigest; no partial bundle closes a check.",
                                  "approvalOrSignatureRequired": False,
                                  "meaning": "Links bind automated passing case evidence to named requirements; absent links mean unverified behavior, not a request for human approval."},
              "limits": ["Source declarations and import reachability do not prove that code executed or that business assertions cover it.",
                         "The endpoint audit resolves main-server topology; imported declarations with unproven mounts retain that uncertainty.",
                         "JSX controls/event bindings are indexed; runtime-generated controls, DOM mutation and data-dependent interactions still need explicit behavioral cases.",
                         "An unreferenced component or unresolved mount may be retained/retired source rather than an active feature. Prove its runtime admission or exclusion before treating it as a current production gap.",
                         "Route/UI requirements are a minimum test plan; domain-specific financial, legal, media-quality and provider semantics need their own assertions.",
                         "V8 coverage covers instrumented JavaScript/TypeScript only; Python, Go and Rust remain separate test/evidence scopes.",
                         "No production readiness, provider delivery, model quality, native VST3 processing or Replit deployment is inferred from this register."]}
    (output / "platform-register.json").write_text(json.dumps(report, indent=2) + "\n")
    (output / "platform-register.md").write_text(render(report))
    print(json.dumps({"gate": report["gate"]["status"], **report["summary"]}))
    return 1 if args.strict and report["gate"]["status"] != "PASS" else 0


if __name__ == "__main__":
    raise SystemExit(main())
