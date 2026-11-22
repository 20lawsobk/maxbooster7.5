"""Real ASGI planner requests without server startup, weights or provider calls."""
import ast
import asyncio
from hashlib import sha256
import json
import os
from pathlib import Path
import time
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import Mock, patch
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from ai_model.awareness import AwarenessUnavailable, Snapshot, bound_snapshot
from ai_model.awareness.engine import DOMAINS, canonical
from ai_model.agents.script_agent import ScriptAgent
from ai_model.generation.live_serving import LiveServingModel
from ai_model.generation.plan import active_plan, live_awareness_generation


SERVER = Path(__file__).parents[1] / "server.py"


def fresh_snapshot(now=None):
    now = time.time() if now is None else now
    domains, health = {}, {}
    for domain in DOMAINS:
        source = domain + "-public-fixture"
        text = domain + " observed public trend"
        citation = "https://example.org/" + domain
        row = {"source": source, "text": text, "citation": citation,
               "observed_at": now, "value": 10, "score": .5, "metric": "rank"}
        row["id"] = sha256(canonical([source, citation, text]).encode()).hexdigest()
        domains[domain] = [row]
        health[source] = {"ok": True, "domain": domain, "observed_at": now}
    doc = {"schema": 1, "created_at": now, "expires_at": now + 600,
           "domains": domains, "source_health": health,
           "ranking": "digital_gpu_awareness_software:v1;stable-id-ties;seed=0",
           "secondary": {}}
    doc["id"] = sha256(canonical(doc).encode()).hexdigest()
    return Snapshot.parse(doc, now=now)


def planner_app(model, learning_loop=None, script_agent=None):
    # Retain the actual Pydantic request models, route decorators, planner
    # bodies, shared context merge and immutable generation wrapper. Only the
    # process-wide startup/background services are excluded from this fixture.
    app = FastAPI()

    def require_scope(scope):
        async def check(request: Request):
            if request.headers.get("authorization") != "Bearer fixture-generation":
                raise HTTPException(status_code=401, detail="Generation credential required")
            return {"scope": scope}
        return check

    names = {"_AwarenessMixin", "_as_text", "_request_live_learning_check",
             "_live_awareness_capability", "unified_awareness_status",
             "_generation_readiness", "unified_awareness_readiness",
              "_generation_runtime_dependencies", "_generation_endpoint_catalog",
              "generation_readiness", "unified_awareness_context",
             "_merged_awareness_for",
             "_merged_awareness_legacy", "_planned_generation",
             "_is_live_awareness_text_request", "MaxcoreTextRequest",
             "ApiGenerateTextRequest", "ApiGenerateContentRequest", "_planner_inputs",
             "_require_model_script", "_script_provenance", "maxcore_generate_text",
             "api_generate_text", "api_generate_content"}
    tree = ast.parse(SERVER.read_text())
    nodes = [node for node in tree.body
             if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in names]
    class Pdim:
        def compute(self, key, build, namespace=""):
            return {"result": build(), "source": "compute"}

    class Coalescer:
        async def compute(self, key, build):
            return await build()

    async def in_thread(fn):
        return await asyncio.to_thread(fn)

    scope = {"app": app, "Any": Any, "Dict": Dict, "List": List, "Optional": Optional,
             "BaseModel": BaseModel, "Field": Field, "model_validator": model_validator,
             "Depends": Depends, "HTTPException": HTTPException, "Request": Request, "os": os,
              "require_scope": require_scope, "json": json, "time": time, "uuid": uuid,
              "_model_ready": False, "_trained_checkpoint_loaded": False,
              "_script_agent": script_agent, "_distribution_agent": None,
             "_live_serving_model": model,
             "_live_learning_loop": learning_loop,
              "_model_init_error": None,
             "_serving_release_status": {"checkpoint_sha256": "unrelated-checkpoint"},
              "_GENERATION_CONTRACT": "documented-stack-v3",
              "_effective_awareness": lambda platform, value: value,
              "_platform_optimization_awareness": lambda req: {},
              "_generation_plan_hash": lambda: "fixture-plan",
              "_ad_hook_score": lambda hook: 0.5,
              "_resolve_topic_from_url": lambda topic: topic,
              "_get_storage_mode": lambda: "live",
              "_get_pdim_orchestrator": lambda: Pdim(),
              "_get_async_coalescer": lambda: Coalescer(),
              "_in_thread": in_thread,
              "_platform_rules": {
                  "instagram": {"text": {
                      "recommendedLength": 220, "tone": ["authentic"],
                      "hashtags": {"max": 0, "allowed": False},
                  }},
              },
              "normalize_platform": lambda platform: str(platform).lower()}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SERVER), "exec"), scope)
    return app


