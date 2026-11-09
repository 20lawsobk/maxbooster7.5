"""Fail-closed access policy for anonymous platform-page collection.

Robots permission is necessary but not sufficient. No platform in this
checkout has an approved terms/permission record for anonymous page crawling,
so this module never authorizes collection merely because a URL is public.
"""

from __future__ import annotations

import os
import threading
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from ai_model.native_analysis.safe_http import SafeHTTPError, fetch_bytes
from ai_model.platform_optimization import normalize_platform
from .platform_discovery import policy_for


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
        "reason": "written_permission_required",
        "basis": "robots_notice",
    },
    "instagram": {
        "state": "blocked",
        "reason": "terms_and_robots_review_required",
        "basis": "unverified",
    },
    "x": {
        "state": "blocked",
        "reason": "robots_disallows_general_crawlers",
        "basis": "robots_disallow_all",
    },
    "youtube": {
        "state": "blocked",
        "reason": "robots_disallows_configured_atom_feed",
        "basis": "robots_feed_path_disallowed",
    },
    "tiktok": {
        "state": "blocked",
        "reason": "search_path_disallowed_terms_unreviewed",
        "basis": "robots_search_path_disallowed",
    },
    "linkedin": {
        "state": "blocked",
        "reason": "terms_and_robots_review_required",
        "basis": "unverified",
    },
    "threads": {
        "state": "blocked",
        "reason": "terms_and_robots_review_required",
        "basis": "unverified",
    },
    "google_business": {
        "state": "blocked",
        "reason": "approved_search_api_or_terms_review_required",
        "basis": "unverified",
    },
}


def native_crawl_status(platform: str) -> dict:
    """Return a safe, explicit status without making a network request."""
    canonical = normalize_platform(platform)
    policy = NATIVE_CRAWL_POLICIES[canonical]
    return {
        "engine": "maxcore_native_public_web",
        "implementation_state": "not_available_without_source_authorization",
        "state": policy["state"],
        "reason": policy["reason"],
        "policy_basis": policy["basis"],
        "authorized": False,
        "robots_checked_at": None,
        "last_attempt_at": None,
        "last_success_at": None,
        "first_party_observation_count": 0,
        "training_eligible": False,
    }


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

    # Resolve the exact configured host's robots file, not a caller-selected
    # host or a platform alias that could change the policy origin.
    robots_host = (parsed.hostname or "").casefold()
    parser = _robots_policy(robots_host, fetcher=fetcher, clock=clock)
    if not parser.can_fetch(ROBOTS_USER_AGENT, feed_url):
        raise SafeHTTPError("robots policy denied platform feed")

    # No permission evidence exists in this checkout. Robots Allow never
    # substitutes for platform terms or explicit source authorization.
    raise SafeHTTPError("platform terms review required for direct collection")


def clear_robots_cache_for_tests() -> None:
    with _cache_lock:
        _robots_cache.clear()
