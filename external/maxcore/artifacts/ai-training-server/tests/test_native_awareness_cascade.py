"""Regression coverage for awareness at native MaxCore consumer seams."""

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

import server
from ai_model.generation import campaign
from ai_model.agents.script_agent import ScriptAgent, ScriptRequest


def _run(coro):
    return asyncio.run(coro)


def test_native_request_models_preserve_structured_and_direction_context():
    ad = server.AdGenerateRequest(
        user_id="artist-1",
        product="Real Release",
        platform="instagram",
        awareness={"contextString": "[HIGH] real caller signal"},
        description="A dark release trailer",
        prompt_url="",
        instruction="Keep the voice understated",
        extra_context="Recorded live",
        content_themes=["craft"],
        intent={"goal": "distinctive-intent-482"},
        direction={"preserve": "distinctive-direction-731"},
        context={"campaignId": "distinctive-context-956"},
    )
    extension = server.ApiVideoExtendRequest(
        source="job-1",
        awareness={"contextString": "[HIGH] continue the same visual story"},
        description="Continue after the reveal",
        instruction="Hold the blue palette",
    )
    optimize = server.ApiOptimizeAdRequest.model_validate({
        "action": "score",
        "campaign": {"ctr": 0.02},
        "intent": "improve-retention-distinctive",
        "direction": {"preserve": "headline-distinctive"},
        "context": {"campaignId": "campaign-distinctive"},
    })

    assert ad.awareness == "[HIGH] real caller signal"
    assert ad.description == "A dark release trailer"
    assert ad.extra_context == "Recorded live"
    assert ad.intent == {"goal": "distinctive-intent-482"}
    assert ad.direction == {"preserve": "distinctive-direction-731"}
    assert ad.context == {"campaignId": "distinctive-context-956"}
    assert extension.awareness == "[HIGH] continue the same visual story"
    assert extension.instruction == "Hold the blue palette"
    assert optimize.intent == "improve-retention-distinctive"
    assert optimize.direction == {"preserve": "headline-distinctive"}
    assert optimize.context == {"campaignId": "campaign-distinctive"}


def test_social_route_delivers_structured_envelope_to_agents(monkeypatch):
    seen = []

    class Agent:
        def run(self, request):
            seen.append(request)
            if hasattr(request, "idea"):
                return SimpleNamespace(
                    hook="real hook", body="real body", cta="real cta",
                    source="model",
                )
            return SimpleNamespace(
                caption="real caption", hashtags=["#real"],
                posting_time="18:00",
            )

    async def ready():
        return None

    monkeypatch.setattr(server, "_wait_for_model_ready", ready)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(server, "_distribution_agent", Agent())
    monkeypatch.setattr(server, "_fw_ingest", lambda *args, **kwargs: None)

    # Construct the real Pydantic route model from a JSON-shaped payload.
    req = server.PlatformSocialRequest.model_validate({
        "user_id": "artist-structured",
        "platform": "instagram",
        "topic": "real release",
        "intent": {"goal": "distinctive-intent-482"},
        "direction": {"preserve": "distinctive-direction-731"},
        "context": {"campaignId": "distinctive-context-956"},
        "awareness": {"contextString": "[HIGH] distinctive-awareness-214"},
    })

    result = _run(server.platform_social_generate(req, _key={}))

    assert result["success"] is True
    assert len(seen) == 2
    for consumed in seen:
        assert '"goal":"distinctive-intent-482"' in consumed.awareness
        assert '"preserve":"distinctive-direction-731"' in consumed.awareness
        assert '"campaignId":"distinctive-context-956"' in consumed.awareness
        assert "distinctive-awareness-214" in consumed.awareness
        assert "{'goal':" not in consumed.awareness  # no Python repr injection


