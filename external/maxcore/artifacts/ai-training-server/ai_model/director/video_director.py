"""VideoDirector — shows the feeling.

Wraps sample_all_scenes with Director enhancements:
- Story Bible ensures scene coherence
- Platform-specific scene architecture from research
- Awareness trends as scene concepts
- Critic loop for diversity and immediacy
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive
from .critic import Critic


class VideoDirector:
    """Directs video scene generation."""

    def __init__(self):
        self.critic = Critic()

    def direct(
        self,
        idea: str,
        artist: str,
        platform: str = "tiktok",
        genre: str = "",
        tone: str = "energetic",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        max_iterations: int = 3,
    ) -> Dict:
        """Generate platform-native video scenes with critic iteration."""
        from ai_model.video.dataset_sampler import sample_all_scenes

        scene_sequence = ["hook", "build", "body", "drop", "cta"]

        # Awareness as scene context.
        awareness_str = ""
        if awareness and awareness.has_landscape():
            # Viral formats become scene concepts.
            formats = awareness.viral_formats[:2]
            if formats:
                awareness_str = "Viral formats: " + ", ".join(formats)

        # Story Bible: use the arc for scene coherence.
        keywords = None
        if bible and bible.is_complete():
            keywords = bible.language_patterns[:4]

        directive = get_platform_directive(platform)

        best = None
        best_score = -1

        for iteration in range(max_iterations):
            import random
            # Vary seed per iteration for diversity.
            random.seed(hash((idea, platform, iteration)) % (2**31))

            scenes, tier = sample_all_scenes(
                scene_sequence,
                idea=idea,
                genre=genre,
                tone=tone,
                platform=platform,
                artist_name=artist,
                awareness=awareness_str,
                keywords=keywords,
            )

            # Critique.
            report = self.critic.critique_video(scenes, platform=platform)
            score = sum(c.score for c in report.critiques) / max(1, len(report.critiques))

            if score > best_score:
                best_score = score
                best = {
                    "scenes": scenes,
                    "tier": tier,
                    "critique": report.summary(),
                    "iterations": iteration + 1,
                    "platform": platform,
                    "platform_directive": directive["video"],
                }

            if report.passed():
                break

        return best
