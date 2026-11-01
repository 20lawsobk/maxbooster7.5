"""VideoDirector — shows the feeling.

Production-grade: wraps sample_all_scenes with Director enhancements,
and can invoke the real video renderer to produce actual video files.
- Story Bible ensures scene coherence
- Platform-specific scene architecture from research
- Awareness trends as scene concepts
- Critic loop for diversity and immediacy
- Stable seeding (hashlib, not hash()) for reproducibility
"""
from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive
from .critic import Critic
from .observability import get_logger


def _stable_seed(*parts: str) -> int:
    """Deterministic seed from hashlib (not hash() — that's per-process)."""
    h = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(h[:8], 16)


class VideoDirector:
    """Directs video scene generation."""

    def __init__(self):
        self.critic = Critic()
        self.log = get_logger("video_director")

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
        render: bool = False,
        audio_path: Optional[str] = None,
    ) -> Dict:
        """Generate platform-native video scenes with critic iteration.

        If render=True, invokes the real video renderer to produce an
        actual video file from the best scenes.
        """
        from ai_model.video.dataset_sampler import sample_all_scenes

        self.log.info("direct_start", platform=platform, idea=idea[:40],
                      render=render)

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
            # Stable seed for reproducibility (hashlib, not hash()).
            random.seed(_stable_seed(idea, platform, str(iteration)))

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

        # Render if requested.
        if render and best and best.get("scenes"):
            try:
                video_path = self._render_video(
                    best["scenes"], platform, artist, audio_path)
                best["video_path"] = video_path
                best["rendered"] = True
                self.log.info("render_complete", path=video_path)
            except Exception as e:
                self.log.error("render_failed", error=str(e))
                best["render_error"] = str(e)
                best["rendered"] = False

        return best

    def _render_video(
        self,
        scenes: Dict,
        platform: str,
        artist: str,
        audio_path: Optional[str] = None,
    ) -> str:
        """Invoke the real video renderer."""
        from ai_model.video.renderer import render_video, VideoRequest

        # Extract hook/body/cta text from scenes.
        # Scenes is a dict of scene_name -> scene text.
        hook = scenes.get("hook", "")
        body = scenes.get("body", "") or scenes.get("build", "")
        cta = scenes.get("cta", "")

        req = VideoRequest(
            hook=hook[:200],
            body=body[:300],
            cta=cta[:150],
            platform=platform,
            artist_name=artist,
            audio_path=audio_path,
        )
        result = render_video(req)
        # result is VideoResult; return the output path.
        return getattr(result, "output_path", str(result))
