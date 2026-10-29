"""Read-only, pre-landing census and real selector check; write only outside repo."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shlex
import subprocess
import sys

sys.dont_write_bytecode = True
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--repo", type=Path, required=True)
parser.add_argument("--candidate", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
repo = args.repo.resolve()
output = args.output.resolve()
assert not output.is_relative_to(repo), "Audit output must be outside the repository"
output.mkdir(parents=True, exist_ok=True)


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def git(*arguments):
    return subprocess.check_output(["git", *arguments], cwd=repo, text=True).strip()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = repo
    return module


tracked = git("ls-files", "-z").split("\0")
protected = sorted(p for p in tracked if p and (repo / p).is_file() and (
    p.startswith(("scripts/testing/", "tests/testing/", "docs/testing/"))
    or p.startswith("reports/") and p.endswith((".json", ".md"))
    or p.startswith("vitest") and p.endswith(".ts")))
before = {p: digest(repo / p) for p in protected}
status_before = git("status", "--porcelain=v1")
head_before = git("rev-parse", "HEAD")
baseline = load("catalog_baseline_audit", repo / "scripts/testing/generate-catalog.py").collect()
candidate_module = load("catalog_candidate_audit", args.candidate.resolve())
candidate = candidate_module.collect()
historical = "reports/accessibility-audit/2026-10-28-sealed-startup/test-before.mjs"
baseline_rows = {r["path"]: r for r in baseline["entries"]}
candidate_rows = {r["path"]: r for r in candidate["entries"]}
baseline_snapshots = {r["path"]: r for r in baseline["generatedSnapshots"]}
candidate_snapshots = {r["path"]: r for r in candidate["generatedSnapshots"]}
sys.path.insert(0, str(repo / "scripts/testing"))
node = load("catalog_actual_node_audit", repo / "scripts/testing/run-node-suites.py")
node_paths = set(node.discover())
catalog_node_paths = {r["path"] for r in candidate["entries"] if r["group"] == "root-node"}
commands = {r["path"]: shlex.split(r["command"]) for r in candidate["entries"] if r["group"] == "root-node"}
assert all(command == ["python3", "scripts/testing/run-node-suites.py", "--file", path] for path, command in commands.items())
assert set(commands) == node_paths == catalog_node_paths
node_output = output / "must-not-be-created"
assert not node_output.exists()
command = [sys.executable, "-B", str(repo / "scripts/testing/run-node-suites.py"), "--file", historical, "--list", "--output", str(node_output)]
environment = {"PATH": "/workspace/.cloud-tools/node_modules/.bin:/workspace/.cloud-python/bin:/usr/bin:/bin", "HOME": str(output), "LANG": "C", "CI": "1", "PYTHONDONTWRITEBYTECODE": "1"}
rejected = subprocess.run(command, cwd=repo, env=environment, capture_output=True, text=True, timeout=30)
(output / "actual-node-report-selector.txt").write_text(rejected.stdout + rejected.stderr)
assert rejected.returncode == 2
assert "Not a canonical isolated Node test: " + historical in rejected.stderr
assert not node_output.exists()
admitted_command = [sys.executable, "-B", str(repo / "scripts/testing/run-node-suites.py"), "--list", "--output", str(node_output)]
for path in sorted(node_paths):
    admitted_command += ["--file", path]
admitted = subprocess.run(admitted_command, cwd=repo, env=environment, capture_output=True, text=True, timeout=30)
(output / "actual-node-current-selectors.json").write_text(admitted.stdout)
assert admitted.returncode == 0, admitted.stderr
assert set(json.loads(admitted.stdout)) == node_paths
assert not node_output.exists()
retained_from_entries = set(baseline_rows) - set(candidate_rows)
assert historical in retained_from_entries
assert all(path.startswith("reports/") for path in retained_from_entries)
assert set(candidate_rows) - set(baseline_rows) == set()
assert {p: row for p, row in baseline_rows.items() if p not in retained_from_entries} == candidate_rows
assert set(candidate_snapshots) - set(baseline_snapshots) == retained_from_entries
assert all(candidate_snapshots[p] == row for p, row in baseline_snapshots.items())
assert candidate_snapshots[historical]["sha256"] == baseline_rows[historical]["sha256"] == digest(repo / historical)
assert all(candidate_snapshots[path]["sha256"] == baseline_rows[path]["sha256"] == digest(repo / path) for path in retained_from_entries)
assert baseline["supportFiles"] == candidate["supportFiles"]
assert baseline["workingTreeInputDigest"] == candidate["workingTreeInputDigest"]
before_counts = (baseline["counts"]["canonicalTestFiles"], baseline["counts"]["byGroup"]["root-node"], baseline["counts"]["retainedSnapshotFiles"])
after_counts = (candidate["counts"]["canonicalTestFiles"], candidate["counts"]["byGroup"]["root-node"], candidate["counts"]["retainedSnapshotFiles"])
assert before_counts == (642, 130, 71), before_counts
assert after_counts == (635, 124, 78), after_counts
after = {p: digest(repo / p) for p in protected}
assert before == after
assert status_before == git("status", "--porcelain=v1")
assert head_before == git("rev-parse", "HEAD")
receipt = {
    "purpose": "Pre-landing metadata regression only; no app, feature, provider, production or coverage execution proof",
    "sourceRevision": head_before,
    "sourceHashes": {p: before[p] for p in ("scripts/testing/generate-catalog.py", "scripts/testing/run-node-suites.py", "scripts/testing/common.py")},
    "candidateSha256": digest(args.candidate.resolve()),
    "baselineCounts": baseline["counts"], "candidateCounts": candidate["counts"],
    "unchangedTestInputDigest": candidate["workingTreeInputDigest"],
    "canonicalMovedToRetainedOnly": sorted(retained_from_entries),
    "movedSourceHashes": {path: candidate_snapshots[path]["sha256"] for path in sorted(retained_from_entries)},
    "historicalSha256": candidate_snapshots[historical]["sha256"],
    "currentRowsUnchanged": len(candidate_rows),
    "existingSnapshotRowsUnchanged": len(baseline_snapshots),
    "defaultNodeDiscoveryEqualsCatalog": sorted(node_paths),
    "generatedNodeSelectorsAcceptedByOwningBuilder": len(commands),
    "actualHistoricalNodeSelector": {"command": command, "exitCode": rejected.returncode, "outputDirectoryCreated": node_output.exists(), "credentialEnvironmentInherited": False},
    "actualCurrentNodeSelectors": {"selectorCount": len(node_paths), "mode": "--list only", "exitCode": admitted.returncode, "outputDirectoryCreated": node_output.exists(), "credentialEnvironmentInherited": False},
    "protectedFileCount": len(protected),
    "protectedFilesUnchanged": before == after,
    "headUnchanged": True, "gitStatusUnchanged": True,
    "coverageThresholdDenominatorPageSectionAndResultArtifactsRewritten": False,
    "historicalOrApplicationSourceExecuted": False,
    "earlierTraceExpectedCounts": {"canonicalTestFiles": 635, "rootNodeFiles": 124, "retainedSnapshotFiles": 72},
    "countReconciliation": "The doc-only checkpoint tracks six further report-held staged/candidate source files. All seven report-owned sources move to retained snapshots; all 635 current canonical tests remain indexed. This raises retained snapshots to 78, preserving the input digest.",
}
(output / "protected-sha256-before.json").write_text(json.dumps(before, indent=2) + "\n")
(output / "protected-sha256-after.json").write_text(json.dumps(after, indent=2) + "\n")
(output / "actual-census.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"baselineCounts": before_counts, "candidateCounts": after_counts, "nodeSelectorsAdmitted": len(commands), "protectedFilesUnchanged": len(protected), "receipt": str(output / "actual-census.json")}, indent=2))
