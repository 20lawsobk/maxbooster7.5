#!/usr/bin/env python3
"""Inventory first-party tests without importing or executing application code.

The catalog is a source index, not an execution result or a coverage percentage.
Only Git-tracked files and new first-party testing runners are considered. Case
names are extracted statically; parameterized/generated cases expand at runtime.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "reports/test-verification/test-inventory.json"
CATALOG = ROOT / "docs/testing/catalog.md"
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh", ".go", ".rs", ".cpp", ".cc", ".h"}
BROWSER_FILES = {
    "tests/auth-session-transient-browser.test.mjs", "tests/local-media-renderer-browser.test.mjs",
    "tests/studio-load-save-guard.test.mjs", "tests/studio-plugin-audio-browser.test.mjs",
    "tests/storefront-hook-transition.test.mjs",
}
ASSERTION_SCRIPTS = {
    "tests/integration-webhooks.cjs", "tests/integrations-readiness.cjs",
    "tests/unit/generated-pdim-isolated.mjs", "scripts/test-data-runtime.mjs",
    "scripts/test-fabric-deletion.mjs",
}
MANUAL_DIRS = ("tests/load/", "tests/chaos/", "tests/burn-in/", "server/tests/")
NAMED_PROBES = {
    "scripts/penetration-test.ts", "scripts/smoke-test.sh", "scripts/test-data-runtime.mjs",
    "scripts/test-fabric-deletion.mjs", "scripts/test-maxcore-proxy.sh", "scripts/test-url-to-video.sh",
    "scripts/readiness-assembled-acceptance.mjs", "scripts/readiness-packed-acceptance.mjs",
    "scripts/readiness-container-acceptance.mjs", "scripts/maxcore-isolated-recovery-acceptance.py",
    "external/maxcore/scripts/check-js-security-versions.js",
    "server/database-performance-test.ts", "tests/smoke/post-deployment-tests.ts", "evaluations/maxcore-fused/live-api.mjs",
    "evaluations/maxcore-fused/runner.mjs", "evaluations/maxcore-quality/verify_evidence.py",
    "evaluations/maxcore-quality/verify_types.py",
}
GROUP_LABELS = {
    "root-unit": "Root Vitest unit suites",
    "root-node": "Root Node contracts and assertion scripts",
    "python": "Python suites and bounded regression scripts",
    "commerce": "Commerce and beat lifecycle suites",
    "integration-browser": "Integration and real browser suites",
    "subsystems": "Rust, Go and imported subsystem suites",
    "manual-destructive-provider": "Operational, load, provider and hardware checks",
    "runner-support": "Runners, fixtures, helpers and configuration",
}


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def input_paths() -> list[str]:
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    paths = {p for p in tracked if p and (ROOT / p).is_file()}
    new = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z", "--", "tests", "server", "script", "scripts/testing"], cwd=ROOT).decode().split("\0")
    paths.update(p for p in new if p and (ROOT / p).is_file())
    paths.update(str(p.relative_to(ROOT)) for p in ROOT.glob("vitest*.config.ts") if p.is_file())
    # Other agents may be adding reusable runners during the same verification.
    for directory in ("scripts/testing", "tests/testing"):
        base = ROOT / directory
        if base.is_dir():
            paths.update(str(p.relative_to(ROOT)) for p in base.rglob("*") if p.is_file() and p.suffix in SOURCE_EXTENSIONS)
    return sorted(p for p in paths if "__pycache__" not in Path(p).parts)


def snapshot(p: str) -> bool:
    return p.startswith(".pdim-") or p.startswith("reports/") and "/.snapshots/" in p


def test_candidate(p: str, source: str) -> bool:
    name = Path(p).name
    if name.startswith("vitest") and ".config." in name:
        return True
    if any(part in ("tests", "__tests__") for part in Path(p).parts):
        return True
    if p in NAMED_PROBES or p.startswith(("scripts/testing/", "tests/testing/")):
        return True
    if re.search(r"(^test[_-]|[.-](?:test|spec)\.[^.]+$|_test\.go$|^__.*_test\.ts$)", name):
        return True
    return p.endswith(".rs") and bool(re.search(r"#\[(?:tokio::)?test", source))


def literal_titles(source: str) -> list[str]:
    # No source evaluation, interpolation, callback traversal or module import.
    pattern = re.compile(r"\b(?:describe|suite|it|test)(?:\.(?:skip|only|todo|each|concurrent|sequential))*\s*\(\s*([\"'`])((?:\\.|(?!\1).)*?)\1", re.S)
    return list(dict.fromkeys(re.sub(r"\s+", " ", match[1]).strip() for match in pattern.findall(source)))


def python_titles(source: str) -> tuple[list[str], str]:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [], ""
    titles = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            titles.append(node.name)
        if isinstance(node, ast.ClassDef):
            titles.extend(f"{node.name}.{method.name}" for method in node.body if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef)) and method.name.startswith("test"))
    return titles, ast.get_docstring(tree) or ""


def leading_comment(source: str) -> str:
    source = re.sub(r"^#![^\n]*\n", "", source).lstrip()
    if source.startswith("/*"):
        return re.sub(r"(?m)^\s*\* ?", "", source[2:source.find("*/")]).strip()
    lines = []
    for line in source.splitlines():
        if line.lstrip().startswith(("//", "#")):
            lines.append(re.sub(r"^\s*(?://|#) ?", "", line))
        else:
            break
    return "\n".join(lines)


def purpose_for(p: str, source: str, titles: list[str], module_doc: str) -> str:
    comment = module_doc or leading_comment(source)
    useful = [line.strip() for line in comment.splitlines() if line.strip() and not re.match(r"^(?:[-=─━]|(?:run|usage|env|node|python|uv run|npm|npx|from |import )\b)", line.strip(), re.I)]
    if useful:
        purpose = " ".join(useful[:3])
    elif titles:
        purpose = "; ".join(titles[:2])
    else:
        purpose = re.sub(r"[-_]", " ", re.sub(r"\.(?:test|spec)\.[^.]+$|\.[^.]+$", "", Path(p).name))
    return re.sub(r"\s+", " ", purpose).strip()[:480]


def ts_config_members(config: str, prop: str) -> list[str]:
    file = ROOT / config
    if not file.is_file():
        return []
    source = re.sub(r"//[^\n]*", "", file.read_text())
    match = re.search(r"\b" + re.escape(prop) + r"\s*:\s*\[(.*?)\]", source, re.S)
    return re.findall(r"[\"']([^\"']+)[\"']", match[1]) if match else []


def matches(p: str, patterns: list[str]) -> bool:
    # TS/Vitest **/ also matches zero directory levels.
    def glob_regex(pattern: str) -> str:
        output, index = "", 0
        while index < len(pattern):
            if pattern[index:index + 3] == "**/":
                output += "(?:.*/)?"
                index += 3
            elif pattern[index:index + 2] == "**":
                output += ".*"
                index += 2
            elif pattern[index] == "*":
                output += "[^/]*"
                index += 1
            elif pattern[index] == "?":
                output += "[^/]"
                index += 1
            else:
                output += re.escape(pattern[index])
                index += 1
        return output
    return any(re.fullmatch(glob_regex(pattern), p) for pattern in patterns)


def support_file(p: str, source: str, titles: list[str]) -> bool:
    name = Path(p).name
    if any(part in ("fixtures", "__pycache__") for part in Path(p).parts):
        return True
    if p.startswith("scripts/testing/") or name in {"setup.ts", "globalSetup.ts", "globalTeardown.ts", "__init__.py", "conftest.py"}:
        return True
    if re.search(r"(?:^helpers?[-_.]|[-_.]config\.[^.]+$|^.*\.config\.[^.]+$)", name):
        return True
    if name in {"production_fixture_support.py", "prepare-production-fixture.py", "browser-fixture.mjs", "feature-validators.ts", "harness.py", "loadTestFramework.ts", "stripe-verification.ts", "inbound-known-failures.mjs"}:
        return True
    if p.startswith("evaluations/maxcore-fused/") and name == "runner.mjs":
        return True
    if p.endswith(".py") and not titles and name.startswith("test_"):
        return False  # Script-style smoke tests often contain assertions/main.
    return False


def python_wrapper_metadata(p: str, source: str) -> tuple[bool, str | None]:
    """Read the wrapper's declared mapping without importing/executing it."""
    file = ROOT / "scripts/testing/run-python-suites.py"
    if not file.is_file():
        return False, None
    dictionaries = {}
    for node in ast.parse(file.read_text()).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in {"OPERATIONAL", "LIVE_FILES"}:
            dictionaries[node.targets[0].id] = ast.literal_eval(node.value)
    operational = dictionaries.get("OPERATIONAL", {})
    live = dictionaries.get("LIVE_FILES", {})
    name = Path(p).name
    relevant = name.startswith("test_") or p.startswith("tests/") or "/tests/" in p and name in operational
    try:
        has_cases = any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_") for node in ast.walk(ast.parse(source)))
    except SyntaxError:
        has_cases = False
    reason = live.get(name) or operational.get(name)
    return relevant and (has_cases or bool(reason) or name == "fsspec-advisories.py"), reason


