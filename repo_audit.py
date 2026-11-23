#!/usr/bin/env python3

import os
import re
import json
import argparse
import subprocess
import tempfile
from pathlib import Path
from dataclasses import dataclass, asdict
from collections import defaultdict
from datetime import datetime, timezone

MAX_FILE_SIZE_MB = 20

TODO_PATTERNS = [
    "TODO",
    "FIXME",
    "XXX",
    "HACK",
    "TEMP",
    "WIP"
]

PLACEHOLDER_PATTERNS = [
    "mock",
    "stub",
    "placeholder",
    "fake",
    "dummy",
    "sample data",
    "example data",
    "test data"
]

SECRET_PATTERNS = [
    r"""(?i)\b(?:api[_-]?key|client[_-]?secret|secret[_-]?key|private[_-]?key|password|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9/_+=.-]{16,}""",
    r"\bAKIA[0-9A-Z]{16}\b",
    r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b"
]

CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".mjs",
    ".cjs",
    ".jsx",
    ".ts",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".swift",
    ".kt",
    ".sql",
    ".sh",
    ".bash"
}

TEXT_EXTENSIONS = CODE_EXTENSIONS | {
    ".cfg",
    ".conf",
    ".css",
    ".env",
    ".html",
    ".ini",
    ".json",
    ".key",
    ".md",
    ".pem",
    ".properties",
    ".toml",
    ".txt",
    ".xml",
    ".yaml",
    ".yml"
}

TEXT_FILENAMES = {
    ".dockerignore",
    ".editorconfig",
    ".env",
    ".env.example",
    ".gitignore",
    "Dockerfile",
    "Makefile",
    "Procfile"
}
TEXT_FILENAMES_LOWER = {name.lower() for name in TEXT_FILENAMES}

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    "dist",
    "build",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    ".local",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "attached_assets",
    "audit_reports",
    "generated-artifacts",
    "reports",
    ".task123-publishing-candidate",
    ".pdim-scratch-external_maxcore-989"
}
SKIP_DIR_PREFIXES = (
    ".pdim-cluster-test-",
)

@dataclass
class Finding:
    severity: str
    category: str
    file: str
    title: str
    details: str
    recommendation: str
    requires_review: bool


