"""Check immutable diagnostic records and media bytes; not a quality scorer."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reports/maxcore-quality"
fixture = ROOT / "evaluations/maxcore-quality/types.json"
definition = json.loads(fixture.read_text())
cases = {c["id"]: c for c in definition["cases"]}
digest = hashlib.sha256(fixture.read_bytes()).hexdigest()
corrected = {"text-api", "text-slots", "content-generic", "content-api",
             "social-variants", "audio-wav", "video-render", "video-studio"}
checkpoint = None
for name, expected in (("2026-09-23-all-types", set(cases)),
                       ("2026-09-23-types-corrected", corrected)):
    folder = BASE / name
    records = list(folder.glob("*/result.json"))
    assert {p.parent.name for p in records} == expected
    for p in records:
        r = json.loads(p.read_text())
        supervisor = json.loads((p.parent / "supervisor.json").read_text())
        assert r["case"] == cases[r["id"]]
        assert r["fixture_sha256"] == digest
        assert r["finished"] and r["checkpoint_preserved"]
        assert r["before"] == r["after"] == supervisor["before"] == supervisor["after"]
        assert supervisor["exit_code"] == 0
        assert r["connection"]["backend"] == "HyperGPUBackend"
        assert r["connection"]["all_modules_attached"]
        checkpoint = r["after"]
        for f in r["files"]:
            data = (ROOT / f["path"]).read_bytes()
            assert len(data) == f["bytes"]
            assert hashlib.sha256(data).hexdigest() == f["sha256"]
    print(f"{name}: {len(records)} complete records and media hashes verified")
model = ROOT / "external/maxcore/artifacts/ai-training-server"
assert checkpoint
for relative, expected in checkpoint.items():
    assert hashlib.sha256((model / relative).read_bytes()).hexdigest() == expected
print("Current checkpoint and release manifest still match the measured identity")