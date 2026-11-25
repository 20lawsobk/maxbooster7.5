import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.testing.common import run_command


class CommandHarnessTests(unittest.TestCase):
    def test_invalid_environment_is_reported_without_aborting_orchestration(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "invalid-environment.log"
            result = run_command(
                [sys.executable, "-c", "pass"],
                log,
                timeout=5,
                extra_env={"INVALID_OPTIONAL_VALUE": None},
            )

            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["exitCode"], 127)
            self.assertFalse(result["timedOut"])
            self.assertIn("NoneType", log.read_text())


if __name__ == "__main__":
    unittest.main()
