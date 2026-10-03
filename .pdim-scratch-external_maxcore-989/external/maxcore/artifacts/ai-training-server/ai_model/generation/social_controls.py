"""Validated controls and native output shaping for social generation."""
from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field


class SocialGenerationControls(BaseModel):
    """Controls accepted by the platform social endpoint."""

    output_format: str = Field(
        "text", pattern=r"^(text|image|audio|video)$"
    )
    target_audience: Optional[str] = Field(None, max_length=500)
    hashtag_strategy: Optional[str] = Field(
        None, pattern=r"^(balanced|niche|trending|branded)$"
    )
    caption_length: Optional[str] = Field(
        None, pattern=r"^(short|optimal|long)$"
    )
    call_to_action_strength: Optional[str] = Field(
        None, pattern=r"^(low|medium|high)$"
    )
    genre: Optional[str] = Field(None, max_length=100)
    content_type: Optional[str] = Field(None, max_length=100)


def control_awareness(controls: SocialGenerationControls) -> str:
    """Build request signals consumed by the native script/distribution agents."""
    lines: list[str] = []
    if controls.target_audience:
        lines.append(f"Target audience: {controls.target_audience.strip()}")
    lines.append(
        f"Content format: {controls.output_format}; write platform-native copy "
        f"that accompanies {controls.output_format} content."
    )
    if controls.caption_length:
        lines.append(f"Caption length requested: {controls.caption_length}.")
    if controls.call_to_action_strength:
        lines.append(
            f"Call to action intensity requested: "
            f"{controls.call_to_action_strength}."
        )
    if controls.hashtag_strategy:
        lines.append(f"Hashtag strategy requested: {controls.hashtag_strategy}.")
    if controls.genre:
        lines.append(f"Source genre: {controls.genre.strip()}.")
    if controls.content_type:
        lines.append(f"Source content type: {controls.content_type.strip()}.")
    return "\n".join(lines)


def _clip_words(value: str, limit: int) -> str:
    value = " ".join((value or "").split())
    if len(value) <= limit:
        return value
    clipped = value[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return clipped + "…"


def _topic_hashtag(topic: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", topic or "")
    joined = "".join(word[:1].upper() + word[1:] for word in words[:3])
    return f"#{joined}" if len(joined) >= 3 else ""


def apply_social_controls(
    *,
    hook: str,
    body: str,
    cta: str,
    hashtags: list[str],
    topic: str,
    controls: SocialGenerationControls,
    awareness: str = "",
) -> dict:
    """Shape only genuine native-agent output; never invent a caption."""
    clean_hook = (hook or "").strip()
    clean_body = (body or "").strip()
    clean_cta = (cta or "").strip()

    if controls.call_to_action_strength == "low":
        clean_cta = re.sub(
            r"\b(right now|now|don['’]t miss|must|hurry)\b",
            "",
            clean_cta,
            flags=re.IGNORECASE,
        )
        clean_cta = re.sub(r"\s+", " ", clean_cta).replace("!", ".").strip()

    limits = {"short": 160, "optimal": 300, "long": 1000}
    limit = limits.get(controls.caption_length or "long", 1000)
    # Reserve the native hook and CTA, then clip only the native body.
    fixed = len(clean_hook) + len(clean_cta) + (4 if clean_hook and clean_cta else 0)
    body_limit = max(0, limit - fixed)
    clean_body = _clip_words(clean_body, body_limit) if body_limit else ""
    caption = "\n\n".join(
        part for part in (clean_hook, clean_body, clean_cta) if part
    )
    if len(caption) > limit:
        caption = _clip_words(caption, limit)

    clean_tags = list(dict.fromkeys(
        tag.strip() for tag in hashtags if isinstance(tag, str) and tag.strip()
    ))
    strategy = controls.hashtag_strategy
    if strategy == "niche":
        clean_tags = clean_tags[-3:]
    elif strategy == "trending":
        # "Trending" is a provenance claim, not a synonym for "first five".
        # Return only tags that appeared in an explicitly-labelled trend
        # section/line of current awareness. An empty result is more honest
        # than relabelling generic or synthesised tags as trend data.
        evidenced: list[str] = []
        in_trending = False
        for line in awareness.splitlines():
            stripped = line.strip()
            if "TRENDING TOPICS" in stripped.upper():
                in_trending = True
                continue
            if in_trending and stripped.startswith("==="):
                in_trending = False
            if in_trending or re.search(r"\btrending\s*:", stripped, re.I):
                evidenced.extend(re.findall(r"#\w+", stripped))
        evidence_set = {tag.lower() for tag in evidenced}
        clean_tags = [
            tag for tag in clean_tags if tag.lower() in evidence_set
        ][:5]
    elif strategy == "branded":
        branded = _topic_hashtag(topic)
        clean_tags = ([branded] if branded else []) + [
            tag for tag in clean_tags if tag.lower() != branded.lower()
        ]
        clean_tags = clean_tags[:5]
    elif strategy == "balanced":
        clean_tags = clean_tags[:5]

    return {
        "hook": clean_hook,
        "body": clean_body,
        "cta": clean_cta,
        "caption": caption,
        "hashtags": clean_tags,
    }