"""SocialDirector — spreads the feeling.

Wraps compose_caption with Director enhancements:
- Story Bible context woven into the brief
- Platform-specific directives from research
- Awareness trends in the language
- Critic loop iteration
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive
from .critic import Critic, CritiqueReport


class SocialDirector:
    """Directs social copy generation."""

    def __init__(self):
        self.critic = Critic()

    def direct(
        self,
        topic: str,
        artist: str,
        platform: str = "instagram",
        genre: str = "",
        goal: str = "drive_engagement",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        max_iterations: int = 3,
    ) -> Dict:
        """Generate platform-native social copy with critic iteration."""
        from ai_model.request_intelligence import (
            build_brief, compose_caption,
        )

        # Build the brief with Director context.
        brief_kwargs = dict(
            modality="text",
            platform=platform,
            topic=topic,
            goal=goal,
            genre=genre,
            artist=artist,
        )

        # Weave Story Bible into the topic/narrative.
        if bible and bible.is_complete():
            # The emotional core becomes part of the creative direction.
            brief_kwargs["narrative"] = bible.emotional_core

        # Weave awareness trends.
        awareness_str = ""
        if awareness and awareness.has_landscape():
            awareness_str = " | ".join(awareness.hashtags[:5])
            brief_kwargs["awareness"] = awareness_str

        brief = build_brief(**brief_kwargs)

        # Platform directive from research.
        directive = get_platform_directive(platform)

        best = None
        best_score = -1

        for iteration in range(max_iterations):
            result = compose_caption(
                topic, artist, brief, genre=genre, variants=3,
            )
            caption = result.get("caption", "")

            # Critique.
            report = self.critic.critique_social(
                caption,
                hook=result.get("hook", ""),
                body=result.get("body", ""),
                cta=result.get("cta", ""),
                platform=platform,
            )

            score = sum(c.score for c in report.critiques) / max(1, len(report.critiques))
            if score > best_score:
                best_score = score
                best = result
                best["critique"] = report.summary()
                best["iterations"] = iteration + 1

            if report.passed():
                break

            # If failed, the next iteration uses the critique to adjust.
            # (In the full system, this would modify the brief; for now,
            # we accept the best of N iterations.)

        best["platform_directive"] = directive["social"]
        best["platform"] = platform
        return best
