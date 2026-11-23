import json
import os
import subprocess
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import production_audit_ai as audit_ai


class _AnthropicTestEndpoint(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        size = int(self.headers.get("Content-Length", "0"))
        self.server.requests.append(json.loads(self.rfile.read(size)))
        body = json.dumps({
            "id": "msg_local_test",
            "type": "message",
            "role": "assistant",
            "model": "claude-test",
            "content": [{"type": "text", "text": "local sdk response"}],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {"input_tokens": 2, "output_tokens": 3},
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return


class _FakeResponse:
    def __init__(self, content):
        self.content = content

    def model_dump(self, mode):
        if mode != "json":
            raise AssertionError("SDK response must be normalized as JSON")
        return {
            "id": "msg_test",
            "type": "message",
            "content": self.content,
            "stop_reason": "end_turn",
        }


class _FakeClient:
    def __init__(self, response):
        self.response = response
        self.request = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    class _Messages:
        def __init__(self, owner):
            self.owner = owner

        def create(self, **request):
            self.owner.request = request
            return self.owner.response

    @property
    def messages(self):
        return self._Messages(self)


class ProductionAuditSdkRuntimeTests(unittest.TestCase):
    def test_python_sdk_handles_text_generation_and_normalizes_response(self):
        response = _FakeResponse([
            {"type": "text", "text": "first"},
            {"type": "thinking", "thinking": "private reasoning"},
            {"type": "text", "text": " second"},
        ])
        fake_client = _FakeClient(response)
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "python",
        }), patch("anthropic.Anthropic", return_value=fake_client) as sdk:
            result = audit_ai.call_model("system prompt", "user prompt", "model-x", 900)

        self.assertEqual(result, "first second")
        sdk.assert_called_once_with(
            api_key="test-only-not-a-real-key",
            max_retries=4,
            timeout=300,
        )
        self.assertEqual(fake_client.request["model"], "model-x")
        self.assertEqual(fake_client.request["max_tokens"], 900)
        self.assertEqual(fake_client.request["messages"][0]["content"], "user prompt")

    def test_python_sdk_preserves_tool_use_blocks(self):
        tool_block = {
            "type": "tool_use",
            "id": "tool_123",
            "name": "read_file",
            "input": {"path": "README.md"},
        }
        fake_client = _FakeClient(_FakeResponse([tool_block]))
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "python",
        }), patch("anthropic.Anthropic", return_value=fake_client):
            result = audit_ai.call_model_tools(
                "system prompt",
                [{"role": "user", "content": "inspect README"}],
                [{"name": "read_file", "input_schema": {"type": "object"}}],
                "model-y",
                max_tokens=1000,
                thinking=1200,
            )

        self.assertEqual(result["content"], [tool_block])
        self.assertEqual(fake_client.request["thinking"], {
            "type": "enabled",
            "budget_tokens": 1200,
        })
        self.assertEqual(fake_client.request["max_tokens"], 2200)
        self.assertEqual(fake_client.request["tools"][0]["name"], "read_file")

    def test_key_is_required_before_any_runtime_is_started(self):
        with patch.dict(os.environ, {"ANTHROPIC_SDK_RUNTIME": "node"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "ANTHROPIC_API_KEY is not set"):
                audit_ai.call_model("system", "user", "model")

    def test_unknown_sdk_runtime_fails_closed(self):
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "unknown",
        }):
            with self.assertRaisesRegex(RuntimeError, "ANTHROPIC_SDK_RUNTIME must be one of"):
                audit_ai.call_model("system", "user", "model")

    def test_python_sdk_sends_one_request_to_local_test_endpoint(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _AnthropicTestEndpoint)
        server.requests = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "python",
            "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_address[1]}",
        }):
            self.assertEqual(
                audit_ai.call_model("test system", "test user", "claude-test", 32),
                "local sdk response",
            )
        self.assertEqual(len(server.requests), 1)
        self.assertEqual(server.requests[0]["model"], "claude-test")
        self.assertEqual(server.requests[0]["messages"][0]["content"], "test user")

    def test_node_and_dotnet_adapters_use_argv_and_json_stdin(self):
        expected = {
            "id": "msg_test",
            "content": [{"type": "text", "text": "ok"}],
        }
        for runtime in ("node", "dotnet"):
            with self.subTest(runtime=runtime):
                with patch.dict(os.environ, {
                    "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
                    "ANTHROPIC_SDK_RUNTIME": runtime,
                }), patch("production_audit_ai.subprocess.run") as run:
                    run.return_value = subprocess.CompletedProcess(
                        args=[], returncode=0, stdout=json.dumps(expected), stderr="",
                    )
                    with patch(
                        "production_audit_ai._dotnet_sdk_command",
                        return_value=["dotnet", "client.dll"],
                    ) as dotnet_command:
                        result = audit_ai.call_model("system", "user", "model-z")
                if runtime == "dotnet":
                    dotnet_command.assert_called_once()

                self.assertEqual(result, "ok")
                command = run.call_args.args[0]
                options = run.call_args.kwargs
                self.assertFalse(options.get("shell", False))
                self.assertEqual(json.loads(options["input"])["model"], "model-z")
                self.assertNotIn("test-only-not-a-real-key", options["input"])
                self.assertEqual(command[0], "node" if runtime == "node" else "dotnet")
                self.assertGreater(options["timeout"], 0)

    def test_invalid_subprocess_response_fails_closed(self):
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "node",
        }), patch(
            "production_audit_ai.subprocess.run",
            return_value=subprocess.CompletedProcess(
                args=[], returncode=0, stdout='{"content":null}', stderr="",
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "invalid message response"):
                audit_ai.call_model("system", "user", "model")

    def test_dotnet_sdk_sends_one_request_to_local_test_endpoint(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), _AnthropicTestEndpoint)
        server.requests = []
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        with patch.dict(os.environ, {
            "ANTHROPIC_API_KEY": "test-only-not-a-real-key",
            "ANTHROPIC_SDK_RUNTIME": "dotnet",
            "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_address[1]}",
        }):
            self.assertEqual(
                audit_ai.call_model("test system", "test user", "claude-test", 32),
                "local sdk response",
            )
            tool_response = audit_ai.call_model_tools(
                "test system",
                [{"role": "user", "content": "inspect README"}],
                [{
                    "name": "read_file",
                    "description": "Read a repository file",
                    "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}},
                }],
                "claude-test",
                max_tokens=64,
                thinking=1024,
            )
        self.assertEqual(tool_response["content"][0]["text"], "local sdk response")
        self.assertEqual(len(server.requests), 2)
        self.assertEqual(server.requests[0]["model"], "claude-test")
        self.assertEqual(server.requests[0]["messages"][0]["content"], "test user")
        self.assertEqual(server.requests[1]["tools"][0]["name"], "read_file")
        self.assertEqual(server.requests[1]["thinking"], {
            "type": "enabled",
            "budget_tokens": 1024,
        })


if __name__ == "__main__":
    unittest.main()
