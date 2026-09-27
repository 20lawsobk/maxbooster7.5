"""Fail-closed campaign entrypoint pending a release-backed campaign generator.

The former composer assembled template hooks and substituted template posts
after model errors. That is not learned campaign generation. Keep the public
entrypoint explicit without retaining an unreachable template implementation.
"""
from typing import Any, Callable, Dict, List, Optional


def build_campaign(
    *,
    artist: str,
    title: str,
    genre: Optional[str] = None,
    tone: Optional[str] = None,
    brand_voice: Optional[str] = None,
    target_audience: Optional[str] = None,
    platforms: Optional[List[str]] = None,
    weeks: int = 6,
    mood: Optional[str] = None,
    bpm: Optional[float] = None,
    key: Optional[str] = None,
    release_date: Optional[str] = None,
    hashtag_fn: Optional[Callable[[str, Optional[str], str], List[str]]] = None,
    normalize_platform_fn: Optional[Callable[[str], str]] = None,
    image_fn: Optional[Callable[..., Optional[Dict[str, Any]]]] = None,
    teaser_fn: Optional[Callable[..., Optional[Dict[str, Any]]]] = None,
    seed: int = 0,
    awareness: str = "",
) -> Dict[str, Any]:
    from .awareness import require_context
    require_context("general", "campaign")
    raise RuntimeError(
        "Learned campaign generation unavailable: legacy template composer is disabled")