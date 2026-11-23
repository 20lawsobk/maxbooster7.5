#!/usr/bin/env python3
# audit:ignore-file  (this file defines the audit's own detection vocabulary and test fixtures)
"""
REPAIR SCOPE: The supplied source ended inside _build_repo_findings. This
file repairs that audit-engine portion and adds its missing _log and
calculate_score methods. Import ProductionAuditEngine to use this portion.
The original usage notes below describe code that was not supplied: there is
no CLI entry point, AI/remediation pipeline, or --self-test implementation here.

Original header (for context; its commands require the missing remainder):
production_audit_suite.py: audit -> understand -> remediate -> re-audit, in one file (stdlib only, Python 3.9+).

  python production_audit_suite.py --repo PATH --audit-only              audit and report only
  python production_audit_suite.py --repo PATH                           dry run: audit + planned fixes + diff
  python production_audit_suite.py --repo PATH --apply [--commit]        apply safe fixes, then re-audit
  python production_audit_suite.py --repo PATH --apply --ai              + AI agent for TODOs, logging, tests, ...
  python production_audit_suite.py --repo PATH --apply --ai --build      + finish unfinished features from the intent map
  python production_audit_suite.py --repo PATH --apply --ai --replace-third-party [PKG ...]
  python production_audit_suite.py --repo PATH --ai --understand         analysis only: writes understanding/intent_map.*
  python production_audit_suite.py --self-test                           verify the whole pipeline end to end (offline)

AI modes need ANTHROPIC_API_KEY. Everything the AI changes passes hard gates (syntax, audit regression, tests,
no new third-party imports, documented decisions) or is rolled back. Read the report and diff before merging.
"""

# ==========================================================================
# PART: Production Audit Engine v2
# ==========================================================================

import argparse
import fnmatch
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from datetime import datetime, timezone
from pathlib import Path

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", ".next", ".nuxt", ".turbo", "dist",
    "build", "out", "target", "coverage", "__pycache__", ".venv", "venv", "env",
    ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache", "site-packages",
    "vendor", "Pods", ".gradle", ".idea", ".vscode", ".terraform", ".cache",
}

CODE_EXTENSIONS = {
    ".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".java", ".go", ".rs",
    ".rb", ".php", ".cs", ".cpp", ".cc", ".c", ".h", ".hpp", ".swift", ".kt",
    ".kts", ".scala", ".sql", ".sh", ".bash", ".lua", ".dart", ".ex", ".exs",
    ".clj", ".r", ".pl", ".vue", ".svelte", ".m", ".mm", ".groovy",
}

SEVERITY_WEIGHT = {"CRITICAL": 10, "HIGH": 5, "MEDIUM": 2, "LOW": 1}
SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

# rule_id -> (severity, category, title, recommendation, production_blocker)
RULES = {
    "todo": ("HIGH", "Incomplete Implementation", "TODO/FIXME markers",
             "Complete or ticket the unfinished work", True),
    "placeholder": ("HIGH", "Placeholder Logic", "Mock/stub/placeholder in non-test code",
                    "Replace with production implementation", True),
    "secret": ("CRITICAL", "Security", "Potential hardcoded secret",
               "Rotate the credential and move it to a secrets manager / env vars", True),
    "env_file": ("CRITICAL", "Security", "Environment file committed",
                 "Remove from the repo, rotate contents, add to .gitignore", True),
    "large_file": ("MEDIUM", "Architecture", "Oversized source file",
                   "Break into smaller modules", False),
    "bare_except": ("MEDIUM", "Reliability", "Swallowed or overly broad exception",
                    "Catch specific errors and log or re-raise", False),
    "no_tests": ("CRITICAL", "Testing", "No test suite detected",
                 "Create automated tests", True),
    "low_tests": ("MEDIUM", "Testing", "Very low test-to-source ratio",
                  "Increase automated test coverage", False),
    "no_logging": ("HIGH", "Observability", "No logging framework detected",
                   "Implement structured, centralized logging", True),
    "no_error_handling": ("HIGH", "Reliability", "No error handling detected",
                          "Implement an error handling strategy", True),
    "no_readme": ("LOW", "Documentation", "Missing README",
                  "Create onboarding documentation", False),
    "no_license": ("LOW", "Documentation", "Missing LICENSE",
                   "Add a license file", False),
    "no_ci": ("MEDIUM", "Delivery", "No CI configuration detected",
              "Add CI to run tests and checks on every change", False),
    "no_gitignore": ("LOW", "Hygiene", "Missing .gitignore",
                     "Add a .gitignore", False),
}

TODO_RE = re.compile(
    r"(?:#|//|/\*|^\s*\*|--|<!--)[^\n]*?\b(TODO|FIXME|XXX|HACK|WIP)\b")