class ProductionAuditEngine:

    def __init__(self, repo_root, output_dir=None):
        self.repo_root = Path(repo_root).expanduser().resolve()
        self.output_dir = (
            Path(output_dir).expanduser().resolve()
            if output_dir is not None
            else None
        )
        self.findings = []
        self.scan_stats = {
            "filesVisited": 0,
            "textFilesScanned": 0,
            "nonTextFilesSkipped": 0,
            "oversizedFilesSkipped": 0,
            "unreadableFiles": 0,
            "symlinksSkipped": 0
        }

    def execute(self):
        if not self.repo_root.is_dir():
            raise ValueError(f"Repository directory does not exist: {self.repo_root}")
        if (
            self.output_dir is not None
            and (
                self.output_dir == self.repo_root
                or self.output_dir in self.repo_root.parents
            )
        ):
            raise ValueError("--output must not be the repository root or one of its parents")

        print("Starting repository audit...")

        test_files = 0
        logging_found = False
        error_handling_found = False

        # Read each relevant file once. The earlier implementation walked and
        # reread the entire workspace once per heuristic, multiplying I/O cost.
        for path in self.walk_files():
            self.scan_stats["filesVisited"] += 1
            if self.scan_stats["filesVisited"] % 1000 == 0:
                print(f"Scanned {self.scan_stats['filesVisited']} repository paths...")
            name = path.name.lower()
            suffix = path.suffix.lower()

            if "test" in name or "spec" in name:
                test_files += 1

            if suffix not in TEXT_EXTENSIONS and name not in TEXT_FILENAMES_LOWER:
                self.scan_stats["nonTextFilesSkipped"] += 1
                continue

            try:
                size = path.stat().st_size
                if size > MAX_FILE_SIZE_MB * 1024 * 1024:
                    self.scan_stats["oversizedFilesSkipped"] += 1
                    continue
                content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                self.scan_stats["unreadableFiles"] += 1
                self.add_finding(
                    "LOW",
                    "Audit Coverage",
                    str(path.relative_to(self.repo_root)),
                    "File Could Not Be Read",
                    "The scanner could not read this file.",
                    "Check file permissions and rerun the audit.",
                    False
                )
                continue

            self.scan_stats["textFilesScanned"] += 1
            is_code = suffix in CODE_EXTENSIONS

            for pattern in SECRET_PATTERNS:
                if re.search(pattern, content, re.IGNORECASE):
                    # Report only the detector name, never the matched value.
                    self.add_finding(
                        "CRITICAL",
                        "Security",
                        str(path.relative_to(self.repo_root)),
                        "Potential Secret Reference Detected",
                        f"Matched detector: {pattern}",
                        "Review the file and keep actual credentials in secure environment storage.",
                        True
                    )

            relative_parts = path.relative_to(self.repo_root).parts
            is_test_source = (
                any(part.lower() in {"test", "tests", "spec", "specs"} for part in relative_parts[:-1])
                or name.startswith(("test_", "spec_"))
                or ".test." in name
                or ".spec." in name
            )
            is_scanner = path.resolve() == Path(__file__).resolve()
            if not is_code or is_test_source or is_scanner:
                continue

            if any(token in content for token in ("logger", "logging", "winston", "pino", "console.log")):
                logging_found = True
            if any(token in content for token in ("try:", "except", "catch(", "catch (")):
                error_handling_found = True

            for pattern in TODO_PATTERNS:
                if re.search(rf"\b{re.escape(pattern)}\b", content, re.IGNORECASE):
                    self.add_finding(
                        "HIGH",
                        "Incomplete Implementation",
                        str(path.relative_to(self.repo_root)),
                        f"{pattern} Found",
                        f"{pattern} detected",
                        "Review whether the marker represents unfinished production behavior.",
                        True
                    )

            lowered = content.lower()
            for pattern in PLACEHOLDER_PATTERNS:
                if re.search(rf"\b{re.escape(pattern)}\b", lowered):
                    self.add_finding(
                        "HIGH",
                        "Placeholder Logic",
                        str(path.relative_to(self.repo_root)),
                        "Placeholder Keyword Detected",
                        f"Matched keyword: {pattern}",
                        "Inspect the actual execution path before classifying this as incomplete.",
                        True
                    )

            line_count = len(content.splitlines())
            if line_count > 2000:
                self.add_finding(
                    "MEDIUM",
                    "Architecture",
                    str(path.relative_to(self.repo_root)),
                    "Oversized Source File",
                    f"{line_count} lines",
                    "Review whether the module has separable responsibilities.",
                    False
                )

        if self.scan_stats["filesVisited"] == 0:
            raise ValueError("No files were found in the repository scan scope")

        if test_files == 0:
            self.add_finding(
                "CRITICAL",
                "Testing",
                "*",
                "No Test Suite Detected",
                "No test files were found in the scanned repository scope.",
                "Add and run tests for supported user workflows.",
                True
            )

        if not logging_found:
            self.add_finding(
                "HIGH",
                "Observability",
                "*",
                "No Logging Detected",
                "Unable to detect a logging call in scanned source files.",
                "Review the logging architecture and its execution paths.",
                True
            )

        if not error_handling_found:
            self.add_finding(
                "HIGH",
                "Reliability",
                "*",
                "No Error Handling Detected",
                "Unable to detect exception handling in scanned source files.",
                "Review error handling in production execution paths.",
                True
            )

        if not any((self.repo_root / name).is_file() for name in ("README.md", "readme.md")):
            self.add_finding(
                "LOW",
                "Documentation",
                "*",
                "Missing README",
                "No root README.md was found.",
                "Add repository onboarding documentation.",
                False
            )

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "repository": str(self.repo_root),
            # Keyword scans are triage only and cannot certify production readiness.
            "production_ready": False,
            "readiness_status": "UNVERIFIED",
            "verified_production_blockers": None,
            "scope": {
                "description": "Heuristic scan of Git-listed active source and text configuration; generated reports, local state, ignored files, and named historical/scratch copies are excluded. This is not a product acceptance gate.",
                "skippedDirectories": sorted(SKIP_DIRS),
                "skippedDirectoryPrefixes": list(SKIP_DIR_PREFIXES),
                "ignoredFilesExcluded": True,
                "inventorySource": "git ls-files --cached --others --exclude-standard",
                "testSourcePolicy": "Test files are counted for presence but not searched for unfinished or placeholder implementation markers.",
                "outputDirectory": (
                    str(self.output_dir)
                    if self.output_dir is not None
                    else None
                )
            },
            "scan": dict(self.scan_stats),
            "finding_count": len(self.findings),
            "review_required_count": len(
                [f for f in self.findings if f.requires_review]
            ),
            "findings": [asdict(f) for f in self.findings]
        }

    def walk_files(self):
        try:
            result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(self.repo_root),
                    "ls-files",
                    "-z",
                    "--cached",
                    "--others",
                    "--exclude-standard",
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ValueError(
                "Could not enumerate repository files with Git; run this command inside a Git working tree."
            ) from error

        output_root = (
            self.output_dir
            if self.output_dir is not None
            else None
        )
        for raw_path in result.stdout.split(b"\0"):
            if not raw_path:
                continue
            relative_path = Path(os.fsdecode(raw_path))
            if (
                any(part in SKIP_DIRS for part in relative_path.parts)
                or any(
                    part.startswith(prefix)
                    for part in relative_path.parts
                    for prefix in SKIP_DIR_PREFIXES
                )
            ):
                continue

            path = self.repo_root / relative_path
            if path.is_symlink():
                self.scan_stats["symlinksSkipped"] += 1
                continue
            if output_root is not None:
                resolved = path.resolve()
                if resolved == output_root or output_root in resolved.parents:
                    continue
            yield path

    def read_file(self, path):
        return path.read_text(encoding="utf-8", errors="ignore")

    def add_finding(
        self,
        severity,
        category,
        file,
        title,
        details,
        recommendation,
        requires_review
    ):

        self.findings.append(
            Finding(
                severity,
                category,
                file,
                title,
                details,
                recommendation,
                requires_review
            )
        )

    def audit_todos(self):

        for path in self.walk_files():

            if path.suffix not in CODE_EXTENSIONS:
                continue

            content = self.read_file(path)

            for pattern in TODO_PATTERNS:

                if pattern in content:

                    self.add_finding(
                        "HIGH",
                        "Incomplete Implementation",
                        str(path),
                        f"{pattern} Found",
                        f"{pattern} detected",
                        "Complete unfinished implementation",
                        True
                    )

    def audit_placeholders(self):

        for path in self.walk_files():

            if path.suffix not in CODE_EXTENSIONS:
                continue

            content = self.read_file(path).lower()

            for pattern in PLACEHOLDER_PATTERNS:

                if pattern in content:

                    self.add_finding(
                        "HIGH",
                        "Placeholder Logic",
                        str(path),
                        "Placeholder Detected",
                        pattern,
                        "Replace with production implementation",
                        True
                    )

    def audit_secrets(self):

        for path in self.walk_files():

            content = self.read_file(path)

            for pattern in SECRET_PATTERNS:

                if re.search(
                    pattern,
                    content,
                    re.IGNORECASE
                ):

                    self.add_finding(
                        "CRITICAL",
                        "Security",
                        str(path),
                        "Potential Secret Detected",
                        pattern,
                        "Move secrets to secure environment storage",
                        True
                    )

    def audit_large_files(self):

        for path in self.walk_files():

            if path.suffix not in CODE_EXTENSIONS:
                continue

            content = self.read_file(path)

            lines = len(content.splitlines())

            if lines > 2000:

                self.add_finding(
                    "MEDIUM",
                    "Architecture",
                    str(path),
                    "Oversized File",
                    f"{lines} lines",
                    "Break into smaller modules",
                    False
                )

    def audit_tests(self):

        test_files = 0

        for path in self.walk_files():

            name = path.name.lower()

            if (
                "test" in name
                or "spec" in name
            ):
                test_files += 1

        if test_files == 0:

            self.add_finding(
                "CRITICAL",
                "Testing",
                "*",
                "No Test Suite Detected",
                "No tests discovered",
                "Create automated tests",
                True
            )

    def audit_logging(self):

        logging_found = False

        LOG_PATTERNS = [
            "logger",
            "logging",
            "winston",
            "pino",
            "console.log"
        ]

        for path in self.walk_files():

            content = self.read_file(path).lower()

            for pattern in LOG_PATTERNS:

                if pattern.lower() in content:
                    logging_found = True
                    break

            if logging_found:
                break

        if not logging_found:

            self.add_finding(
                "HIGH",
                "Observability",
                "*",
                "No Logging Detected",
                "Unable to detect logging framework",
                "Implement centralized logging",
                True
            )

    def audit_error_handling(self):

        found = False

        for path in self.walk_files():

            content = self.read_file(path)

            if (
                "try:" in content
                or "except" in content
                or "catch(" in content
                or "catch (" in content
            ):
                found = True
                break

        if not found:

            self.add_finding(
                "HIGH",
                "Reliability",
                "*",
                "No Error Handling Detected",
                "Unable to find exception handling",
                "Implement error handling strategy",
                True
            )

    def audit_documentation(self):

        candidates = [
            "README.md",
            "readme.md"
        ]

        found = False

        for name in candidates:

            if (self.repo_root / name).exists():
                found = True

        if not found:

            self.add_finding(
                "LOW",
                "Documentation",
                "*",
                "Missing README",
                "No repository documentation detected",
                "Create onboarding documentation",
                False
            )

    def generate_markdown(self, report):

        lines = []

        lines.append("# Production Audit Report")
        lines.append("")
        lines.append(
            f"Generated: {report['timestamp']}"
        )
        lines.append("")
        lines.append("Readiness: UNVERIFIED (heuristic scan is not a release gate)")
        lines.append("")
        lines.append(f"Repository: {report['repository']}")
        lines.append("")
        lines.append(f"Files visited: {report['scan']['filesVisited']}")
        lines.append(f"Text files scanned: {report['scan']['textFilesScanned']}")
        lines.append("")
        lines.append(f"Heuristic review signals: {report['finding_count']}")
        lines.append("Verified production blockers: not determined by this scanner.")
        lines.append("This heuristic report does not certify production readiness.")
        lines.append("")

        grouped = defaultdict(list)

        for f in report["findings"]:
            grouped[f["category"]].append(f)

        for category, findings in grouped.items():

            lines.append(f"## {category}")
            lines.append("")

            for item in findings:

                lines.append(
                    f"- [{item['severity']}] "
                    f"{item['title']}"
                )

                lines.append(
                    f"  File: {item['file']}"
                )

                lines.append(
                    f"  Details: {item['details']}"
                )

                lines.append(
                    f"  Recommendation: "
                    f"{item['recommendation']}"
                )

                lines.append("")

        return "\n".join(lines)


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--repo",
        required=True
    )

    parser.add_argument(
        "--output",
        default="audit_output"
    )

    args = parser.parse_args()

    repo_root = Path(args.repo).expanduser().resolve()
    if not repo_root.is_dir():
        parser.error(f"--repo must point to an existing directory: {repo_root}")

    output_dir = Path(args.output).expanduser().resolve()
    if output_dir == repo_root or output_dir in repo_root.parents:
        parser.error("--output must not be the repository root or one of its parents")
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = ProductionAuditEngine(repo_root, output_dir)

    try:
        report = engine.execute()
    except ValueError as error:
        parser.error(str(error))

    json_path = output_dir / "audit_report.json"
    md_path = output_dir / "audit_report.md"

    write_report_atomically(json_path, json.dumps(report, indent=2) + "\n")
    write_report_atomically(md_path, engine.generate_markdown(report) + "\n")

    print("\nAUDIT COMPLETE")
    print("-" * 50)
    print("Readiness: UNVERIFIED (heuristics are not a release gate)")
    print(
        f"Findings: "
        f"{report['finding_count']}"
    )
    print(f"Review signals: {report['review_required_count']}")
    print(
        f"JSON Report: {json_path}"
    )
    print(
        f"Markdown Report: {md_path}"
    )


def write_report_atomically(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as report_file:
            report_file.write(content)
            report_file.flush()
            os.fsync(report_file.fileno())
        os.replace(temporary_path, path)
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()