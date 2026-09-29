"""Offline handler-contract tests. No server startup, media render or weight access."""
import ast
import asyncio
from dataclasses import FrozenInstanceError
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.generation.plan import GenerationPlan, active_plan, validate_output


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


TREE = ast.parse((ROOT / "server.py").read_text())


def handler_tools():
    nodes = [node for node in TREE.body if isinstance(node, ast.FunctionDef)
             and node.name in {"_planned_generation", "_job_digest", "_generation_plan_hash",
                               "_create_durable_render_manager"}]
    import hashlib
    import json
    async def in_thread(fn):
        return fn()
    scope = {"HTTPException": HTTPError, "_in_thread": in_thread, "Request": type("Request", (), {}),
             "_model_ready": True,
             "_UPLOADS_PATH": ROOT / "uploads", "hashlib": hashlib, "json": json,
             "_request_job_owner": SimpleNamespace(get=lambda: "signed-owner"),
             "_serving_release_status": {"active": "legacy-explicit-release"},
             "_persist_generation_job": lambda *args: None, "_job_read": lambda job: None}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), scope)
    return scope


class GenerationPlanTests(unittest.TestCase):
    def test_immutable_nested_data_and_stable_hash(self):
        data = {"topic": "Real release", "facts": [{"title": "My Song"}],
                "artist_context": {"name": "Artist"}, "provenance": {"source": "caller"},
                "constraints": {"max_chars": 80}, "modalities": ["text", "image"]}
        plan = GenerationPlan.from_request(data, "text")
        self.assertEqual(plan.plan_hash, GenerationPlan.from_request(dict(reversed(list(data.items()))), "text").plan_hash)
        data["facts"][0]["title"] = "Changed"
        self.assertEqual(plan.to_dict()["facts"][0]["title"], "My Song")
        self.assertNotEqual(plan.plan_hash, GenerationPlan.from_request(data, "text").plan_hash)
        with self.assertRaises(FrozenInstanceError):
            plan.topic = "changed"

    def test_invalid_plan_and_real_text_validation(self):
        with self.assertRaises(ValueError):
            GenerationPlan.from_request({"modalities": ["telepathy"]}, "text")
        with self.assertRaises(ValueError):
            GenerationPlan.from_request({"temperature": float("nan")}, "text")
        plan = GenerationPlan.from_request({"constraints": {"max_chars": 4}}, "text")
        for result in ({}, {"success": True}, {"text": "     "}, {"text": "too long"}):
            with self.assertRaises(ValueError):
                validate_output(plan, result)
        self.assertEqual(validate_output(plan, {"text": "real"})["quality"], "not_evaluated")

    def test_job_cache_identity_includes_all_plan_context(self):
        tools = handler_tools()
        hashes = []
        for facts in (["one"], ["two"]):
            token = active_plan.set(GenerationPlan.from_request({"facts": facts}, "audio"))
            try:
                hashes.append(tools["_job_digest"]({"genre": "trap"}))
            finally:
                active_plan.reset(token)
        self.assertNotEqual(*hashes)

    def test_handler_context_lifecycle_and_spec_honesty(self):
        tools = handler_tools()
        async def handler(req):
            self.assertEqual(active_plan.get().topic, "Caller topic")
            return {"outputs": [{"concept": "not an image"}]}
        decorated = tools["_planned_generation"]("image", specification=True)(handler)
        output = asyncio.run(decorated(SimpleNamespace(topic="Caller topic", facts=["real"])))
        self.assertEqual(output["kind"], "specification")
        self.assertFalse(output["validation"]["artifact_validated"])
        self.assertEqual(output["generation_plan"]["facts"], ["real"])
        self.assertIsNone(active_plan.get())

    def test_handler_failure_does_not_retry_or_manufacture_copy(self):
        calls = []
        async def handler(req):
            calls.append(req)
            return {"text": ""}
        decorated = handler_tools()["_planned_generation"]("text")(handler)
        with self.assertRaises(HTTPError) as raised:
            asyncio.run(decorated(SimpleNamespace(topic="Topic")))
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(len(calls), 1)
        self.assertIsNone(active_plan.get())

    def test_dedicated_handler_preserves_exact_controls(self):
        async def forbidden(req):
            self.fail("Legacy generator must not consume dedicated controls")
        controls = {"duration_sec": 1.25, "sample_rate": 16000, "instrument": "piano"}
        decorated = handler_tools()["_planned_generation"]("audio")(forbidden)
        with patch("ai_model.generation.dedicated.render", return_value={
                "url": "/uploads/test.wav", "validation": {
                    "artifact_validated": True, "quality": "not_evaluated"}}) as render:
            output = asyncio.run(decorated(SimpleNamespace(dedicated_controls=controls)))
        self.assertEqual(render.call_args.args[:2], ("audio", controls))
        self.assertTrue(output["validation"]["artifact_validated"])
        self.assertEqual(output["capability_status"]["digital_gpu_exclusive"], "not_verified")

    def test_actual_entry_points_are_wrapped(self):
        expected = {
            "generate_content", "platform_social_generate", "platform_social_autopilot",
            "platform_daw_generate", "platform_video_generate", "maxcore_generate_text",
            "maxcore_generate_image", "maxcore_generate_audio", "maxcore_generate_video",
            "api_generate_content", "api_generate_text", "api_generate_campaign",
            "api_generate_image", "api_generate_audio", "api_generate_video",
            "api_video_extend", "api_video_generate_ai"}
        covered = {node.name for node in TREE.body if isinstance(node, ast.AsyncFunctionDef)
                   and any(isinstance(d, ast.Call) and isinstance(d.func, ast.Name)
                           and d.func.id == "_planned_generation" for d in node.decorator_list)}
        self.assertTrue(expected <= covered, expected - covered)

    def test_actual_api_handlers_dispatch_dedicated_controls(self):
        # Compile the actual handlers without server startup side effects. Their
        # public signatures and production decorators are retained.
        scope = handler_tools()
        class App:
            def post(self, path):
                return lambda fn: fn
        scope.update({"app": App(), "Depends": lambda value: None,
                      "require_scope": lambda scope: None,
                      "ApiGenerateImageRequest": SimpleNamespace,
                      "ApiGenerateAudioRequest": SimpleNamespace,
                      "ApiGenerateVideoRequest": SimpleNamespace,
                      "ApiVideoExtendRequest": SimpleNamespace})
        names = {"api_generate_image", "api_generate_audio", "api_generate_video"}
        nodes = [node for node in TREE.body if isinstance(node, ast.AsyncFunctionDef) and node.name in names]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), scope)
        for name in names:
            controls = {"subject": "unsupported identity"}
            with patch("ai_model.generation.dedicated.render", side_effect=ValueError("Unsupported subject")):
                with self.assertRaises(HTTPError) as raised:
                    kwargs = {"req": SimpleNamespace(dedicated_controls=controls)}
                    if name == "api_generate_video":
                        kwargs["request"] = None
                    asyncio.run(scope[name](**kwargs))
            self.assertEqual(raised.exception.status_code, 422)
            self.assertIsNone(active_plan.get())

    def test_render_manager_recovers_journals_and_uses_verified_owner(self):
        scope = handler_tools()
        records = [{"job_id": "old", "render_manager": True, "status": "committing"},
                   {"job_id": "other", "dedicated": True}]
        scope["_journal_records"] = lambda: iter(records)
        saved = []
        scope["_job_write"] = lambda job, record: saved.append(record)
        class Manager:
            def __init__(self, persist_job):
                self.persist_job = persist_job
            def recover_jobs(self, values):
                self.recovered = values
            def render_thumbnail(self, sheet, image_engine=None, owner_id=None):
                self.persist_job({"job_id": "new", "owner_id": owner_id})
                return owner_id
        manager = scope["_create_durable_render_manager"](Manager)
        self.assertEqual(manager.recovered, records[:1])
        self.assertEqual(manager.render_thumbnail("sheet"), "signed-owner")
        self.assertEqual(saved[0]["owner_ids"], ["signed-owner"])
        self.assertTrue(saved[0]["render_manager"])
        with self.assertRaises(HTTPError):
            manager.render_thumbnail("sheet", owner_id="spoofed-body-owner")

    def test_dedicated_handler_requires_authenticated_owner(self):
        scope = handler_tools()
        scope["_request_job_owner"] = SimpleNamespace(get=lambda: None)
        async def forbidden(req):
            self.fail("Must not render without origin authentication")
        decorated = scope["_planned_generation"]("audio")(forbidden)
        with self.assertRaises(HTTPError) as raised:
            asyncio.run(decorated(SimpleNamespace(dedicated_controls={})))
        self.assertEqual(raised.exception.status_code, 403)

    def test_reviewed_candidate_allows_current_sampling_pipeline(self):
        scope = handler_tools()
        scope["_serving_release_status"] = {"active": "reviewed-candidate"}
        async def handler(req):
            return {"text": "Genuine model content"}
        output = asyncio.run(scope["_planned_generation"]("content")(handler)(SimpleNamespace(topic="Topic")))
        self.assertEqual(output["text"], "Genuine model content")

    def test_candidate_context_error_cannot_be_swallowed_into_template_success(self):
        from ai_model.generation.release import FailClosedCandidateAdapter
        from unittest.mock import Mock
        model = Mock()
        model.generate.side_effect = ValueError("Full prompt exceeds 128-byte context; no truncation")
        adapter = FailClosedCandidateAdapter(model)
        scope = handler_tools()
        async def legacy_agent_recovery(req):
            try:
                await asyncio.to_thread(adapter.generate, req.topic, temperature=.8, top_p=.92)
            except ValueError:
                pass  # emulate a legacy agent swallowing failure
            return {"text": "Template fallback must never escape"}
        decorated = scope["_planned_generation"]("content")(legacy_agent_recovery)
        with self.assertRaises(HTTPError) as raised:
            asyncio.run(decorated(SimpleNamespace(topic="Caller topic")))
        self.assertEqual(raised.exception.status_code, 422)
        self.assertIn("128-byte context", raised.exception.detail)
        model.generate.assert_called_once()


if __name__ == "__main__":
    unittest.main()