"""Reproduce the isolated current-helper pytest/direct acceptance cohort."""
from pathlib import Path
import hashlib
import importlib.util
import json
import stat
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/testing"))
from common import run_command, write_json

spec = importlib.util.spec_from_file_location("python_runner", ROOT / "scripts/testing/run-python-suites.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=False)
python = sys.executable
files = ["external/maxcore/artifacts/ai-training-server/ai_model/" + name for name in
         ["retrieval/test_pipeline.py", "retrieval/test_phase4.py", "retrieval/test_rcgs.py",
          "retrieval/test_retrieval.py", "rta/test_render_contracts.py"]]
files += ["tests/testing/test_assertion_oracles.py"]


def uploads():
    base = runner.MAXCORE / "uploads"
    rows = []
    for path in sorted(base.rglob("*")):
        if path.is_file():
            rows.append({"relativeName": str(path.relative_to(base)), "bytes": path.stat().st_size,
                         "mode": stat.S_IMODE(path.stat().st_mode), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return {"files": len(rows), "bytes": sum(row["bytes"] for row in rows),
            "modes": sorted({row["mode"] for row in rows}),
            "inventorySha256": hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()}


receipt = {"scope": "Canonical custom-helper tests, exact-AST pytest oracle regressions and direct entrypoints; not production readiness",
           "sourceFiles": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files},
           "sourceUploadsBefore": uploads(), "runs": [], "productionReady": False}
write_json(out / "receipt.json", receipt)
command = [python, "scripts/testing/run-python-suites.py", "--python", python, "--workers", "1"]
for name in files:
    command += ["--file", name]
command += ["--output", str(out / "canonical-python")]
result = run_command(command, out / "canonical-python.txt", 420)
receipt["runs"].append(dict(result, id="pytest-all-five-and-oracle-regressions"))
receipt["sourceUploadsAfterPytest"] = uploads()
write_json(out / "receipt.json", receipt)
print("pytest", result["exitCode"], result["durationSeconds"], flush=True)
if result["exitCode"]:
    sys.exit(result["exitCode"])
for module in ["ai_model.retrieval.test_rcgs", "ai_model.retrieval.test_retrieval", "ai_model.rta.test_render_contracts"]:
    with tempfile.TemporaryDirectory(prefix="maxbooster-oracle-direct-") as directory:
        home = Path(directory)
        guard = home / "guard"
        guard.mkdir()
        (guard / "sitecustomize.py").write_text(runner.GUARD)
        environment = runner.clean_environment(home, guard, {"file": "external/maxcore/" + module})
        label = module.rsplit(".", 1)[1]
        result = run_command([python, "-u", "-m", module], out / (label + "-direct.txt"), 420,
                             cwd=runner.MAXCORE, extra_env=environment)
        receipt["runs"].append(dict(result, id=label + "-direct", sourceUploadsAfter=uploads(),
                                    remainingOwnedRetrievalDirs=[str(path.relative_to(home)) for path in home.rglob("maxcore-retrieval-test-*")]))
    receipt["runs"][-1]["ownedHomeRemoved"] = not home.exists()
    write_json(out / "receipt.json", receipt)
    print(module, result["exitCode"], result["durationSeconds"], flush=True)
    if result["exitCode"]:
        sys.exit(result["exitCode"])
receipt["sourceUploadsAfter"] = uploads()
receipt["sourceUploadsUnchanged"] = all(value == receipt["sourceUploadsBefore"] for value in
    [receipt["sourceUploadsAfterPytest"], receipt["sourceUploadsAfter"]]
    + [row["sourceUploadsAfter"] for row in receipt["runs"] if "sourceUploadsAfter" in row])
receipt["sourceFilesUnchanged"] = all(hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha
    for name, sha in receipt["sourceFiles"].items())
receipt["status"] = "passed" if receipt["sourceUploadsUnchanged"] and receipt["sourceFilesUnchanged"] else "failed_integrity"
write_json(out / "receipt.json", receipt)
print("final", receipt["status"], flush=True)
sys.exit(0 if receipt["status"] == "passed" else 1)
