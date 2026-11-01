"""Authenticated FastAPI routes for native analysis."""

from __future__ import annotations

import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from .assets import (
    IMAGE_MAX_BYTES,
    IMAGE_MIMES,
    VIDEO_MAX_BYTES,
    VIDEO_MIMES,
    AnalysisAssets,
    AssetDecodeError,
    AssetError,
    validate_media,
)
from .safe_http import (
    ResponseTooLarge,
    SafeHTTPError,
    UnsupportedContentType,
    fetch_bytes,
    fetch_to_file,
)


class URLInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=4096)
    user_id: str | None = None  # compatibility only; never trusted as identity


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=1_000_000)
    user_id: str | None = None  # compatibility only; never trusted as identity


def _owner(x_maxcore_user_id: str | None = Header(None)) -> str:
    owner = (x_maxcore_user_id or "").strip()
    if not owner or len(owner) > 256 or any(ord(char) < 32 for char in owner):
        raise HTTPException(
            status_code=401,
            detail="Trusted X-MaxCore-User-Id header is required",
        )
    return owner


def _error(exc: Exception) -> HTTPException:
    from .media import (
        InvalidMediaError,
        MediaDecodeError,
        MediaLimitError,
        MediaToolUnavailableError,
    )

    if isinstance(exc, ResponseTooLarge | MediaLimitError):
        return HTTPException(status_code=413, detail="Analysis input exceeds size limit")
    if isinstance(exc, UnsupportedContentType):
        return HTTPException(status_code=415, detail="Analysis input type is unsupported")
    if isinstance(exc, MediaToolUnavailableError):
        return HTTPException(status_code=503, detail="Required media decoder is unavailable")
    if isinstance(exc, (AssetDecodeError, MediaDecodeError, InvalidMediaError)):
        return HTTPException(status_code=422, detail="Analysis input cannot be decoded")
    if isinstance(exc, (SafeHTTPError, AssetError)):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=422, detail="Analysis failed")


def create_analysis_router(
    require_generation: Callable[..., Any],
    uploads_root: str | Path,
) -> APIRouter:
    router = APIRouter(
        prefix="/api/analysis",
        tags=["native-analysis"],
        dependencies=[Depends(require_generation)],
    )
    assets = AnalysisAssets(uploads_root)
    concurrency = max(1, int(os.environ.get("MAXCORE_ANALYSIS_CONCURRENCY", "2")))
    capacity_lock = asyncio.Lock()
    active = 0

    @asynccontextmanager
    async def capacity():
        # Check and reserve atomically. asyncio.Semaphore.locked()+acquire()
        # races and can silently create an unbounded waiter queue.
        nonlocal active
        async with capacity_lock:
            if active >= concurrency:
                raise HTTPException(status_code=503, detail="Analysis capacity is busy")
            active += 1
        try:
            yield
        finally:
            async with capacity_lock:
                active -= 1

    async def run_bounded(function: Callable[..., Any], *args: Any) -> Any:
        async with capacity():
            return await asyncio.to_thread(function, *args)

    async def analyze_remote_or_asset(kind: Literal["image", "video"], url: str, owner: str):
        from .media import analyze_image, analyze_video

        async with capacity():
            assets.cleanup()
            try:
                local = (
                    assets.resolve_owned(url, owner)
                    if url.startswith("/uploads/")
                    else None
                )
            except Exception as exc:
                raise _error(exc) from None
            temporary = False
            if url.startswith("/uploads/") and local is None:
                raise HTTPException(status_code=400, detail="Analysis upload URL is invalid")
            if local is None:
                suffix = ".image" if kind == "image" else ".video"
                handle = tempfile.NamedTemporaryFile(prefix="maxcore-analysis-", suffix=suffix, delete=False)
                handle.close()
                local = Path(handle.name)
                local.unlink(missing_ok=True)
                temporary = True
                try:
                    await asyncio.to_thread(
                        fetch_to_file,
                        url,
                        local,
                        max_bytes=IMAGE_MAX_BYTES if kind == "image" else VIDEO_MAX_BYTES,
                        allowed_content_types=(kind,),
                        deadline_seconds=25.0,
                        max_redirects=3,
                    )
                except Exception as exc:
                    local.unlink(missing_ok=True)
                    raise _error(exc) from None
            try:
                analyzer = analyze_image if kind == "image" else analyze_video
                return await asyncio.to_thread(analyzer, local)
            except HTTPException:
                raise
            except Exception as exc:
                raise _error(exc) from None
            finally:
                # Uploaded assets are scratch inputs, not durable user content.
                if temporary or url.startswith("/uploads/analysis-inputs/"):
                    assets.release(local)

    @router.post("/image")
    async def image(payload: URLInput, owner: str = Depends(_owner)):
        return await analyze_remote_or_asset("image", payload.url, owner)

    @router.post("/video")
    async def video(payload: URLInput, owner: str = Depends(_owner)):
        return await analyze_remote_or_asset("video", payload.url, owner)

    @router.post("/text")
    async def text(payload: TextInput, _owner_id: str = Depends(_owner)):
        from .text import analyze_text

        try:
            return await run_bounded(analyze_text, payload.text)
        except HTTPException:
            raise
        except Exception as exc:
            raise _error(exc) from None

    @router.post("/website")
    async def website(payload: URLInput, _owner_id: str = Depends(_owner)):
        try:
            async with capacity():
                raw, result = await asyncio.to_thread(
                    fetch_bytes,
                    payload.url,
                    max_bytes=2 * 1024 * 1024,
                    allowed_content_types=("text/html", "application/xhtml+xml"),
                    deadline_seconds=20.0,
                    max_redirects=3,
                )
                html = raw.decode("utf-8", errors="replace")
                from .website import analyze_website_html

                return await asyncio.to_thread(
                    analyze_website_html, html, result.final_url
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise _error(exc) from None

    @router.post("/upload")
    async def upload(
        request: Request,
        kind: Literal["image", "video"] = Query(...),
        owner: str = Depends(_owner),
    ):
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        mime_map = IMAGE_MIMES if kind == "image" else VIDEO_MIMES
        if content_type not in mime_map:
            raise HTTPException(status_code=415, detail="Upload Content-Type is unsupported")
        maximum = IMAGE_MAX_BYTES if kind == "image" else VIDEO_MAX_BYTES
        declared = request.headers.get("content-length")
        if declared:
            try:
                declared_bytes = int(declared)
                if declared_bytes < 0:
                    raise HTTPException(status_code=400, detail="Invalid Content-Length")
                if declared_bytes > maximum:
                    raise HTTPException(status_code=413, detail="Upload exceeds size limit")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid Content-Length") from None
        assets.cleanup()
        path = assets.new_path(owner, mime_map[content_type])
        total = 0
        try:
            with path.open("xb") as output:
                path.chmod(0o600)
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > maximum:
                        raise HTTPException(status_code=413, detail="Upload exceeds size limit")
                    output.write(chunk)
            if total == 0:
                raise HTTPException(status_code=422, detail="Upload is empty")
            await run_bounded(validate_media, path, kind)
        except HTTPException:
            path.unlink(missing_ok=True)
            raise
        except Exception as exc:
            path.unlink(missing_ok=True)
            raise _error(exc) from None
        expires = datetime.fromtimestamp(assets.expires_at(path), timezone.utc)
        return {"url": assets.url_for(path), "expires_at": expires.isoformat()}

    return router