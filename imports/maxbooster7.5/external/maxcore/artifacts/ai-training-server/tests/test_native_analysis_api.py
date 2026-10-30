from __future__ import annotations

import io
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from ai_model.native_analysis.api import create_analysis_router


def _png() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (12, 8), (20, 80, 160)).save(output, "PNG")
    return output.getvalue()


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # A dependency with Header metadata, matching require_scope's behavior.
    async def require_generation(authorization: str | None = __import__("fastapi").Header(None)):
        if authorization != "Bearer generation-secret":
            raise HTTPException(status_code=401, detail="generation auth required")
        return {"scopes": ["generate"]}

    app = FastAPI()
    app.include_router(create_analysis_router(require_generation, tmp_path / "uploads"))
    return TestClient(app)


HEADERS = {
    "Authorization": "Bearer generation-secret",
    "X-MaxCore-User-Id": "artist-123",
}


def test_text_requires_generation_auth_and_trusted_owner(client: TestClient) -> None:
    assert client.post("/api/analysis/text", json={"text": "hello"}).status_code == 401
    assert client.post(
        "/api/analysis/text",
        headers={"Authorization": "Bearer generation-secret"},
        json={"text": "hello", "user_id": "body-is-not-authority"},
    ).status_code == 401
    response = client.post(
        "/api/analysis/text",
        headers=HEADERS,
        json={"text": "Great work!", "user_id": "attacker"},
    )
    assert response.status_code == 200
    assert response.json()["source"] == "maxcore_native_analysis"
    assert response.json()["kind"] == "text"


def test_real_image_upload_is_owner_scoped_then_consumed(
    client: TestClient, tmp_path: Path
) -> None:
    uploaded = client.post(
        "/api/analysis/upload?kind=image",
        headers={**HEADERS, "Content-Type": "image/png"},
        content=_png(),
    )
    assert uploaded.status_code == 200
    asset_url = uploaded.json()["url"]
    wrong_owner = client.post(
        "/api/analysis/image",
        headers={**HEADERS, "X-MaxCore-User-Id": "someone-else"},
        json={"url": asset_url},
    )
    assert wrong_owner.status_code == 400
    malformed = client.post(
        "/api/analysis/image",
        headers=HEADERS,
        json={"url": "/uploads/analysis-inputs/../images/not-owned.png"},
    )
    assert malformed.status_code == 400
    analyzed = client.post(
        "/api/analysis/image", headers=HEADERS, json={"url": asset_url}
    )
    assert analyzed.status_code == 200
    assert analyzed.json()["kind"] == "image"
    assert not list((tmp_path / "uploads" / "analysis-inputs").glob("*/*"))


def test_upload_rejects_mime_size_and_invalid_decode(client: TestClient) -> None:
    assert client.post(
        "/api/analysis/upload?kind=image",
        headers={**HEADERS, "Content-Type": "text/plain"},
        content=b"not an image",
    ).status_code == 415
    invalid = client.post(
        "/api/analysis/upload?kind=image",
        headers={**HEADERS, "Content-Type": "image/png"},
        content=b"not an image",
    )
    assert invalid.status_code == 422
    too_large = client.post(
        "/api/analysis/upload?kind=image",
        headers={
            **HEADERS,
            "Content-Type": "image/png",
            "Content-Length": str(16 * 1024 * 1024 + 1),
        },
        content=b"x",
    )
    assert too_large.status_code == 413


def test_body_actor_is_ignored(client: TestClient) -> None:
    response = client.post(
        "/api/analysis/text",
        headers=HEADERS,
        json={"text": "hello", "user_id": "../other-owner"},
    )
    assert response.status_code == 200


def test_expired_upload_is_rejected_and_removed(
    client: TestClient, tmp_path: Path
) -> None:
    uploaded = client.post(
        "/api/analysis/upload?kind=image",
        headers={**HEADERS, "Content-Type": "image/png"},
        content=_png(),
    )
    assert uploaded.status_code == 200
    asset_url = uploaded.json()["url"]
    path = tmp_path / asset_url.removeprefix("/")
    old = time.time() - 3601
    os.utime(path, (old, old))

    response = client.post(
        "/api/analysis/image", headers=HEADERS, json={"url": asset_url}
    )
    assert response.status_code == 400
    assert not path.exists()


def test_capacity_is_rejected_without_queuing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def require_generation():
        return {"scopes": ["generate"]}

    started = threading.Event()
    release = threading.Event()

    def slow_analysis(text: str):
        started.set()
        assert release.wait(timeout=5)
        return {
            "schema_version": 1,
            "source": "maxcore_native_analysis",
            "kind": "text",
            "method": "test measurement",
            "analysis": {"length": len(text)},
            "limitations": [],
        }

    monkeypatch.setenv("MAXCORE_ANALYSIS_CONCURRENCY", "1")
    monkeypatch.setattr("ai_model.native_analysis.text.analyze_text", slow_analysis)
    app = FastAPI()
    app.include_router(create_analysis_router(require_generation, tmp_path / "uploads"))
    local_client = TestClient(app)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            local_client.post,
            "/api/analysis/text",
            headers={"X-MaxCore-User-Id": "artist-123"},
            json={"text": "first"},
        )
        assert started.wait(timeout=5)
        second = local_client.post(
            "/api/analysis/text",
            headers={"X-MaxCore-User-Id": "artist-123"},
            json={"text": "second"},
        )
        assert second.status_code == 503
        release.set()
        assert first.result(timeout=5).status_code == 200