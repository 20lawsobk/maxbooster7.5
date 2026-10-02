"""Director API — HTTP endpoints for the CampaignDirector.

Mount these in the FastAPI server:
    from ai_model.director.api import router
    app.include_router(router, prefix="/api/director")
"""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field

try:
    from fastapi import APIRouter, Depends, HTTPException
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


def _get_director():
    from .campaign import CampaignDirector, CampaignBrief
    return CampaignDirector, CampaignBrief


if _HAS_FASTAPI:
    router = APIRouter(tags=["director"])

    @router.post("/campaign", response_model=CampaignResponse)
    async def run_campaign(req: CampaignRequest):
        """Run a full multi-modal campaign.

        One brief in → coordinated audio/video/social/ads out.
        Requires 'generate' scope (same as other generation endpoints).
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
            video={k: {"scenes": v.get("scenes", {})}
                   for k, v in output.video.items()},
            social={k: {"caption": v.get("caption", "")[:500]}
                    for k, v in output.social.items()},
            ads={k: {"caption": v.get("caption", "")[:500]}
                 for k, v in output.ads.items()},
        )

    @router.get("/platforms")
    async def list_platforms():
        """List supported platforms with their directives."""
        from .platforms import platform_list, get_platform_directive
        return {
            p: get_platform_directive(p)["algorithm"]
            for p in platform_list()
        }

    @router.get("/config")
    async def get_config():
        """Dump current Director configuration."""
        from . import config as _config
        return _config.all_config()