def classify(p: str, source: str, titles: list[str]) -> dict:
    q = shlex.quote(p)
    result = {"category": "test", "group": "root-node", "runner": "node", "cwd": ".", "command": f"node {q}", "prerequisites": ["Node.js >=22.12", "npm ci"], "risks": [], "status": "execution_not_inferred_from_inventory"}
    if support_file(p, source, titles):
        result.update(category="support", group="runner-support", runner="support", command=None, prerequisites=["Invoked or imported by its owning test runner; do not run as a standalone test"])
        return result
    if p.endswith(".py"):
        training_root = "external/maxcore/artifacts/ai-training-server"
        cwd = training_root if p.startswith(training_root + "/") else "."
        target = p[len(cwd) + 1:] if cwd != "." else p
        pytest_style = bool(re.search(r"(?:^|\n)(?:import pytest|from pytest\b|def test_)", source))
        unittest_style = "unittest" in source and bool(titles)
        runner = "pytest" if pytest_style else "unittest" if unittest_style else "python-script"
        command = f"python3 -m pytest {shlex.quote(target)} -v" if pytest_style else f"python3 -m unittest {shlex.quote(target.removesuffix('.py').replace('/', '.'))} -v" if unittest_style else f"python3 {shlex.quote(target)}"
        result.update(group="python", runner=runner, cwd=cwd, command=command, prerequisites=["Python environment with the repository's locked runtime and pytest", "See python.md for isolated PYTHONPATH/state and optional native dependencies"])
        accepted, reason = python_wrapper_metadata(p, source)
        if accepted:
            result.update(runner="isolated-python", cwd=".", command=f"python3 scripts/testing/run-python-suites.py --file {q}")
            if reason:
                result["prerequisites"].append("The default wrapper records this file as blocked: " + reason)
        if "load_test" in p or "smoke_load" in p or "w6_90m" in p or "benchmark" in p or "chaos/" in p:
            result.update(group="manual-destructive-provider")
            result["risks"].append("Long-running load, failure injection or benchmark; use only a disposable target with explicitly bounded settings")
        if re.search(r"requests\.(?:get|post)|urllib\.request|https?://(?:localhost|127\.0\.0\.1):", source):
            result["prerequisites"].append("Review live-endpoint fixtures and ports; a live HTTP dependency may be required")
        return result
    if p.endswith(".rs"):
        result.update(group="subsystems", runner="cargo", cwd="boosterstate", command="cargo test --locked --test " + Path(p).stem + " -- --nocapture", prerequisites=["Pinned Rust toolchain; Cargo.lock dependencies", "Temporary Cargo target and runtime state; see subsystems.md"])
        return result
    if p.endswith("_test.go"):
        cwd = str(Path(p).parent)
        result.update(group="subsystems", runner="go-test", cwd=cwd, command="go test -v .", prerequisites=["Go toolchain and module dependencies; see subsystems.md"])
        return result
    if p.endswith(".sh"):
        result.update(group="manual-destructive-provider", runner="bash", command=f"bash {q}", prerequisites=["Bash, curl and jq as used by the script", "Disposable local app with explicitly reviewed target and credentials"], risks=["Inspect before running: some legacy scripts hardcode port 5000 and create records or generation jobs"])
        return result
    if "node:test" in source or p in ASSERTION_SCRIPTS:
        result.update(runner="node:test", command=f"node {'--import tsx ' if p.endswith(('.ts', '.tsx')) else ''}--test {q}")
        if p in ASSERTION_SCRIPTS:
            result.update(runner="node-assertion-script", command=f"node --import tsx {q}")
        if p in BROWSER_FILES:
            result.update(group="integration-browser")
            result["command"] = 'env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C ' + result["command"]
            result["prerequisites"].append("Chromium; optional CHROMIUM_PATH selection; see integration-browser.md")
        if p == "tests/patent-pdf-runtime.test.mjs":
            result["prerequisites"].append("Chromium; optional REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE selection")
        if p.startswith("tests/payment-processing/"):
            result.update(group="commerce")
            result["prerequisites"].append("Disposable PostgreSQL where required; see commerce.md")
        if p == "tests/runtime-bucket-restore.test.mjs":
            result["risks"].append("Remote private bucket write/delete; defaults to skipped until RUN_PRIVATE_BUCKET_TEST=1 and a dedicated test bucket is configured")
        if p == "tests/deployment-rust-phase.test.mjs":
            result["prerequisites"].append("RUN_RUST_TOOLCHAIN_TESTS=1 opts into the bounded native-toolchain path")
        if result["group"] == "root-node" and (ROOT / "scripts/testing/run-node-suites.py").is_file():
            result["command"] = f"python3 scripts/testing/run-node-suites.py --file {q}"
        if result["group"] == "commerce" and (ROOT / "scripts/testing/run-commerce.py").is_file():
            result["command"] = f"python3 scripts/testing/run-commerce.py --only {shlex.quote(Path(p).name)}"
        return result
    if "from \"vitest\"" in source or "from 'vitest'" in source or "@jest/globals" in source:
        if "@jest/globals" in source:
            result.update(group="root-unit", runner="legacy-jest", command=None, prerequisites=["Legacy Jest example: port its imports/configuration to Vitest or supply a dedicated Jest installation/config; it is excluded from the default suite"])
            return result
        unit_include = ts_config_members("vitest.config.ts", "include")
        unit_exclude = ts_config_members("vitest.config.ts", "exclude")
        integration = ts_config_members("vitest.integration.config.ts", "include")
        if p == "tests/unit/beat-sale-money-loop.test.ts":
            result.update(group="commerce", runner="vitest", command="python3 scripts/testing/run-commerce.py --only legacy-beat", prerequisites=["Disposable, fully migrated PostgreSQL distinct from the app database", "The sealed commerce runner prepares the fixture; see commerce.md"], risks=["Writes fixture users, listings, orders, royalties, notifications and posts; never use application DATABASE_URL"])
        elif p in integration:
            result.update(group="integration-browser", runner="vitest", command='env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C MAXBOOSTER_PYTHON="${MAXBOOSTER_PYTHON:-python3}" ' + f"node scripts/testing/integration-browser.mjs {q}", prerequisites=["PostgreSQL server tools and configured MaxCore Python dependencies", "The wrapper creates disposable PostgreSQL and a sealed loopback app fixture; see integration-browser.md"], risks=["May create/delete fixture accounts and application records; never point at the user's running app"])
        elif p in ts_config_members("vitest.additional.config.ts", "include"):
            result.update(group="root-unit", runner="vitest", command='env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C CI=1 ' + f"npx vitest run --config vitest.additional.config.ts {q}")
        elif matches(p, unit_include) and not matches(p, unit_exclude):
            result.update(group="root-unit", runner="vitest", command='env -i PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" HOME=/tmp LANG=C CI=1 ' + f"npx vitest run --config vitest.config.ts {q}")
        else:
            result.update(group="root-unit", runner="vitest-outside-default", command=None, prerequisites=["Outside the current default include/exclude rules; use an explicit isolated Vitest config that admits this exact file", "See root test runner/results for whether this file was executed"])
        return result
    if p.endswith(".js") and "k6/" in source:
        result.update(group="manual-destructive-provider", runner="k6", command=f"BASE_URL='<isolated app URL>' k6 run {q}", prerequisites=["k6", "Disposable isolated app and database with intended load budget"], risks=["Sends concurrent sustained HTTP load; inspect configured stages, duration and URLs before execution"])
        return result
    if p.startswith("tests/payment-processing/"):
        result.update(group="commerce", prerequisites=["Node.js >=22.12 and npm ci", "Use the commerce runner's offline mode; see commerce.md"])
        if "real-stripe" in p or "real_stripe" in p:
            result.update(group="manual-destructive-provider")
            result["risks"].append("Calls remote Stripe resources; requires explicit test-mode credentials and verified disposable resource ownership, not live account keys")
        return result
    if p.startswith("external/"):
        result.update(group="subsystems", runner="tsx", command=f"node --import tsx {q}", prerequisites=["Root Node.js dependencies and imported subsystem dependencies", "Review subsystem fixture target; see subsystems.md"])
        if p == "external/maxcore/scripts/check-js-security-versions.js":
            result.update(runner="node-assertion-script", cwd="external/maxcore", command="node scripts/check-js-security-versions.js")
        if "smoke-load" in p:
            result["risks"].append("Performs storage writes and load; configure an isolated PDIM target")
        return result
    if p.startswith(MANUAL_DIRS) or p in NAMED_PROBES or p.startswith("tests/e2e/") or p in {"tests/p0-verification.ts", "tests/pdim-bucket-cloud-smoke.ts", "server/database-performance-test.ts"}:
        result.update(group="manual-destructive-provider", runner="tsx" if p.endswith((".ts", ".tsx")) else "node", command=f"node {'--import tsx ' if p.endswith(('.ts', '.tsx')) else ''}{q}", prerequisites=["Inspect script-specific target/environment options and required fixtures", "Use only a disposable target with provider egress disabled unless explicitly testing a dedicated sandbox"], risks=["Operational script: may write data, create jobs, inject failures, run prolonged load or call providers; ordinary suite invocation is not proof this script passed"])
        if p == "scripts/readiness-packed-acceptance.mjs" or p == "scripts/readiness-container-acceptance.mjs":
            result["command"] += " '<copied public model-state root>' '<results directory>'"
            result["prerequisites"].append("Current prepared release; env -i with only required PATH/CA/proxy parameters; inspect the runner's documented arguments")
        if p == "scripts/readiness-container-acceptance.mjs":
            result["prerequisites"].append("Working Docker daemon with cloud proxy and CA trust")
        return result
    if p.endswith((".ts", ".tsx")):
        result.update(runner="tsx", command=f"node --import tsx {q}")
    return result


