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

        # Surgical repairs: if the critic still fails dimensions after all
        # iterations, apply targeted edits. Regeneration explores the space;
        # these guarantee the critic's prescriptions are honored.
        result = self._surgical_repairs(result, platform)

        result["platform_directive"] = get_platform_directive(platform)["social"]
        result["platform"] = platform

        # Record metrics.
        from .observability import get_metrics
        metrics = get_metrics()
        metrics.increment("social.completed")
        metrics.increment(f"social.platform.{platform}")
        if result.get("final_score") is not None:
            metrics.record_score("social.critic", result["final_score"])
        if result.get("repaired"):
            metrics.increment("social.repaired")

        self.log.info("direct_complete",
                      score=result.get("final_score"),
                      iterations=result.get("candidates_considered", 1))
        return result

    def _surgical_repairs(self, result: Dict, platform: str) -> Dict:
        """Apply targeted edits for still-failing critic dimensions."""
        report = result.get("critique_report")
        if not report:
            return result

        repairs = []
        for crit in report.critiques:
            if crit.passed:
                continue
            if crit.dimension == "cta":
                forced = self._platform_cta(platform)
                parts = result.get("caption", "").rsplit("\n\n", 1)
                if len(parts) == 2:
                    result["caption"] = f"{parts[0]}\n\n{forced}"
                result["cta"] = forced
                repairs.append("cta")
            elif crit.dimension == "emotional_arc":
                # Ensure tension + resolution are both present.
                low = result.get("caption", "").lower()
                has_tension = any(t in low for t in
                                  ["3am", "struggle", "scrapped", "doubt"])
                has_resolution = any(r in low for r in
                                     ["finally", "survived", "out now"])
                body = result.get("body", "")
                if not has_tension and body:
                    body = f"After the 3am sessions that almost broke me. {body}"
                if not has_resolution and body:
                    body = f"{body} Finally out now."
                if body != result.get("body", ""):
                    # Rebuild caption with repaired body.
                    hook = result.get("hook", "")
                    cta = result.get("cta", "")
                    result["body"] = body
                    result["caption"] = f"{hook}\n\n{body}\n\n{cta}"
                    repairs.append("emotional_arc")

        if repairs:
            result["repaired"] = repairs
            self.log.info("surgical_repairs_applied",
                          platform=platform, repairs=repairs)
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
