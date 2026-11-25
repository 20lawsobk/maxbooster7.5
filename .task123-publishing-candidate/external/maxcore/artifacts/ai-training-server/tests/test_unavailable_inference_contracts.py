"""Contract guards for MaxCore capabilities that have no real model yet."""

import ast
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import HTTPException


SERVER = Path(__file__).resolve().parents[1] / "server.py"


def _function(name: str) -> ast.AsyncFunctionDef:
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    return next(
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == name
    )


def test_missing_audio_and_video_inference_never_synthesizes_results():
    for name in (
        "api_infer_viral_score",
        "api_generate_text",
        "api_predict_engagement",
    ):
        function = _function(name)
        source = ast.unparse(function)
        assert "HTTPException" in source
        assert "status_code=503" in source
        if name != "api_predict_engagement":
            assert "random" not in source


def test_audio_endpoints_use_real_waveform_conductor():
    for name in ("api_analyze_audio", "api_audio_analyze"):
        source = ast.unparse(_function(name))
        assert "_analyze_audio_reference" in source
        assert "random" not in source


def test_audio_upload_contract_is_bounded_owner_scoped_and_validated():
    source = ast.unparse(_function("api_audio_upload"))
    assert "x-maxcore-user-id" in source
    assert "_AUDIO_UPLOAD_MAX_BYTES" in source
    assert "librosa.load" in source
    assert "temp_path.unlink" in source
    resolver = SERVER.read_text(encoding="utf-8")
    assert "Cannot access another user's audio upload" in resolver
    assert 'raw_path.startswith("/uploads/audio-inputs/")' in resolver


def test_real_conductor_analyzes_tiny_waveform():
    import numpy as np

    sys.path.insert(0, str(SERVER.parent))
    from ai_model.audio.audio_analysis import analyze_audio

    sample_rate = 22050
    times = np.arange(sample_rate * 2, dtype=np.float32) / sample_rate
    waveform = (0.2 * np.sin(2 * np.pi * 440 * times)).astype(np.float32)
    timeline = analyze_audio(waveform, sample_rate, use_cache=False)
    assert timeline.analysis_ok
    assert timeline.duration_sec == 2.0
    assert timeline.energy_envelope


def test_text_content_mode_never_returns_template_fallback():
    source = ast.unparse(_function("api_generate_text"))
    assert "deterministic_candidate" not in source
    assert "Generated content for intent" not in source
    assert "_require_model_script(sr)" in source
    assert "Cached text result lacks genuine model provenance" in source
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    guard = next(node for node in tree.body
                 if isinstance(node, ast.FunctionDef) and node.name == "_require_model_script")
    namespace = {"Any": Any, "HTTPException": HTTPException}
    exec(compile(ast.Module(body=[guard], type_ignores=[]), str(SERVER), "exec"), namespace)
    for source in ("awareness", "template", "unknown", ""):
        with pytest.raises(HTTPException) as error:
            namespace["_require_model_script"](SimpleNamespace(
                source=source, hook="Real hook", body="Real body", cta="Real CTA"))
        assert error.value.status_code == 503
    for source in ("model", "ai_model", "model_composed"):
        namespace["_require_model_script"](SimpleNamespace(
            source=source, hook="Real hook", body="Real body", cta="Real CTA"))


def test_model_readiness_reports_terminal_initialization_failure():
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    sync_init = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_init_ai_model"
    )
    server_source = SERVER.read_text(encoding="utf-8")
    # Execute the actual init/wait functions with a failing owned initializer;
    # spelling of its exception variable must not define the contract.
    def unavailable():
        raise ValueError("public candidate is unavailable")
    namespace = {"os": os, "HTTPException": HTTPException, "asyncio": asyncio,
                 "_init_live_awareness_model": unavailable}
    exec(compile(ast.Module(body=[sync_init, _function("_wait_for_model_ready")],
                            type_ignores=[]), str(SERVER), "exec"), namespace)
    with patch.dict(os.environ, {"MAXCORE_SERVING_RELEASE": "live-awareness"}):
        namespace["_init_ai_model"]()
    assert namespace["_model_ready"] is False
    assert namespace["_model_init_error"] == "ValueError: public candidate is unavailable"
    assert namespace["_serving_release_status"]["active"] is None
    with pytest.raises(HTTPException) as error:
        asyncio.run(namespace["_wait_for_model_ready"](max_wait=0))
    assert error.value.status_code == 503
    assert "public candidate is unavailable" in error.value.detail
    assert '"weights_source": "disk" if weights_path.exists() else "unavailable"' in server_source
    assert '"random_init"' not in server_source


def test_every_job_reader_enforces_durable_owner():
    for name in (
        "api_poll_video_job",
        "api_cancel_video_job",
        "api_video_job_preview",
        "api_list_video_jobs",
        "api_poll_audio_job",
        "api_audio_stems",
        "api_serve_stem_file",
        "api_audio_midi",
    ):
        assert "_require_job_owner" in ast.unparse(_function(name))
    assert "_resolve_video_job_file(job_id, request)" in ast.unparse(
        _function("api_video_job_download")
    )
