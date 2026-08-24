"""Closed social-platform optimization registry for the awareness bus."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

PLATFORMS = (
    "facebook", "instagram", "youtube", "tiktok",
    "threads", "google_business", "x", "linkedin",
)
ALIASES = {
    "google business": "google_business",
    "googlebusiness": "google_business",
    "google-business": "google_business",
    "twitter": "x",
    "twitter/x": "x",
}


def _load_registry() -> dict[str, Any]:
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / "shared" / "social-platform-optimization.json",
        here.parents[5] / "shared" / "social-platform-optimization.json",
    ]
    for candidate in candidates:
        if candidate.is_file():
            data = json.loads(candidate.read_text(encoding="utf-8"))
            profiles = data.get("platforms")
            if set(profiles or {}) != set(PLATFORMS):
                raise RuntimeError("Invalid social awareness optimization registry")
            return data
    raise FileNotFoundError("shared/social-platform-optimization.json")


def normalize_platform(value: Any) -> str:
    raw = str(value or "").strip().lower()
    normalized = ALIASES.get(raw, raw.replace(" ", "_"))
    if normalized not in PLATFORMS:
        raise ValueError(f"Unsupported social awareness platform: {value}")
    return normalized


def format_platform_optimization(value: Any) -> str:
    platform = normalize_platform(value)
    registry = _load_registry()
    profile = registry["platforms"][platform]
    return "\n".join((
        f"[PLATFORM_OPTIMIZATION platform={platform} revision={registry['revision']}]",
        f"Content shape: {profile['contentShape']}.",
        f"Length: {profile['length']['min']}-{profile['length']['max']} {profile['length']['unit']}. Formats: {', '.join(profile['format'])}.",
        f"Audience intent: {', '.join(profile['audienceIntent'])}.",
        f"Cadence: {profile['cadence']}. CTA: {profile['cta']}.",
        f"Hashtag/keyword policy: {profile['hashtagKeywordPolicy']}.",
        f"Primary engagement signals: {', '.join(profile['engagementSignals'])}.",
        f"Quality dimensions: {', '.join(profile['qualityDimensions'])}.",
    ))