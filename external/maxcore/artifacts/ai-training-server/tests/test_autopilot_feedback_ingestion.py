from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

import server
import storage_client


class RecordingCurriculum:
    def __init__(self) -> None:
        self.records: list[dict] = []

    def record_feedback(self, **record: object) -> None:
        self.records.append(record)


def _request() -> server.ApiTrainFeedbackRequest:
    return server.ApiTrainFeedbackRequest(
        user_id="admin-owner",
        feedback_id="feedback-123",
        source="autopilot_performance",
        trigger="measured_autopilot_outcome",
        engagement_rate=5.0,
        platform="instagram",
        content_type="advertising_campaign_post",
        hook_type="story",
        media_type="video",
        curriculum_hint="reinforce_high_engagement_style",
    )


def test_autopilot_feedback_enters_owner_scoped_maxcore_curriculum(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    curriculum = RecordingCurriculum()
    monkeypatch.setattr(storage_client, "get_curriculum_client", lambda: curriculum)
    monkeypatch.setattr(
        server, "_FEEDBACK_LOG_PATH", tmp_path / "feedback_log.json"
    )
    with server._feedback_lock:
        server._feedback_records.clear()

    response = asyncio.run(server.train_feedback_endpoint(_request(), _key=None))

    assert response == {
        "ok": True,
        "curriculum": "recorded",
        "user_id": "admin-owner",
        "feedback_id": "feedback-123",
    }
    assert curriculum.records == [
        {
            "user_id": "admin-owner",
            "platform": "instagram",
            "engagement_rate": 5.0,
            "content_type": "advertising_campaign_post",
            "style_tags": [
                "story",
                "video",
                "reinforce_high_engagement_style",
            ],
        }
    ]
    assert (tmp_path / "feedback_log.json").is_file()


def test_autopilot_feedback_fails_closed_when_curriculum_storage_is_unavailable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unavailable() -> RecordingCurriculum:
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(storage_client, "get_curriculum_client", unavailable)
    monkeypatch.setattr(
        server, "_FEEDBACK_LOG_PATH", tmp_path / "feedback_log.json"
    )
    with server._feedback_lock:
        server._feedback_records.clear()

    with pytest.raises(server.HTTPException) as exc:
        asyncio.run(server.train_feedback_endpoint(_request(), _key=None))

    assert exc.value.status_code == 503
    assert not (tmp_path / "feedback_log.json").exists()
    assert server._feedback_records == []


def test_ownerless_legacy_feedback_is_audited_without_entering_user_curriculum(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def must_not_be_called() -> RecordingCurriculum:
        raise AssertionError("ownerless signal must not enter an account curriculum")

    monkeypatch.setattr(storage_client, "get_curriculum_client", must_not_be_called)
    monkeypatch.setattr(
        server, "_FEEDBACK_LOG_PATH", tmp_path / "feedback_log.json"
    )
    with server._feedback_lock:
        server._feedback_records.clear()
    request = _request().model_copy(update={"user_id": None})

    response = asyncio.run(server.train_feedback_endpoint(request, _key=None))

    assert response["ok"] is True
    assert response["curriculum"] == "not_recorded_ownerless"
    assert response["user_id"] is None
    assert (tmp_path / "feedback_log.json").is_file()
