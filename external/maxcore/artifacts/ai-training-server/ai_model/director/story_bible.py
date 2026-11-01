"""StoryBible — the campaign's narrative DNA.

Every Director reads the Story Bible. Every output is checked against it.
This is what makes four modalities feel like one world instead of four
separate generations.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class StoryBible:
    """The narrative contract for a campaign."""

    # Core identity
    artist: str = ""
    track: str = ""
    genre: str = ""

    # The emotional core — one sentence that everything serves.
    emotional_core: str = ""

    # Key moments: timestamps or structural points where the story turns.
    # For audio: e.g. {"drop": "0:45", "bridge": "1:30"}
    # For video: e.g. {"hook": "0:00", "payoff": "0:12"}
    key_moments: Dict[str, str] = field(default_factory=dict)

    # Visual motifs recurring across video and social.
    visual_motifs: List[str] = field(default_factory=list)

    # Language patterns: the artist's voice, campaign vocabulary.
    # e.g. ["midnight", "voltage", "no sleep"]
    language_patterns: List[str] = field(default_factory=list)

    # Trend integrations: which live trends we're conversing with and how.
    # e.g. [{"trend": "#newmusicfriday", "angle": "drop-day energy"}]
    trend_integrations: List[Dict[str, str]] = field(default_factory=list)

    # Platform notes: per-platform adjustments to the core story.
    platform_notes: Dict[str, str] = field(default_factory=dict)

    # Narrative arc: tension -> build -> payoff in the artist's own words.
    tension: str = ""
    build: str = ""
    payoff: str = ""

    def is_complete(self) -> bool:
        """A Bible is complete when it has the core + arc."""
        return bool(self.emotional_core and self.tension and self.payoff)

    def for_platform(self, platform: str) -> Dict[str, str]:
        """Extract the platform-relevant slice."""
        return {
            "emotional_core": self.emotional_core,
            "tension": self.tension,
            "build": self.build,
            "payoff": self.payoff,
            "language": ", ".join(self.language_patterns[:5]),
            "platform_note": self.platform_notes.get(platform, ""),
            "trends": ", ".join(
                t.get("trend", "") for t in self.trend_integrations[:3]),
        }


def build_story_bible(
    artist: str,
    track: str,
    genre: str = "",
    narrative: str = "",
    mood: str = "",
    trends: Optional[List[str]] = None,
) -> StoryBible:
    """Construct a Story Bible from a campaign brief.

    This is deterministic and template-driven — the Director refines it,
    but the bones come from the brief itself.
    """
    bible = StoryBible(artist=artist, track=track, genre=genre)

    # Emotional core from narrative + mood.
    if narrative:
        bible.emotional_core = narrative.strip()
    elif mood:
        bible.emotional_core = f"{mood} energy that demands to be felt"
    else:
        bible.emotional_core = f"The undeniable energy of {track}"

    # Default arc — the Director customizes per campaign.
    bible.tension = f"The wait for {track} is over — but nobody's ready"
    bible.build = f"{artist} poured every late night into this"
    bible.payoff = f"{track} is here. Turn it up."

    # Language patterns from artist/track/genre.
    patterns = []
    if artist:
        patterns.append(artist.lower())
    if track:
        # Key words from track title.
        patterns.extend(w.lower() for w in track.split()
                        if len(w) > 3 and w.lower() not in ("the", "and"))
    if genre:
        patterns.append(genre.lower())
    bible.language_patterns = patterns[:6]

    # Trend integrations.
    for trend in (trends or [])[:3]:
        bible.trend_integrations.append({
            "trend": trend,
            "angle": f"{track} meets {trend}",
        })

    return bible
