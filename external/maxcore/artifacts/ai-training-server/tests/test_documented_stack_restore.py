"""Offline stack contracts: no server startup, storage, weights, or training."""
import ast
import asyncio
import contextvars
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


ROOT = Path(__file__).resolve().parents[1]


def server_functions(*names, **namespace):
    tree = ast.parse((ROOT / "server.py").read_text())
    nodes = [node for node in tree.body if isinstance(
        node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
    for node in nodes:
        node.decorator_list = []
    ns = {"asyncio": asyncio, "HTTPException": HTTPException, **namespace}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(ROOT / "server.py"), "exec"), ns)
    return ns


def test_executor_propagates_isolated_request_context():
    ns = server_functions("_in_thread")
    gpu = contextvars.ContextVar("test_gpu", default=None)

    async def request(value):
        token = gpu.set(value)
        try:
            return await ns["_in_thread"](gpu.get)
        finally:
            gpu.reset(token)

    async def run():
        return await asyncio.gather(request("one"), request("two"))

    assert asyncio.run(run()) == ["one", "two"]
    assert gpu.get() is None


def test_executor_cancellation_waits_for_actual_worker_exit():
    import threading

    ns = server_functions("_in_thread")
    entered, release, exited = threading.Event(), threading.Event(), threading.Event()

    def worker():
        entered.set()
        release.wait(3)
        exited.set()

    async def run():
        task = asyncio.create_task(ns["_in_thread"](worker))
        while not entered.is_set():
            await asyncio.sleep(0.001)
        task.cancel()
        await asyncio.sleep(0.01)
        assert not task.done()
        assert not exited.is_set()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert exited.is_set()

    asyncio.run(run())


def test_literal_direction_composes_real_model_without_claiming_raw_provenance():
    from ai_model.agents.script_agent import _apply_direction, ScriptResponse

    awareness = "[CONTROL_DIRECTION] " + json.dumps({
        "openingPhrase": "Quiet nights",
        "mustInclude": ["Paper Lanterns"],
    })
    result = _apply_direction(awareness, ScriptResponse(
        "Listen to this new song", "A mellow instrumental for your evening.",
        "Listen to the full song", "ai_model"))
    assert result.hook.startswith("Quiet nights")
    assert "Paper Lanterns" in result.body
    assert result.source == "model_composed"


def test_awareness_prompt_does_not_invent_checkpoint_special_tokens():
    from ai_model.agents.script_agent import _format_awareness_prefix

    result = _format_awareness_prefix(
        '[CONTROL_DIRECTION] {"openingPhrase": "Quiet nights"}')
    assert "Quiet nights" in result
    assert "<CREATIVE_DIRECTION>" not in result


def test_prompt_keeps_user_words_and_punctuation_without_fabricated_suffixes():
    from ai_model.agents.script_agent import ScriptRequest, _script_prompt

    req = ScriptRequest("Gold Rush", "instagram", "growth", "edgy",
                        target_audience="playlist listeners", genre="hip-hop")
    prompt = _script_prompt(req)
    assert "Gold Rush " in prompt and "Rush." not in prompt
    assert "Target: playlist listeners" in prompt
    assert "Genre: hip-hop" in prompt
    assert "Format: text." not in prompt
    req.idea = "Gold Rush."
    req.output_format = "thread"
    req.caption_length = "short"
    req.cta_strength = "strong"
    prompt = _script_prompt(req)
    assert "Gold Rush." in prompt  # caller punctuation is not stripped
    assert "Format: thread" in prompt
    assert "Length: short" in prompt
    assert "CTA: strong" in prompt


def test_composition_provenance_allowed_but_templates_still_rejected():
    ns = server_functions("_require_model_script", "_script_provenance", Any=object)
    script = SimpleNamespace(hook="Real hook", body="Real body", cta="Real CTA",
                             source="model_composed")
    ns["_require_model_script"](script)
    assert ns["_script_provenance"](script)["composition"] == "caller_direction"
    script.source = "awareness"
    with pytest.raises(HTTPException):
        ns["_require_model_script"](script)


