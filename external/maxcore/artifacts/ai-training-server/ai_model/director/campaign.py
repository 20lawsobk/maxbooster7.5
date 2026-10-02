"""CampaignDirector — conducts the four instruments.

Takes a campaign brief and produces coordinated outputs across all four
modalities (audio, video, social, ads), all reading from the same Story
Bible and Awareness Bus.

Production-grade: per-Director error boundaries, persistence, observability.
One Director failing never takes down the campaign.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .story_bible import StoryBible, build_story_bible
from .awareness_bus import AwarenessBus, AwarenessSnapshot
from .audio_director import AudioDirector
from .video_director import VideoDirector
from .social_director import SocialDirector
from .ads_director import AdsDirector
from .platforms import platform_list
from .observability import get_logger, get_metrics
from .persistence import save_bible, save_campaign
from . import config


@dataclass
class CampaignBrief:
    """Input to the CampaignDirector."""

    artist: str
    track: str
    genre: str = ""
    mood: str = ""
    narrative: str = ""
    goal: str = "drive_engagement"
    platforms: List[str] = field(default_factory=lambda: ["tiktok", "instagram"])


@dataclass
class CampaignOutput:
    """Coordinated outputs across all four modalities."""

    bible: StoryBible
    audio: Dict
    video: Dict[str, Dict]  # per-platform
    social: Dict[str, Dict]  # per-platform
    ads: Dict[str, Dict]  # per-platform
    awareness: AwarenessSnapshot


class CampaignDirector:
    """Orchestrates all four content modalities as one campaign."""

    def __init__(self):
        self.bus = AwarenessBus()
        self.audio = AudioDirector()
        self.video = VideoDirector()
        self.social = SocialDirector()
        self.ads = AdsDirector()
        self.log = get_logger("campaign_director")
        self.metrics = get_metrics()

    def direct(self, brief: CampaignBrief) -> CampaignOutput:
        """Run the full campaign: one brief in, four coherent outputs out.

        Per-Director error boundaries: one modality failing never takes
        down the campaign. Failures are logged and the output marks
        which modalities succeeded.
        """
        campaign_id = f"camp_{uuid.uuid4().hex[:12]}"
        start = time.time()
        self.log.info("campaign_start", campaign_id=campaign_id,
                      artist=brief.artist, track=brief.track,
                      platforms=brief.platforms)

        # Step 1: Capture awareness (shared by all Directors).
        awareness = self._safe(
            "awareness",
            lambda: self.bus.snapshot(platforms=brief.platforms),
            fallback=AwarenessSnapshot(),
        )

        # Step 2: Build the Story Bible (the narrative contract).
        trends = awareness.hashtags[:3] if awareness.has_landscape() else []
        bible = build_story_bible(
            artist=brief.artist,
            track=brief.track,
            genre=brief.genre,
            narrative=brief.narrative,
            mood=brief.mood,
            trends=trends,
        )
        # Persist the Bible (best-effort).
        save_bible(campaign_id, {
            "artist": bible.artist, "track": bible.track,
            "emotional_core": bible.emotional_core,
            "tension": bible.tension, "build": bible.build,
            "payoff": bible.payoff,
        })

        # Step 3: Direct each modality with error boundaries.
        audio_out = self._safe(
            "audio",
            lambda: self.audio.direct(
                platform="spotify", genre=brief.genre,
                bible=bible, awareness=awareness),
            fallback={"error": "audio director failed", "platform": "spotify"},
        )

        video_out = {}
        social_out = {}
        ads_out = {}

        for platform in brief.platforms:
            # Video: show the feeling.
            video_out[platform] = self._safe(
                f"video:{platform}",
                lambda p=platform: self.video.direct(
                    idea=brief.track, artist=brief.artist, platform=p,
                    genre=brief.genre, tone=brief.mood or "energetic",
                    bible=bible, awareness=awareness),
                fallback={"error": f"video failed for {platform}", "scenes": {}},
            )

            # Social: spread the feeling.
            social_out[platform] = self._safe(
                f"social:{platform}",
                lambda p=platform: self.social.direct(
                    topic=brief.track, artist=brief.artist, platform=p,
                    genre=brief.genre, goal=brief.goal,
                    bible=bible, awareness=awareness),
                fallback={"error": f"social failed for {platform}", "caption": ""},
            )

            # Ads: amplify the feeling.
            if platform in ("facebook", "instagram", "tiktok"):
                ads_out[platform] = self._safe(
                    f"ads:{platform}",
                    lambda p=platform: self.ads.direct(
                        topic=brief.track, artist=brief.artist, platform=p,
                        genre=brief.genre, objective=brief.goal,
                        bible=bible, awareness=awareness),
                    fallback={"error": f"ads failed for {platform}"},
                )

        output = CampaignOutput(
            bible=bible,
            audio=audio_out,
            video=video_out,
            social=social_out,
            ads=ads_out,
            awareness=awareness,
        )

        # Record metrics.
        elapsed = time.time() - start
        self.metrics.increment("campaigns_completed")
        self.log.info("campaign_complete", campaign_id=campaign_id,
                      elapsed_s=round(elapsed, 2),
                      video_platforms=list(video_out.keys()),
                      social_platforms=list(social_out.keys()))

        # Persist (best-effort).
        save_campaign(campaign_id, {
            "artist": brief.artist, "track": brief.track,
            "platforms": brief.platforms,
            "elapsed_s": round(elapsed, 2),
        })

        return output

    def _safe(self, name: str, fn, fallback: Dict) -> Dict:
        """Error boundary: never let one Director kill the campaign."""
        try:
            return fn()
        except Exception as e:
            self.log.error("director_failed", director=name, error=str(e))
            self.metrics.increment(f"errors.{name}")
            return fallback
