from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_model.generation.social_controls import (
    SocialGenerationControls,
    apply_social_controls,
    control_awareness,
)
from ai_model.agents.script_agent import ScriptAgent, ScriptRequest
from ai_model.url_parser import core as url_core


def test_pydantic_schema_accepts_every_social_url_ui_control() -> None:
    controls = SocialGenerationControls.model_validate({
        "output_format": "video",
        "target_audience": "late-night electronic music fans",
        "hashtag_strategy": "branded",
        "caption_length": "short",
        "call_to_action_strength": "low",
    })
    schema = SocialGenerationControls.model_json_schema()["properties"]
    assert controls.output_format == "video"
    assert set(schema) == {
        "output_format",
        "target_audience",
        "hashtag_strategy",
        "caption_length",
        "call_to_action_strength",
        "genre",
        "content_type",
    }
    assert "late-night electronic music fans" in control_awareness(controls)
    assert "video content" in control_awareness(controls)


def test_platform_endpoint_schema_inherits_the_real_control_contract() -> None:
    from server import PlatformSocialRequest

    request = PlatformSocialRequest.model_validate({
        "user_id": "artist-1",
        "topic": "https://artist.example/night-drive",
        "platform": "instagram",
        "tone": "inspirational",
        "num_variants": 1,
        "output_format": "video",
        "target_audience": "late-night electronic music fans",
        "hashtag_strategy": "branded",
        "caption_length": "short",
        "call_to_action_strength": "low",
        "genre": "electronic",
        "content_type": "track",
    })
    endpoint_fields = PlatformSocialRequest.model_json_schema()["properties"]
    assert request.num_variants == 1
    assert request.output_format == "video"
    assert {
        "target_audience",
        "hashtag_strategy",
        "caption_length",
        "call_to_action_strength",
        "genre",
        "content_type",
    }.issubset(endpoint_fields)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("output_format", "hologram"),
        ("hashtag_strategy", "fake"),
        ("caption_length", "huge"),
        ("call_to_action_strength", "extreme"),
    ],
)
def test_pydantic_schema_rejects_unsupported_controls(
    field: str, value: str
) -> None:
    with pytest.raises(ValidationError):
        SocialGenerationControls.model_validate({field: value})


def test_native_consumer_applies_length_cta_and_hashtag_controls() -> None:
    result = apply_social_controls(
        hook="A genuine native hook",
        body=" ".join(["native"] * 80),
        cta="You must listen right now!",
        hashtags=["#Trending", "#Electronic", "#NightMusic", "#Producer"],
        topic="Night Drive by Actual Artist",
        controls=SocialGenerationControls(
            caption_length="short",
            call_to_action_strength="low",
            hashtag_strategy="branded",
        ),
    )
    assert len(result["caption"]) <= 160
    assert "must" not in result["cta"].lower()
    assert "right now" not in result["cta"].lower()
    assert result["hashtags"][0] == "#NightDriveBy"
    assert result["hook"] == "A genuine native hook"
    assert result["body"]


def test_trending_strategy_returns_only_explicitly_evidenced_tags() -> None:
    controls = SocialGenerationControls(hashtag_strategy="trending")
    result = apply_social_controls(
        hook="Native hook",
        body="Native body",
        cta="Native CTA",
        hashtags=["#ActuallyTrending", "#Generic", "#Synthesised"],
        topic="Actual topic",
        controls=controls,
        awareness=(
            "=== TRENDING TOPICS ===\n"
            "Trending: #ActuallyTrending\n"
            "=== PLATFORM NOTES ===\n"
            "Tags: #Generic"
        ),
    )
    assert result["hashtags"] == ["#ActuallyTrending"]

    no_evidence = apply_social_controls(
        hook="Native hook",
        body="Native body",
        cta="Native CTA",
        hashtags=["#Generic"],
        topic="Actual topic",
        controls=controls,
        awareness="Tags: #Generic",
    )
    assert no_evidence["hashtags"] == []


def test_native_script_agent_consumes_audience_format_length_and_cta() -> None:
    prompts: list[str] = []

    class NativeModelProbe:
        def generate(self, prompt: str, **kwargs) -> str:
            prompts.append(prompt)
            return (
                "<STAGE_HOOK>A real generated hook for listeners today."
                "<STAGE_BODY>A real generated body grounded in source material."
                "<STAGE_CTA>Listen when it feels right."
            )

    response = ScriptAgent(NativeModelProbe()).run(ScriptRequest(
        idea="Night Drive",
        platform="instagram",
        goal="growth",
        tone="inspirational",
        target_audience="late-night electronic fans",
        output_format="video",
        caption_length="short",
        cta_strength="low",
    ))
    assert response.source == "ai_model"
    assert prompts
    assert "<FORMAT_VIDEO>" in prompts[0]
    assert "<LENGTH_SHORT>" in prompts[0]
    assert "<CTA_LOW>" in prompts[0]
    assert "Target audience: late-night electronic fans." in prompts[0]


def test_url_parser_fetches_public_url_and_extracts_real_title(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class PublicHtmlResponse:
        headers = {"content-type": "text/html; charset=utf-8"}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, limit: int) -> bytes:
            assert limit == url_core._MAX_BYTES
            return (
                b'<html><head><meta property="og:title" '
                b'content="Night Drive \xe2\x80\x94 Actual Artist"></head></html>'
            )

    monkeypatch.setattr(url_core, "_is_safe_host", lambda hostname: True)
    monkeypatch.setattr(
        url_core._NO_REDIRECT_OPENER,
        "open",
        lambda request, timeout=5.0: PublicHtmlResponse(),
    )
    parsed = url_core.parse_url("https://artist.example/releases/night-drive")
    assert parsed.fetch_ok is True
    assert "Night Drive" in parsed.title
    assert parsed.topic_string


def test_url_parser_refuses_ssrf_target_without_fetching(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    opened = False

    def fail_open(*args, **kwargs):
        nonlocal opened
        opened = True
        raise AssertionError("network must not be opened")

    monkeypatch.setattr(url_core._NO_REDIRECT_OPENER, "open", fail_open)
    parsed = url_core.parse_url("http://127.0.0.1/private")
    assert parsed.fetch_ok is False
    assert opened is False