"""AwarenessBus — the nervous system.

Three live streams feed every Director:
1. Landscape: trending hashtags, sounds, viral formats (live)
2. Algorithm: per-platform ranking signals (research + observed)
3. Performance: real engagement feedback (when available)

All four modality Directors read from the same bus, so they share
context and stay coherent.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class AwarenessSnapshot:
    """A point-in-time capture of all awareness streams."""

    # Landscape: live trends
    hashtags: List[str] = field(default_factory=list)
    sounds: List[str] = field(default_factory=list)
    viral_formats: List[str] = field(default_factory=list)

    # Algorithm: per-platform signals (from research JSON)
    platform_signals: Dict[str, Dict] = field(default_factory=dict)

    # Performance: observed engagement (when available)
    performance_hints: Dict[str, str] = field(default_factory=dict)

    def has_landscape(self) -> bool:
        return bool(self.hashtags or self.sounds or self.viral_formats)

    def for_platform(self, platform: str) -> Dict:
        """Platform-specific slice."""
        return {
            "hashtags": self.hashtags[:5],
            "sounds": self.sounds[:3],
            "formats": self.viral_formats[:3],
            "signals": self.platform_signals.get(platform, {}),
            "performance": self.performance_hints.get(platform, ""),
        }


class AwarenessBus:
    """Unified interface to all awareness systems."""

    def __init__(self):
        self._landscape_cache: Optional[dict] = None
        self._platform_cache: Optional[dict] = None

    def snapshot(
        self,
        platforms: Optional[List[str]] = None,
    ) -> AwarenessSnapshot:
        """Capture current awareness across all streams."""
        snap = AwarenessSnapshot()

        # Stream 1: Landscape (live trends)
        try:
            from ai_model.awareness.sources import landscape_feed
            for kind in ("hashtags", "sounds", "viral_formats"):
                try:
                    items = landscape_feed(kind) or []
                    texts = [i.get("text", i) if isinstance(i, dict) else str(i)
                             for i in items[:8]]
                    if kind == "hashtags":
                        snap.hashtags = texts
                    elif kind == "sounds":
                        snap.sounds = texts
                    else:
                        snap.viral_formats = texts
                except Exception:
                    pass
        except Exception:
            pass

        # Stream 2: Algorithm (platform research)
        try:
            import json
            from pathlib import Path
            # Try multiple locations for the research JSON.
            for p in [
                Path.home() / "workspace/maxbooster7.5/shared/social-platform-optimization.json",
                Path("/home/hatch/workspace/maxbooster7.5/shared/social-platform-optimization.json"),
            ]:
                if p.is_file():
                    data = json.loads(p.read_text())
                    for plat in (platforms or []):
                        prof = data.get("platforms", {}).get(plat, {})
                        if prof:
                            snap.platform_signals[plat] = {
                                "cta": prof.get("cta", ""),
                                "signals": prof.get("engagementSignals", []),
                                "quality": prof.get("qualityDimensions", []),
                                "hashtag_policy": prof.get("hashtagKeywordPolicy", ""),
                            }
                    break
        except Exception:
            pass

        # Stream 3: Performance (placeholder — wired when analytics available)
        # In production, this reads from the analytics store.

        return snap

    def trend_context(self, snap: AwarenessSnapshot) -> str:
        """Format trends as generation context."""
        parts = []
        if snap.hashtags:
            parts.append("Trending: " + ", ".join(snap.hashtags[:5]))
        if snap.viral_formats:
            parts.append("Formats: " + ", ".join(snap.viral_formats[:3]))
        return " | ".join(parts)
