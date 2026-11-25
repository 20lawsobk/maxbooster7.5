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
    """Score one public content observation, never an account/profile."""
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
        "decisionUnit": "public_content_observation",
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


def _percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return round(ordered[lower], 2)
    fraction = position - lower
    return round(ordered[lower] * (1 - fraction) + ordered[upper] * fraction, 2)


def summarize_quality_cohort(
    assessments: Any,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Report one global quality distribution across content observations."""
    policy = policy or profile_sourcing_quality_policy()
    if not isinstance(assessments, (list, tuple)):
        assessments = []
    scores = []
    counts = {
        "eligible": 0,
        "preferred": 0,
        "above_preferred": 0,
        "below_range": 0,
        "insufficient_evidence": 0,
        "invalid_evidence": 0,
    }
    for assessment in assessments:
        if not isinstance(assessment, dict):
            counts["invalid_evidence"] += 1
            continue
        score = assessment.get("qualityPotentialScore")
        if type(score) in (int, float) and math.isfinite(score):
            scores.append(float(score))
            if score < policy["minimumEligibleScore"]:
                counts["below_range"] += 1
            else:
                counts["eligible"] += 1
                preferred = policy["preferredScoreRange"]
                if preferred["min"] <= score <= preferred["max"]:
                    counts["preferred"] += 1
                elif score > preferred["max"]:
                    counts["above_preferred"] += 1
        elif assessment.get("status") == "invalid_evidence":
            counts["invalid_evidence"] += 1
        else:
            counts["insufficient_evidence"] += 1

    distribution = {
        "min": round(min(scores), 2) if scores else None,
        "p25": _percentile(scores, 0.25),
        "median": _percentile(scores, 0.5),
        "p75": _percentile(scores, 0.75),
        "p90": _percentile(scores, 0.9),
        "max": round(max(scores), 2) if scores else None,
    }
    return {
        "decision_unit": "public_content_observation_cohort",
        "profile_specific_thresholds": False,
        "candidate_observations": len(assessments),
        "scored_observations": len(scores),
        "counts": counts,
        "quality_range": {
            "scale": policy["scoreScale"],
            "minimum_eligible_score": policy["minimumEligibleScore"],
            "preferred": policy["preferredScoreRange"],
            "maximum_is_hard_limit": policy["maximumIsHardLimit"],
            "minimum_evidence_coverage": policy["minimumEvidenceCoverage"],
        },
        "score_distribution": distribution,
        "calibration_status": policy["calibrationStatus"],
    }


def rank_observation_cohort(
    observations: Any,
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score and rank content observations as a cohort, not profile accounts."""
    policy = policy or profile_sourcing_quality_policy()
    if not isinstance(observations, (list, tuple)):
        raise TypeError("Profile-source observations must be a list")
    ranked = []
    assessments = []
    for observation in observations:
        if not isinstance(observation, dict):
            continue
        assessment = assess_profile_quality(observation.get("quality_factors"), policy)
        assessments.append(assessment)
        ranked.append({**observation, "quality_assessment": assessment})
    ranked.sort(
        key=lambda row: (
            not row["quality_assessment"]["eligible"],
            -(row["quality_assessment"]["qualityPotentialScore"] or 0),
            -(
                row.get("query_relevance_score", 0)
                if type(row.get("query_relevance_score", 0)) in (int, float)
                and math.isfinite(row.get("query_relevance_score", 0))
                else 0
            ),
            str(row.get("post_citation", "")),
        )
    )
    return {
        "quality_cohort": summarize_quality_cohort(assessments, policy),
        "observations": ranked,
    }
