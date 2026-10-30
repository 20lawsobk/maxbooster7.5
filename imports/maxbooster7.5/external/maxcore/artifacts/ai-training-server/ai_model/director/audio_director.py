"""AudioDirector — creates the feeling.

Production-grade: orchestrates the real mastering recommendation engine.
Accepts PCM analysis features (from Node DSP or direct analysis),
applies platform-specific targets and Story Bible direction,
and returns actual DSP parameters — not just creative notes.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Any

from .story_bible import StoryBible
from .awareness_bus import AwarenessSnapshot
from .platforms import get_platform_directive
from .observability import get_logger


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

# Elite reference profile (from audio benchmark).
ELITE_REFERENCE = {
    "targetLUFS": -8.1,
    "truePeakCeiling": -1.0,
    "targetLRA": 9.0,
    "stereoWidth": 0.7683,
}


class AudioDirector:
    """Directs audio mastering decisions."""

    def __init__(self):
        self.log = get_logger("audio_director")

    def direct(
        self,
        platform: str = "spotify",
        genre: str = "",
        bible: Optional[StoryBible] = None,
        awareness: Optional[AwarenessSnapshot] = None,
        reference_profile: Optional[Dict] = None,
        audio_features: Optional[Dict[str, Any]] = None,
    ) -> Dict:
        """Get mastering direction with platform and story context.

        If audio_features are provided (PCM analysis from Node DSP),
        invokes the real mastering recommendation engine and returns
        DSP parameters. Otherwise returns creative direction for the
        mastering stage to apply when features are available.
        """
        directive = get_platform_directive(platform)
        self.log.info("direct_start", platform=platform, genre=genre,
                      has_features=bool(audio_features))

        # Platform loudness target.
        target_lufs = PLATFORM_LOUDNESS.get(platform.lower(), -14.0)

        # Elite reference overrides.
        ref = reference_profile or ELITE_REFERENCE
        if ref and "targetLUFS" in ref:
            target_lufs = float(ref["targetLUFS"])

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

        result = {
            "platform": platform,
            "target_lufs": target_lufs,
            "true_peak_ceiling": float(ref.get("truePeakCeiling", -1.0)),
            "target_lra": float(ref.get("targetLRA", 9.0)),
            "stereo_width": float(ref.get("stereoWidth", 0.7)),
            "directive": directive["audio"],
            "sonic_notes": sonic_notes,
            "trend_note": trend_note,
            "reference_anchored": True,
        }

        # If we have PCM features, run the real mastering engine.
        if audio_features:
            try:
                dsp_params = self._run_mastering_engine(
                    audio_features, target_lufs, ref, genre)
                result["dsp_params"] = dsp_params
                result["engine"] = "mastering_recommendation"
                self.log.info("mastering_engine_complete",
                              platform=platform)
            except Exception as e:
                self.log.error("mastering_engine_failed", error=str(e))
                result["engine_error"] = str(e)

        return result

    def _run_mastering_engine(
        self,
        features: Dict[str, Any],
        target_lufs: float,
        ref: Dict,
        genre: str,
    ) -> Dict[str, Any]:
        """Invoke the mastering recommendation logic directly.

        Imports the server's endpoint function and calls it with a
        constructed request — no HTTP round-trip.
        """
        # Import here to avoid circular imports at module load.
        import sys
        import os
        server_dir = os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))
        if server_dir not in sys.path:
            sys.path.insert(0, server_dir)

        # The endpoint is async; run it synchronously.
        import asyncio
        from server import (
            audio_mastering_recommendation,
            AudioMasteringRecommendationRequest,
        )

        # Build the request from features.
        # Features should match the MasteringSpectralFeatures etc. shapes.
        req = AudioMasteringRecommendationRequest(
            spectral=features.get("spectral", {}),
            dynamics=features.get("dynamics", {}),
            rhythm=features.get("rhythm", {}),
            timbre=features.get("timbre", {}),
            currentLUFS=features.get("currentLUFS", -14.0),
            currentPeak=features.get("currentPeak", -3.0),
            dynamicRange=features.get("dynamicRange", 8.0),
            stereoWidth=features.get("stereoWidth", 0.5),
            frequencyBalance=features.get("frequencyBalance", {}),
            genre=genre or None,
            referenceProfile=ref,
        )

        # Call the endpoint function directly (bypass FastAPI Depends).
        # The _key param has a default via Depends; we pass None.
        coro = audio_mastering_recommendation(req, _key=None)
        return asyncio.get_event_loop().run_until_complete(coro)