def test_planner_routes_all_documented_modalities_without_claiming_model():
    import time
    import uuid

    ns = server_functions(
        "maxcore_generate_text", MaxcoreTextRequest=object,
        Depends=lambda x: None, require_scope=lambda x: None,
        time=time, uuid=uuid, _GENERATION_CONTRACT="documented-stack-v3",
        _merged_awareness_for=lambda req: "",
    )
    slots = [{"id": m, "modality": m, "platform": "instagram"}
             for m in ("text", "image", "audio", "video")]
    req = SimpleNamespace(mode="planner", input={"packSpec": slots})
    result = asyncio.run(ns["maxcore_generate_text"](req))
    assert [step["worker"] for step in result["steps"][1:]] == [
        "text", "image", "audio", "video"]
    assert result["source"] == "deterministic_planner"
    assert result["checkpoint_inference"] is False
    req.input["packSpec"] = [{"modality": "unsupported"}]
    with pytest.raises(HTTPException):
        asyncio.run(ns["maxcore_generate_text"](req))


def test_planner_topic_shorthand_retains_request_and_builds_real_slot():
    import time
    import uuid

    ns = server_functions(
        "_planner_inputs", "maxcore_generate_text", "api_generate_text",
        Any=object, ApiGenerateTextRequest=object, MaxcoreTextRequest=SimpleNamespace,
        Depends=lambda x: None, require_scope=lambda x: None,
        time=time, uuid=uuid, _GENERATION_CONTRACT="documented-stack-v3",
        _merged_awareness_for=lambda req: getattr(req, "awareness", ""),
    )
    fields = dict(mode="planner", inputs=None, topic="album release campaign",
                  prompt=None, platform="instagram", tone="excited", intent=None,
                  format=None, slots=None, instruction="Keep the artist name",
                  content_themes=["release"], awareness="Caller direction")
    req = SimpleNamespace(**fields, model_dump=lambda **kw:
                          {k: v for k, v in fields.items() if k != "inputs"})
    result = ns["_planner_inputs"](req)
    assert result["normalized"]["semantic"]["topic"] == fields["topic"]
    assert result["request"]["tone"] == "excited"
    assert result["request"]["instruction"] == "Keep the artist name"
    assert result["request"]["awareness"] == "Caller direction"
    assert result["packSpec"][0]["platform"] == "instagram"
    assert result["packSpec"][0]["modality"] == "text"
    planned = asyncio.run(ns["api_generate_text"](req))
    assert planned["steps"][1]["worker"] == "text"
    assert planned["normalizedInput"]["semantic"]["topic"] == "album release campaign"
    assert planned["source"] == "deterministic_planner"
    req.inputs = {"normalized": []}
    with pytest.raises(HTTPException):
        ns["_planner_inputs"](req)


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/@lunarvoss",
    "https://www.instagram.com/lunarvoss/",
])
def test_social_profile_identity_reaches_inference_without_fabricated_fetch(url, monkeypatch):
    import time
    from ai_model.url_parser import core

    monkeypatch.setattr(core, "parse_url", lambda *a, **kw: pytest.fail("profile identity needs no fetch"))

    async def ready():
        pass

    async def in_thread(fn):
        return fn()

    def generate(req):
        assert req.idea == "lunarvoss"
        raise ValueError("checkpoint vocabulary unavailable")

    ns = server_functions(
        "platform_social_generate", PlatformSocialRequest=object,
        Depends=lambda x: None, require_scope=lambda x: None,
        time=time, normalize_platform=lambda p: p,
        _build_personalized_tone=lambda *args: "excited",
        control_awareness=lambda req: "", _merged_awareness_for=lambda req: "",
        _effective_awareness=lambda platform, text: text,
        _wait_for_model_ready=ready, _in_thread=in_thread,
        _script_agent=SimpleNamespace(run=generate),
    )
    req = SimpleNamespace(topic=url, user_id="artist", platform="instagram",
                          tone="excited", goal="fanbase", num_variants=1,
                          target_audience="", output_format="text", caption_length="optimal",
                          call_to_action_strength="medium", genre="")
    with pytest.raises(HTTPException) as err:
        asyncio.run(ns["platform_social_generate"](req))
    assert err.value.status_code == 503  # model failure, not URL rejection/fake success


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/lunarvoss", "https://instagram.com.evil.test/lunarvoss",
    "https://user@instagram.com/lunarvoss", "https://instagram.com/p/opaque",
    "https://youtube.com/watch?v=opaque", "file://instagram.com/lunarvoss",
])
def test_profile_identity_never_turns_private_or_post_urls_into_claimed_content(url):
    from ai_model.url_parser.core import supplied_profile_identity
    assert supplied_profile_identity(url) is None


