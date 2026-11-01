"""Tests for the quality-awareness buffer's editing-decision bridge. Run:

    uv run python -m ai_model.test_quality_awareness

Verifies the retirement/weighting contract that every consumer (video
transition/camera-motion, image style tag, audio arrangement grammar) relies
on: an active buffer returns a pattern, a retired one returns nothing, and
per-modality retirement lets one modality retire independently of another.
Never raises on missing storage — that contract is also covered here.
"""
from __future__ import annotations

import os
import sys

import ai_model.quality_awareness as qa


class _FakeStore:
    """Minimal storage stub — only the methods quality_awareness calls."""

    def __init__(self, llens=None, keys=None):
        self._llens = llens or {}
        self._keys = keys or []

    def llen(self, key):
        return self._llens.get(key, 0)

    def keys(self, pattern):
        return list(self._keys)


def _reset(store=None, doc=None):
    qa._store = lambda: store
    qa._state["own_at"] = 0.0
    qa._state["own"] = 0
    if doc is not None:
        qa.get_doc = lambda trigger_harvest=True: doc


def test_active_buffer_returns_pattern():
    _reset(store=_FakeStore(), doc={
        "stats": {"top_genres": ["trap"], "punchy_title_ratio": 0.6},
    })
    pattern = qa.editing_pattern("seed-a", modality="video")
    assert pattern is not None, "active buffer with matching genre must return a pattern"
    assert pattern["transition"] == "wipeleft"
    assert pattern["camera_motion"] == "zoom_in"
    assert pattern["style_tag"] == "gritty"
    print("test_active_buffer_returns_pattern: OK")


def test_retired_modality_returns_none():
    # Own corpus == threshold -> retired for that modality.
    _reset(store=_FakeStore(llens={"phrases:image_headline": 500}),
           doc={"stats": {"top_genres": ["trap"], "punchy_title_ratio": 0.6}})
    pattern = qa.editing_pattern("seed-a", modality="image")
    assert pattern is None, "a retired modality must never return a pattern"
    print("test_retired_modality_returns_none: OK")


def test_modalities_retire_independently():
    # Image's own corpus is full (retired); video has no dedicated corpus yet
    # and falls back to the combined corpus, which is empty here (active).
    _reset(store=_FakeStore(llens={"phrases:image_headline": 500}, keys=[]),
           doc={"stats": {"top_genres": ["trap"], "punchy_title_ratio": 0.6}})
    suff_image = qa.self_sufficiency("image")
    suff_video = qa.self_sufficiency("video")
    assert suff_image["retired"] is True
    assert suff_video["retired"] is False
    print("test_modalities_retire_independently: OK")


def test_per_modality_env_override():
    _reset(store=_FakeStore(keys=[]))
    os.environ["MB_AWARENESS_RETIRE_AT_AUDIO"] = "10"
    try:
        suff = qa.self_sufficiency("audio")
        assert suff["retire_threshold"] == 10
    finally:
        os.environ.pop("MB_AWARENESS_RETIRE_AT_AUDIO", None)
    print("test_per_modality_env_override: OK")


def test_no_genre_match_returns_none():
    _reset(store=_FakeStore(),
           doc={"stats": {"top_genres": ["polka"], "punchy_title_ratio": 0.0}})
    pattern = qa.editing_pattern("seed-a", modality="video")
    assert pattern is None, "an unmapped genre with no punchy signal must return nothing"
    print("test_no_genre_match_returns_none: OK")


def test_missing_doc_never_raises():
    _reset(store=_FakeStore())
    qa.get_doc = lambda trigger_harvest=True: None
    pattern = qa.editing_pattern("seed-a", modality="video")
    assert pattern is None
    suff = qa.self_sufficiency("video")
    assert isinstance(suff, dict)
    print("test_missing_doc_never_raises: OK")


def run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
    sys.exit(0)
