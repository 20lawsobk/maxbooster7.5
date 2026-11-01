"""Portable compiler verification must fail before an altered compiler is run."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("portable_rust", Path(__file__).resolve().parents[1] / "scripts/prepare-rust-toolchain.py")
portable = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portable)


class PortableRustVerification(unittest.TestCase):
    def fixture(self, root):
        (root / "bin").mkdir()
        for tool in ("rustc", "cargo"):
            (root / "bin" / tool).write_text("fixture")
        record = {"version": portable.VERSION, "target": portable.TARGET,
                  "archives": portable.ARCHIVES, "files": portable.inventory(root)}
        (root / "provenance.json").write_text(json.dumps(record))

    def test_intact_toolchain_checks_exact_versions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            with patch.object(portable.subprocess, "check_output", return_value="rustc 1.93.1 (fixture)") as run:
                portable.verify(root)
                self.assertEqual(run.call_count, 2)
            with patch.object(portable.subprocess, "check_output", return_value="rustc 1.92.0 (fixture)"):
                with self.assertRaisesRegex(RuntimeError, "Unexpected rustc version"):
                    portable.verify(root)

    def test_altered_or_added_toolchain_file_rejected_before_execution(self):
        for change in ("alter", "add"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.fixture(root)
                (root / "bin" / ("rustc" if change == "alter" else "injected")).write_text("changed")
                with patch.object(portable.subprocess, "check_output") as run:
                    with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
                        portable.verify(root)
                    run.assert_not_called()

    def test_unpinned_archive_provenance_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            record = json.loads((root / "provenance.json").read_text())
            record["archives"] = {**record["archives"], "rustc": "0" * 64}
            (root / "provenance.json").write_text(json.dumps(record))
            with self.assertRaisesRegex(RuntimeError, "provenance"):
                portable.verify(root)


if __name__ == "__main__":
    unittest.main()
