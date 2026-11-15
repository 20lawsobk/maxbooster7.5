"""Unified conditioned generation engine.

This package centralises the pieces every generation modality shares:

  * :mod:`technique` — the media-technique ("Visual/Sonic DNA") extraction stage
    that analyses the *real* reference assets we already hold (retrieved frames,
    audio samples) into a normalized descriptor set, blended with a genre/tone
    prior by the awareness buffer weight.
  * :mod:`orchestrator` — one entry point (:func:`build_context`) that builds the
    brief, merges awareness, and runs technique extraction, then exposes helpers
    that map the shared conditioning bus onto each renderer (diffusion, RTA, the
    PIL image engine, the audio producer).

Render availability and observed artifact validity are not quality certification.
Failed brief construction is explicit rather than a generic success fallback.
"""

from .technique import TechniqueProfile, extract_technique
from .orchestrator import GenerationContext, build_context, merge_awareness
from .campaign import build_campaign
from .plan import GenerationPlan, validate_output

__all__ = [
    "TechniqueProfile",
    "extract_technique",
    "GenerationContext",
    "build_context",
    "merge_awareness",
    "build_campaign",
    "GenerationPlan",
    "validate_output",
]
