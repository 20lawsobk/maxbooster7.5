"""Exercise production gates without importing server's background daemons."""
import ast
import asyncio
from contextlib import nullcontext
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace
import time
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request
from starlette.responses import StreamingResponse
from ai_model.awareness import Snapshot, AwarenessUnavailable, bind, bound_snapshot
from ai_model.awareness.engine import DOMAINS, canonical
from ai_model.generation.plan import GenerationPlan, active_plan
from ai_model.generation.release import FailClosedCandidateAdapter
from ai_model.generation.dedicated import conditioned_controls

SERVER = Path(__file__).parents[1] / "server.py"
TREE = ast.parse(SERVER.read_text())


def snapshot(variant="one", now=None):
    now = time.time() if now is None else now
    domains, health = {}, {}
    for domain in DOMAINS:
        source = domain + "-fixture"
        text = domain + " observed chart " + variant
        citation = "https://example.org/" + domain
        row = {"source": source, "text": text, "citation": citation,
               "observed_at": now, "value": 10, "score": .5, "metric": "rank"}
        row["id"] = sha256(canonical([source, citation, text]).encode()).hexdigest()
        domains[domain] = [row]
        health[source] = {"ok": True, "domain": domain, "observed_at": now}
    doc = {"schema": 1, "created_at": now, "expires_at": now + 600,
           "domains": domains, "source_health": health,
           "ranking": "digital_gpu_awareness_software:v1;stable-id-ties;seed=0",
           "secondary": {"features_observed_at": now, "music_features": {
               "global": {"bpm_median": 98, "measured_previews": 3}}}}
    doc["id"] = sha256(canonical(doc).encode()).hexdigest()
    return Snapshot.parse(doc, now=now)


def production_gates():
    names = {"_planned_generation", "_run_gpu_job", "_in_thread", "_reject_serving_write"}
    selected = [n for n in TREE.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                and n.name in names]
    ns = {"Request": Request, "HTTPException": HTTPException, "asyncio": asyncio,
          "_model_ready": True, "_serving_release_status": {"checkpoint_sha256": "release"}}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(SERVER), "exec"), ns)
    return ns


