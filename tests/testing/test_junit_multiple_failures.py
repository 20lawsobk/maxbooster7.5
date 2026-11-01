"""JUnit evidence must retain failed cases with multiple assertion details."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/testing"))
spec = importlib.util.spec_from_file_location("junit_parent", ROOT / "scripts/testing/run-all.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def document(children, failures=1):
    return (
        f'<testsuites tests="1" failures="{failures}" errors="0">'
        f'<testsuite tests="1" failures="{failures}" errors="0" skipped="0">'
        f'<testcase name="case">{children}</testcase></testsuite></testsuites>'
    ).encode()


class JunitMultipleFailures(unittest.TestCase):
    def test_multiple_failures_remain_one_failed_case(self):
        counts = runner._junit_counts(document('<failure>one</failure><failure>two</failure>'))
        self.assertEqual(counts["total"], 1)
        self.assertEqual(counts["failed"], 1)
        self.assertEqual(counts["passed"], 0)

    def test_conflicting_outcomes_are_rejected(self):
        for other in ("error", "skipped"):
            with self.subTest(other=other), self.assertRaisesRegex(ValueError, "ambiguous"):
                runner._junit_counts(document(f"<failure/><{other}/>"))

    def test_failure_cannot_be_hidden_by_success_counters(self):
        with self.assertRaisesRegex(ValueError, "counters disagree"):
            runner._junit_counts(document("<failure/><failure/>", failures=0))


if __name__ == "__main__":
    unittest.main()
