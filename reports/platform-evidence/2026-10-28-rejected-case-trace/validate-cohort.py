"""Read-only retained-evidence integrity checks; never product acceptance."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = json.loads((BASE / "manifest.json").read_text())
files = manifest["files"]
assert files and len({row["path"] for row in files}) == len(files)
for row in files:
    path = BASE / row["path"]
    assert path.is_file() and path.stat().st_size == row["bytes"]
    assert digest(path) == row["sha256"], row["path"]

entries = json.loads((BASE / "entries.json").read_text())
summary = json.loads((BASE / "summary.json").read_text())
receipt = json.loads((BASE / "replay-receipt.json").read_text())
catalog = json.loads((BASE / "catalog-gap.json").read_text())
cases = json.loads((ROOT / "reports/test-verification/case-results.json").read_text())
assert len(entries) == 104 and len({row["id"] for row in entries}) == 104
assert len({row["caseResultIndex"] for row in entries}) == 104
assert Counter(row["classification"] for row in entries) == {
    "parameterized-title-collision": 64,
    "python-class-scope-loss": 26,
    "commerce-adapter-subject-binding": 14,
}
assert Counter(row["reason"] for row in entries) == {
    "case-not-passed-in-bound-xml": 90,
    "unbound-default-file-producer": 14,
}
for row in entries:
    assert row["status"] == "UNVERIFIED" and row["newAcceptedEvidence"] is False
    assert cases[row["caseResultIndex"]] == row["case"]
    for field in ("rootCause", "affectedSystems", "requiredFixes", "dependencies",
                  "orderOfExecution", "riskLevel", "validationCriteria",
                  "productionAcceptanceCriteria", "sourceCitations"):
        assert row[field], (row["id"], field)
    if row["reason"] == "case-not-passed-in-bound-xml":
        assert row["rawOutcomeCounts"] == {"passed": row["rawOccurrenceCount"]}
        assert row["rawOccurrenceCount"] > 1
    else:
        assert len(row["independentRawXmlDiagnostic"]) == 1
        assert row["independentRawXmlDiagnostic"][0]["status"] == "passed"
    for citation in row["sourceCitations"]:
        source = ROOT / citation["path"]
        assert source.is_file() and digest(source) == citation["sha256"]
        assert 1 <= citation["line"] <= citation["endLine"] <= len(source.read_text().splitlines())

assert catalog["status"] == "UNVERIFIED" and not catalog["newAcceptedEvidence"]
assert len(catalog["validationCriteria"]) == 6
assert catalog["proposedCountCorrection"]["currentExecutedNodeFiles"] == 124
assert summary["rowsIncludingCatalogDebt"] == 105
assert summary["caseProofsTransferred"] == receipt["newAcceptedEvidence"] == 0
assert summary["pageDeclarations"] == 80 and summary["businessSections"] == 2162
assert summary["retainedWorkItems"] == 53020
assert receipt["commonUnchanged"] and receipt["protectedArtifactsUnchanged"]
assert receipt["protectedArtifactsBefore"] == receipt["protectedArtifactsAfter"]
assert summary["productionReady"] is False

links = 0
for doc in [BASE / "README.md", BASE / "matrix.md", ROOT / "docs/testing/evidence-binding-gaps.md"]:
    for target in re.findall(r"\]\(([^)]+)\)", doc.read_text()):
        if "://" in target or target.startswith("#"):
            continue
        path = doc.parent / target.split("#", 1)[0]
        assert path.exists(), (str(doc), target)
        links += 1

print(json.dumps({
    "artifactHashesPassed": len(files),
    "caseOccurrencesReviewed": len(entries),
    "catalogDebtsReviewed": 1,
    "fileLinksPassed": links,
    "newAcceptedEvidence": 0,
    "productionReady": False,
}))
