"""Campaign slots must remain complete without asserting unverified outcomes."""

from ai_model.generation import campaign


def test_unverified_release_keeps_all_slots_without_invented_milestones(monkeypatch):
    seen_themes = {}

    def compose(**kwargs):
        seen_themes[kwargs["theme"]] = True
        return {
            "variants": [{"body": "Hear the new release.", "cta": "Tell us what you think."}],
            "disclosure_brief": None,
        }

    monkeypatch.setattr(campaign, "_compose_body_cta", compose)
    monkeypatch.setattr(campaign, "_art_direction", lambda **kwargs: None)
    result = campaign.build_campaign(
        artist="Fictional Harbor Artist",
        title="Paper Lantern Harbor",
        platforms=["instagram"],
        weeks=2,
        awareness="No awards, chart rankings or stream totals are known.",
    )
    posts = [post for phase in result["phases"] for post in phase["posts"]]
    assert len(posts) == result["summary"]["total_posts"] == len(campaign._BLUEPRINT)
    assert sum(result["summary"]["by_phase"].values()) == len(posts)
    assert all(post["platform"] == "instagram" for post in posts)
    by_type = {post["content_type"]: post for post in posts}
    assert "just hit a new milestone" not in by_type["milestone"]["caption"]
    assert "Your reactions" not in by_type["reaction"]["caption"]
    assert "— stripped back" not in by_type["acoustic"]["caption"]
    assert "link in bio" not in by_type["presave_push"]["caption"]
    assert "streams milestone" not in seen_themes
    assert "fan reactions" not in seen_themes