def collect() -> dict:
    entries, snapshots, support = [], [], []
    for p in input_paths():
        file = ROOT / p
        is_source = file.suffix in SOURCE_EXTENSIONS
        in_test_tree = any(part in ("tests", "__tests__") for part in Path(p).parts)
        if not is_source:
            if in_test_tree:
                support.append({"path": p, "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "reason": "Non-executable test data/documentation/fixture"})
            continue
        source = file.read_text(errors="replace")
        if not test_candidate(p, source):
            continue
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if snapshot(p):
            snapshots.append({"path": p, "sha256": digest, "reason": "Retained generated/historical copy; canonical source test is indexed instead; not an independently executed suite"})
            continue
        titles, module_doc = python_titles(source) if p.endswith(".py") else (literal_titles(source), "")
        if p.endswith(".rs"):
            titles = re.findall(r"#\[(?:tokio::)?test[^\]]*\]\s*(?:async\s+)?fn\s+(\w+)", source)
        if p.endswith("_test.go"):
            titles = re.findall(r"\bfunc\s+(Test\w+|Benchmark\w+|Fuzz\w+)\(", source)
        row = {"path": p, "sha256": digest, **classify(p, source, titles), "purpose": purpose_for(p, source, titles, module_doc), "caseTitles": titles, "caseEnumeration": "Static literal titles/definitions only; generated and parameterized cases expand at runtime"}
        if row["runner"].startswith("vitest"):
            membership = []
            for config in ("vitest.config.ts", "vitest.integration.config.ts", "vitest.additional.config.ts", "vitest.beat-loop.config.ts"):
                if matches(p, ts_config_members(config, "include")) and not matches(p, ts_config_members(config, "exclude")):
                    membership.append(config)
            row["configMembership"] = membership
        entries.append(row)
    counts = Counter(row["group"] for row in entries)
    digest_inputs = sorted((row["path"], row["sha256"]) for row in entries + snapshots + support)
    return {"schemaVersion": 1, "sourceRevision": git("rev-parse", "HEAD"), "workingTreeInputDigest": hashlib.sha256(json.dumps(digest_inputs, separators=(",", ":")).encode()).hexdigest(), "scope": "Canonical first-party tracked tests, operational acceptance scripts, test support and newly added testing runners; not runtime execution evidence", "caseEnumeration": "Literal source labels only, not a count of runtime test cases or coverage percentage", "counts": {"canonicalTestFiles": sum(row["category"] == "test" for row in entries), "supportSourceFiles": sum(row["category"] == "support" for row in entries), "retainedSnapshotFiles": len(snapshots), "nonExecutableSupportFiles": len(support), "byGroup": dict(sorted(counts.items()))}, "entries": entries, "generatedSnapshots": snapshots, "supportFiles": support}


def md(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def render(data: dict) -> str:
    counts = data["counts"]
    lines = ["# Max Booster test catalog", "", "Generated by `python3 scripts/testing/generate-catalog.py` from repository source. This index describes what each file does and how to select it; actual pass/fail/skip outcomes are in [the recorded results](../../reports/test-verification/README.md). It does not execute tests or claim production readiness.", "", f"The census contains **{counts['canonicalTestFiles']} canonical test/operational files**, {counts['supportSourceFiles']} runner/helper source files, {counts['nonExecutableSupportFiles']} data/documentation fixtures and {counts['retainedSnapshotFiles']} retained generated/historical test copies.", "", "Commands below run from the repository root unless a different working directory is stated. Run the clean-environment group runner first; a per-file command is a selector, not permission to use the application's real database, private model state, production bucket or provider account. Requirements and risk notes are part of each command's instructions.", "", "Literal titles and Python/Go/Rust definitions are source descriptions. Parameterized tests, loops, subtests and generated suites may produce different runtime counts. Files with no static titles can still be executable assertion scripts. Support files and retained snapshots are listed separately and must not count as passed tests.", "", "| Group | Indexed files |", "| --- | ---: |"]
    for group, label in GROUP_LABELS.items():
        lines.append(f"| {label} | {counts['byGroup'].get(group, 0)} |")
    lines += ["", "Regenerate after changing or adding tests. `python3 scripts/testing/generate-catalog.py --check` compares source paths, classifications and hashes without executing tests. The recorded Git SHA identifies the base revision; per-file hashes also capture uncommitted test edits present when the inventory was generated.", ""]
    for group, label in GROUP_LABELS.items():
        rows = [row for row in data["entries"] if row["group"] == group]
        if not rows:
            continue
        lines += [f"## {label}", ""]
        for row in rows:
            p = row["path"]
            lines += [f"### [{p}](../../{p.replace(' ', '%20')})", "", row["purpose"], "", f"Runner: `{row['runner']}`. Working directory: `{row['cwd']}`.", ""]
            if len(row.get("configMembership", [])) > 1:
                lines += ["Configuration membership: " + ", ".join(f"`{config}`" for config in row["configMembership"]) + ". The file is indexed once here even when more than one runner selects it.", ""]
            if row["command"]:
                lines += ["```sh", row["command"], "```", ""]
            else:
                lines += ["Standalone command: none. " + "; ".join(row["prerequisites"]) + ".", ""]
            if row["command"] and row["prerequisites"]:
                lines += ["Requirements: " + "; ".join(row["prerequisites"]) + ".", ""]
            if row["risks"]:
                lines += ["Execution limits: " + "; ".join(row["risks"]) + ".", ""]
            if row["caseTitles"]:
                lines += [f"<details><summary>Source case labels ({len(row['caseTitles'])}; runtime expansion may differ)</summary>", ""]
                lines.extend(f"- {md(title)}" for title in row["caseTitles"])
                lines += ["", "</details>", ""]
    lines += ["## Retained generated and historical copies", "", "These tracked files are duplicate or historical snapshots, not current execution targets. They are preserved and hashed so the exclusion is explicit.", "", "| File | SHA-256 |", "| --- | --- |"]
    lines.extend(f"| `{row['path']}` | `{row['sha256']}` |" for row in data["generatedSnapshots"])
    lines += ["", "## Non-executable test support", "", "These data, documentation and fixture files are inputs to tests. Run their owning suites, not the files themselves.", "", "| File | Role |", "| --- | --- |"]
    lines.extend(f"| `{row['path']}` | {row['reason']} |" for row in data["supportFiles"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if source paths/hashes/classifications changed; do not modify outputs")
    args = parser.parse_args()
    data = collect()
    if args.check:
        if not INVENTORY.is_file():
            print("Test inventory is missing; run the catalog generator", file=sys.stderr)
            return 1
        previous = json.loads(INVENTORY.read_text())
        keys = ("workingTreeInputDigest", "counts", "entries", "generatedSnapshots", "supportFiles")
        if any(previous.get(key) != data.get(key) for key in keys):
            print("Test source inventory changed; regenerate the catalog", file=sys.stderr)
            return 1
        print("Test source inventory is current")
        return 0
    INVENTORY.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    INVENTORY.write_text(json.dumps(data, indent=2) + "\n")
    CATALOG.write_text(render(data))
    print(json.dumps(data["counts"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
