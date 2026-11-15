"""Validate this report's actual inputs/identities; never claim product passage."""
import hashlib
import json
from pathlib import Path
import re
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
load = lambda file: json.loads(file.read_text())
digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
data = load(OUT / "entries.json")
register = load(ROOT / "reports/test-verification/platform-register.json")
plan = load(ROOT / "reports/test-verification/completion-plan.json")
python = load(OUT / "python-router-trace.json")
selected = load(OUT / "source-hashes.json")["files"]
rows = data["entries"]
checks = []

def check(name, condition, details=None):
    checks.append({"name": name, "status": "PASS" if condition else "FAIL", "details": details})

check("All130 original warnings retained in order", [r["originalUnknownEntry"] for r in rows] == register["unknownMappings"] and len(rows) == 130)
check("All exact existing mapping work IDs retained", [r["existingWorkItemId"] for r in rows] == [name + "/resolve" for name in plan["entityIds"]["unknownMappings"]])
check("All identities and indexes unique", len({r["existingWorkItemId"] for r in rows}) == 130 and [r["unknownIndex"] for r in rows] == list(range(130)))
check("All source classification entries have required execution fields", all(all(key in r for key in ("rootCause", "requiredFix", "dependencies", "executionOrder", "risk", "validationCriteria", "productionAcceptanceCriteria", "sourceCitations")) for r in rows))
errors = [name for name, sha in selected.items() if not (ROOT / name).is_file() or digest(ROOT / name) != sha]
check("Every selected source and input artifact hash matches", not errors, {"checkedFiles": len(selected), "changedOrMissing": errors})
lines = {}
citations = [c for r in rows for c in r["sourceCitations"]]
citations += [c for finding in load(OUT / "confirmed-findings.json")["items"] for c in finding["sourceCitations"]]
citations += load(OUT / "cross-process-example.json")["sourceCitations"]
bad = []
for citation in citations:
    name = citation["file"]
    if name not in lines:
        lines[name] = (ROOT / name).read_text().splitlines()
    start, end = citation["startLine"], citation["endLine"]
    expected = "\n".join(lines[name][start - 1:end])
    # The subordinate Python trace uses line numbers plus an excerpt and hash;
    # every retained citation uses the same explicitly bounded representation.
    wanted = citation.get("sourceSha256", citation.get("sha256"))
    if not (1 <= start <= end <= len(lines[name])) or citation["excerpt"] != expected or wanted != digest(ROOT / name):
        bad.append({"file": name, "startLine": start, "endLine": end})
check("Every bounded source citation matches actual bytes", not bad, {"checkedCitations": len(citations), "mismatches": bad})
check("All19 Python exact warnings retained", len(python["entries"]) == 19 and [r["originalUnknownEntry"] for r in python["entries"]] == register["unknownMappings"][111:130])
check("All19 Python paths included without behavior promotion", all(rows[r["unknownIndex"]]["staticallyResolvedPaths"] == [r["staticallyResolvedPath"]] and r["behaviorAcceptance"] == "UNVERIFIED" for r in python["entries"]))
check("All six Director conditional mounts remain conditional", sum(bool(r["mountConditional"]) for r in python["entries"]) == 6 and all("Director" in r["availabilityCondition"] for r in python["entries"] if r["mountConditional"]))
check("Both confirmed topology defects retain exact current records", len(load(OUT / "confirmed-findings.json")["items"]) == 2 and all(len(r["actualIncorrectRecords"]) == 2 for r in load(OUT / "confirmed-findings.json")["items"]))
check("All45 already-expanded MaxCore paths preserved", len(rows[11]["staticallyResolvedPaths"]) == 45 and set(rows[11]["staticallyResolvedPaths"]) == {r["path"] for r in register["backendRoutes"] if r["source"] == {"file": "server/routes/maxcoreProxy.ts", "line": 523}})
check("No product behavior or page passed by this source trace", data["summary"]["behaviorChecksClosed"] == 0 and data["summary"]["missingProductionHandlersProven"] == 0 and all(r["behavioralAcceptance"] == "UNVERIFIED" and r["productionReady"] is False for r in rows))
spec = load(OUT / "next-patch-spec.json")
check("Next patch remains explicit seven-step unimplemented plan", len(spec["steps"]) == 7 and spec["status"] == "PLANNED_NOT_IMPLEMENTED" and not spec["productionReady"])

result = {"schemaVersion": 1, "scope": "Actual report-integrity observations; not product tests or launch approval", "productionReady": False, "checks": checks}
(OUT / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
# The manifest is an output below; make its path available for the exact local
# documentation link observation before writing the final hashed manifest.
manifest_file = OUT / "manifest.json"
if not manifest_file.exists():
    manifest_file.write_text("{}\n")
bad_links = []
link_count = 0
for file in [ROOT / "docs/testing/mapping-blocker-trace.md", OUT / "README.md", OUT / "trace-matrix.md"]:
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", file.read_text()):
        if "://" in target or target.startswith("#"):
            continue
        target = target.split("#", 1)[0]
        link_count += 1
        if not (file.parent / target).resolve().exists():
            bad_links.append({"file": str(file.relative_to(ROOT)), "target": target})
check("Every local documentation link resolves", not bad_links, {"checkedLinks": link_count, "broken": bad_links})
result.update(status="PASS" if all(r["status"] == "PASS" for r in checks) else "FAIL", checks=checks)
(OUT / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
artifacts = [{"path": str(file.relative_to(OUT)), "bytes": file.stat().st_size, "sha256": digest(file)}
             for file in sorted(OUT.rglob("*")) if file.is_file() and file != manifest_file and "__pycache__" not in file.parts]
manifest_file.write_text(json.dumps({"schemaVersion": 1, "scope": "Every retained source-trace cohort artifact; not runtime application acceptance", "artifacts": artifacts}, indent=2) + "\n")
print(json.dumps({"status": result["status"], "reportIntegrityChecks": len(checks), "failed": [r["name"] for r in checks if r["status"] != "PASS"], "artifacts": len(artifacts)}))
sys.exit(0 if result["status"] == "PASS" else 1)
