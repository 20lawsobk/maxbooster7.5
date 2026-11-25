"""Check completed archived diagnostic records/media; current model identity is opt-in."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reports/maxcore-quality"
import argparse


def verify_archives(base=BASE, root=ROOT, include_later=False):
    fixture = root / "evaluations/maxcore-quality/types.json"
    definition = json.loads(fixture.read_text())
    cases = {c["id"]: c for c in definition["cases"]}
    digest = hashlib.sha256(fixture.read_bytes()).hexdigest()
    corrected = {"text-api", "text-slots", "content-generic", "content-api",
                 "social-variants", "audio-wav", "video-render", "video-studio"}
    checkpoint = None
    verified = []
    runs = [("2026-09-23-all-types", set(cases)),
            ("2026-09-23-types-corrected", corrected)]
    if include_later:
        runs += [("2026-09-24-final", set(cases)), ("2026-09-24-post-fix", set(cases))]
    for name, expected in runs:
        folder = base / name
        records = list(folder.glob("*/result.json"))
        assert {p.parent.name for p in records} == expected, f"{name}: missing or unexpected case records"
        for p in records:
            r = json.loads(p.read_text())
            supervisor = json.loads((p.parent / "supervisor.json").read_text())
            assert r["case"] == cases[r["id"]], p
            assert r["fixture_sha256"] == digest, p
            assert r.get("finished") and r.get("checkpoint_preserved"), f"{p}: archived measurement incomplete"
            assert r["before"] == r["after"] == supervisor["before"] == supervisor["after"], p
            assert supervisor["exit_code"] == 0, p
            assert r["connection"]["backend"] == "HyperGPUBackend", p
            assert r["connection"]["all_modules_attached"], p
            if checkpoint is not None:
                assert checkpoint == r["after"], f"{name}: archive checkpoint identities differ"
            checkpoint = r["after"]
            for f in r["files"]:
                data = (root / f["path"]).read_bytes()
                assert len(data) == f["bytes"], p
                assert hashlib.sha256(data).hexdigest() == f["sha256"], p
        verified.append({"run": name, "records": len(records)})
    assert checkpoint, "No archived checkpoint identity was measured"
    return {"scope": "immutable archived diagnostic integrity; not output quality or current serving readiness",
            "runs": verified, "archivedCheckpoint": checkpoint}


def verify_current_checkpoint(identity, model):
    for relative, expected in identity.items():
        file = model / relative
        if not file.is_file():
            raise FileNotFoundError(f"Current checkpoint identity is UNVERIFIED: missing {relative}")
        assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, f"Current identity mismatch: {relative}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-current-checkpoint", action="store_true",
                        help="Also require current model bytes to match the historical checkpoint; not applicable to a replaced serving model")
    parser.add_argument("--include-later-archives", action="store_true",
                        help="Also verify Sept 24 final/post-fix archives; the retained post-fix campaign is incomplete and cannot pass")
    args = parser.parse_args()
    result = verify_archives(include_later=args.include_later_archives)
    for run in result["runs"]:
        print(f"{run['run']}: {run['records']} complete archived records and media hashes verified")
    if args.check_current_checkpoint:
        verify_current_checkpoint(result["archivedCheckpoint"], ROOT / "external/maxcore/artifacts/ai-training-server")
        print("Current checkpoint bytes match the archived measured identity")
    else:
        print("Current checkpoint identity NOT_CHECKED (use --check-current-checkpoint when comparing the historical model)")
    if not args.include_later_archives:
        print("Later Sept 24 archives NOT_CHECKED (use --include-later-archives; post-fix campaign evidence is incomplete)")
    print("Archive integrity PASS; this does not score output quality or certify current serving readiness")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
