"""Real ASGI planner requests without server startup, weights or provider calls."""
import ast
import asyncio
from hashlib import sha256
import json
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
from ai_model.generation.live_serving import LiveServingModel
from ai_model.generation.plan import active_plan


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


def planner_app(model):
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

    names = {"_AwarenessMixin", "_as_text", "_merged_awareness_for",
             "_merged_awareness_legacy", "_planned_generation", "MaxcoreTextRequest",
             "ApiGenerateTextRequest", "ApiGenerateContentRequest", "_planner_inputs",
             "maxcore_generate_text", "api_generate_text", "api_generate_content"}
    tree = ast.parse(SERVER.read_text())
    nodes = [node for node in tree.body
             if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in names]
    scope = {"app": app, "Any": Any, "Dict": Dict, "List": List, "Optional": Optional,
             "BaseModel": BaseModel, "Field": Field, "model_validator": model_validator,
             "Depends": Depends, "HTTPException": HTTPException, "Request": Request,
             "require_scope": require_scope, "json": json, "time": time, "uuid": uuid,
             "_model_ready": False, "_script_agent": None, "_distribution_agent": None,
             "_live_serving_model": model,
             "_serving_release_status": {"checkpoint_sha256": "unrelated-checkpoint"},
             "_GENERATION_CONTRACT": "documented-stack-v3"}
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


class LiveAwarenessPlannerHTTP(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.snapshot = fresh_snapshot()
        self.engine = SimpleNamespace(current_snapshot=Mock(return_value=self.snapshot))
        self.patch = patch("ai_model.awareness.engine.get_engine", return_value=self.engine)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.model = LiveServingModel()
        self.model.pin = Mock(wraps=self.model.pin)
        self.app = planner_app(self.model)

    def assert_clean_context(self):
        self.assertIsNone(active_plan.get())
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

    async def test_actual_content_modes_remain_unavailable_without_capable_model(self):
        for path, body in [
                ("/generate/text", {"mode": "content", "input": {}}),
                ("/api/generate/text", {"mode": "content", "topic": "New release"}),
                ("/api/generate/content", {"platform": "instagram", "topic": "New release",
                                           "tone": "warm", "mode": "planner"})]:
            with self.subTest(path=path):
                status, result = await post_json(self.app, path, body)
                self.assertEqual(status, 503, result)
                self.assertIn("No operationally capable", result["detail"])
                self.assertNotIn("text", result)
                self.assertNotIn("caption", result)
                self.assert_clean_context()
        self.assertEqual(self.model.pin.call_count, 3)

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