PLACEHOLDER_RE = re.compile(
    r"\b(mock|stub|placeholder|fake|dummy|lorem ipsum|sample data|example data|test data)\b(?!\s*[=:])",
    re.IGNORECASE)
BARE_EXCEPT_RE = re.compile(
    r"^\s*except\s*:|^\s*except\s+(?:Exception|BaseException)\s*(?:as\s+\w+)?\s*:\s*pass\s*$"
    r"|catch\s*(?:\([^)]*\))?\s*\{\s*\}")
ERROR_HANDLING_RE = re.compile(r"\b(try|except|catch|rescue|recover)\b|\bif err != nil\b|\.catch\(|Result<")
LOGGING_RE = re.compile(
    r"\b(logging|logger|log4j|slf4j|winston|pino|logrus|zap|structlog|loguru|bunyan|serilog|tracing|"
    r"NLog|glog|zerolog)\b", re.IGNORECASE)

SECRET_RULES = [
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("Private key block", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Stripe live key", re.compile(r"\b[sr]k_live_[0-9a-zA-Z]{24,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
]
GENERIC_SECRET_RE = re.compile(
    r"""(?i)\b[\w-]*?(api[_-]?key|secret|passwd|password|token|private[_-]?key|access[_-]?key)"""
    r"""["']?\s*[:=]\s*["']([^"'\s]{12,})["']""")
FAKE_VALUE_HINTS = ("example", "changeme", "your", "xxx", "<", "${", "{{", "env", "placeholder",
                    "dummy", "test", "sample", "process.", "os.environ", "getenv")

TEST_DIR_RE = re.compile(r"(^|/)(tests?|__tests__|specs?|e2e)(/|$)", re.IGNORECASE)
TEST_NAME_RE = re.compile(r"(^test_|_test\.|\.test\.|\.spec\.|_spec\.|Tests?\.(java|cs|kt|swift)$)", re.IGNORECASE)
ENV_FILE_RE = re.compile(r"^\.env(\..+)?$")
ENV_SAFE_SUFFIXES = (".example", ".sample", ".template", ".dist")
CI_HINTS = (".github/workflows", ".gitlab-ci.yml", ".circleci", "Jenkinsfile",
            ".travis.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml", ".buildkite")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def shannon_entropy(s):
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


def redact(value):
    return f"{value[:4]}…[{len(value)} chars]"


def is_binary(path):
    try:
        with open(path, "rb") as f:
            return b"\0" in f.read(8192)
    except OSError:
        return True


def is_test_path(rel):
    rel = rel.replace(os.sep, "/")
    return bool(TEST_DIR_RE.search(rel) or TEST_NAME_RE.search(os.path.basename(rel)))


# --------------------------------------------------------------------------
# Per-file scan (runs in worker processes; must be top-level and picklable)
# --------------------------------------------------------------------------

def scan_file(task):
    path, rel, cfg = task
    code_exts = set(cfg["code_exts"])
    result = {"rel": rel, "skipped": None, "binary": False, "lines": 0, "is_code": False,
              "is_test": False, "logging": False, "error_handling": False, "hits": []}
    ext = os.path.splitext(rel)[1].lower()
    base = os.path.basename(rel)

    try:
        size = os.path.getsize(path)
    except OSError:
        result["skipped"] = "unreadable"
        return result

    result["is_test"] = is_test_path(rel)

    if ENV_FILE_RE.match(base) and not base.endswith(ENV_SAFE_SUFFIXES):
        result["hits"].append(("env_file", 1, base))

    max_bytes = cfg["max_scan_mb"] * 1024 * 1024
    if max_bytes and size > max_bytes:
        result["skipped"] = f"larger than {cfg['max_scan_mb']} MB"
        return result
    if is_binary(path):
        result["binary"] = True
        return result

    is_code = ext in code_exts
    result["is_code"] = is_code
    scan_markers = is_code or cfg["scan_all"]
    max_line = cfg["max_line"]
    hits = result["hits"]
    per_rule = Counter()
    cap = cfg["max_hits_per_file"]

    def add(rule, lineno, detail):
        if per_rule[rule] < cap:
            hits.append((rule, lineno, detail))
        per_rule[rule] += 1

    lineno = 0
    ignore_file = False
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            while True:
                chunk = f.readline(65536)  # bounded read: safe on minified one-line files
                if not chunk:
                    break
                if not chunk.endswith("\n") and len(chunk) == 65536:
                    # Very long line: only inspect its head, drain the rest.
                    while True:
                        rest = f.readline(65536)
                        if not rest or rest.endswith("\n"):
                            break
                lineno += 1
                line = chunk[:max_line]
                if lineno <= 10 and "audit:ignore-file" in chunk:
                    ignore_file = True
                if is_code:  # evidence that the repo logs / handles errors counts even in suppressed lines
                    if not result["logging"] and LOGGING_RE.search(line):
                        result["logging"] = True
                    if not result["error_handling"] and ERROR_HANDLING_RE.search(line):
                        result["error_handling"] = True
                if ignore_file or "audit:ignore" in line:  # explicit, visible opt-out (never added by the AI)
                    continue

                for label, rx in SECRET_RULES:
                    m = rx.search(line)
                    if m:
                        add("secret", lineno, f"{label}: {redact(m.group(0))}")
                m = GENERIC_SECRET_RE.search(line)
                if m:
                    val = m.group(2)
                    low = val.lower()
                    if shannon_entropy(val) >= 3.5 and not any(h in low for h in FAKE_VALUE_HINTS):
                        add("secret", lineno, f"Assigned {m.group(1)}: {redact(val)}")

                if not scan_markers:
                    continue

                m = TODO_RE.search(line)
                if m:
                    add("todo", lineno, m.group(1))
                if not result["is_test"]:
                    m = PLACEHOLDER_RE.search(line)
                    if m:
                        add("placeholder", lineno, m.group(1).lower())
                if is_code:
                    if not result["logging"] and LOGGING_RE.search(line):
                        result["logging"] = True
                    if not result["error_handling"] and ERROR_HANDLING_RE.search(line):
                        result["error_handling"] = True
                    if BARE_EXCEPT_RE.search(line):
                        add("bare_except", lineno, line.strip()[:80])
    except OSError:
        result["skipped"] = "read error"
        return result

    result["lines"] = lineno
    if is_code and not result["is_test"] and not ignore_file and lineno > cfg["large_file_lines"]:
        hits.append(("large_file", 1, f"{lineno} lines"))
    # Record overflow so reports can say "and N more"
    for rule, n in per_rule.items():
        if n > cap:
            hits.append((rule + "_overflow", 0, str(n - cap)))
    return result


# --------------------------------------------------------------------------
# Engine
# --------------------------------------------------------------------------

class ProductionAuditEngine:
    def __init__(self, repo_root, args):
        self.repo_root = Path(repo_root).resolve()
        self.args = args
        self.findings = []
        self.stats = Counter()
        self.top_level = set()
        self.has_ci = False
        self.cfg = {
            "code_exts": sorted(CODE_EXTENSIONS | set(args.extra_code_ext or [])),
            "scan_all": args.scan_all,
            "max_scan_mb": args.max_scan_mb,
            "max_line": 5000,
            "max_hits_per_file": args.max_hits_per_file,
            "large_file_lines": args.large_file_lines,
        }

    # ---- discovery -------------------------------------------------------

    def _excluded(self, rel):
        rel = rel.replace(os.sep, "/")
        if self.args.include and not any(fnmatch.fnmatch(rel, g) for g in self.args.include):
            return True
        return any(fnmatch.fnmatch(rel, g) for g in (self.args.exclude or []))

    def _git_files(self):
        if self.args.no_git or not (self.repo_root / ".git").exists():
            return None
        try:
            out = subprocess.run(
                ["git", "-C", str(self.repo_root), "ls-files", "-z", "--cached",
                 "--others", "--exclude-standard"],
                capture_output=True, check=True, timeout=300).stdout
        except (OSError, subprocess.SubprocessError):
            return None
        return [p for p in out.decode("utf-8", "replace").split("\0") if p]

    def discover(self):
        git_files = self._git_files()
        if git_files is not None:
            for rel in git_files:
                parts = rel.split("/")
                if any(p in SKIP_DIRS for p in parts[:-1]) or self._excluded(rel):
                    continue
                full = self.repo_root / rel
                if full.is_file() and not full.is_symlink():
                    yield str(full), rel
            return
        stack = [self.repo_root]
        while stack:
            current = stack.pop()
            try:
                with os.scandir(current) as it:
                    for entry in it:
                        try:
                            if entry.is_symlink():
                                continue
                            rel = os.path.relpath(entry.path, self.repo_root)
                            if entry.is_dir(follow_symlinks=False):
                                if entry.name not in SKIP_DIRS:
                                    stack.append(Path(entry.path))
                            elif entry.is_file(follow_symlinks=False) and not self._excluded(rel):
                                yield entry.path, rel
                        except OSError:
                            continue
            except OSError:
                continue

    # ---- execution -------------------------------------------------------

    def execute(self):
        self._log("Starting repository audit...")
        by_rule_file = defaultdict(lambda: defaultdict(list))
        overflow = Counter()
        workers = self.args.workers or max(1, (os.cpu_count() or 2))
        in_flight_limit = workers * 8

        def consume(res):
            self.stats["files"] += 1
            rel = res["rel"]
            base = os.path.basename(rel)
            self.top_level.add(rel.split("/")[0] if "/" in rel else rel)
            if any(rel.startswith(h) or ("/" + h) in rel for h in CI_HINTS) or base in CI_HINTS:
                self.has_ci = True
            if res["skipped"]:
                self.stats["skipped"] += 1
                self.stats["skipped:" + res["skipped"]] += 1
                return
            if res["binary"]:
                self.stats["binary"] += 1
                return
            self.stats["text"] += 1
            self.stats["lines"] += res["lines"]
            if res["is_code"]:
                if res["is_test"]:
                    self.stats["test_files"] += 1
                else:
                    self.stats["source_files"] += 1
                    self.stats["logging_files"] += res["logging"]
                    self.stats["error_handling_files"] += res["error_handling"]
            elif res["is_test"]:
                self.stats["test_files"] += 1
            for rule, lineno, detail in res["hits"]:
                if rule.endswith("_overflow"):
                    overflow[rule[:-9]] += int(detail)
                else:
                    by_rule_file[rule][rel].append((lineno, detail))

        with ProcessPoolExecutor(max_workers=workers) as pool:
            pending = set()
            for full, rel in self.discover():
                pending.add(pool.submit(scan_file, (full, rel, self.cfg)))
                if len(pending) >= in_flight_limit:
                    done, pending = wait(pending, return_when=FIRST_COMPLETED)
                    for fut in done:
                        consume(fut.result())
                if self.stats["files"] and self.stats["files"] % 5000 == 0:
                    self._log(f"  ...{self.stats['files']} files scanned")
            for fut in pending:
                consume(fut.result())

        self._build_file_findings(by_rule_file, overflow)
        self._build_repo_findings()
        score = self.calculate_score()
        blockers = sum(1 for f in self.findings if f["production_blocker"])
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "repository": str(self.repo_root),
            "production_score": score,
            "production_ready": score >= self.args.ready_threshold and blockers == 0,
            "finding_count": len(self.findings),
            "blockers": blockers,
            "stats": dict(self.stats),
            "findings": self.findings,
        }

    # ---- findings --------------------------------------------------------

    def _add(self, rule, file, details, count=1):
        sev, cat, title, rec, blocker = RULES[rule]
        self.findings.append({
            "rule": rule, "severity": sev, "category": cat, "file": file, "title": title,
            "details": details, "recommendation": rec, "production_blocker": blocker,
            "count": count,
        })

    def _build_file_findings(self, by_rule_file, overflow):
        for rule, files in by_rule_file.items():
            for rel, hits in sorted(files.items()):
                shown = "; ".join(f"L{ln}: {d}" for ln, d in hits[:10])
                extra = len(hits) - 10
                if extra > 0:
                    shown += f"; +{extra} more"
                self._add(rule, rel, shown, count=len(hits))
            if overflow[rule]:
                self._add(rule, "*", f"{overflow[rule]} additional hits beyond per-file cap",
                          count=overflow[rule])

    def _build_repo_findings(self):
        s = self.stats
        src = s["source_files"]
        if src:
            if s["test_files"] == 0:
                self._add("no_tests", "*", f"No tests found among {src} source files")
            elif s["test_files"] / src < 0.05:
                self._add("low_tests", "*", f"{s['test_files']} test files vs {src} source files")
            if s["logging_files"] == 0:
                self._add("no_logging", "*", "No logging framework usage found in source")
            if s["error_handling_files"] == 0:
                self._add("no_error_handling", "*", "No exception handling found in source")
        names = {n.lower() for n in self.top_level}
        if not any(n.startswith("readme") for n in names):
            self._add("no_readme", "*", "No README file found at the repository root")
        if not any(n.startswith(("license", "licence", "copying")) for n in names):
            self._add("no_license", "*", "No license file found at the repository root")
        if not self.has_ci:
            self._add("no_ci", "*", "No CI configuration detected")
        if ".gitignore" not in names:
            self._add("no_gitignore", "*", "No .gitignore found at the repository root")

    def calculate_score(self):
        """Return a heuristic audit score between 0 and 100.

        The original scoring method was absent from the supplied source.
        This repair defines a default: subtract the configured severity
        weight for every recorded occurrence, including overflow counts.
        The existing production_blocker check remains separate in execute().
        This heuristic does not certify production readiness.
        """
        penalty = sum(
            SEVERITY_WEIGHT[finding["severity"]] * finding["count"]
            for finding in self.findings
        )
        return max(0, 100 - penalty)

    def _log(self, message):
        """Write progress to stderr, honoring quiet mode when provided."""
        if not getattr(self.args, "quiet", False):
            print(message, file=sys.stderr, flush=True)
