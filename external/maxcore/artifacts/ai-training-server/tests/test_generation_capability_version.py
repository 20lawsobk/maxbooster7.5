"""Actual capability ASGI output matches the immutable plan version.

Only the production metadata route is extracted; no server startup, model,
learning worker, provider request or rendered artifact is required. These
checks do not establish generation availability or quality.
"""
import ast
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from ai_model.generation.plan import GenerationPlan

SERVER = Path(__file__).parents[1] / "server.py"


async def get_capabilities(app):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    path = "/api/generation/capabilities"
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
               "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode(),
               "root_path": "", "query_string": b"", "headers": [],
               "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80)}, receive, send)
    status = next(message["status"] for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return status, json.loads(body)


class GenerationCapabilityVersion(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app = FastAPI()
        nodes = [node for node in ast.parse(SERVER.read_text()).body
                 if isinstance(node, ast.AsyncFunctionDef) and node.name == "generation_capabilities"]
        self.assertEqual(len(nodes), 1, "exact production metadata function must exist")
        self.serving = {"active": None, "candidate_quality": "not_selected"}
        scope = {"app": app, "_serving_release_status": self.serving}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SERVER), "exec"), scope)
        self.app = app
        self.enterContext(patch("ai_model.awareness.current_snapshot", return_value=None))

    async def test_advertised_version_matches_actual_plans_for_all_supported_modalities(self):
        status, result = await get_capabilities(self.app)
        self.assertEqual(status, 200, result)
        for modality in ("text", "content", "image", "audio", "video", "campaign"):
            with self.subTest(modality=modality):
                plan = GenerationPlan.from_request({"topic": "My current release", "seed": 42}, modality)
                self.assertEqual(result["plan_version"], plan.to_dict()["version"])
                self.assertEqual(plan.seed, 42)

    async def test_static_metadata_preserves_unverified_runtime_quality_and_detached_renderers(self):
        status, result = await get_capabilities(self.app)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["runtime"], "not_probed")
        self.assertEqual(result["quality"], "not_evaluated")
        self.assertEqual(result["digital_gpu_exclusive"], "not_verified")
        self.assertEqual(result["serving_release"], self.serving)
        self.assertEqual(set(result["renderers"]), {"image", "audio", "video"})
        self.assertTrue(all(renderer["trained"] is False for renderer in result["renderers"].values()))
        result["renderers"]["image"]["trained"] = True
        second_status, second = await get_capabilities(self.app)
        self.assertEqual(second_status, 200, second)
        self.assertIs(second["renderers"]["image"]["trained"], False)
        self.assertNotIn("ready", second)
        self.assertNotIn("productionReady", second)


if __name__ == "__main__":
    unittest.main()
