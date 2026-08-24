from types import SimpleNamespace

import pytest

from ai_model.generation.orchestrator import merge_awareness


def test_api_content_awareness_bus_contains_shared_platform_profile_once():
    request = SimpleNamespace(
        platform="TikTok",
        instruction="Make the first second impossible to ignore",
        extra_context="Promote the new single",
        content_themes=["release", "dance"],
        awareness="Live audience is saving short clips",
    )
    awareness = merge_awareness(request)
    assert awareness.count("[PLATFORM_OPTIMIZATION platform=tiktok") == 1
    assert "watch_completion" in awareness
    assert "first_seconds" in awareness
    assert "First second impossible to ignore" in awareness


def test_awareness_bus_rejects_platforms_outside_the_closed_set():
    with pytest.raises(ValueError, match="Unsupported social awareness platform"):
        merge_awareness(SimpleNamespace(platform="spotify", awareness=""))