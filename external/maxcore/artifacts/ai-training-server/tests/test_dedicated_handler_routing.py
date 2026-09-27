"""Handler-level routing contracts; no checkpoint or media inference."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


def test_ads_meta_uses_social_awareness_but_keeps_network_identity(monkeypatch):
    import server
    import storage_client

    class Ads:
        def get_winning_formula(self, *_args):
            return None

    monkeypatch.setattr(storage_client, "get_ads_client", lambda: Ads())
    monkeypatch.setattr(storage_client, "get_curriculum_client",
                        lambda: SimpleNamespace(get_top_performers=lambda *a, **k: []))
    seen = []

    async def creative(**kwargs):
        seen.append(kwargs)
        return {"content_type": kwargs["ad_type"], "source": "model",
                "asset_status": "spec_only"}

    monkeypatch.setattr(server, "_generate_ad_creative", creative)
    monkeypatch.setattr(server, "_merged_awareness_for",
                        lambda req: f"social={req.platform}; {req.awareness}")
    monkeypatch.setattr(server, "_effective_awareness",
                        lambda platform, text: f"{text}; buffered={platform}")
    req = server.AdGenerateRequest(
        user_id="artist", product="Paper Lanterns", platform="meta",
        target_subtypes=["video", "audio", "text", "image"],
        num_creatives=4, awareness={"contextString": "quiet harbor"},
    )
    result = asyncio.run(server.ads_generate(req, _key={}))
    assert result["platform"] == "meta"
    assert [c["content_type"] for c in result["creatives"]] == [
        "video", "audio", "text", "image"]
    assert all("social=facebook" in c["awareness"] and
               "quiet harbor" in c["awareness"] for c in seen)
    assert "platform_benchmarks" not in result


def test_ad_script_uses_agent_run_and_exposes_source(monkeypatch):
    import server

    class Agent:
        def run(self, request):
            assert request.platform == "facebook"
            assert "quiet harbor" in request.awareness
            return SimpleNamespace(hook="Lanterns on the water",
                                   body="A mellow instrumental by June",
                                   cta="Listen to Paper Lanterns",
                                   source="model")

        def _awareness_compose(self, request):
            raise AssertionError("must attempt the dedicated agent run")

    async def in_thread(fn):
        return fn()

    monkeypatch.setattr(server, "_model_ready", True)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(server, "_in_thread", in_thread)
    result = asyncio.run(server._generate_ad_creative(
        "meta", "video", "Paper Lanterns", "streams", None,
        "June", "hip-hop", 0, awareness="quiet harbor"))
    assert result["source"] == "model"
    assert result["asset_status"] == "spec_only"
    assert result["hook"] == "Lanterns on the water"


def test_ad_script_failure_is_not_disguised_as_template(monkeypatch):
    import server

    monkeypatch.setattr(server, "_model_ready", False)
    monkeypatch.setattr(server, "_script_agent", None)
    with pytest.raises(HTTPException) as err:
        asyncio.run(server._generate_ad_creative(
            "meta", "image", "Paper Lanterns", "streams",
            None, "June", None, 0, awareness="quiet harbor"))
    assert err.value.status_code == 503


def test_ad_awareness_fallback_is_not_claimed_as_generated(monkeypatch):
    import server

    class Agent:
        def run(self, request):
            return SimpleNamespace(hook="Awareness hook", body="Awareness body",
                                   cta="Awareness CTA", source="awareness")

    async def in_thread(fn):
        return fn()

    monkeypatch.setattr(server, "_model_ready", True)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(server, "_in_thread", in_thread)
    with pytest.raises(HTTPException) as err:
        asyncio.run(server._generate_ad_creative(
            "meta", "audio", "Paper Lanterns", "streams",
            None, "June", None, 0, awareness="quiet harbor"))
    assert err.value.status_code == 503
    assert "source=awareness" in err.value.detail


def test_campaign_passes_platform_specific_awareness_to_builder(monkeypatch):
    import server
    import ai_model.generation as generation

    captured = {}

    def build_campaign(**kwargs):
        captured.update(kwargs)
        return {"phases": []}

    monkeypatch.setattr(generation, "build_campaign", build_campaign)
    monkeypatch.setattr(server, "_merged_awareness_for",
                        lambda req: "quiet harbor")
    monkeypatch.setattr(server, "_effective_awareness",
                        lambda platform, raw: f"{raw}; platform={platform}")
    req = server.ApiGenerateCampaignRequest(
        title="Paper Lanterns", platforms=["instagram"], weeks=2)
    result = asyncio.run(server.api_generate_campaign(req, _key={}))
    assert captured["awareness"] == "quiet harbor; platform=instagram"
    assert captured["platforms"] == ["instagram"]
    assert result["phases"] == []
    assert result["source"] == "campaign_composer"


def test_studio_soundtrack_deadline_covers_admission_and_render():
    import server

    assert server._soundtrack_timeout(6) > 20
    assert server._soundtrack_timeout(600) == 300


def test_internal_model_and_health_listeners_are_loopback_only():
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "server.py").read_text()
    assert '_http.HTTPServer(("127.0.0.1", _HEALTHZ_PORT)' in source
    assert 'host="127.0.0.1",' in source
    assert '"0.0.0.0"' not in source


def test_requested_pathtrace_passes_subject_and_rejects_unsupported(monkeypatch):
    import server
    import ai_model.rta as rta
    import ai_model.generation as generation
    import ai_model.request_intelligence as ri

    subject = []

    def reject(**kwargs):
        subject.append(kwargs["prompt"])
        raise ValueError("RTA tracer cannot represent the requested subject")

    async def in_thread(fn):
        return fn()

    brief = SimpleNamespace(layout="square_1_1", tone="cinematic",
                            keywords=[], ai_disclosure=False,
                            to_dict=lambda: {})
    monkeypatch.setattr(ri, "build_brief", lambda **kwargs: brief)
    monkeypatch.setattr(ri, "visual_style_from_brief", lambda brief: [])
    monkeypatch.setattr(ri, "best_image_headline",
                        lambda *args: ("Lanterns", 0, 0))
    monkeypatch.setattr(generation, "extract_technique", lambda **kwargs: None)
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_visual_spec_agent", None)
    monkeypatch.setattr(server, "_image_engine", None)
    monkeypatch.setattr(server, "_in_thread", in_thread)
    monkeypatch.setattr(rta.api, "render_image", reject)
    req = server.ApiGenerateImageRequest(
        prompt="Paper lanterns reflected in a quiet harbor",
        render_engine="pathtraced", slots=[{"platform": "instagram"}])
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.api_generate_image(req, _key={}))
    assert err.value.status_code == 422
    assert subject == ["Paper lanterns reflected in a quiet harbor"]


def test_soundtrack_passes_genre_mood_and_intent_to_isolated_renderer(monkeypatch, tmp_path):
    import server
    import ai_model.isolated_audio as isolated

    received = {}
    sound = tmp_path / "audio_vsnd_demo.mp3"
    sound.write_bytes(b"test-path-only")

    def render(exports, request, uploads_path, **kwargs):
        received.update(request)
        return {"url": f"/uploads/{sound.name}"}

    monkeypatch.setattr(server, "_UPLOADS_PATH", tmp_path)
    monkeypatch.setattr(server, "_job_read", lambda job_id: {"status": "rendering"})
    monkeypatch.setattr(isolated, "render_isolated", render)
    result = server._auto_soundtrack_path(
        "demo", 6, genre="hip-hop", mood="calm", intent="quiet harbor")
    assert result == str(sound)
    assert received["opts"] == {
        "genre": "hip-hop", "preferred_genres": ["hip-hop"],
        "preferred_mood": "calm", "intent": "quiet harbor"}


def test_dataset_audio_reports_bytes_and_targets_not_invented_measurements(
        monkeypatch, tmp_path):
    import base64
    import threading
    import server
    import storage_client
    import ai_model.audio.track_selector as selector
    import ai_model.audio.producer_tools as producer
    import ai_model.video.ffmpeg_util as ffmpeg

    sample = {"idx": 3, "bpm": 126.9, "key": "G major",
              "genres": ["hip-hop"]}

    class Storage:
        def get(self, key):
            if key == "mb:dataset:audio:meta":
                return {"num_chunks": 1, "index": [sample]}
            if key == "mb:dataset:audio:chunk:3":
                return {**sample, "source": "dataset",
                        "b64": base64.b64encode(b"source-audio").decode()}
            return None

    def fake_ffmpeg(command, **kwargs):
        from pathlib import Path
        Path(command[-1]).write_bytes(b"encoded-audio")
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(server, "_UPLOADS_PATH", tmp_path)
    monkeypatch.setattr(server, "_AUDIO_RENDER_CACHE", {})
    monkeypatch.setattr(server, "_AUDIO_RENDER_CACHE_LOCK", threading.Lock())
    monkeypatch.setattr(storage_client, "get_storage", lambda: Storage())
    monkeypatch.setattr(selector, "select_audio_sample",
                        lambda *args: (sample, False))
    monkeypatch.setattr(ffmpeg, "run_ffmpeg", fake_ffmpeg)
    monkeypatch.setattr(producer, "master_export",
                        lambda src, dst, **kw: dst.write_bytes(b"encoded-audio"))
    result = server._render_audio_from_dataset(
        "audio_test", 92, "C minor", 4,
        {"preferred_genres": ["hip-hop"], "loudness_lufs": -14})
    assert result["waveform_source"] == "dataset_chunk_bytes"
    assert result["source_sample"]["role"] == "pool"
    assert (result["requested_bpm"], result["requested_key"]) == (92, "C minor")
    assert (result["bpm"], result["key"]) == (126.9, "G major")
    assert result["requested_loudness_lufs"] == -14
    assert result["loudness_target_applied"] is True
    assert result["loudness_lufs"] is None
    assert result["measured_bpm"] is None
    assert result["measured_key"] is None
    assert result["measured_loudness_lufs"] is None
    assert "not transformed or measured" in result["selection_warning"]


def test_model_script_guard_rejects_template_and_awareness():
    import server

    for source in ("template", "awareness", ""):
        with pytest.raises(HTTPException) as err:
            server._require_model_script(SimpleNamespace(
                source=source, hook="hook", body="body", cta="cta"))
        assert err.value.status_code == 503


def test_generic_content_rejects_stale_cached_awareness(monkeypatch):
    import server

    async def ready():
        return None

    async def in_thread(fn):
        return fn()

    class Cache:
        def compute(self, key, builder, namespace):
            assert key["generation_contract"] == server._GENERATION_CONTRACT
            assert namespace == "api_content_model_v2"
            return {"source": "cache", "result": {
                "success": True, "source": "awareness", "caption": "Trending everywhere"}}

    monkeypatch.setattr(server, "_wait_for_model_ready", ready)
    monkeypatch.setattr(server, "_in_thread", in_thread)
    monkeypatch.setattr(server, "_get_pdim_orchestrator", lambda: Cache())
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_platform_optimization_awareness", lambda req: "")
    req = server.ContentRequest(topic="Paper Lanterns", platform="instagram")
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.generate_content(req, _key={}))
    assert err.value.status_code == 503


def test_api_content_rejects_cached_fake_score(monkeypatch):
    import server

    class Coalescer:
        async def compute(self, key, fn):
            assert key["generation_contract"] == server._GENERATION_CONTRACT
            return {"source": "cache", "result": {
                "source": "ai_model",
                "generation_contract": server._GENERATION_CONTRACT,
                "caption": "unsupported six-month secret",
                "quality_score": 98, "confidence": 1}}

    monkeypatch.setattr(server, "_model_ready", True)
    monkeypatch.setattr(server, "_get_async_coalescer", lambda: Coalescer())
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_platform_optimization_awareness", lambda req: "")
    req = server.ApiGenerateContentRequest(
        topic="Paper Lanterns", platform="instagram", tone="authentic")
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.api_generate_content(req, _key={}))
    assert err.value.status_code == 503


def test_api_text_rejects_legacy_cached_score(monkeypatch):
    import server

    class Coalescer:
        async def compute(self, key, fn):
            assert key["generation_contract"] == server._GENERATION_CONTRACT
            return {"source": "cache", "result": {
                "source": "ai_model", "text": "old",
                "quality_score": 98}}

    monkeypatch.setattr(server, "_model_ready", True)
    monkeypatch.setattr(server, "_script_agent", object())
    monkeypatch.setattr(server, "_get_async_coalescer", lambda: Coalescer())
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_platform_optimization_awareness", lambda req: "")
    req = server.ApiGenerateTextRequest(mode="content", topic="Paper Lanterns",
                                        platform="instagram")
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.api_generate_text(req, _key={}))
    assert err.value.status_code == 503


def test_api_content_fresh_copy_is_model_text_without_fake_scores(monkeypatch):
    import server
    import ai_model.generation as generation
    import ai_model.request_intelligence as ri

    brief = SimpleNamespace(
        tone="authentic", hashtags_target=0, ai_disclosure=False,
        to_dict=lambda: {})

    class Agent:
        def run(self, request):
            return SimpleNamespace(
                source="model", hook="Paper lanterns by the harbor",
                body="An instrumental for a quiet night",
                cta="Listen to Paper Lanterns")

    monkeypatch.setattr(server, "_model_ready", True)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(generation, "build_context",
                        lambda *a, **kw: SimpleNamespace(brief=brief, awareness=""))
    monkeypatch.setattr(ri, "apply_disclosure", lambda caption, brief: caption)
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_get_storage_mode", lambda: "live")
    req = server.ApiGenerateContentRequest(
        platform="instagram", topic="Paper Lanterns", tone="authentic",
        artistProfileId="bypass-cache", include_hashtags=False)
    result = asyncio.run(server.api_generate_content(req, _key={}))
    assert result["source"] == "ai_model"
    assert "Paper lanterns by the harbor" in result["caption"]
    assert "quality_score" not in result and "confidence" not in result


def test_alias_media_endpoints_mark_asset_identifiers_as_specs(monkeypatch):
    import server

    monkeypatch.setattr(server, "_model_ready", False)
    monkeypatch.setattr(server, "_visual_spec_agent", None)
    monkeypatch.setattr(server, "_script_agent", None)
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    req = server.MaxcoreMediaRequest(
        step={"params": {"slots": [{"id": "cover", "platform": "instagram"}]}},
        inputs={"normalized": {"semantic": {"topic": "Paper Lanterns"}}})
    for handler in (server.maxcore_generate_image, server.maxcore_generate_audio,
                    server.maxcore_generate_video):
        result = asyncio.run(handler(req, _key={}))
        assert result["kind"] == "specification"
        assert result["outputs"][0]["asset_status"] == "spec_only"
        assert result["outputs"][0]["url"].startswith("asset://")


def test_audio_explicit_direction_reaches_synth_and_avoids_genre_pool(monkeypatch, tmp_path):
    import server
    import storage_client

    class Storage:
        def get(self, key):
            if key == "mb:dataset:audio:meta":
                return {"num_chunks": 1, "index": [
                    {"idx": 3, "bpm": 126.9, "key": "G major", "genres": ["hip-hop"]}]}
            raise AssertionError("explicit piano/calm request must not fetch pool bytes")

    monkeypatch.setattr(storage_client, "get_storage", lambda: Storage())
    monkeypatch.setattr(server, "_UPLOADS_PATH", tmp_path)
    captured = {}

    def synth(job_id, bpm, key, **kwargs):
        captured.update({"bpm": bpm, "key": key, **kwargs})
        raise RuntimeError("stop before media encoding")

    monkeypatch.setattr(server, "_render_audio_clip", synth)
    with pytest.raises(RuntimeError, match="stop before media encoding"):
        server._render_audio_from_dataset(
            "piano", 82, "C minor", 4, {
                "target_bpm": 82, "target_key": "C minor",
                "preferred_genres": ["hip-hop", "dance"],
                "preferred_mood": "calm", "explicit_mood": True,
                "explicit_targets": True, "prompt": "Mellow piano instrumental with soft drums",
                "instrument": "piano"})
    assert captured["bpm"] == 82
    assert captured["key"] == "C minor"
    assert captured["mood"] == "calm"
    assert captured["instrument"] == "piano"
    assert captured["prompt"] == "Mellow piano instrumental with soft drums"


def test_audio_synth_receives_actual_instrument_and_prompt(monkeypatch):
    import server
    import ai_model.audio.digital_gpu_synth as synth

    captured = {}

    def render(**kwargs):
        captured.update(kwargs)
        raise RuntimeError("stop before waveform rendering")

    monkeypatch.setattr(synth, "render_audio_clip", render)
    with pytest.raises(RuntimeError, match="stop before waveform rendering"):
        server._render_audio_clip(
            "test", 82, "C minor", 4, genre="hip-hop", mood="calm",
            prompt="Mellow piano instrumental with soft drums", instrument="piano")
    assert captured["genre"] == "hip-hop"
    assert captured["bpm"] == 82 and captured["key"] == "C minor"
    assert all(text in captured["mood"] for text in (
        "calm", "piano", "Mellow piano instrumental with soft drums"))


def test_audio_reference_mode_rejects_unfulfillable_piano_direction():
    import server

    req = server.ApiGenerateAudioRequest(
        reference_sample_idx=3, prompt="Mellow piano with soft drums",
        genre="hip-hop", mood="calm")
    with pytest.raises(HTTPException) as err:
        asyncio.run(server.api_generate_audio(req, _key={}))
    assert err.value.status_code == 422


@pytest.mark.parametrize(("request_mood", "expected_mood"), [
    ("calm", "calm"), (None, "mellow"),
])
def test_audio_handler_caller_mood_and_targets_beat_fast_priors(
        monkeypatch, request_mood, expected_mood):
    import server
    import ai_model.request_intelligence as ri
    import ai_model.generation as generation
    import ai_model.isolated_audio as isolated
    import ai_model.media_contract as contract

    jobs = {}
    seen = {}
    monkeypatch.setattr(server, "_active_jobs", {})
    monkeypatch.setattr(server, "_model_ready", False)
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    monkeypatch.setattr(server, "_extract_awareness_genres", lambda text: ["dance"])
    monkeypatch.setattr(server, "_extract_awareness_moods", lambda text: ["vibrant"])
    monkeypatch.setattr(server, "_job_write", lambda key, data: jobs.update({key: data}))
    monkeypatch.setattr(server, "_job_read", lambda key: jobs.get(key))
    monkeypatch.setattr(server, "_job_update",
                        lambda key, data: jobs[key].update(data))
    monkeypatch.setattr(server, "_fw_ingest_audio_render", lambda *args: None)

    class Thread:
        def __init__(self, target, name=None, **kwargs):
            self.target, self.name = target, name

        def start(self):
            if self.name and self.name.startswith("ApiAudioJob-"):
                self.target()

        def join(self, **kwargs):
            pass

    monkeypatch.setattr(server.threading, "Thread", Thread)
    brief = SimpleNamespace(tempo="fast", mood="vibrant", tone="vibrant",
                            to_dict=lambda: {
                                "producer_metadata": {"mood": "vibrant", "energy": 0.9}})
    monkeypatch.setattr(ri, "build_brief", lambda **kw: brief)
    monkeypatch.setattr(generation, "extract_technique",
                        lambda **kw: SimpleNamespace(tempo=130, key="G major",
                                                     to_dict=lambda: {"energy": 0.9}))
    monkeypatch.setattr(contract, "render_with_budget", lambda render, **kw: render())

    def render(exports, request, path, **kwargs):
        seen.update(request["opts"])
        return {"url": "/uploads/audio_test.mp3", "waveform_source": "digital_gpu_synthesis"}

    monkeypatch.setattr(isolated, "render_isolated", render)
    req = server.ApiGenerateAudioRequest(
        prompt="Mellow piano instrumental with soft drums", genre="hip-hop",
        mood=request_mood, target_bpm=82, target_key="C minor",
        duration=4, instrument="piano")
    result = asyncio.run(server.api_generate_audio(req, _key={}))
    job = jobs[result["job_id"]]
    assert seen["prompt"] == req.prompt
    assert seen["instrument"] == "piano"
    assert seen["preferred_mood"] == expected_mood
    assert seen["target_bpm"] == 82 and seen["target_key"] == "C minor"
    assert seen["explicit_targets"] is True
    assert job["status"] == "done"
    assert job["intelligence"]["producer_metadata"] == {
        "mood": expected_mood, "energy": None}
    assert "technique" not in job


def test_daw_and_social_model_failures_are_service_unavailable(monkeypatch):
    import server

    class Agent:
        def run(self, request):
            raise RuntimeError("checkpoint unavailable")

    async def ready():
        return None

    async def in_thread(fn):
        return fn()

    monkeypatch.setattr(server, "_wait_for_model_ready", ready)
    monkeypatch.setattr(server, "_script_agent", Agent())
    monkeypatch.setattr(server, "_in_thread", in_thread)
    monkeypatch.setattr(server, "_merged_awareness_for", lambda req: "")
    monkeypatch.setattr(server, "_effective_awareness", lambda *args: "")
    for handler, req in (
        (server.platform_daw_generate, server.PlatformDAWRequest(user_id="artist")),
        (server.platform_social_generate, server.PlatformSocialRequest(
            user_id="artist", topic="Paper Lanterns")),
    ):
        with pytest.raises(HTTPException) as err:
            asyncio.run(handler(req, _key={}))
        assert err.value.status_code == 503