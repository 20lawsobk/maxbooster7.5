"""Verify immutable retained baseline/producer inputs without product writes."""
import hashlib
import json
from pathlib import Path
import tarfile

out = Path(__file__).resolve().parent
root = out.parents[2]
provenance = json.loads((out / "provenance.json").read_text())
archive = root / provenance["baselineArchive"]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == provenance["baselineArchiveSha256"]
with tarfile.open(archive, "r:gz") as incoming:
    raw = incoming.extractfile(provenance["baselineMember"]).read()
assert len(raw) == provenance["baselineMemberBytes"]
assert hashlib.sha256(raw).hexdigest() == provenance["baselineMemberSha256"]
baseline = json.loads(raw)
selected = json.loads((out / "baseline-selected-files.json").read_text())
assert len(selected) == provenance["files"] == 9
assert all(baseline[name] == data for name, data in selected.items())
profile = root / provenance["nodeProfile"]
assert hashlib.sha256(profile.read_bytes()).hexdigest() == provenance["nodeProfileSha256"]
assert set(selected) == set(json.loads(profile.read_text()))
report = {
    "status": "PASS",
    "scope": "Retained immutable baseline archive, exact selected entries and actual Node profile hashes",
    "baselineArchiveSha256": provenance["baselineArchiveSha256"],
    "baselineMemberSha256": provenance["baselineMemberSha256"],
    "selectedFiles": len(selected),
    "nodeProfileSha256": provenance["nodeProfileSha256"],
    "productionReady": False,
    "mergedIntoGlobalCoverage": False,
}
(out / "retained-input-verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