def test_live_report_payload_conditions_real_agent_without_metadata_leak():
    prompts = []

    class LeakingModel:
        def generate(self, prompt, **kwargs):
            prompts.append(prompt)
            return (
                '<STAGE_HOOK>{"audienceAction":"save"} malformed direction metadata'
                "<STAGE_BODY>DIRECTION control metadata leaked into visible generated copy."
                "<STAGE_CTA>Save this post today.</STAGE_CTA>"
            )

    request = server.PlatformSocialRequest.model_validate({
        "user_id": "live-review",
        "platform": "instagram",
        "topic": "Signal Lantern release",
        "tone": "inspirational",
        "goal": "engagement",
        "instruction": "Open with SIGNAL LANTERN 47",
        "intent": {"audienceAction": "save this post after reading"},
        "direction": {
            "openingPhrase": "SIGNAL LANTERN 47",
            "voice": "inspirational and concise",
        },
        "context": {
            "campaignId": "signal-lantern-live-review",
            "audience": "independent music fans",
        },
        "awareness": {
            "contextString": "[HIGH] Instagram saves indicate lasting interest",
        },
    })
    awareness = server._merged_awareness_for(request)
    response = ScriptAgent(LeakingModel()).run(ScriptRequest(
        idea=request.topic,
        platform=request.platform,
        goal=request.goal,
        tone=request.tone,
        awareness=awareness,
    ))

    assert response.source == "awareness"
    assert response.hook.startswith("SIGNAL LANTERN 47")
    assert response.cta.startswith("Save this post")
    visible = " ".join((response.hook, response.body, response.cta))
    assert "audienceAction" not in visible
    assert "campaignId" not in visible
    assert "CONTROL_" not in visible
    assert "DIRECTION" not in visible
    assert not visible.lstrip().startswith("{")

    assert prompts
    prompt = prompts[0]
    assert "SIGNAL LANTERN 47" in prompt
    assert "save this post after reading" in prompt
    assert "independent music fans" in prompt
    assert "audienceAction" not in prompt
    assert "campaignId" not in prompt
    assert "CONTROL_" not in prompt
    assert not any(line.lstrip().startswith("{") for line in prompt.splitlines())


@pytest.mark.parametrize(
    ("instruction", "expected"),
    [
        ("Open with the exact phrase ORBIT GLASS 82", "ORBIT GLASS 82"),
        ('Begin the hook with the exact phrase "VELVET COMET 19".', "VELVET COMET 19"),
    ],
)
def test_real_agent_honors_exact_opening_wording(instruction, expected):
    class Model:
        def generate(self, prompt, **kwargs):
            return (
                "<STAGE_HOOK>A distinct native hook for this release."
                "<STAGE_BODY>A complete body that invites intentional listening."
                "<STAGE_CTA>Save this for release day.</STAGE_CTA>"
            )

    request = server.PlatformSocialRequest.model_validate({
        "user_id": "opening-review",
        "platform": "instagram",
        "topic": "Independent release",
        "instruction": instruction,
    })
    response = ScriptAgent(Model()).run(ScriptRequest(
        idea=request.topic,
        platform=request.platform,
        goal=request.goal,
        tone=request.tone,
        awareness=server._merged_awareness_for(request),
    ))

    assert response.source == "ai_model"
    assert response.hook.startswith(expected)
    assert "the exact phrase" not in response.hook.lower()


@pytest.mark.parametrize(
    "required",
    [
        ["COPPER ECHO 63"],
        ["NORTH STAR CASSETTE", "ROOM 28 SESSION"],
    ],
)
def test_real_agent_honors_structured_must_include_list(required):
    class Model:
        def generate(self, prompt, **kwargs):
            raise RuntimeError("exercise native awareness composition")

    request = server.PlatformSocialRequest.model_validate({
        "user_id": "must-include-review",
        "platform": "instagram",
        "topic": "Independent release",
        "direction": {
            "mustInclude": required,
            "voice": "concise and welcoming",
        },
        "awareness": {
            "contextString": "[HIGH] Instagram saves indicate lasting interest",
        },
    })
    response = ScriptAgent(Model()).run(ScriptRequest(
        idea=request.topic,
        platform=request.platform,
        goal=request.goal,
        tone=request.tone,
        awareness=server._merged_awareness_for(request),
    ))

    visible = " ".join((response.hook, response.body, response.cta))
    for phrase in required:
        assert phrase in visible
    assert "mustInclude" not in visible
    assert "CONTROL_" not in visible


