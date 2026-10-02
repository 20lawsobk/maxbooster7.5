"""Configuration — no more hardcoded values.

All thresholds, limits, and platform settings come from here.
Override via environment or config file.
"""
from __future__ import annotations

import os
from typing import Dict, Any


_DEFAULTS: Dict[str, Any] = {
    # Critic thresholds (elite bars per dimension).
    "critic.engagement_threshold": 0.65,
    "critic.hook_threshold": 0.55,
    "critic.cta_threshold": 0.70,
    "critic.arc_threshold": 0.60,

    # Iterative loop.
    "loop.max_iterations": 5,
    "loop.min_score_improvement": 0.02,

    # Director behavior.
    "director.social.variants": 3,
    "director.video.scenes": 5,

    # Platform.
    "platform.default": "instagram",

    # Awareness.
    "awareness.cache_ttl_seconds": 300,
    "awareness.max_hashtags": 5,

    # Observability.
    "log.level": "info",

    # Rate limiting.
    "rate.campaign_per_minute": 10,
    "rate.requests_per_minute": 60,
}


def get(key: str, default: Any = None) -> Any:
    """Get config value. Env var override: DIRECTOR_<KEY_UPPER>."""
    env_key = "DIRECTOR_" + key.upper().replace(".", "_")
    if env_key in os.environ:
        raw = os.environ[env_key]
        # Try to parse as number/bool.
        if raw.lower() in ("true", "false"):
            return raw.lower() == "true"
        try:
            return int(raw)
        except ValueError:
            pass
        try:
            return float(raw)
        except ValueError:
            pass
        return raw
    return _DEFAULTS.get(key, default)


def all_config() -> Dict[str, Any]:
    """Dump all config (for debugging)."""
    out = dict(_DEFAULTS)
    for key in _DEFAULTS:
        env_key = "DIRECTOR_" + key.upper().replace(".", "_")
        if env_key in os.environ:
            out[key] = get(key)
    return out
