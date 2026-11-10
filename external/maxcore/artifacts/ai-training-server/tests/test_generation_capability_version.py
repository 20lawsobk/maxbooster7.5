"""Generation metadata and readiness route contracts for MaxCore ASGI.

The metadata/readiness handlers are extracted without server startup, a model,
learning worker, provider request, or rendered artifact. Dependency probes are
controlled for deterministic status assertions; media output acceptance lives
in the dedicated renderer HTTP tests.
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


async def get_capabilities(app, path="/api/generation/capabilities"):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

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
                 "_generation_runtime_dependencies", "_generation_endpoint_catalog",
                 "generation_capabilities", "generation_readiness",
                 "live_learning_status", "health", "api_warm_status"}
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
            "_model_init_error": None,
            "_script_agent": self.script_agent, "_live_learning_loop": self.learning_loop,
            "_live_serving_model": self.live_serving_model,
            "_generation_runtime_dependencies": lambda _modality: {
                "runtime_fixture": True},
            "_warm_status": {"state": "warm"},
            "_deep_warm_status": {"state": "pending"},
            "_start_time": 100.0,
            "_get_storage_mode": lambda: "test",
            "time": SimpleNamespace(time=lambda: 110.0),
            "os": os,
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
        endpoints = result["endpoint_routes"]
        self.assertEqual(endpoints["readiness"]["paths"], ["/ready", "/api/ready"])
        self.assertTrue(endpoints["readiness"]["ready"])
        self.assertEqual(endpoints["health"]["path"], "/health")
        self.assertTrue(endpoints["health"]["route_registered"])
        self.assertEqual(endpoints["warm_status"]["path"], "/api/warm/status")
        self.assertTrue(endpoints["warm_status"]["route_registered"])
        self.assertTrue(endpoints["warm_status"]["admin_only"])
        self.assertTrue(endpoints["warm_status"]["read_only"])
        self.assertEqual(endpoints["capabilities"]["path"], "/api/generation/capabilities")
        self.assertTrue(endpoints["capabilities"]["route_registered"])
        self.assertEqual(endpoints["awareness_status"]["path"], "/api/awareness/unified/status")
        self.assertTrue(endpoints["awareness_status"]["ready"])
        expected_paths = {
            "text": "/api/generate/text",
            "image": "/api/generate/image",
            "audio": "/api/generate/audio",
            "video": "/api/generate-video",
        }
        self.assertEqual(
            {name: endpoint["path"] for name, endpoint in endpoints["generation"].items()},
            expected_paths,
        )
        self.assertTrue(all(
            endpoint["route_declared"] and endpoint["shared_generation_gate_ready"]
            for endpoint in endpoints["generation"].values()
        ))
        self.assertTrue(all(
            endpoint["online"] and endpoint["ready"] and endpoint["status"] == "online"
            for endpoint in endpoints["generation"].values()
        ))
        self.assertFalse(endpoints["generation"]["text"]["trained"])
        self.assertTrue(all(
            endpoint["trained"] is False
            for name, endpoint in endpoints["generation"].items()
            if name != "text"
        ))
        self.assertIn("does not assert trained weights", endpoints["note"])
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
        self.assertFalse(result["endpoint_routes"]["readiness"]["ready"])
        self.assertFalse(result["endpoint_routes"]["awareness_status"]["ready"])
        self.assertTrue(all(
            endpoint["online"] is False and endpoint["status"] == "blocked"
            for endpoint in result["endpoint_routes"]["generation"].values()
        ))

    async def test_ready_exposes_each_generation_route_and_actual_renderer_gate(self):
        status, result = await get_capabilities(self.app, "/ready")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["ready"])
        self.assertTrue(result["endpoint_routes"]["readiness"]["ready"])
        self.assertEqual(result["endpoint_routes"]["readiness"]["paths"],
                         ["/ready", "/api/ready"])
        self.assertFalse(result["model_loaded"])
        self.assertEqual(
            {name: endpoint["path"] for name, endpoint
             in result["endpoint_routes"]["generation"].items()},
            {
                "text": "/api/generate/text",
                "image": "/api/generate/image",
                "audio": "/api/generate/audio",
                "video": "/api/generate-video",
            },
        )
        self.assertTrue(all(
            endpoint["online"] and endpoint["route_declared"]
            for endpoint in result["endpoint_routes"]["generation"].values()
        ))
        self.assertEqual(
            result["endpoint_routes"]["generation"]["text"]["serving_mode"],
            "live_awareness",
        )
        self.assertTrue(all(
            result["endpoint_routes"]["generation"][modality]["serving_mode"]
            == "procedural_renderer"
            for modality in ("image", "audio", "video")
        ))
        self.assertTrue(all(
            result["endpoint_routes"]["generation"][modality]["trained"] is False
            for modality in ("image", "audio", "video")
        ))

    async def test_ready_fails_when_a_required_modality_runtime_dependency_is_missing(self):
        self.scope["_generation_runtime_dependencies"] = lambda modality: {
            "required_renderer": modality != "audio",
        }
        status, result = await get_capabilities(self.app, "/api/ready")
        self.assertEqual(status, 503, result)
        self.assertFalse(result["ready"])
        self.assertTrue(result["endpoint_routes"]["generation"]["text"]["online"])
        self.assertFalse(result["endpoint_routes"]["generation"]["audio"]["online"])
        self.assertEqual(
            result["endpoint_routes"]["generation"]["audio"]["readiness_reason"],
            "runtime_dependencies_missing",
        )
        self.assertTrue(result["endpoint_routes"]["generation"]["video"]["online"])

    async def test_health_liveness_includes_route_catalog_without_claiming_checkpoint_loaded(self):
        with patch("ai_model.capabilities.capabilities", return_value={
            "image": {"renderer": "image-test", "trained": False},
            "audio": {"renderer": "audio-test", "trained": False},
            "video": {"renderer": "video-test", "trained": False},
        }):
            status, result = await get_capabilities(self.app, "/health")
        self.assertEqual(status, 200, result)
        self.assertEqual(result["status"], "healthy")
        self.assertFalse(result["model_loaded"])
        self.assertEqual(result["endpoint_routes"]["health"]["path"], "/health")
        self.assertEqual(
            result["endpoint_routes"]["warm_status"]["path"],
            "/api/warm/status",
        )
        self.assertEqual(
            result["endpoint_routes"]["readiness"]["paths"],
            ["/ready", "/api/ready"],
        )

    async def test_warm_status_includes_runtime_routes_and_remains_read_only(self):
        with patch("ai_model.capabilities.capabilities", return_value={
            "image": {"renderer": "image-test", "trained": False},
            "audio": {"renderer": "audio-test", "trained": False},
            "video": {"renderer": "video-test", "trained": False},
        }):
            status, result = await get_capabilities(self.app, "/api/warm/status")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["awareness_ready"])
        self.assertTrue(result["generation_ready"])
        self.assertEqual(result["endpoint_routes"]["health"]["path"], "/health")
        self.assertEqual(
            result["endpoint_routes"]["warm_status"]["path"],
            "/api/warm/status",
        )
        self.assertEqual(result["deep_warm"], self.scope["_deep_warm_status"])

    async def test_health_stays_live_but_fails_closed_when_endpoint_inspection_errors(self):
        with patch(
            "ai_model.capabilities.capabilities",
            side_effect=RuntimeError("renderer inspection failed"),
        ):
            status, result = await get_capabilities(self.app, "/health")
        self.assertEqual(status, 200, result)
        self.assertEqual(result["status"], "healthy")
        self.assertFalse(result["generation_ready"])
        self.assertFalse(result["endpoint_routes"]["readiness"]["ready"])
        self.assertFalse(result["endpoint_routes"]["catalog_available"])

    async def test_warm_status_remains_available_but_blocks_generation_on_catalog_error(self):
        with patch(
            "ai_model.capabilities.capabilities",
            side_effect=RuntimeError("renderer inspection failed"),
        ):
            status, result = await get_capabilities(self.app, "/api/warm/status")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["awareness_ready"])
        self.assertFalse(result["generation_ready"])
        self.assertFalse(result["endpoint_routes"]["readiness"]["ready"])
        self.assertFalse(result["endpoint_routes"]["catalog_available"])


if __name__ == "__main__":
    unittest.main()
