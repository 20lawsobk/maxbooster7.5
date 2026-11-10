"""Actual capability ASGI output matches the immutable plan version.

Only the production metadata route is extracted; no server startup, model,
learning worker, provider request or rendered artifact is required. These
checks do not establish generation availability or quality.
"""
import ast
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import Depends, FastAPI
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
        names = {"_live_awareness_capability", "_generation_readiness",
                 "generation_capabilities", "live_learning_status"}
        nodes = [node for node in ast.parse(SERVER.read_text()).body
                 if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
        self.assertEqual({node.name for node in nodes}, names,
                         "production capability and progress functions must exist")
        self.serving = {"active": None, "candidate_quality": "not_selected"}
        self.model_ready = False
        self.script_agent = object()
        self.learning_loop = SimpleNamespace(status=lambda: {
            "running": True, "training": "waiting_for_observations",
            "awareness_endpoint_usage": {"uses": 7, "learning_check_signals": 2},
        })
        self.live_serving_model = SimpleNamespace(
            available=False,
            status=lambda: {"candidate_quality": "awaiting_operational_public_live_candidate"},
        )
        scope = {
            "app": app, "Depends": Depends, "verify_admin": lambda: {"role": "admin"},
            "_serving_release_status": self.serving, "_model_ready": self.model_ready,
            "_script_agent": self.script_agent, "_live_learning_loop": self.learning_loop,
            "_live_serving_model": self.live_serving_model, "os": os,
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SERVER), "exec"), scope)
        self.app = app
        self.scope = scope
        self.awareness = SimpleNamespace(readiness_status=lambda: {"ready": True})
        self.enterContext(patch("ai_model.awareness.get_engine", return_value=self.awareness))
        self.enterContext(patch.dict(os.environ, {"MAXCORE_SERVING_RELEASE": "live-awareness"}))

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
        self.assertEqual(result["serving"]["generation_mode"], "live_awareness")
        self.assertTrue(result["serving"]["generation_ready"])
        self.assertTrue(result["serving"]["awareness_ready"])
        self.assertFalse(result["serving"]["model_loaded"])
        self.assertEqual(result["awareness_conditioning"]["modalities"],
                         ["text", "image", "audio", "video"])
        self.assertEqual(set(result["renderers"]), {"image", "audio", "video"})
        self.assertTrue(all(renderer["trained"] is False for renderer in result["renderers"].values()))
        result["renderers"]["image"]["trained"] = True
        second_status, second = await get_capabilities(self.app)
        self.assertEqual(second_status, 200, second)
        self.assertIs(second["renderers"]["image"]["trained"], False)
        self.assertNotIn("productionReady", second)

    async def test_training_progress_reports_real_awareness_use_separately_from_checkpoint(self):
        status, result = await get_capabilities(self.app)
        self.assertEqual(status, 200, result)
        # Exercise the authenticated live-learning status route with the same ASGI helper.
        messages = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            messages.append(message)

        path = "/api/training/live/status"
        await self.app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                        "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode(),
                        "root_path": "", "query_string": b"", "headers": [],
                        "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80)}, receive, send)
        response_status = next(message["status"] for message in messages
                               if message["type"] == "http.response.start")
        body = b"".join(message.get("body", b"") for message in messages
                        if message["type"] == "http.response.body")
        progress = json.loads(body)
        self.assertEqual(response_status, 200)
        self.assertTrue(progress["generation_ready"])
        self.assertEqual(progress["generation_mode"], "live_awareness")
        self.assertFalse(progress["model_loaded"])
        self.assertTrue(progress["learning"]["running"])
        self.assertEqual(progress["learning"]["awareness_endpoint_usage"]["uses"], 7)

    async def test_generation_capabilities_reports_unavailable_instead_of_asserting_serving(self):
        self.awareness.readiness_status = lambda: {"ready": False}
        status, result = await get_capabilities(self.app)
        self.assertEqual(status, 200, result)
        self.assertFalse(result["serving"]["generation_ready"])
        self.assertFalse(result["serving"]["awareness_ready"])
        self.assertEqual(result["serving"]["generation_mode"], "unavailable")


if __name__ == "__main__":
    unittest.main()
