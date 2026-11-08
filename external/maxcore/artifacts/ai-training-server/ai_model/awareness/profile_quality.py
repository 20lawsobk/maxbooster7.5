"""Evidence-based match-potential scoring for MaxCore profile-source candidates.

Scores describe potential relative to a caller-supplied Google Veo reference;
they are not exact similarity, verified video-quality equivalence, or a
performance guarantee. Missing measurements are never silently imputed.
"""
from __future__ import annotations

import math
from typing import Any

from ai_model.platform_optimization import profile_sourcing_quality_policy


PROFILE_MATCH_METRIC = "veo_profile_match_potential_v1"


def assess_profile_quality(
    factors: Any,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score measured 0-100 factors and enforce the configured evidence range."""
    policy = policy or profile_sourcing_quality_policy()
    weights = policy["weights"]
    required = set(policy["requiredFactors"])
    if not isinstance(factors, dict):
        factors = {}

    missing = []
    invalid = []
    measured: dict[str, float] = {}
    for name in weights:
        value = factors.get(name)
        if value is None:
            missing.append(name)
            continue
        if (
            type(value) not in (int, float)
            or not math.isfinite(value)
            or not policy["scoreScale"]["min"] <= value <= policy["scoreScale"]["max"]
        ):
            invalid.append(name)
            continue
        measured[name] = float(value)

    coverage = sum(weights[name] for name in measured)
    missing_required = sorted(required - set(measured))
    base = {
        "eligible": False,
        "status": "insufficient_evidence",
        "qualityPotentialScore": None,
        "qualityBand": None,
        "evidenceCoverage": round(coverage, 4),
        "missingFactors": missing,
        "invalidFactors": invalid,
        "missingRequiredFactors": missing_required,
        "exactMatchRequired": False,
        "calibrationStatus": policy["calibrationStatus"],
    }
    if invalid:
        return {**base, "status": "invalid_evidence"}
    if (
        missing_required
        or coverage < policy["minimumEvidenceCoverage"]
        or coverage <= 0
    ):
        return base

    score = sum(measured[name] * weights[name] for name in measured) / coverage
    score = round(max(policy["scoreScale"]["min"], min(policy["scoreScale"]["max"], score)), 2)
    if score < policy["minimumEligibleScore"]:
        return {
            **base,
            "status": "below_limit",
            "qualityPotentialScore": score,
        }

    preferred = policy["preferredScoreRange"]
    band = (
        "preferred"
        if preferred["min"] <= score <= preferred["max"]
        else "above_preferred"
        if score > preferred["max"]
        else "eligible"
    )
    return {
        **base,
        "eligible": True,
        "status": "eligible",
        "qualityPotentialScore": score,
        "qualityBand": band,
    }
