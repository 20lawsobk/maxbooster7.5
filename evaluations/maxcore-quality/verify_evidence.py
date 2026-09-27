"""Verify persisted measurement evidence without rerunning model inference."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reports/maxcore-quality"
fixture_path = ROOT / "evaluations/maxcore-quality/cases.json"
fixture = json.loads(fixture_path.read_text())
expected = {(c["id"], s) for c in fixture["cases"] for s in fixture["seeds"]}
fixture_hash = hashlib.sha256(fixture_path.read_bytes()).hexdigest()

for directory in sorted(BASE.iterdir()):
    if not directory.is_dir():
        continue
    if directory.name in ("2026-09-23-all-types", "2026-09-23-types-corrected"):
        continue  # Validated separately by verify_types.py.
    result = json.loads((directory / "results.json").read_text())
    assert result["fixture_sha256"] == fixture_hash, directory
    if directory.name in ("2026-09-23-aware-connected", "2026-09-23-aware-traced"):
        rows = result["samples"]
        assert len(rows) == len(expected), directory
        assert {(r["id"], r["seed"]) for r in rows} == expected, directory
        assert result["before"] == result["after"] and result["checkpoint_preserved"], directory
        assert result["connection"]["backend"] == "HyperGPUBackend", directory
        assert all(result["connection"]["module_attachment"].values()), directory
        assert result["connection"]["after"]["total_ops"] > result["connection"]["before"]["total_ops"], directory
        assert all(r["awareness"]["effective_chars"] > 0 for r in rows), directory
        assert all(r["status"] == "error" and "source=awareness" in r["detail"]["reason"] for r in rows), directory
        streamed = [json.loads(line) for line in (directory / "responses.jsonl").read_text().splitlines()]
        assert streamed == rows, directory
        if directory.name.endswith("traced"):
            assert all(r["awareness_observations"] and
                       all(o["nonempty_result"] for o in r["awareness_observations"]) for r in rows), directory
            assert all(any("too many values to unpack" in e["error"] for e in r["gpu_errors"]) for r in rows), directory
            assert all(r["agent_outputs"] and
                       all(o["source"] == "awareness" for o in r["agent_outputs"]) for r in rows), directory
        print(f"{directory.name}: connected GPU and awareness evidence consistent ({len(rows)} failed requests)")
        continue
    assert result["generation"] == fixture["generation"], directory
    assert len(result["samples"]) == len(expected), directory
    assert {(r["id"], r["seed"]) for r in result["samples"]} == expected, directory
    assert result["before"] == result["after"], directory
    assert result["before"]["checkpoint"] == result["manifest"]["sha256"], directory
    assert result["checkpoint_preserved"], directory
    assert not result["contamination"]["matches"], directory
    streamed = [json.loads(line) for line in (directory / "responses.jsonl").read_text().splitlines()]
    assert streamed == result["samples"], directory
    if result.get("mode") == "full-prefix-diagnostic":
        assert result["replay"]["exact_match"], directory
        assert all(r["status"] == "ok" and r["token_ids"] for r in streamed), directory
    else:
        assert all(r["status"] == "error" and not r["token_ids"] for r in streamed), directory
    print(f"{directory.name}: evidence consistent ({len(streamed)} samples)")

assessment = json.loads((BASE / "assessment.json").read_text())
scores = {(case["id"], seed): case["scores"]
          for case in assessment["cases"] for seed in case["seeds"]}
assert set(scores) == expected
assert all(len(s) == 3 and all(v in (0, 1, 2) for v in s) for s in scores.values())
passing = sum(s == [2, 2, 2] for s in scores.values())
assert passing == assessment["passing_samples"]
assert len(scores) == assessment["scored_samples"]
print(f"Assessment consistent: {passing}/{len(scores)} diagnostic samples pass")