def test_max_knowledge_assistant_remains_local_exempt_source():
    workspace = Path(__file__).resolve().parents[5]
    contract = (workspace / "server/lib/aiSource.ts").read_text(encoding="utf-8")
    assistant = (
        workspace / "server/services/maxAssistantService.ts"
    ).read_text(encoding="utf-8")

    assert 'sole exception being "Max"' in contract
    assert "answers from its local knowledge base" in contract
    assert "maxcoreDomainAdapter" not in assistant
    assert "pythonAIService" not in assistant


def test_daw_agents_receive_effective_awareness(monkeypatch):
    seen = []

    class Agent:
        def run(self, request):
            seen.append(request)
            return SimpleNamespace(
                hook="hook", body="body", cta="cta", source="model",
                thumbnail_prompt="visual", color_scheme="blue", layout="wide",
            )

    async def ready():
        return None

    monkeypatch.setattr(server, "_wait_for_model_ready", ready)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(server, "_visual_spec_agent", Agent())
    monkeypatch.setattr(server, "_fw_ingest", lambda *args, **kwargs: None)
    req = server.PlatformDAWRequest(
        user_id="artist-1",
        genre="r&b",
        mood="dark",
        awareness="[HIGH] real audience prefers sparse arrangements",
        instruction="Write in first person",
    )

    result = _run(server.platform_daw_generate(req, _key={}))

    assert result["source"] == "model"
    assert len(seen) == 2
    for consumed in seen:
        assert "[HIGH] real audience prefers sparse arrangements" in consumed.awareness
        assert "first person" in consumed.awareness.lower()
        assert consumed.awareness  # includes MaxCore's real platform layer too


def test_distribution_agent_receives_effective_awareness(monkeypatch):
    seen = []

    class Agent:
        def run(self, request):
            seen.append(request)
            return SimpleNamespace(
                caption="pitch", hashtags=["#real"], source="model",
            )

    async def ready():
        return None

    monkeypatch.setattr(server, "_wait_for_model_ready", ready)
    monkeypatch.setattr(server, "_distribution_agent", Agent())
    monkeypatch.setattr(server, "_fw_ingest", lambda *args, **kwargs: None)
    req = server.PlatformDistributionRequest(
        user_id="artist-1",
        track_title="Real Song",
        awareness="[HIGH] playlist editors prefer concise pitches",
        instruction="Lead with the live instrumentation",
    )

    result = _run(server.platform_distribution_plan(req, _key={}))

    assert result["source"] == "model"
    assert len(seen) == 1
    assert "[HIGH] playlist editors prefer concise pitches" in seen[0].awareness
    assert "live instrumentation" in seen[0].awareness.lower()


def test_audio_job_identity_contains_effective_awareness():
    source = __import__("inspect").getsource(server.api_generate_audio)
    assert '"awareness":  _effective_audio_awareness' in source
    assert "_effective_awareness(" in source


def test_platform_video_coalescer_uses_consumed_awareness():
    source = __import__("inspect").getsource(server.platform_video_generate)
    assert '"awareness": _vid_awareness' in source
    assert "_vid_awareness = _effective_awareness(" in source
    assert "awareness=_vid_aw" in source


def test_campaign_post_composer_adds_slot_platform_awareness(monkeypatch):
    seen = {}

    class Brief:
        suggested_cta = "Listen"

    def build_brief(**kwargs):
        seen.update(kwargs)
        return Brief()

    monkeypatch.setattr(
        "ai_model.request_intelligence.build_brief", build_brief
    )
    monkeypatch.setattr(
        "ai_model.request_intelligence.compose_caption",
        lambda *args, **kwargs: {
            "body": "body", "cta": "Listen",
            "variants": [{"body": "body", "cta": "Listen"}],
        },
    )
    monkeypatch.setattr(
        "ai_model.quality_awareness.platform_awareness_string",
        lambda platform: f"[PLATFORM QUALITY] {platform}",
    )

    campaign._compose_body_cta(
        title="Real Song", artist="Real Artist", platform="tiktok",
        goal="streams", theme="studio story", tone="quiet", genre="r&b",
        brand_voice=None, target_audience=None,
        awareness="[HIGH] real caller campaign signal",
    )

    assert "[HIGH] real caller campaign signal" in seen["awareness"]
    assert "[PLATFORM QUALITY] tiktok" in seen["awareness"]