async def post_json(app, path, body, *, authenticated=True):
    payload = json.dumps(body).encode()
    messages, received = [], False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": payload, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    headers = [(b"content-type", b"application/json")]
    if authenticated:
        headers.append((b"authorization", b"Bearer fixture-generation"))
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
               "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(),
               "root_path": "", "query_string": b"", "headers": headers,
               "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80)}, receive, send)
    status = next(message["status"] for message in messages
                  if message["type"] == "http.response.start")
    data = b"".join(message.get("body", b"") for message in messages
                    if message["type"] == "http.response.body")
    return status, json.loads(data)


async def get_json(app, path, *, authenticated=True):
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    headers = []
    if authenticated:
        headers.append((b"authorization", b"Bearer fixture-generation"))
    await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
               "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode(),
               "root_path": "", "query_string": b"", "headers": headers,
               "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 80)}, receive, send)
    status = next(message["status"] for message in messages
                  if message["type"] == "http.response.start")
    data = b"".join(message.get("body", b"") for message in messages
                    if message["type"] == "http.response.body")
    return status, json.loads(data)


class LiveAwarenessPlannerHTTP(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.snapshot = fresh_snapshot()
        self.engine = SimpleNamespace(
            current_snapshot=Mock(return_value=self.snapshot),
            status=Mock(return_value={"ready": True, "phase": "idle"}),
            readiness_status=Mock(return_value={"ready": True, "snapshot_ready": True}),
        )
        self.patches = [
            patch("ai_model.awareness.engine.get_engine", return_value=self.engine),
            patch("ai_model.awareness.get_engine", return_value=self.engine),
        ]
        for active_patch in self.patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)
        self.model = LiveServingModel()
        self.model.pin = Mock(wraps=self.model.pin)
        self.learning_loop = SimpleNamespace(
            status=Mock(return_value={
                "running": True, "training": "waiting_for_observations",
                "last_run_id": None,
                "awareness_endpoint_usage": {"uses": 0, "learning_check_signals": 0},
            }),
            request_learning_check=Mock(return_value=True),
        )
        self.app = planner_app(self.model, self.learning_loop)

    def assert_clean_context(self):
        self.assertIsNone(active_plan.get())
        self.assertFalse(live_awareness_generation.get())
        with self.assertRaises(AwarenessUnavailable):
            bound_snapshot()

    async def test_multimodal_planner_uses_fresh_awareness_without_model(self):
        status, result = await post_json(self.app, "/generate/text", {
            "mode": "planner", "awareness": "Caller creative context", "input": {
                "request": {"id": "fixture-request", "instruction": "Describe my new release"},
                "normalized": {"semantic": {"topic": "My release"}},
                "packSpec": [{"id": "caption", "modality": "text", "platform": "instagram"},
                             {"id": "artwork", "modality": "image", "platform": "instagram"}]}})
        self.assertEqual(status, 200, result)
        self.assertEqual(result["source"], "deterministic_planner")
        self.assertFalse(result["checkpoint_inference"])
        self.assertEqual(result["kind"], "specification")
        self.assertFalse(result["validation"]["artifact_validated"])
        self.assertEqual(result["generation_plan"]["checkpoint"], "")
        self.assertEqual(result["snapshot_id"], self.snapshot.id)
        self.assertEqual([step["worker"] for step in result["steps"]], ["text", "text", "image"])
        for step in result["steps"]:
            self.assertIn("observed public trend", step["params"]["awareness"])
            self.assertIn("Caller creative context", step["params"]["awareness"])
        self.model.pin.assert_not_called()
        self.assert_clean_context()

    async def test_live_awareness_readiness_does_not_claim_a_trained_model(self):
        status, _ = await get_json(self.app, "/api/awareness/unified/ready", authenticated=False)
        self.assertEqual(status, 401)
        status, result = await get_json(self.app, "/api/awareness/unified/ready")
        self.assertEqual(status, 503, result)
        self.assertFalse(result["ready"])
        self.assertTrue(result["live_model"]["available"])
        self.assertFalse(result["live_model"]["trained_model_loaded"])
        self.assertFalse(result["generation_ready"])

        status, result = await get_json(self.app, "/api/awareness/unified/status")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["live_model"]["available"])
        self.assertEqual(result["live_model"]["learning_state"], "waiting_for_observations")
        self.assertFalse(result["live_model"]["trained_candidate_serving"])

    async def test_live_awareness_is_a_generation_release_without_claiming_loaded_weights(self):
        app = planner_app(self.model, self.learning_loop, ScriptAgent(self.model))
        status, result = await get_json(app, "/api/ready")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["ready"])
        self.assertFalse(result["model_loaded"])
        self.assertTrue(result["generation_ready"])
        self.assertEqual(result["generation_mode"], "live_awareness")
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
            endpoint["online"]
            for endpoint in result["endpoint_routes"]["generation"].values()
        ))
        self.assertFalse(result["trained_checkpoint_ready"])

    async def test_real_script_agent_composes_from_bound_live_awareness_without_checkpoint(self):
        app = planner_app(self.model, self.learning_loop, ScriptAgent(self.model))
        brief = SimpleNamespace(tone="authentic", to_dict=lambda: {"tone": "authentic"})
        context = SimpleNamespace(
            brief=brief,
            awareness="short-form music discovery and listener conversation",
        )
        with patch("ai_model.generation.build_context", return_value=context), \
             patch("ai_model.request_intelligence.rank_candidates",
                   side_effect=lambda candidates, _brief: [(candidates[0], 1.0)]), \
             patch.dict(os.environ, {"MAXCORE_SERVING_RELEASE": "live-awareness"}):
            status, result = await post_json(app, "/api/generate/text", {
                "mode": "content",
                "topic": "Midnight Signal",
                "platform": "instagram",
                "goal": "introduce the single",
                "tone": "warm",
                "slots": 1,
            })
        self.assertEqual(status, 200, result)
        self.assertEqual(result["source"], "live_awareness")
        self.assertEqual(result["generation_mode"], "live_awareness")
        self.assertFalse(result["checkpoint_inference"])
        self.assertIn("Midnight Signal", result["text"])
        self.assertNotIn("observed public trend", result["text"])
        self.assertTrue(result["text"].strip())
        self.assert_clean_context()

    async def test_orchestrator_text_content_uses_the_same_live_awareness_release(self):
        app = planner_app(self.model, self.learning_loop, ScriptAgent(self.model))
        status, result = await post_json(app, "/generate/text", {
            "mode": "content",
            "awareness": "listener conversation and short-form music discovery",
            "input": {
                "normalized": {"semantic": {"topic": "Blue Hour", "intent": "announce"}},
                "step": {"params": {"slots": [
                    {"id": "caption", "platform": "instagram", "purpose": "release"},
                ]}},
                "inputs": {"normalized": {"semantic": {
                    "topic": "Blue Hour", "intent": "announce",
                }}},
            },
        })
        self.assertEqual(status, 200, result)
        self.assertEqual(result["generation_mode"], "live_awareness")
        self.assertFalse(result["checkpoint_inference"])
        self.assertEqual(result["outputs"][0]["meta"]["source"], "live_awareness")
        self.assertIn("Blue Hour", result["outputs"][0]["text"])
        self.assert_clean_context()

    async def test_awareness_context_use_signals_learning_outside_request_path(self):
        status, result = await post_json(self.app, "/api/awareness/unified/context", {
            "platform": "instagram", "modality": "text",
        })
        self.assertEqual(status, 200, result)
        self.assertTrue(result["ready"])
        self.assertEqual(result["snapshot_id"], self.snapshot.id)
        self.learning_loop.request_learning_check.assert_called_once_with()

    async def test_api_planner_alias_keeps_one_snapshot_and_caller_request(self):
        status, result = await post_json(self.app, "/api/generate/text", {
            "mode": "planner", "topic": "Independent release", "platform": "instagram",
            "instruction": "Keep the release date literal", "seed": 42})
        self.assertEqual(status, 200, result)
        self.assertEqual(result["source"], "deterministic_planner")
        self.assertFalse(result["checkpoint_inference"])
        self.assertEqual(result["snapshot_id"], self.snapshot.id)
        self.assertEqual(result["seed"], 42)
        self.assertEqual(result["generation_plan"]["checkpoint"], "")
        self.assertEqual(result["generation_plan"]["request"]["instruction"],
                         "Keep the release date literal")
        self.assertIn("observed public trend", result["steps"][0]["params"]["awareness"])
        self.engine.current_snapshot.assert_called_once()
        self.model.pin.assert_not_called()
        self.assert_clean_context()

    async def test_generation_without_a_live_composer_or_checkpoint_remains_unavailable(self):
        for path, body in [
                ("/generate/text", {"mode": "content", "input": {
                    "normalized": {"semantic": {"topic": "New release"}},
                    "step": {"params": {"slots": [{"platform": "instagram"}]}},
                    "inputs": {"normalized": {"semantic": {"topic": "New release"}}},
                }}),
                ("/api/generate/text", {"mode": "content", "topic": "New release"}),
                ("/api/generate/content", {"platform": "instagram", "topic": "New release",
                                           "tone": "warm", "mode": "planner"})]:
            with self.subTest(path=path):
                status, result = await post_json(self.app, path, body)
                self.assertEqual(status, 503, result)
                self.assertNotIn("text", result)
                self.assertNotIn("caption", result)
                self.assert_clean_context()
        self.assertEqual(self.model.pin.call_count, 1)

    async def test_missing_or_expired_awareness_does_not_become_planner_success(self):
        for snapshot in (None, fresh_snapshot(time.time() - 1000)):
            self.engine.current_snapshot.return_value = snapshot
            for path in ("/generate/text", "/api/generate/text"):
                with self.subTest(path=path, snapshot=snapshot is not None):
                    status, result = await post_json(self.app, path, {"mode": "planner"})
                    self.assertEqual(status, 503, result)
                    self.assertIn("Live awareness unavailable", result["detail"])
                    self.assert_clean_context()
        self.model.pin.assert_not_called()

    async def test_planner_preserves_validation_and_cannot_dispatch_render_controls(self):
        for body in [
                {"mode": "planner", "slots": [{"id": "bad", "modality": "telepathy"}]},
                {"mode": "planner", "seed": -1},
                {"mode": "planner", "dedicated_controls": {"render_engine": "procedural"}}]:
            with self.subTest(body=body):
                status, result = await post_json(self.app, "/api/generate/text", body)
                self.assertEqual(status, 422, result)
                self.assert_clean_context()
        self.model.pin.assert_not_called()

    async def test_actual_route_dependencies_still_require_generation_authentication(self):
        for path in ("/generate/text", "/api/generate/text"):
            status, result = await post_json(self.app, path, {"mode": "planner"},
                                             authenticated=False)
            self.assertEqual(status, 401, result)
        self.engine.current_snapshot.assert_not_called()
        self.model.pin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
