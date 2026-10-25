#!/usr/bin/env python3
"""Run canonical isolated Node test files, with per-file evidence and bounds."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
from common import ROOT, run_command, source_revision, write_json

BROWSER = {"tests/auth-session-transient-browser.test.mjs", "tests/local-media-renderer-browser.test.mjs",
           "tests/studio-load-save-guard.test.mjs", "tests/studio-plugin-audio-browser.test.mjs",
           "tests/storefront-hook-transition.test.mjs"}
ASSERTION_SCRIPTS = {"tests/integration-webhooks.cjs", "tests/integrations-readiness.cjs",
                     "tests/unit/generated-pdim-isolated.mjs", "scripts/test-data-runtime.mjs",
                     "scripts/test-fabric-deletion.mjs"}


def discover():
    paths = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines()
    result = []
    for file in paths:
        if not file.startswith(("tests/", "script/", "scripts/", "server/", "evaluations/")):
            continue
        if file in BROWSER or file.startswith("tests/payment-processing/") or "/fixtures/" in file:
            continue
        if Path(file).suffix not in (".mjs", ".cjs", ".ts"):
            continue
        source = (ROOT / file).read_text(errors="replace")
        if file in ASSERTION_SCRIPTS or re.search(r"(?:from\s*|require\s*\(\s*)['\"]node:test['\"]", source):
            result.append(file)
    return sorted(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "reports/test-verification/node")
    parser.add_argument("--file", action="append", help="Run only an exact discovered path; repeatable")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    files = discover()
    if args.file:
        missing = set(args.file) - set(files)
        if missing:
            parser.error("Not a canonical isolated Node test: " + ", ".join(sorted(missing)))
        files = sorted(set(args.file))
    if args.list:
        print(json.dumps(files, indent=2))
        return 0
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for file in files:
        command = ["node", "--import", "tsx"]
        if file not in ASSERTION_SCRIPTS:
            command += ["--test", "--test-concurrency=1", "--test-reporter=tap"]
        command.append(file)
        row = run_command(command, output / (file.replace("/", "__") + ".txt"), args.timeout)
        row["file"] = file
        log = (ROOT / row["log"]).read_text()
        counts = {name: int(value) for name, value in re.findall(r"^# (tests|pass|fail|skipped|cancelled) (\d+)\s*$", log, re.M)}
        row["counts"] = counts
        if row["status"] == "passed" and counts.get("skipped", 0):
            row["status"] = "passed_with_skips"
        # Assertion scripts have process-level evidence, not invented case totals.
        row["countScope"] = "node:test reported totals (includes parent tests)" if counts else "assertion script; no case count reported"
        rows.append(row)
        write_json(output / "results.json", {"sourceRevision": source_revision(), "group": "node", "runs": rows})
        print(f"{row['status']}: {file}", flush=True)
    failed = sum(row["exitCode"] != 0 for row in rows)
    write_json(output / "results.json", {"sourceRevision": source_revision(), "group": "node", "runs": rows,
               "summary": {"files": len(rows), "failedFiles": failed,
                           "counts": {name: sum(row["counts"].get(name, 0) for row in rows) for name in ("tests", "pass", "fail", "skipped", "cancelled")}}})
    return int(bool(failed))


if __name__ == "__main__":
    sys.exit(main())
