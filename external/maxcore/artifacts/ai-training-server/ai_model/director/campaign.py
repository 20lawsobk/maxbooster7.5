"""CampaignDirector — conducts the four instruments.

Takes a campaign brief and produces coordinated outputs across all four
modalities (audio, video, social, ads), all reading from the same Story
Bible and Awareness Bus.

This is the "entire thing e2e": one brief in, four coherent outputs out.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .story_bible import StoryBible, build_story_bible
from .awareness_bus import AwarenessBus, AwarenessSnapshot
from .audio_director import AudioDirector
from .video_director import VideoDirector
from .social_director import SocialDirector
from .ads_director import AdsDirector
from .platforms import platform_list


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

    def direct(self, brief: CampaignBrief) -> CampaignOutput:
        """Run the full campaign: one brief in, four coherent outputs out."""

        # Step 1: Capture awareness (shared by all Directors).
        awareness = self.bus.snapshot(platforms=brief.platforms)

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

        # Step 3: Direct each modality.
        # Audio: the feeling (platform-agnostic master + platform renders).
        audio_out = self.audio.direct(
            platform="spotify",  # Reference master
            genre=brief.genre,
            bible=bible,
            awareness=awareness,
        )

        # Video, Social, Ads: per-platform.
        video_out = {}
        social_out = {}
        ads_out = {}

        for platform in brief.platforms:
            # Video: show the feeling.
            video_out[platform] = self.video.direct(
                idea=brief.track,
                artist=brief.artist,
                platform=platform,
                genre=brief.genre,
                tone=brief.mood or "energetic",
                bible=bible,
                awareness=awareness,
            )

            # Social: spread the feeling.
            social_out[platform] = self.social.direct(
                topic=brief.track,
                artist=brief.artist,
                platform=platform,
                genre=brief.genre,
                goal=brief.goal,
                bible=bible,
                awareness=awareness,
            )

            # Ads: amplify the feeling.
            # (Only for platforms with paid support.)
            if platform in ("facebook", "instagram", "tiktok"):
                ads_out[platform] = self.ads.direct(
                    topic=brief.track,
                    artist=brief.artist,
                    platform=platform,
                    genre=brief.genre,
                    objective=brief.goal,
                    bible=bible,
                    awareness=awareness,
                )

        return CampaignOutput(
            bible=bible,
            audio=audio_out,
            video=video_out,
            social=social_out,
            ads=ads_out,
            awareness=awareness,
        )
