"""Native, local-index discovery for public music-profile content observations.

The observatory searches evidence already collected by MaxCore's scheduled
read-only source scans. It does not call Exa, scrape gated pages, or score a
profile account. Quality is measured across content observations in a cohort.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse, parse_qs

from ai_model.platform_optimization import PLATFORMS, normalize_platform
from ai_model.awareness.profile_quality import (
    profile_sourcing_quality_policy,
    summarize_quality_cohort,
)
from ai_model.awareness.platform_discovery import platform_hosts


DEFAULT_VEO_REFERENCE = {
    "provider": "Google DeepMind",
    "title": "Veo 3 demo | Classical violinist",
    "url": "https://www.youtube.com/watch?v=o55ukJOIHBM",
}

_TOKENS = re.compile(r"[^\W_]+", re.UNICODE)
_STOP_WORDS = {"a", "an", "and", "demo", "for", "the", "veo", "video", "with"}
_PROFILE_HOSTS = platform_hosts()


def _tokens(value: str) -> set[str]:
    return {
        token.casefold()
        for token in _TOKENS.findall(value)
        if len(token) > 1 and token.casefold() not in _STOP_WORDS
    }


def _public_profile_url(value, platform):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.casefold().removeprefix("www.")
    allowed = _PROFILE_HOSTS.get(platform, set())
    return any(host == domain or host.endswith("." + domain) for domain in allowed)


def _reference(value):
    if value is None:
        return {
            **DEFAULT_VEO_REFERENCE,
            "metadata_verified": True,
            "verification_basis": "public YouTube search result and oEmbed metadata",
        }
    if not isinstance(value, dict):
        raise ValueError("benchmark_reference must be an object")
    title = value.get("title")
    url = value.get("url")
    if not isinstance(title, str) or not title.strip() or len(title) > 300:
        raise ValueError("benchmark_reference.title must be 1–300 characters")
    parsed = urlparse(url if isinstance(url, str) else "")
    if parsed.scheme != "https" or parsed.hostname not in {"www.youtube.com", "youtube.com", "youtu.be"}:
        raise ValueError("benchmark_reference.url must be a public HTTPS YouTube URL")
    video_id = (
        parse_qs(parsed.query).get("v", [""])[0]
        if parsed.hostname in {"www.youtube.com", "youtube.com"}
        else parsed.path.strip("/").split("/")[0]
    )
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("benchmark_reference.url must identify one YouTube video")
    verified = (
        video_id == "o55ukJOIHBM"
        and title.strip() == DEFAULT_VEO_REFERENCE["title"]
    )
    return {
        "provider": value.get("provider", "caller-provided"),
        "title": title.strip(),
        "url": url,
        "metadata_verified": verified,
        "verification_basis": (
            "public YouTube search result and oEmbed metadata"
            if verified else "caller-provided metadata; not independently verified"
        ),
    }


def _query_relevance(text: str, query_tokens: set[str]):
    text_tokens = _tokens(text)
    matched = sorted(text_tokens.intersection(query_tokens))
    score = round(100 * len(matched) / len(query_tokens), 2) if query_tokens else 0
    return score, matched


def search_profile_sources(
    source_health,
    query=None,
    platforms=None,
    limit=20,
    benchmark_reference=None,
    platform_status=None,
    discovery_observations=None,
):
    """Search the local public-source index without an external search API."""
    reference = _reference(benchmark_reference)
    if query is None or query == "":
        query = reference["title"]
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 300:
        raise ValueError("query must be 2–300 characters")
    query = query.strip()
    if type(limit) is not int or not 1 <= limit <= 50:
        raise ValueError("limit must be an integer from 1 to 50")
    valid_platforms = set(PLATFORMS)
    if platforms is None:
        requested = valid_platforms
    elif (
        isinstance(platforms, list)
        and all(isinstance(platform, str) for platform in platforms)
    ):
        requested = {platform.casefold() for platform in platforms}
        if not requested.issubset(valid_platforms):
            raise ValueError("platforms contains an unsupported platform")
    else:
        raise ValueError("platforms must be a list of supported platform names")

    health = source_health if isinstance(source_health, dict) else {}
    query_tokens = _tokens(query)
    indexed = []
    matches = []
    quality_indexed = []
    quality_matches = []
    observed_keys = set()
    for source_name, source in health.items():
        if not isinstance(source, dict):
            continue
        rows = source.get("profile_candidates", [])
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            platform = row.get("platform")
            if not isinstance(platform, str) or platform.casefold() not in requested:
                continue
            profile_url = row.get("profile_citation")
            post_url = row.get("post_citation")
            platform = platform.casefold()
            if not _public_profile_url(profile_url, platform):
                continue
            if not _public_profile_url(post_url, platform):
                continue
            dedupe_key = (platform, post_url)
            if dedupe_key in observed_keys:
                continue
            observed_keys.add(dedupe_key)
            title = row.get("text", "")
            title = title.strip()[:500] if isinstance(title, str) else ""
            relevance, terms = _query_relevance(title, query_tokens)
            score = row.get("quality_potential_score")
            if type(score) not in (int, float):
                score = None
            status = row.get("status")
            if not isinstance(status, str):
                status = "insufficient_evidence"
            observation = {
                "decision_unit": "public_content_observation",
                "source": row.get("source", source_name),
                "platform": platform,
                "text": title,
                "profile_citation": profile_url,
                "post_citation": post_url,
                "published_at": row.get("published_at"),
                "query_relevance_score": relevance,
                "query_match_terms": terms,
                "quality_potential_score": score,
                "quality_status": status,
                "missing_metrics": row.get("missing_metrics", []),
                "measured_factors": row.get("measured_factors", []),
                "factor_evidence": row.get("factor_evidence", []),
                "performance_evidence": row.get("performance_evidence", {}),
            }
            indexed.append(observation)
            quality_indexed.append(observation)
            if relevance > 0:
                matches.append(observation)
                quality_matches.append(observation)

    discovery_count = 0
    from ai_model.awareness.platform_discovery import classify_result
    for row in discovery_observations or []:
        if not isinstance(row, dict):
            continue
        discovery = row.get("discovery")
        if not isinstance(discovery, dict):
            continue
        try:
            platform = normalize_platform(discovery.get("platform"))
        except ValueError:
            continue
        if platform not in requested:
            continue
        if (discovery.get("retrieval_method") != "index_snippet"
                or discovery.get("source_type") != "platform_origin_search_index"):
            # Unverified third-party results and feed metadata remain in
            # awareness, but do not masquerade as first-party social content.
            continue
        post_url = row.get("citation")
        if classify_result(platform, post_url) != (
            "index_snippet", "platform_origin_search_index"
        ):
            continue
        text = row.get("text")
        text = text.strip()[:500] if isinstance(text, str) else ""
        if not text:
            continue
        dedupe_key = (platform, post_url)
        if dedupe_key in observed_keys:
            continue
        observed_keys.add(dedupe_key)
        relevance, terms = _query_relevance(text, query_tokens)
        observation = {
            "decision_unit": "public_content_observation",
            "source": row.get("source"),
            "platform": platform,
            "text": text,
            "profile_citation": None,
            "post_citation": post_url,
            "published_at": discovery.get("original_published_at"),
            "observed_at": row.get("observed_at"),
            "query_relevance_score": relevance,
            "query_match_terms": terms,
            "quality_potential_score": None,
            "quality_status": "insufficient_evidence",
            "missing_metrics": ["profile_specific_performance_evidence"],
            "measured_factors": [],
            "factor_evidence": [],
            "performance_evidence": {},
            "retrieval_method": discovery["retrieval_method"],
            "source_type": discovery["source_type"],
            "source_query": discovery.get("query"),
            "search_result_relevance": discovery.get("search_relevance"),
            "reuse_rights": discovery.get("reuse_rights", "unknown"),
            "training_eligible": False,
            "source_attribution_confidence": discovery.get(
                "source_attribution_confidence"
            ),
            "region": discovery.get("region", "unspecified"),
            "genre": discovery.get("genre", "unclassified"),
            "content_hash": discovery.get("content_hash"),
            "expires_at": discovery.get("expires_at"),
            "redaction_policy": discovery.get("redaction_policy"),
        }
        indexed.append(observation)
        discovery_count += 1
        if relevance > 0:
            matches.append(observation)

    matches.sort(key=lambda row: (
        row["quality_status"] != "eligible",
        -(row["quality_potential_score"] if row["quality_potential_score"] is not None else -1),
        -row["query_relevance_score"],
        row["post_citation"],
    ))
    selected = matches[:limit]
    assessments = [
        {
            "qualityPotentialScore": row["quality_potential_score"],
            "status": row["quality_status"],
        }
        for row in quality_indexed
    ]
    matched_assessments = [
        {
            "qualityPotentialScore": row["quality_potential_score"],
            "status": row["quality_status"],
        }
        for row in quality_matches
    ]
    supported = {
        platform: (platform_status or {}).get(platform, {}).get("status", "not_scanned")
        for platform in sorted(requested)
    }
    return {
        "mode": "native_local_profile_observatory",
        "external_search_provider": None,
        "preview": True,
        "status": "matches_available" if matches else "no_text_match",
        "query": query,
        "relevance_method": "normalized token coverage; not semantic or exact-match scoring",
        "benchmark_reference": reference,
        "decision_unit": "public_content_observation_cohort",
        "profile_specific_thresholds": False,
        "quality_cohort": summarize_quality_cohort(
            assessments, profile_sourcing_quality_policy()
        ),
        "matched_quality_cohort": summarize_quality_cohort(
            matched_assessments, profile_sourcing_quality_policy()
        ),
        "platform_status": supported,
        "indexed_observation_count": len(indexed),
        "matched_observation_count": len(matches),
        "returned_observation_count": len(selected),
        "platform_discovery_observation_count": discovery_count,
        "observations": selected,
    }
