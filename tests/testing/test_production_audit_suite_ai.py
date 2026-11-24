import contextlib
import io
import json
import os
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import production_audit_suite as suite
import production_audit_ai as audit_ai


class _LocalAnthropicEndpoint(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        body_size = int(self.headers.get("Content-Length", "0"))
        self.server.requests.append(json.loads(self.rfile.read(body_size)))
        response_body = json.dumps({
            "id": "msg_local_suite_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-test",
            "content": [{"type": "text", "text": "Local audit assessment."}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 3, "output_tokens": 4},
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def log_message(self, *_args):
        return


class ProductionAuditSuiteAiTests(unittest.TestCase):
    def test_package_scripts_wire_audit_review_and_one_pass_apply(self):
        package = json.loads((Path(__file__).resolve().parents[2] / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertEqual(
            scripts["audit:production"],
            "python3 production_audit_suite.py --audit-only",
        )
        self.assertEqual(
            scripts["audit:production:review"],
            "python3 production_audit_suite.py --ai-review",
        )
        self.assertEqual(
            scripts["audit:production:apply"],
            "python3 production_audit_suite.py --ai-review --apply",
        )
        self.assertEqual(
            scripts["test:production-audit-suite"],
            "PYTHONPATH=. python3 tests/testing/test_production_audit_suite_ai.py",
        )
        self.assertTrue(suite.build_parser().parse_args(["--apply"]).ai_remediate)
        self.assertEqual(
            suite.build_parser().parse_args([]).repo.resolve(),
            Path(suite.__file__).resolve().parent,
        )

    def test_ai_review_uses_each_official_sdk_runtime_once_locally(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _LocalAnthropicEndpoint)
        server.requests = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

        original_runtime = os.environ.get("ANTHROPIC_SDK_RUNTIME")
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_address[1]}",
        }):
            for runtime in ("python", "node", "dotnet"):
                with self.subTest(runtime=runtime):
                    result = suite._ai_review(
                        {
                            "production_score": 72,
                            "production_ready": False,
                            "finding_count": 1,
                            "blockers": 1,
                            "findings": [{
                                "severity": "HIGH",
                                "category": "Reliability",
                                "file": "src/app.py",
                                "title": "Missing error handling",
                                "details": "One finding from the deterministic scan.",
                                "recommendation": "Handle and report failures.",
                                "count": 1,
                                "rule": "no_error_handling",
                            }],
                        },
                        SimpleNamespace(sdk_runtime=runtime, model="claude-test"),
                    )
                    self.assertIn("Local audit assessment.", result)

        self.assertEqual(len(server.requests), 3)
        self.assertEqual(
            [request["messages"][0]["content"].find("One finding from the deterministic scan.")
             >= 0 for request in server.requests],
            [True, True, True],
        )
        self.assertEqual(
            os.environ.get("ANTHROPIC_SDK_RUNTIME"),
            original_runtime,
            "runtime selection must not leak after an AI operation",
        )

    def test_default_launch_selects_review_and_remediation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            observed = {}

            def deny_and_capture(args):
                observed["review"] = args.ai_review
                observed["remediate"] = args.ai_remediate
                return False

            with patch("production_audit_suite._confirm_ai", side_effect=deny_and_capture), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                result = suite.main(["--repo", temp_dir, "--workers", "1", "--quiet"])
        self.assertEqual(result, 2)
        self.assertEqual(observed, {"review": True, "remediate": True})

    def test_default_launch_fails_closed_without_sdk_key(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            errors = io.StringIO()
            with patch.dict(os.environ, {}, clear=True), \
                    patch.object(
                        suite.ProductionAuditEngine,
                        "execute",
                        side_effect=AssertionError("must fail before audit execution"),
                    ), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(errors):
                result = suite.main(["--repo", temp_dir, "--quiet"])
        self.assertEqual(result, 2)
        self.assertIn("AI mode requires ANTHROPIC_API_KEY", errors.getvalue())

    def test_local_only_mode_does_not_require_or_call_an_sdk(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            Path(temp_dir, "app.py").write_text("def run():\n    return True\n", encoding="utf-8")
            output = io.StringIO()
            with patch.dict(os.environ, {}, clear=True), \
                    patch("production_audit_ai.call_model", side_effect=AssertionError("must stay local")), \
                    contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
                result = suite.main(["--repo", temp_dir, "--workers", "1", "--quiet", "--local-only"])
        self.assertEqual(result, 0)
        self.assertIn("Production audit report", output.getvalue())

    def test_agent_uses_suite_scan_rules_and_strips_provider_key_from_tests(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            ignored_file = Path(temp_dir, "ignored.py")
            ignored_file.write_text(
                "# audit:ignore-file\n# TODO: ignored by suite policy\n",
                encoding="utf-8",
            )
            engine = suite.ProductionAuditEngine(
                Path(temp_dir),
                SimpleNamespace(
                    extra_code_ext=[],
                    scan_all=False,
                    max_scan_mb=10,
                    max_hits_per_file=100,
                    large_file_lines=1000,
                ),
            )
            agent = audit_ai.AgentRemediator(
                temp_dir,
                engine.cfg,
                SimpleNamespace(
                    model="claude-test",
                    test_cmd=None,
                    ai_thinking=0,
                    policy=None,
                    inhouse_dir="inhouse",
                ),
                extra_env={"ANTHROPIC_API_KEY": None},
                audit_module=suite,
            )
            self.assertIs(agent.audit, suite)
            self.assertNotIn("ANTHROPIC_API_KEY", agent.env)
            self.assertNotIn("ANTHROPIC_AUTH_TOKEN", agent.env)
            self.assertNotIn("ANTHROPIC_CUSTOM_HEADERS", agent.env)
            self.assertFalse(any(hit[0] == "todo" for hit in agent.scan("ignored.py")["hits"]))

    def test_remediation_is_wired_to_suite_rules_and_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            Path(temp_dir, "app.py").write_text("def run():\n    return True\n", encoding="utf-8")
            server = ThreadingHTTPServer(("127.0.0.1", 0), _LocalAnthropicEndpoint)
            server.requests = []
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(server.server_close)
            self.addCleanup(server.shutdown)
            observed = []

            class FakeAgent:
                def __init__(self, root, cfg, args, **kwargs):
                    observed.append({
                        "audit_module": kwargs["audit_module"],
                        "backup_dir": kwargs["backup_dir"],
                        "extra_env": kwargs["extra_env"],
                        "cfg": cfg,
                        "chat_fn": kwargs["chat_fn"],
                        "model": args.model,
                    })
                    self.calls = 0
                    self.baseline = "none"
                    self.test_cmd = []
                    self.records = []

                def run(self, audit_fn):
                    current = observed[-1]
                    current["runtime"] = os.environ.get("ANTHROPIC_SDK_RUNTIME")
                    current["chat_response"] = current["chat_fn"](
                        "system",
                        [{"role": "user", "content": "suite remediation test"}],
                        [{"name": "safe_test_tool", "input_schema": {"type": "object"}}],
                    )
                    return audit_fn()[1]

            backup_dirs = []
            with patch.dict(os.environ, {
                "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
                "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_address[1]}",
            }), patch("production_audit_ai.AgentRemediator", FakeAgent), \
                    contextlib.redirect_stderr(io.StringIO()):
                for runtime in ("python", "node", "dotnet"):
                    output = io.StringIO()
                    with self.subTest(runtime=runtime), contextlib.redirect_stdout(output):
                        result = suite.main([
                            "--repo", temp_dir,
                            "--workers", "1",
                            "--quiet",
                            "--apply",
                            "--confirm-ai",
                            "--sdk-runtime", runtime,
                            "--json",
                        ])
                    self.assertEqual(result, 0)
                    report = json.loads(output.getvalue())
                    self.assertEqual(report["ai_remediation"]["sdk_runtime"], runtime)
                    self.assertIn("records", report["ai_remediation"])
                    backup_dirs.append(observed[-1]["backup_dir"])

            self.assertEqual(
                [item["runtime"] for item in observed],
                ["python", "node", "dotnet"],
            )
            for item in observed:
                self.assertIs(item["audit_module"], suite)
                self.assertIn("code_exts", item["cfg"])
                self.assertIsNone(item["extra_env"]["ANTHROPIC_API_KEY"])
                self.assertIsNone(item["extra_env"]["ANTHROPIC_AUTH_TOKEN"])
                self.assertEqual(item["model"], "claude-sonnet-5-5")
                self.assertEqual(item["chat_response"]["content"][0]["text"], "Local audit assessment.")
            self.assertEqual(len(server.requests), 3)
            self.assertTrue(all(
                request["tools"][0]["name"] == "safe_test_tool"
                for request in server.requests
            ))
            for backup_dir in backup_dirs:
                shutil.rmtree(backup_dir, ignore_errors=True)

    def test_noninteractive_ai_mode_requires_explicit_confirmation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-only-not-a-real-key"}), \
                    patch("sys.stdin.isatty", return_value=False), \
                    contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                result = suite.main([
                    "--repo", temp_dir,
                    "--ai-review",
                    "--sdk-runtime", "python",
                ])
        self.assertEqual(result, 2)


if __name__ == "__main__":
    unittest.main()
