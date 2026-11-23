import json
import os
from argparse import Namespace
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import production_audit as audit_engine
from production_audit_understand import Understander


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "production_audit_understand.py"


class ProductionAuditUnderstandCliTests(unittest.TestCase):
    def run_cli(self, *args, env=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_default_mode_writes_local_inventory_without_model_calls(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo"
            output = repo / "audit_reports"
            repo.mkdir()
            (repo / "app.py").write_text(
                "def run(value):\n    return value\n\n"
                "def unfinished():\n    ...\n",
                encoding="utf-8",
            )
            env = dict(os.environ)
            env.pop("ANTHROPIC_API_KEY", None)

            result = self.run_cli(
                "--repo",
                repo,
                "--output",
                output,
                "--source-input-sha256",
                "a" * 64,
                "--source-dirty-sha256",
                "b" * 64,
                env=env,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("deterministic local inventory", result.stdout)
            report_root = output / "understanding"
            intent_json = json.loads(
                (report_root / "intent_map.json").read_text(encoding="utf-8")
            )
            self.assertIn("app.py", intent_json["modules"])
            self.assertEqual(
                intent_json["scan_scope"]["verification_source_identity"],
                {"inputInventorySha256": "a" * 64, "dirtyInputSha256": "b" * 64},
            )
            symbols = intent_json["modules"]["app.py"]["symbols"]
            unfinished = next(item for item in symbols if item["qualname"] == "unfinished")
            self.assertEqual(unfinished["status"], "stub")
            self.assertTrue((report_root / "intent_map.md").is_file())
            self.assertFalse(any(report_root.glob("*.tmp")))

    def test_invalid_repository_fails_before_creating_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            missing_repo = Path(temporary) / "missing"
            output = Path(temporary) / "output"

            result = self.run_cli("--repo", missing_repo, "--output", output)

            self.assertEqual(result.returncode, 2)
            self.assertIn("--repo must point to an existing directory", result.stderr)
            self.assertFalse(output.exists())

    def test_output_path_rejects_symlink_ancestors(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo"
            outside = Path(temporary) / "outside"
            repo.mkdir()
            outside.mkdir()
            (repo / "app.py").write_text("def run():\n    return True\n", encoding="utf-8")
            (repo / "audit_reports").symlink_to(outside, target_is_directory=True)

            result = self.run_cli("--repo", repo, "--output", repo / "audit_reports")

            self.assertEqual(result.returncode, 2)
            self.assertIn("--output may not contain a symbolic link", result.stderr)
            self.assertFalse((outside / "understanding").exists())

    def test_source_fingerprints_must_be_valid_sha256_pairs(self):
        result = self.run_cli("--source-input-sha256", "not-a-hash")
        self.assertEqual(result.returncode, 2)
        self.assertIn("must be supplied together", result.stderr)

    def test_model_mode_fails_closed_without_api_key(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo"
            output = Path(temporary) / "output"
            repo.mkdir()
            (repo / "app.py").write_text("def run():\n    return True\n", encoding="utf-8")
            env = dict(os.environ)
            env.pop("ANTHROPIC_API_KEY", None)

            result = self.run_cli(
                "--repo",
                repo,
                "--output",
                output,
                "--model-assisted",
                "--confirm-source-upload",
                env=env,
            )

            self.assertEqual(result.returncode, 2)
            self.assertIn("requires ANTHROPIC_API_KEY", result.stderr)
            self.assertFalse(output.exists())

    def test_source_upload_confirmation_requires_model_mode(self):
        result = self.run_cli("--confirm-source-upload")
        self.assertEqual(result.returncode, 2)
        self.assertIn("requires --model-assisted", result.stderr)

    def test_readme_with_detected_secret_is_withheld_from_model_prompt(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            (repo / "README.md").write_text(
                "Example credential: AKIAIOSFODNN7EXAMPLE\n",
                encoding="utf-8",
            )
            cfg = {
                "code_exts": sorted(audit_engine.CODE_EXTENSIONS),
                "scan_all": False,
                "max_scan_mb": 0,
                "max_line": 5000,
                "max_hits_per_file": 200,
                "large_file_lines": 2000,
            }
            understander = Understander(
                repo,
                cfg,
                Namespace(),
                lambda: iter(()),
                model_fn=lambda *_: self.fail("README test must not call a model"),
            )

            self.assertIn("withheld", understander.readme())


if __name__ == "__main__":
    unittest.main()
