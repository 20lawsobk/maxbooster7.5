"""Retain actual exits/logs for the bounded, credential-free report replays."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

out = Path(__file__).resolve().parent
root = out.parents[2]
protected = ["scripts/testing/collect-node-coverage.mjs", "scripts/testing/coverage-provenance.mjs",
             "scripts/testing/coverage-node-bootstrap.mjs", "vitest.platform.config.ts",
             "package.json", "package-lock.json", "reports/test-verification/coverage/coverage-final.json"]
selected = json.loads((out / "baseline-selected-files.json").read_text())
protected.extend(str(Path(name).relative_to(root)) for name in selected)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
before = {name: digest(root / name) for name in protected}
summary = {"startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "scope": "Read-only retained-profile analysis; no new product execution, source changes or counter merge",
           "productionReady": False, "mergedIntoGlobalCoverage": False, "runs": []}
commands = [
    ("initial-package-entry-harness-error", ["node", str(out / "replay-comparison.initial.mjs")], 1),
    ("retained-input-verification", ["python3", str(out / "verify-retained-inputs.py")], 0),
    ("final-retained-runtime-replay", ["node", str(out / "replay-comparison.mjs")], 0),
]
with tempfile.TemporaryDirectory(prefix="maxbooster-coverage-trace-") as home:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": home,
           "TMPDIR": home, "LANG": "C.UTF-8", "CI": "1"}
    if os.environ.get("LD_LIBRARY_PATH"):
        env["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH"]
    for label, command, expected in commands:
        start = time.monotonic()
        result = subprocess.run(command, cwd=root, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=30)
        logfile = out / (label + ".txt")
        logfile.write_bytes(result.stdout)
        row = {"id": label, "command": command, "exitCode": result.returncode,
               "expectedExitCode": expected, "durationSeconds": round(time.monotonic() - start, 3),
               "log": str(logfile.relative_to(root)), "logSha256": digest(logfile)}
        summary["runs"].append(row)
        assert result.returncode == expected, row
summary["protectedInputsBefore"] = before
summary["protectedInputsAfter"] = {name: digest(root / name) for name in protected}
summary["protectedInputsUnchanged"] = summary["protectedInputsBefore"] == summary["protectedInputsAfter"]
assert summary["protectedInputsUnchanged"]
summary["configuredCredentialsPassedToChildren"] = False
summary["status"] = "analysis_completed_profiles_incompatible"
summary["finishedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
(out / "analysis-receipt.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps({"status": summary["status"], "protectedInputsUnchanged": True,
                  "commands": len(commands), "configuredCredentialsPassedToChildren": False}))
