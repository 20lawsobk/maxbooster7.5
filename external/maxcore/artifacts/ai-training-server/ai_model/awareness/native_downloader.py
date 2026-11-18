"""Policy-gated, bounded native awareness source downloads.

The registry contains only reviewed first-party source endpoints. A search
result is never promoted into a download URL. Current platform policy blocks
all direct collection, so the downloader records no successful page fetches.
"""

from __future__ import annotations

from urllib.parse import parse_qsl, urlsplit

from ai_model.native_analysis.safe_http import SafeHTTPError, fetch_bytes
from ai_model.platform_optimization import PLATFORMS, normalize_platform

MAX_SOURCE_BYTES = 512 * 1024
SOURCE_DEADLINE_SECONDS = 8
MAX_SOURCE_REDIRECTS = 0


def source_registry() -> dict[str, tuple[dict[str, str], ...]]:
    """Return the canonical source allowlist, derived from fixed app sources."""
    from workers import quality_harvester

    registry = {platform: [] for platform in PLATFORMS}
    registry["youtube"] = [
        {
            "id": "youtube_" + feed["name"],
            "url": feed["url"],
            "source_type": "official_public_atom_feed",
        }
        for feed in quality_harvester.YOUTUBE_FEEDS
    ]
    validate_source_registry(registry)
    return {platform: tuple(rows) for platform, rows in registry.items()}


def validate_source_registry(registry=None) -> None:
    """Fail closed on registry drift, unsafe endpoints, or unrecognized feeds."""
    from .platform_discovery import policy_for

    rows = source_registry_raw() if registry is None else registry
    if not isinstance(rows, dict) or set(rows) != set(PLATFORMS):
        raise RuntimeError("native_source_registry_platform_mismatch")
    ids = set()
    for platform, sources in rows.items():
        policy = policy_for(platform)
        if not isinstance(sources, (list, tuple)):
            raise RuntimeError("native_source_registry_invalid")
        for source in sources:
            if not isinstance(source, dict) or set(source) != {
                "id", "url", "source_type",
            }:
                raise RuntimeError("native_source_registry_invalid")
            source_id, url = source["id"], source["url"]
            try:
                parsed = urlsplit(url)
                port = parsed.port
                host = (parsed.hostname or "").casefold().removeprefix("www.")
            except (AttributeError, TypeError, ValueError):
                raise RuntimeError("native_source_registry_invalid") from None
            query = parse_qsl(parsed.query, keep_blank_values=True)
            if (
                not isinstance(source_id, str)
                or source_id in ids
                or len(source_id) > 80
                or not source_id.startswith(platform + "_")
                or source["source_type"] != "official_public_atom_feed"
                or parsed.scheme != "https"
                or not host
                or not any(
                    host == domain or host.endswith("." + domain)
                    for domain in policy["domains"]
                )
                or parsed.username is not None
                or parsed.password is not None
                or port not in (None, 443)
                or parsed.path != "/feeds/videos.xml"
                or parsed.fragment
                or any(key not in {"user", "channel_id"} or not value
                       for key, value in query)
                or platform != "youtube"
            ):
                raise RuntimeError("native_source_registry_invalid")
            ids.add(source_id)


def source_registry_raw():
    """Build source entries without recursively invoking registry validation."""
    from workers import quality_harvester

    registry = {platform: [] for platform in PLATFORMS}
    registry["youtube"] = [
        {
            "id": "youtube_" + feed["name"],
            "url": feed["url"],
            "source_type": "official_public_atom_feed",
        }
        for feed in quality_harvester.YOUTUBE_FEEDS
    ]
    return registry


def registered_source(platform: str, source_id: str, source_url: str) -> dict:
    canonical = normalize_platform(platform)
    validate_source_registry()
    for source in source_registry()[canonical]:
        if source["id"] == source_id and source["url"] == source_url:
            return dict(source)
    raise SafeHTTPError("native source is not registered")


def source_id_for_url(platform: str, source_url: str) -> str:
    canonical = normalize_platform(platform)
    matches = [
        source["id"] for source in source_registry()[canonical]
        if source["url"] == source_url
    ]
    if len(matches) != 1:
        raise SafeHTTPError("native source is not registered")
    return matches[0]


def download_registered_source(
    platform: str,
    source_id: str,
    source_url: str,
    *,
    fetcher=fetch_bytes,
) -> bytes:
    """Fetch one exact registered source only after current policy permits it."""
    canonical = normalize_platform(platform)
    source = registered_source(canonical, source_id, source_url)
    from .public_access import _platform_authorized, assert_platform_feed_access
    if not _platform_authorized(canonical, source_id):
        raise SafeHTTPError("platform terms review required for direct collection")

    assert_platform_feed_access(canonical, source["url"])
    body, result = fetcher(
        source["url"],
        max_bytes=MAX_SOURCE_BYTES,
        allowed_content_types=("application/atom+xml", "application/xml", "text/xml"),
        deadline_seconds=SOURCE_DEADLINE_SECONDS,
        max_redirects=MAX_SOURCE_REDIRECTS,
    )
    if result.final_url != source["url"]:
        raise SafeHTTPError("native source origin changed")
    return body


def source_outcome(platform: str, source_health=None) -> dict:
    """Report policy readiness separately from an actual content request."""
    from .public_access import (
        _authorized_source_ids,
        _authorization_block_reason,
    )

    canonical = normalize_platform(platform)
    sources = source_registry()[canonical]
    by_source = source_health if isinstance(source_health, dict) else {}
    attempts = [
        (source, by_source.get(source["id"]))
        for source in sources
        if isinstance(by_source.get(source["id"]), dict)
    ]
    attempts.sort(
        key=lambda item: item[1].get(
            "last_attempt_at", item[1].get("observed_at", 0)
        ),
        reverse=True,
    )
    latest = attempts[0][1] if attempts else {}
    failure = latest.get("failure_class") or latest.get("error")
    outcome = "not_attempted"
    if latest:
        if failure in {
            "terms_review_required", "robots_disallowed",
            "robots_policy_unavailable",
        }:
            outcome = "blocked"
        elif latest.get("ok") is True:
            outcome = "succeeded" if latest.get(
                "direct_public_observation_count", 0
            ) else "no_observations"
        else:
            outcome = "failed"
    authorized_source_count = len(_authorized_source_ids(canonical))
    authorized = authorized_source_count > 0
    last_attempt_at = latest.get(
        "last_attempt_at", latest.get("observed_at")
    )
    return {
        "platform": canonical,
        "source_count": len(sources),
        "authorized_source_count": authorized_source_count,
        "authorized": authorized,
        "policy_outcome": "authorized" if authorized else "blocked",
        "policy_reason": None if authorized else _authorization_block_reason(canonical),
        "last_attempt_at": last_attempt_at,
        "last_success_at": (
            last_attempt_at if outcome in {"succeeded", "no_observations"}
            else None
        ),
        "last_attempt_outcome": outcome,
        "last_failure_class": failure,
        "request_state": (
            "not_attempted" if not latest else
            "blocked_before_request" if outcome == "blocked" else
            "completed" if outcome in {"succeeded", "no_observations"} else
            "failure_stage_unknown"
        ),
        "first_party_observation_count": latest.get(
            "direct_public_observation_count", 0
        ) if type(latest.get("direct_public_observation_count", 0)) is int else 0,
        "training_eligible": False,
    }
