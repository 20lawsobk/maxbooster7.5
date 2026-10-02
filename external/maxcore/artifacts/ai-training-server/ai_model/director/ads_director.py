"""AdsDirector — amplifies the feeling.

Paid distribution of the organic story. Key differences from organic:
- Objective is conversion (streams, presaves, follows), not just engagement
- First 3 seconds are unskippable (Meta) — hook must land immediately
- Social proof from organic performance becomes ad creative
- Platform ad formats have specific requirements

The Ads Director promotes what already works organically, with
paid-specific optimization.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive


class AdsDirector:
    """Directs paid ad creative generation."""

    def direct(
        self,
        topic: str,
        artist: str,
        platform: str = "facebook",
        genre: str = "",
        objective: str = "drive_streams",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        social_proof: Optional[Dict[str, str]] = None,
    ) -> Dict:
        """Generate paid ad creative.

        Uses the SocialDirector as the base (ad creative starts from
        organic winners), then applies paid-specific transformations:
        - Stronger hook (3-second rule)
        - Clear conversion CTA
        - Social proof integration
        - Platform ad format compliance
        """
        from .social_director import SocialDirector

        social = SocialDirector()

        # Generate the organic base.
        # Ads use conversion goal, not engagement.
        base = social.direct(
            topic=topic,
            artist=artist,
            platform=platform,
            genre=genre,
            goal="drive_conversion" if "stream" in objective else objective,
            bible=bible,
            awareness=awareness,
            max_iterations=2,
        )

        caption = base.get("caption", "")
        directive = get_platform_directive(platform)

        # Paid transformations:
        # 1. Front-load the hook (3-second rule for skippable ads).
        # 2. Ensure conversion CTA is explicit.
        # 3. Weave in social proof.

        hook = base.get("hook", "")
        body = base.get("body", "")
        cta = base.get("cta", "")

        # Strengthen CTA for conversion.
        if objective == "drive_streams" and "stream" not in cta.lower():
            cta = f"{cta} Stream now — link in bio."

        # Add social proof if available.
        proof_line = ""
        if social_proof:
            saves = social_proof.get("saves", "")
            shares = social_proof.get("shares", "")
            if saves or shares:
                proof_line = f"\n\n({saves} saves • {shares} shares)"

        ad_caption = caption + proof_line

        return {
            "caption": ad_caption,
            "hook": hook,
            "body": body,
            "cta": cta,
            "platform": platform,
            "objective": objective,
            "platform_directive": directive["ads"],
            "is_paid": True,
            # Paid-specific: the hook must work in 3 seconds (skippable).
            "hook_3sec": len(hook.split()) <= 8,
        }
