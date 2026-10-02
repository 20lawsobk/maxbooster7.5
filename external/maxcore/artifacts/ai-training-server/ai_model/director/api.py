"""Director API — HTTP endpoints for the CampaignDirector.

Mount these in the FastAPI server:
    from ai_model.director.api import create_director_router
    app.include_router(
        create_director_router(require_scope("generate")),
        prefix="/api/director",
    )

Auth: requires 'generate' scope (same as other generation endpoints).
Rate limiting: token bucket per API key (configurable via env).
"""
from __future__ import annotations

import time
from typing import List, Optional, Callable, Dict
from pydantic import BaseModel, Field

try:
    from fastapi import APIRouter, Depends, HTTPException, Request
    _HAS_FASTAPI = True
except ImportError:
    _HAS_FASTAPI = False
    APIRouter = None  # type: ignore


class CampaignRequest(BaseModel):
    artist: str = Field(..., min_length=1, max_length=200)
    track: str = Field(..., min_length=1, max_length=200)
    genre: str = Field(default="", max_length=50)
    mood: str = Field(default="", max_length=50)
    narrative: str = Field(default="", max_length=1000)
    goal: str = Field(default="drive_engagement", max_length=50)
    platforms: List[str] = Field(default=["tiktok", "instagram"], max_items=8)


class CampaignResponse(BaseModel):
    campaign_id: str
    bible: dict
    audio: dict
    video: dict
    social: dict
    ads: dict


class FeedbackRequest(BaseModel):
    """Performance feedback for a deployed piece of content."""
    content_id: str = Field(..., min_length=1, max_length=200)
    platform: str = Field(..., min_length=1, max_length=50)
    modality: str = Field(..., min_length=1, max_length=20)
    impressions: int = Field(default=0, ge=0)
    engagements: int = Field(default=0, ge=0)
    completion_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    ctr: float = Field(default=0.0, ge=0.0, le=1.0)


def _get_director():
    from .campaign import CampaignDirector, CampaignBrief
    return CampaignDirector, CampaignBrief


class RateLimiter:
    """Token-bucket rate limiter, per API key.

    Default: 10 campaigns/minute, 60 other requests/minute.
    Override via DIRECTOR_RATE_* env vars.
    """

    def __init__(self):
        from . import config
        self.campaign_limit = config.get("rate.campaign_per_minute", 10)
        self.default_limit = config.get("rate.requests_per_minute", 60)
        self._buckets: Dict[str, Dict] = {}

    def check(self, key: str, is_campaign: bool = False) -> bool:
        """Return True if allowed, False if rate-limited."""
        limit = self.campaign_limit if is_campaign else self.default_limit
        now = time.time()
        bucket = self._buckets.get(key, {"tokens": limit, "updated": now})

        # Refill: limit tokens per 60 seconds.
        elapsed = now - bucket["updated"]
        bucket["tokens"] = min(
            limit, bucket["tokens"] + elapsed * (limit / 60.0))
        bucket["updated"] = now

        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            self._buckets[key] = bucket
            return True

        self._buckets[key] = bucket
        return False


_limiter = RateLimiter()


def _rate_limit_key(request: Request, key: dict = None) -> str:
    """Identify the caller for rate limiting."""
    if key and key.get("id"):
        return f"key:{key['id']}"
    # Fall back to client IP.
    if request and request.client:
        return f"ip:{request.client.host}"
    return "ip:unknown"


def create_director_router(auth_dependency: Optional[Callable] = None):
    """Create the Director router with auth and rate limiting.

    auth_dependency: e.g. require_scope("generate") from server.py.
    If None, endpoints are unauthenticated (dev only).
    """
    if not _HAS_FASTAPI:
        return None

    router = APIRouter(tags=["director"])

    async def _check_auth(request: Request, key: dict = Depends(auth_dependency) if auth_dependency else None):
        # Rate limiting applies regardless of auth.
        rl_key = _rate_limit_key(request, key)
        is_campaign = request.url.path.endswith("/campaign")
        if not _limiter.check(rl_key, is_campaign=is_campaign):
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Try again in a minute.",
            )
        return key

    @router.post("/campaign", response_model=CampaignResponse)
    async def run_campaign(
        req: CampaignRequest,
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """Run a full multi-modal campaign.

        One brief in → coordinated audio/video/social/ads out.
        Requires 'generate' scope. Rate-limited to 10/minute per key.
        """
        CampaignDirector, CampaignBrief = _get_director()
        import uuid

        director = CampaignDirector()
        brief = CampaignBrief(
            artist=req.artist,
            track=req.track,
            genre=req.genre,
            mood=req.mood,
            narrative=req.narrative,
            goal=req.goal,
            platforms=req.platforms,
        )

        try:
            output = director.direct(brief)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Campaign failed: {e}")

        return CampaignResponse(
            campaign_id=f"camp_{uuid.uuid4().hex[:12]}",
            bible={
                "emotional_core": output.bible.emotional_core,
                "tension": output.bible.tension,
                "build": output.bible.build,
                "payoff": output.bible.payoff,
            },
            audio=output.audio,
            video={k: {"scenes": v.get("scenes", {}),
                       "rendered": v.get("rendered", False)}
                   for k, v in output.video.items()},
            social={k: {"caption": v.get("caption", "")[:500]}
                    for k, v in output.social.items()},
            ads={k: {"caption": v.get("caption", "")[:500]}
                 for k, v in output.ads.items()},
        )

    @router.post("/feedback")
    async def submit_feedback(
        req: FeedbackRequest,
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """Submit performance feedback for deployed content.

        This feeds the analytics loop — future generation learns from
        what actually performed.
        """
        from .analytics import FeedbackLoop
        loop = FeedbackLoop()
        ok = loop.record_feedback(
            content_id=req.content_id,
            platform=req.platform,
            modality=req.modality,
            metrics={
                "impressions": req.impressions,
                "engagements": req.engagements,
                "completion_rate": req.completion_rate,
                "ctr": req.ctr,
            },
        )
        return {"recorded": ok}

    @router.get("/platforms")
    async def list_platforms(
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """List supported platforms with their directives."""
        from .platforms import platform_list, get_platform_directive
        return {
            p: get_platform_directive(p)["algorithm"]
            for p in platform_list()
        }

    @router.get("/config")
    async def get_config(
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """Dump current Director configuration."""
        from . import config as _config
        return _config.all_config()

    @router.get("/metrics")
    async def get_metrics(
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """Get Director metrics (persisted)."""
        from .observability import get_metrics
        return get_metrics().summary()

    @router.get("/metrics/prometheus")
    async def get_metrics_prometheus(
        request: Request,
        _auth=Depends(_check_auth),
    ):
        """Prometheus exposition format for scraping."""
        from .observability import get_metrics
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(
            get_metrics().prometheus(),
            media_type="text/plain; version=0.0.4",
        )

    return router


# Backwards-compatible: plain router without auth (dev only).
# Production should use create_director_router(require_scope("generate")).
if _HAS_FASTAPI:
    router = create_director_router(None)
