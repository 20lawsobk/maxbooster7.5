"""SocialDirector — spreads the feeling.

Wraps compose_caption with Director enhancements:
- Story Bible context woven into the brief
- Platform-specific directives from research
- Awareness trends in the language
- Iterative critic loop with real brief mutation
- Error boundaries with graceful fallback
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive
from .critic import Critic, CritiqueReport
from .iterative import IterativeLoop, mutate_social_params
from .observability import get_logger


class SocialDirector:
    """Directs social copy generation."""

    def __init__(self):
        self.critic = Critic()
        self.loop = IterativeLoop(critic=self.critic, max_iterations=5)
        self.log = get_logger("social_director")

    def direct(
        self,
        topic: str,
        artist: str,
        platform: str = "instagram",
        genre: str = "",
        goal: str = "drive_engagement",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        max_iterations: int = 5,
    ) -> Dict:
        """Generate platform-native social copy with iterative critic loop."""
        from ai_model.request_intelligence import (
            build_brief, compose_caption,
        )

        self.log.info("direct_start", platform=platform, topic=topic[:40])

        # Build initial params.
        params = dict(
            topic=topic,
            artist=artist,
            platform=platform,
            genre=genre,
            goal=goal,
            bible=bible,
            awareness=awareness,
        )

        def generate(p: Dict) -> Dict:
            brief_kwargs = dict(
                modality="text",
                platform=p["platform"],
                topic=p["topic"],
                goal=p["goal"],
                genre=p.get("genre", ""),
                artist=p["artist"],
            )
            if p.get("bible") and p["bible"].is_complete():
                brief_kwargs["narrative"] = p["bible"].emotional_core
            if p.get("awareness") and p["awareness"].has_landscape():
                brief_kwargs["awareness"] = " | ".join(p["awareness"].hashtags[:5])
            # Mutated keywords from critic feedback.
            if p.get("keywords"):
                brief_kwargs["themes"] = p["keywords"][:6]

            brief = build_brief(**brief_kwargs)
            result = compose_caption(
                p["topic"], p["artist"], brief,
                genre=p.get("genre", ""), variants=3,
                agent_cta=p.get("force_cta", ""),
            )
            return result

        def critique(output: Dict) -> CritiqueReport:
            return self.critic.critique_social(
                output.get("caption", ""),
                hook=output.get("hook", ""),
                body=output.get("body", ""),
                cta=output.get("cta", ""),
                platform=platform,
            )

        # Run the iterative loop.
        self.loop.max_iterations = max_iterations
        result = self.loop.run(generate, critique, mutate_social_params, params)

        if "error" in result:
            self.log.error("direct_failed", error=result["error"])
            # Fallback: minimal viable output, never empty.
            return {
                "caption": f"{artist} — {topic} out now.",
                "hook": f"{topic} out now",
                "body": "",
                "cta": "Stream now",
                "platform": platform,
                "fallback": True,
            }

        # Surgical repair: if the critic still fails CTA after all iterations,
        # substitute the platform-native CTA directly. Regeneration expands
        # the search space; this guarantees the prescription is honored.
        report = result.get("critique_report")
        if report:
            cta_crit = next(
                (c for c in report.critiques if c.dimension == "cta"), None)
            if cta_crit and not cta_crit.passed:
                forced = self._platform_cta(platform)
                parts = result.get("caption", "").rsplit("\n\n", 1)
                if len(parts) == 2:
                    result["caption"] = f"{parts[0]}\n\n{forced}"
                result["cta"] = forced
                result["cta_repaired"] = True
                self.log.info("cta_surgically_repaired", platform=platform)

        result["platform_directive"] = get_platform_directive(platform)["social"]
        result["platform"] = platform
        self.log.info("direct_complete",
                      score=result.get("final_score"),
                      iterations=result.get("iteration", 0) + 1)
        return result

    @staticmethod
    def _platform_cta(platform: str) -> str:
        return {
            "tiktok": "Duet this if it hit",
            "instagram": "Save this for later",
            "youtube": "Subscribe for the drop",
            "facebook": "Tag someone who needs this",
            "threads": "Reply with your take",
            "x": "Repost if you feel this",
            "linkedin": "Share your perspective below",
        }.get(platform, "Save and share this")
