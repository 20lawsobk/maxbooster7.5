"""Fail-closed access policy for anonymous platform-page collection.

Robots permission is necessary but not sufficient. No platform in this
checkout has an approved terms/permission record for anonymous page crawling,
so this module never authorizes collection merely because a URL is public.
"""

from __future__ import annotations

import math
import os
import re
import threading
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from ai_model.native_analysis.safe_http import SafeHTTPError, fetch_bytes
from ai_model.platform_optimization import normalize_platform
from .platform_discovery import policy_for, rights_policy_for


ROBOTS_USER_AGENT = "MaxCore-NativeAnalysis/1"
ROBOTS_MAX_BYTES = 32 * 1024
ROBOTS_TTL_SECONDS = 3600
_cache_lock = threading.Lock()
_robots_cache: dict[str, tuple[float, RobotFileParser]] = {}

# These are access states, not claims that a platform feed is operational.
# Written permission or a reviewed official access mechanism is required
# before any entry can become crawl-enabled.
NATIVE_CRAWL_POLICIES = {
    "facebook": {
        "state": "blocked",
        "reason": "approved_meta_source_access_not_configured",
        "basis": "meta_platform_terms_and_application_policy",
        "authorization_record": None,
    },
    "instagram": {
        "state": "blocked",
        "reason": "approved_meta_source_access_not_configured",
        "basis": "meta_platform_terms_and_application_policy",
        "authorization_record": None,
    },
    "x": {
        "state": "blocked",
        "reason": "authorized_x_source_api_not_configured",
        "basis": "x_developer_agreement_and_application_policy",
        "authorization_record": None,
    },
    "youtube": {
        "state": "blocked",
        "reason": "youtube_feed_requires_current_robots_and_terms_approval",
        "basis": "youtube_api_terms_and_live_robots_gate",
        "authorization_record": None,
    },
    "tiktok": {
        "state": "blocked",
        "reason": "written_tiktok_approval_required_for_automated_extraction",
        "basis": "tiktok_terms_of_service",
        "authorization_record": None,
    },
    "linkedin": {
        "state": "blocked",
        "reason": "automated_scraping_prohibited_by_user_agreement",
        "basis": "linkedin_user_agreement",
        "authorization_record": None,
    },
    "threads": {
        "state": "blocked",
        "reason": "verified_threads_api_scope_not_configured",
        "basis": "threads_api_overview_and_application_policy",
        "authorization_record": None,
    },
    "google_business": {
        "state": "blocked",
        "reason": "owned_or_authorized_business_profile_api_not_configured",
        "basis": "business_profile_api_policies",
        "authorization_record": None,
    },
}


def native_crawl_status(platform: str) -> dict:
    """Return a safe, explicit status without making a network request."""
    canonical = normalize_platform(platform)
    policy = NATIVE_CRAWL_POLICIES[canonical]
    rights = rights_policy_for(canonical)
    from .native_downloader import source_registry
    registered_count = len(source_registry()[canonical])
    authorized_source_count = len(_authorized_source_ids(canonical))
    authorized = authorized_source_count > 0
    return {
        "engine": "maxcore_native_public_web",
        "implementation_state": (
            "native_downloader_authorized"
            if authorized else
            "registered_source_blocked_by_policy"
            if registered_count else "no_native_source_registered"
        ),
        "state": "authorized" if authorized else "blocked",
        "reason": None if authorized else _authorization_block_reason(canonical),
        "policy_basis": policy["basis"],
        "registered_source_count": registered_count,
        "authorized_source_count": authorized_source_count,
        "rights_policy_schema": rights["schema"],
        "rights_policy_reviewed_on": rights["reviewed_on"],
        "policy_sources": rights["policy_sources"],
        "authorized": authorized,
        "robots_checked_at": None,
        "last_attempt_at": None,
        "last_success_at": None,
        "first_party_observation_count": 0,
        "training_eligible": False,
    }


