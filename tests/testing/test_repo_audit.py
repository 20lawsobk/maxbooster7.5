import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import repo_audit


def initialize_git_repository(root):
    subprocess.run(
        ["git", "-C", str(root), "init", "--quiet"],
        check=True,
        capture_output=True,
    )


class RepositoryAuditTests(unittest.TestCase):
    def test_missing_repository_is_rejected_before_output_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            missing_repo = root / "does-not-exist"
            output = root / "audit_reports"
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "repo_audit.py"),
                    "--repo",
                    str(missing_repo),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("--repo must point to an existing directory", result.stderr)
            self.assertFalse(output.exists())

    def test_scan_reads_workspace_files_once_and_excludes_generated_reports(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            initialize_git_repository(root)
            (root / "README.md").write_text("# Example\n", encoding="utf-8")
            (root / "app.py").write_text(
                "import logging\n"
                "def run():\n"
                "    try:\n"
                "        return True\n"
                "    except RuntimeError:\n"
                "        logging.exception('failed')\n",
                encoding="utf-8",
            )
            tests = root / "tests"
            tests.mkdir()
            (tests / "test_app.py").write_text("def test_run(): pass\n", encoding="utf-8")
            reports = root / "reports"
            reports.mkdir()
            (reports / "old_report.py").write_text("TODO fake test data\n", encoding="utf-8")
            generated = root / ".local"
            generated.mkdir()
            (generated / "old_copy.py").write_text("TODO fake test data\n", encoding="utf-8")
            output = root / "audit_reports"

            report = repo_audit.ProductionAuditEngine(root, output).execute()

            self.assertEqual(report["scan"]["filesVisited"], 3)
            self.assertEqual(report["scan"]["textFilesScanned"], 3)
            self.assertEqual(report["readiness_status"], "UNVERIFIED")
            self.assertFalse(report["production_ready"])
            self.assertNotIn("old_report.py", str(report["findings"]))
            self.assertNotIn("old_copy.py", str(report["findings"]))

    def test_clean_heuristic_scan_never_claims_production_readiness(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            initialize_git_repository(root)
            (root / "README.md").write_text("# Product\n", encoding="utf-8")
            (root / "service.py").write_text(
                "import logging\n"
                "def run():\n"
                "    try:\n"
                "        return logging.getLogger('app')\n"
                "    except RuntimeError:\n"
                "        return None\n",
                encoding="utf-8",
            )
            (root / "test_service.py").write_text("def test_service(): pass\n", encoding="utf-8")

            report = repo_audit.ProductionAuditEngine(root).execute()

            self.assertFalse(report["production_ready"])
            self.assertEqual(report["readiness_status"], "UNVERIFIED")
            self.assertIsNone(report["verified_production_blockers"])
            self.assertNotIn("production_score", report)
            self.assertTrue(report["scope"]["inventorySource"].startswith("git ls-files"))

    def test_report_replacement_is_atomic_and_leaves_no_temporary_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "audit_report.json"
            output.write_text("old\n", encoding="utf-8")

            repo_audit.write_report_atomically(output, "new\n")

            self.assertEqual(output.read_text(encoding="utf-8"), "new\n")
            self.assertEqual(list(output.parent.glob("*.tmp")), [])

    def test_empty_scope_and_output_over_repository_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            initialize_git_repository(root)
            with self.assertRaisesRegex(ValueError, "No files were found"):
                repo_audit.ProductionAuditEngine(root).execute()

            (root / "source.py").write_text("pass\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "repository root"):
                repo_audit.ProductionAuditEngine(root, root).execute()


if __name__ == "__main__":
    unittest.main()
