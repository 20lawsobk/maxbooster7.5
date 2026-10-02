"""AudioDirector — creates the feeling.

Wraps the mastering recommendation with Director enhancements:
- Elite reference profile anchoring (already built)
- Platform-specific mastering targets from research
- Story Bible emotional core informs the sonic direction
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive


# Platform-specific loudness targets (LUFS integrated).
# From platform documentation and industry practice.
PLATFORM_LOUDNESS = {
    "tiktok": -14.0,      # Normalized; phone speakers
    "instagram": -14.0,   # Normalized
    "youtube": -14.0,     # Normalized; preserves dynamics
    "facebook": -14.0,
    "spotify": -14.0,     # Reference
    "apple_music": -16.0, # Sound Check
}


class AudioDirector:
    """Directs audio mastering decisions."""

    def direct(
        self,
        platform: str = "spotify",
        genre: str = "",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        reference_profile: Optional[Dict] = None,
    ) -> Dict:
        """Get mastering direction with platform and story context.

        Returns the directive; the actual mastering uses the existing
        /api/audio/mastering-recommendation endpoint with the reference
        profile (already wired).
        """
        directive = get_platform_directive(platform)

        # Platform loudness target.
        target_lufs = PLATFORM_LOUDNESS.get(platform.lower(), -14.0)

        # Override with elite reference if provided.
        if reference_profile and "targetLUFS" in reference_profile:
            target_lufs = float(reference_profile["targetLUFS"])

        # Story Bible informs the sonic character.
        sonic_notes = ""
        if bible and bible.is_complete():
            sonic_notes = (
                f"Emotional core '{bible.emotional_core}' should be felt in "
                f"the master: {bible.tension} → {bible.payoff}. "
                f"Key moments: {bible.key_moments}"
            )

        # Trend-aware: if a sound is viral, note it for the mix.
        trend_note = ""
        if awareness and awareness.sounds:
            trend_note = f"Viral sounds in landscape: {', '.join(awareness.sounds[:3])}"

        return {
            "platform": platform,
            "target_lufs": target_lufs,
            "true_peak_ceiling": -1.0,
            "directive": directive["audio"],
            "sonic_notes": sonic_notes,
            "trend_note": trend_note,
            "reference_anchored": bool(reference_profile),
            # The actual DSP params come from the mastering endpoint.
            # This Director provides the creative direction.
        }