def _authorized_source_ids(platform: str) -> set[str]:
    """Return only registered sources covered by current, reviewed approval."""
    policy = NATIVE_CRAWL_POLICIES[platform]
    evidence = policy.get("authorization_record")
    rights = rights_policy_for(platform)
    if (
        not isinstance(evidence, dict)
        or set(evidence) != {
            "authorization_id", "source_ids", "approved_at", "expires_at",
        }
    ):
        return set()
    authorization_id = evidence["authorization_id"]
    source_ids = evidence["source_ids"]
    approved_at, expires_at = evidence["approved_at"], evidence["expires_at"]
    if (
        not isinstance(authorization_id, str)
        or not re.fullmatch(r"[A-Za-z0-9._:-]{1,120}", authorization_id)
        or not isinstance(source_ids, list)
        or not source_ids
        or any(
            not isinstance(source_id, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", source_id)
            for source_id in source_ids
        )
        or len(source_ids) != len(set(source_ids))
        or type(approved_at) not in (int, float)
        or type(expires_at) not in (int, float)
        or not math.isfinite(approved_at)
        or not math.isfinite(expires_at)
        or approved_at <= 0
        or expires_at <= time.time()
        or approved_at > time.time()
    ):
        return set()
    from .native_downloader import source_registry
    registered_ids = {
        source["id"] for source in source_registry()[platform]
    }
    if (
        policy.get("state") != "authorized"
        or rights.get("direct_collection") != "approved_source_access"
        or not set(source_ids) <= registered_ids
    ):
        return set()
    return set(source_ids)


def _platform_authorized(platform: str, source_id: str | None = None) -> bool:
    allowed_sources = _authorized_source_ids(platform)
    return source_id in allowed_sources if source_id is not None else bool(allowed_sources)


def _authorization_block_reason(platform: str) -> str:
    policy = NATIVE_CRAWL_POLICIES[platform]
    if policy.get("state") != "authorized":
        return policy["reason"]
    evidence = policy.get("authorization_record")
    if not isinstance(evidence, dict):
        return "source_authorization_not_configured"
    expiry = evidence.get("expires_at")
    if type(expiry) in (int, float) and math.isfinite(expiry) and expiry <= time.time():
        return "source_authorization_expired"
    if rights_policy_for(platform).get("direct_collection") != "approved_source_access":
        return "source_rights_policy_not_approved"
    return "source_authorization_record_invalid_or_scope_mismatch"


def _robots_policy(host: str, *, fetcher=fetch_bytes, clock=time.monotonic) -> RobotFileParser:
    now = clock()
    with _cache_lock:
        cached = _robots_cache.get(host)
        if cached and now - cached[0] < ROBOTS_TTL_SECONDS:
            return cached[1]

    proxy_url = None
    if os.environ.get("MAXCORE_AWARENESS_USE_PROXY") == "1":
        proxy_url = os.environ.get("HTTPS_PROXY")
    try:
        body, result = fetcher(
            f"https://{host}/robots.txt",
            max_bytes=ROBOTS_MAX_BYTES,
            allowed_content_types=("text/plain", "text"),
            deadline_seconds=6,
            max_redirects=0,
            headers={"User-Agent": ROBOTS_USER_AGENT},
            **({"proxy_url": proxy_url} if proxy_url else {}),
        )
        final = urlsplit(result.final_url)
        if (final.scheme != "https" or final.hostname != host or
                final.path != "/robots.txt" or final.query or final.fragment):
            raise SafeHTTPError("robots policy origin changed")
        parser = RobotFileParser()
        parser.set_url(f"https://{host}/robots.txt")
        parser.parse(body.decode("utf-8", "replace").splitlines())
    except Exception as exc:
        raise SafeHTTPError("robots policy could not be verified") from exc

    with _cache_lock:
        _robots_cache[host] = (clock(), parser)
    return parser


def assert_platform_feed_access(
    platform: str,
    feed_url: str,
    *,
    fetcher=fetch_bytes,
    clock=time.monotonic,
) -> None:
    """Check origin, robots, then terms authorization before fetching a feed.

    YouTube Atom is the only existing first-party platform feed. Its current
    robots policy disallows the configured feed path for this crawler. The
    second gate remains in place if that robots rule changes.
    """
    canonical = normalize_platform(platform)
    try:
        parsed = urlsplit(feed_url if isinstance(feed_url, str) else "")
        port = parsed.port
    except ValueError as exc:
        raise SafeHTTPError("platform feed URL is invalid") from exc
    policy = policy_for(canonical)
    host = (parsed.hostname or "").casefold().removeprefix("www.")
    domain_match = any(
        host == domain or host.endswith("." + domain)
        for domain in policy["domains"]
    )
    if (parsed.scheme != "https" or not domain_match or parsed.username is not None
            or parsed.password is not None or port not in (None, 443)
            or parsed.fragment):
        raise SafeHTTPError("platform feed URL is outside the approved public origin")

    if canonical != "youtube" or parsed.path != "/feeds/videos.xml":
        raise SafeHTTPError("platform feed source is not authorized")
    from .native_downloader import source_registry
    if feed_url not in {
        source["url"] for source in source_registry()[canonical]
    }:
        raise SafeHTTPError("platform feed source is not registered")
    registered = next(
        source for source in source_registry()[canonical]
        if source["url"] == feed_url
    )
    if not _platform_authorized(canonical, registered["id"]):
        raise SafeHTTPError("platform terms review required for direct collection")

    # Resolve the exact configured host's robots file, not a caller-selected
    # host or a platform alias that could change the policy origin.
    robots_host = (parsed.hostname or "").casefold()
    parser = _robots_policy(robots_host, fetcher=fetcher, clock=clock)
    if not parser.can_fetch(ROBOTS_USER_AGENT, feed_url):
        raise SafeHTTPError("robots policy denied platform feed")

    # An Allow rule is necessary but does not itself grant platform permission;
    # _platform_authorized also requires the separately recorded rights review.


def clear_robots_cache_for_tests() -> None:
    with _cache_lock:
        _robots_cache.clear()
