"""Real rollout assembly with a controlled inference boundary and public scan."""
from types import SimpleNamespace

import pytest

from ai_model.awareness import bind
from ai_model.generation import campaign
from ai_model.generation.plan import active_plan
from test_generation_route_bindings import snapshot


def compose(request):
    return SimpleNamespace(hook="Discover Paper Lantern Harbor",
        body="An independent release for your next listening session.",
        cta="Tell us what you think.", source="ai_model")


def test_unverified_release_keeps_all_slots_without_invented_milestones():
    seen = []
    def infer(request):
        seen.append((request, active_plan.get()))
        return compose(request)
    with bind(snapshot()):
        result = campaign.build_campaign(
            artist="Fictional Harbor Artist", title="Paper Lantern Harbor",
            platforms=["instagram"], weeks=2, release_date="2026-12-01",
            awareness="No awards, chart rankings or stream totals are known.", script_fn=infer)
    posts = [post for phase in result["phases"] for post in phase["posts"]]
    assert len(posts) == result["summary"]["total_posts"] == 15
    assert sum(result["summary"]["by_phase"].values()) == 15
    assert result["summary"]["by_platform"] == {"instagram": 15}
    assert all(post["platform"] == "instagram" and post["source"] == "ai_model" for post in posts)
    assert all(post["caption"] == "\n\n".join((post["hook"], post["body"], post["cta"])) for post in posts)
    assert all("No awards" in request.awareness for request, _ in seen)
    assert all("Do not invent awards" in request.idea for request, _ in seen)
    assert len({plan.plan_hash for _, plan in seen}) == 15
    assert len({plan.snapshot_hash for _, plan in seen}) == 1
    assert all(post["date"] for post in posts)
    assert min(post["day_offset"] for post in posts) == -12
    assert active_plan.get() is None


def test_multiplatform_campaign_keeps_normalized_names_and_actual_sections():
    with bind(snapshot()):
        result = campaign.build_campaign(artist="Artist", title="Release", weeks=6,
            platforms=["Instagram", "TIKTOK", "instagram"],
            normalize_platform_fn=str.lower, script_fn=compose)
    assert result["release"]["platforms"] == ["instagram", "tiktok"]
    assert result["summary"]["by_platform"] == {"instagram": 8, "tiktok": 7}
    assert result["summary"]["images_generated"] == result["summary"]["teasers_queued"] == 0


@pytest.mark.parametrize("source", ["template", "awareness", "", None])
def test_backend_provenance_failure_never_substitutes_complete_template(source):
    def invalid(request):
        return SimpleNamespace(hook="fixture hook", body="fixture body", cta="fixture action", source=source)
    with bind(snapshot()), pytest.raises(RuntimeError, match="no validated model copy"):
        campaign.build_campaign(artist="Artist", title="Release", script_fn=invalid)
    assert active_plan.get() is None


def test_backend_exception_aborts_whole_campaign_without_leaking_plan():
    calls = []
    def unavailable(request):
        calls.append(request)
        if len(calls) == 3:
            raise RuntimeError("inference process unavailable")
        return compose(request)
    with bind(snapshot()), pytest.raises(RuntimeError, match="inference process unavailable"):
        campaign.build_campaign(artist="Artist", title="Release", script_fn=unavailable)
    assert len(calls) == 3
    assert active_plan.get() is None


@pytest.mark.parametrize("claim", ["We just hit a milestone", "100,000 streams", "link in bio", "Award-winning release"])
def test_unverified_metrics_links_and_marketing_claims_fail_explicitly(claim):
    def invalid(request):
        return SimpleNamespace(hook=claim, body="Release body", cta="Listen", source="ai_model")
    with bind(snapshot()), pytest.raises(RuntimeError, match="unsupported promotional claim"):
        campaign.build_campaign(artist="Artist", title="Release", script_fn=invalid)


@pytest.mark.parametrize("changes", [{"weeks": True}, {"weeks": 1}, {"weeks": 13},
    {"platforms": []}, {"platforms": ["unknown"]}, {"release_date": "2026-02-30"},
    {"seed": -1}, {"artist": ""}, {"title": ""}, {"bpm": float("nan")}, {"bpm": True}])
def test_invalid_campaign_controls_fail_before_any_backend_call(changes):
    def no_inference(request):
        raise AssertionError("invalid controls must not invoke inference")
    options = {"artist": "Artist", "title": "Release", "script_fn": no_inference, **changes}
    with pytest.raises(ValueError):
        campaign.build_campaign(**options)


def test_failed_optional_asset_is_explicit_without_inventing_delivery():
    def unavailable(**kwargs):
        return None
    with bind(snapshot()):
        result = campaign.build_campaign(artist="Artist", title="Release", script_fn=compose,
                                         image_fn=unavailable, teaser_fn=unavailable)
    posts = [post for phase in result["phases"] for post in phase["posts"]]
    assert result["summary"]["images_generated"] == result["summary"]["teasers_queued"] == 0
    assert all("image" not in post and post["asset_errors"] for post in posts)
    assert all(error["status"] == "unavailable" for post in posts for error in post["asset_errors"])


def test_actual_script_agent_runs_under_unique_slot_plans_and_one_public_scan():
    from ai_model.agents.script_agent import ScriptAgent
    class Model:
        def __init__(self):
            self.calls = []
        def generate(self, prompt, **kwargs):
            self.calls.append((prompt, kwargs))
            return ("<STAGE_HOOK>Discover a new independent music release."
                    "<STAGE_BODY>Paper Lantern Harbor brings a quiet melody to your next listening session."
                    "<STAGE_CTA>Tell us what you think of the track.")
    model = Model()
    public = snapshot()
    with bind(public):
        result = campaign.build_campaign(artist="Harbor Artist", title="Paper Lantern Harbor",
            platforms=["instagram"], seed=17, script_fn=ScriptAgent(model).run)
    assert len(model.calls) == result["summary"]["total_posts"] == 15
    assert [kwargs["seed"] for _, kwargs in model.calls] == list(range(17, 32))
    assert {kwargs["snapshot_hash"] for _, kwargs in model.calls} == {public.id}
    assert all(post["source"] == "ai_model" for phase in result["phases"] for post in phase["posts"])


@pytest.mark.parametrize("url", ["asset://concept/image.png", "javascript:alert(1)", "", "/uploads/../private.png"])
def test_specification_or_unsafe_asset_identifiers_never_count_as_generated_images(url):
    with bind(snapshot()):
        result = campaign.build_campaign(artist="Artist", title="Release", script_fn=compose,
                                         image_fn=lambda **kwargs: {"url": url})
    assert result["summary"]["images_generated"] == 0
    assert all(post["asset_errors"] for phase in result["phases"] for post in phase["posts"])


def test_expired_inherited_budget_blocks_inference_and_preserves_context():
    from ai_model.model.inference_budget import inference_deadline
    token = inference_deadline.set(0)
    try:
        with pytest.raises(TimeoutError, match="operational capability time budget"):
            campaign.build_campaign(artist="Artist", title="Release", script_fn=compose)
        assert inference_deadline.get() == 0
        assert active_plan.get() is None
    finally:
        inference_deadline.reset(token)