def test_video_checkpoint_unavailable_maps_to_503_not_500():
    import time

    async def ready():
        pass

    async def compute(*args):
        raise ValueError("checkpoint vocabulary unavailable")

    ns = server_functions(
        "platform_video_generate", PlatformVideoRequest=object,
        Depends=lambda x: None, require_scope=lambda x: None,
        time=time, normalize_platform=lambda p: p,
        _build_personalized_tone=lambda *args: "excited",
        _resolve_topic_from_url=lambda topic: topic,
        _merged_awareness_for=lambda req: "",
        _effective_awareness=lambda platform, text: text,
        _wait_for_model_ready=ready,
        _get_async_coalescer=lambda: SimpleNamespace(compute=compute),
    )
    req = SimpleNamespace(user_id="artist", platform="youtube", tone="excited",
                          duration_seconds=30, topic="new EP announcement",
                          style="cinematic", goal="engagement")
    with pytest.raises(HTTPException) as err:
        asyncio.run(ns["platform_video_generate"](req))
    assert err.value.status_code == 503


def test_model_failure_never_runs_awareness_template_substitute(monkeypatch):
    from ai_model.agents.script_agent import ScriptAgent, ScriptRequest

    class Model:
        def generate(self, *args, **kwargs):
            raise ValueError("checkpoint vocabulary unavailable")

    agent = ScriptAgent(Model())
    monkeypatch.setattr(agent, "_awareness_compose",
                        lambda req: pytest.fail("unrequested fallback"))
    with pytest.raises(ValueError, match="checkpoint vocabulary"):
        agent.run(ScriptRequest("Paper Lanterns", "instagram", "streams",
                                "calm", awareness="Quiet nights"))


def test_private_supervisor_auth_requires_secret_and_loopback(monkeypatch):
    import os
    import secrets

    monkeypatch.setenv("PDIM_LOCAL_CHANNEL_TOKEN", "test-private-channel")
    ns = server_functions(
        "verify_api_key", os=os, secrets=secrets, Request=object,
        Header=lambda _: None, _ENV_BYPASS_KEYS=set(),
    )
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    result = ns["verify_api_key"](authorization="Bearer test-private-channel", request=request)
    assert result["id"] == "local-supervisor"
    assert "admin" not in result["scopes"] and "train" not in result["scopes"]
    request.client.host = "203.0.113.20"
    with pytest.raises(HTTPException) as err:
        ns["verify_api_key"](authorization="Bearer test-private-channel", request=request)
    assert err.value.status_code == 403
    with pytest.raises(HTTPException) as err:
        ns["verify_api_key"](request=request)
    assert err.value.status_code == 401


def test_render_worker_owns_gpu_until_it_returns():
    from contextlib import contextmanager

    events = []

    class Pool:
        @contextmanager
        def spawn_sync(self, digest):
            events.append(("born", digest))
            try:
                yield object()
            finally:
                events.append(("dead", digest))

    ns = server_functions(
        "_run_gpu_job", _get_gpu_pool=lambda: Pool(),
        _job_update=lambda *a: pytest.fail("unexpected render failure"),
    )
    ns["_run_gpu_job"]("job-1", lambda: events.append(("worker", "job-1")))
    assert [event[0] for event in events] == ["born", "worker", "dead"]