class RouteBindings(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.ns = production_gates()
        self.snap = snapshot()
        self.engine = SimpleNamespace(require_snapshot=Mock(return_value=self.snap))
        self.patch = patch("ai_model.awareness.get_engine", return_value=self.engine)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    async def test_raw_dictionary_nested_alias_calls_acquire_once(self):
        gate = self.ns["_planned_generation"]
        @gate("text")
        async def legacy(req):
            self.assertEqual(bound_snapshot().id, self.snap.id)
            return {"text": "learned text"}
        @gate("text")
        async def alias(body: dict):
            return await legacy(body)
        result = await alias({"topic": "release", "seed": 7, "facts": "z" * 20000})
        self.assertEqual(result["snapshot_id"], self.snap.id)
        self.assertEqual(result["seed"], 7)
        self.engine.require_snapshot.assert_called_once()
        self.assertIsNone(active_plan.get())
        with self.assertRaises(AwarenessUnavailable):
            bound_snapshot()

    async def test_http_request_body_media_fails_before_handler(self):
        body = json.dumps({"prompt": "learned image"}).encode()
        async def receive():
            return {"type": "http.request", "body": body}
        request = Request({"type": "http", "method": "POST", "path": "/api/video/generate-ai",
                           "headers": []}, receive)
        called = []
        @self.ns["_planned_generation"]("video")
        async def raw(request: Request):
            called.append(True)
            return {"url": "not-real"}
        with self.assertRaises(HTTPException) as error:
            await raw(request)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(called, [])
        self.assertIsNone(active_plan.get())

    async def test_unavailable_and_bad_request_do_not_reach_worker(self):
        @self.ns["_planned_generation"]("text")
        async def handler(req):
            raise AssertionError("must not execute")
        self.engine.require_snapshot.side_effect = AwarenessUnavailable("offline")
        with self.assertRaises(HTTPException) as error:
            await handler({})
        self.assertEqual(error.exception.status_code, 503)
        self.engine.require_snapshot.side_effect = None
        with self.assertRaises(HTTPException) as error:
            await handler({"seed": -1})
        self.assertEqual(error.exception.status_code, 422)
        self.assertIsNone(active_plan.get())

    async def test_stream_and_thread_keep_snapshot_and_fail_before_headers(self):
        seen = []
        @self.ns["_planned_generation"]("text")
        async def stream(req):
            async def chunks():
                seen.append(await self.ns["_in_thread"](lambda: bound_snapshot().id))
                yield "first"
                seen.append(bound_snapshot().id)
                yield "second"
            return StreamingResponse(chunks(), media_type="text/plain")
        result = await stream({"seed": 12})
        self.assertEqual(result.body, b"firstsecond")
        self.assertEqual(seen, [self.snap.id, self.snap.id])
        self.assertEqual(result.headers["x-awareness-snapshot-id"], self.snap.id)
        self.engine.require_snapshot.assert_called_once()
        @self.ns["_planned_generation"]("text")
        async def broken(req):
            async def chunks():
                yield "not committed"
                raise AwarenessUnavailable("expired")
            return StreamingResponse(chunks())
        with self.assertRaises(HTTPException) as error:
            await broken({})
        self.assertEqual(error.exception.status_code, 503)
        self.assertIsNone(active_plan.get())

    async def test_async_job_uses_saved_snapshot_not_current_engine(self):
        with bind(self.snap):
            plan = GenerationPlan.from_request({"seed": 55}, "video", "release")
        saved = {"generation_plan": plan.to_dict()}
        self.ns["_job_read"] = lambda _: saved
        updates = []
        self.ns["_job_update"] = lambda _, value: updates.append(value)
        self.ns["_get_gpu_pool"] = lambda: SimpleNamespace(spawn_sync=lambda _: nullcontext())
        observed = []
        self.ns["_run_gpu_job"]("job", lambda: observed.append(
            (bound_snapshot().id, active_plan.get().seed)))
        self.assertEqual(observed, [(self.snap.id, 55)])
        self.engine.require_snapshot.assert_not_called()
        old = snapshot(now=time.time() - 1000)
        saved["generation_plan"]["snapshot"] = old.to_dict()
        self.ns["_run_gpu_job"]("job", lambda: observed.append("must not run"))
        self.assertEqual(len(observed), 1)
        self.assertEqual(updates[-1]["status"], "error")
        self.assertIsNone(active_plan.get())


class DirectContracts(unittest.TestCase):
    def test_request_schema_preserves_seed_and_complete_additive_context(self):
        from pydantic import BaseModel, Field, model_validator
        from typing import Optional, Any, List, Dict
        node = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == "_AwarenessMixin")
        ns = {"BaseModel": BaseModel, "Field": Field, "model_validator": model_validator,
              "Optional": Optional, "Any": Any, "List": List, "Dict": Dict, "json": json}
        exec(compile(ast.Module(body=[node], type_ignores=[]), str(SERVER), "exec"), ns)
        schema = ns["_AwarenessMixin"]
        req = schema(seed=17, facts="x" * 20000, optional_context={"full": "y" * 20000},
                     awareness={"contextString": "caller", "additionalFact": "preserved"})
        data = req.model_dump()
        self.assertEqual(data["seed"], 17)
        self.assertEqual(len(data["facts"]), 20000)
        self.assertEqual(data["optional_context"]["full"], "y" * 20000)
        self.assertEqual(json.loads(data["awareness"])["additionalFact"], "preserved")
        with self.assertRaises(ValueError):
            schema(seed=True)

    def test_installed_batching_accepts_sampling_api_and_retains_plan(self):
        from ai_model.generation.batching import install, execute_rows
        from ai_model.dynamic_batching import GenerateCoalescer
        snap = snapshot()
        seen = []
        model = SimpleNamespace(generate=lambda *args, **kwargs: "unused",
                                generate_batch_rows=lambda rows: [str(r["seed"]) for r in rows])
        with patch.object(GenerateCoalescer, "start"), patch.dict("os.environ", {"AI_DYNAMIC_BATCHING": "1"}):
            coalescer = install(model)
        def submit(row):
            seen.append(row)
            return execute_rows(model, [row])[0]
        coalescer.submit = submit
        with bind(snap):
            plan = GenerationPlan.from_request({"seed": 31}, "text", "release")
            token = active_plan.set(plan)
            try:
                self.assertEqual(model.generate("full prompt", seed=31, snapshot_hash=snap.id), "31")
            finally:
                active_plan.reset(token)
        self.assertIs(seen[0]["_plan"], plan)
        self.assertEqual(seen[0]["_snapshot"].id, snap.id)
        self.assertEqual(seen[0]["prompt"], "full prompt")
        with self.assertRaises(AwarenessUnavailable):
            model.generate("unbound prompt")

    def test_actual_batch_worker_preserves_each_row_and_partitions_snapshots(self):
        from ai_model.generation.batching import execute_rows, active_batch_plans
        snapshots = [snapshot("first"), snapshot("second")]
        rows = []
        for index, snap in enumerate([snapshots[0], snapshots[1], snapshots[0]]):
            with bind(snap):
                plan = GenerationPlan.from_request({"seed": index, "topic": str(index)}, "text", "release")
            rows.append({"prompt": str(index), "seed": plan.seed, "snapshot_hash": snap.id,
                         "_snapshot": snap, "_plan": plan})
        observed = []
        def batch(clean):
            plans = active_batch_plans.get()
            observed.append((bound_snapshot().id, [p.seed for p in plans]))
            self.assertTrue(all(r["snapshot_hash"] == bound_snapshot().id for r in clean))
            self.assertTrue(all("_plan" not in r for r in clean))
            return [r["prompt"] for r in clean]
        self.assertEqual(execute_rows(SimpleNamespace(generate_batch_rows=batch), rows), ["0", "1", "2"])
        self.assertEqual(observed, [(snapshots[0].id, [0, 2]), (snapshots[1].id, [1])])
        self.assertEqual(active_batch_plans.get(), ())
        old = snapshot(now=time.time() - 1000)
        rows[0]["_snapshot"] = old
        rows[0]["snapshot_hash"] = old.id
        model = Mock()
        with self.assertRaises(AwarenessUnavailable):
            execute_rows(model, rows)
        model.generate_batch_rows.assert_not_called()

    def test_selected_adapter_single_batch_stream_require_binding(self):
        underlying = Mock()
        adapter = FailClosedCandidateAdapter(underlying)
        for invoke in (lambda: adapter.generate("prompt"),
                       lambda: adapter.generate_batch(["one", "two"]),
                       lambda: adapter.generate_batch_rows([{"prompt": "one"}]),
                       lambda: adapter.generate_stream("prompt")):
            with self.assertRaises(AwarenessUnavailable):
                invoke()
        underlying.generate.assert_not_called()
        underlying.generate_batch.assert_not_called()

    def test_stream_adapter_retains_snapshot_when_consumed_later(self):
        snap = snapshot()
        seen = []
        def chunks(*args, **kwargs):
            seen.append((bound_snapshot().id, kwargs["snapshot_hash"]))
            yield "learned output"
        adapter = FailClosedCandidateAdapter(SimpleNamespace(generate_stream=chunks))
        with bind(snap):
            stream = adapter.generate_stream("prompt", seed=22)
        self.assertEqual(list(stream), ["learned output"])
        self.assertEqual(seen, [(snap.id, snap.id)])
        with self.assertRaises(AwarenessUnavailable):
            bound_snapshot()

    def test_agents_require_binding_before_model_use(self):
        from ai_model.agents.script_agent import ScriptAgent
        from ai_model.agents.distribution_agent import DistributionAgent
        from ai_model.agents.visual_spec_agent import VisualSpecAgent
        from ai_model.agents.optimization_agent import OptimizationAgent
        for agent_type in (ScriptAgent, DistributionAgent, VisualSpecAgent, OptimizationAgent):
            model = Mock()
            with self.assertRaises(AwarenessUnavailable):
                agent_type(model).run(SimpleNamespace())
            model.generate.assert_not_called()

    def test_agent_sampling_and_full_context_reach_actual_model_call(self):
        from ai_model.agents.visual_spec_agent import VisualSpecAgent, VisualSpecRequest
        snap = snapshot()
        model = Mock()
        model.generate.return_value = "A detailed dramatic stage composition with warm lights"
        agent = VisualSpecAgent(model)
        req = VisualSpecRequest(idea="record release", platform="instagram",
                                tone="warm", awareness="caller context " + "z" * 20000)
        with bind(snap):
            with self.assertRaises(AwarenessUnavailable):
                agent.run(req)
            plan = GenerationPlan.from_request(vars(req), "image", "release")
            token = active_plan.set(plan)
            try:
                agent.run(req)
            finally:
                active_plan.reset(token)
        prompt = model.generate.call_args.args[0]
        self.assertIn(req.awareness, prompt)
        self.assertEqual(model.generate.call_args.kwargs["seed"], plan.seed)
        self.assertEqual(model.generate.call_args.kwargs["snapshot_hash"], snap.id)

    def test_defaults_only_use_measured_absent_compatible_controls(self):
        with bind(snapshot()):
            self.assertEqual(conditioned_controls("audio", {})["bpm"], 98)
            self.assertEqual(conditioned_controls("audio", {"bpm": 131})["bpm"], 131)
            self.assertNotIn("bpm", conditioned_controls("audio", {"genre": "unknown"}))
            self.assertEqual(conditioned_controls("image", {"text": "user"}), {"text": "user"})

    def test_all_generation_and_ad_aliases_are_decorated(self):
        expected = {"/content/generate", "/generate/text", "/generate/image",
                    "/generate/audio", "/generate/video", "/api/generate/content",
                    "/api/generate/text", "/api/generate/image", "/api/generate/audio",
                    "/api/generate-video", "/api/video/generate-ai", "/api/video/extend",
                    "/platform/ads/generate", "/platform/ads/autopilot",
                    "/platform/ads/audience", "/platform/ads/optimize"}
        found = set()
        for node in TREE.body:
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            routes = [d.args[0].value for d in node.decorator_list if isinstance(d, ast.Call)
                      and isinstance(d.func, ast.Attribute) and d.func.attr == "post"
                      and d.args and isinstance(d.args[0], ast.Constant)]
            for route in set(routes) & expected:
                self.assertTrue(any(isinstance(d, ast.Call) and isinstance(d.func, ast.Name)
                                    and d.func.id == "_planned_generation" for d in node.decorator_list), route)
                found.add(route)
        self.assertEqual(found, expected)

    def test_serving_checkpoint_writes_reject_explicitly(self):
        with self.assertRaises(HTTPException) as error:
            production_gates()["_reject_serving_write"]()
        self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()