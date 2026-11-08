"""Policy and provenance for the eight configured social-platform sources.

Web-search results are discovery evidence, not first-party engagement or
training permission. The local observatory indexes these records; this module
never fetches a result page. Direct public ingestion remains limited to the
existing official YouTube Atom feed until a platform-specific terms and
robots policy is reviewed and encoded.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import ipaddress
import unicodedata
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from ai_model.platform_optimization import PLATFORMS, normalize_platform


SEARCH_OPT_IN = "MAXCORE_AWARENESS_PLATFORM_DISCOVERY"
SEARCH_PROVIDER_SETTING = "MAXCORE_AWARENESS_PLATFORM_DISCOVERY_PROVIDER"
SEARCH_INTERVAL_SETTING = "MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS"
FRESHNESS_WINDOW_DAYS = 7
DEFAULT_SEARCH_INTERVAL_SECONDS = 3600
MIN_SEARCH_INTERVAL_SECONDS = 900
MAX_SEARCH_INTERVAL_SECONDS = 3600
MAX_RESULT_CHARS = 500
_PROVIDER_KEYS = {"exa": "EXA_API_KEY", "tavily": "TAVILY_API_KEY"}


PLATFORM_DISCOVERY = {
    "facebook": {
        "network_group": "meta",
        "domains": ("facebook.com", "fb.com"),
        "paths": (r"/[^/]+/posts/", r"/[^/]+/videos/", r"/reel/", r"/watch/"),
        "topics": "music artists independent releases live performance creators",
    },
    "instagram": {
        "network_group": "meta",
        "domains": ("instagram.com",),
        "paths": (r"/p/", r"/reel/"),
        "topics": "music artists independent releases reels creators live performance",
    },
    "x": {
        "network_group": "x",
        "domains": ("x.com", "twitter.com"),
        "paths": (r"/[^/]+/status/",),
        "topics": "music artists independent releases music marketing creator trends",
    },
    "youtube": {
        "network_group": "google",
        "domains": ("youtube.com", "youtu.be"),
        "paths": (r"/watch", r"/shorts/"),
        "topics": "music artists new releases live performance Shorts creator trends",
    },
    "tiktok": {
        "network_group": "tiktok",
        "domains": ("tiktok.com",),
        "paths": (r"/@[^/]+/video/",),
        "topics": "music artists trending sounds creators short video music marketing",
    },
    "linkedin": {
        "network_group": "linkedin",
        "domains": ("linkedin.com",),
        "paths": (r"/posts/", r"/feed/update/", r"/company/[^/]+/posts/"),
        "topics": "music industry artists labels distribution marketing creator economy",
    },
    "threads": {
        "network_group": "meta",
        "domains": ("threads.net",),
        "paths": (r"/@[^/]+/post/",),
        "topics": "music artists independent releases creators culture trends",
    },
    "google_business": {
        "network_group": "google",
        "domains": ("google.com", "business.google.com"),
        "paths": (r"/maps/place/",),
        "topics": "music venue live music artist event business profile updates",
    },
}

_PLATFORM_HOSTS = {
    platform: tuple(policy["domains"])
    for platform, policy in PLATFORM_DISCOVERY.items()
}
_ALLOWED_PROVENANCE_FIELDS = {
    "schema",
    "platform",
    "platform_scope",
    "retrieval_method",
    "source_type",
    "provider",
    "query",
    "original_published_at",
    "freshness_state",
    "reuse_rights",
    "training_eligible",
    "training_block_reason",
    "safety_decision",
    "search_relevance",
    "content_hash",
    "source_attribution_confidence",
    "region",
    "genre",
    "redaction_policy",
    "expires_at",
}
_EMAIL_OR_PHONE = re.compile(
    r"(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d(). -]{7,}\d)"
)


def validate_registry() -> None:
    """Fail closed if the discovery policy drifts from the app registry."""
    if set(PLATFORM_DISCOVERY) != set(PLATFORMS):
        raise RuntimeError("platform_discovery_registry_mismatch")
    for platform, policy in PLATFORM_DISCOVERY.items():
        if (not policy["domains"] or not policy["paths"] or not policy["topics"]
                or not policy.get("network_group")
                or any(not re.fullmatch(r"[a-z0-9.-]+", host)
                       for host in policy["domains"])):
            raise RuntimeError(f"invalid_platform_discovery_policy:{platform}")


validate_registry()


def provider_state(environ=None) -> dict:
    """Return provider readiness without reading or exposing secret values."""
    env = os.environ if environ is None else environ
    available = [
        provider for provider, key_name in _PROVIDER_KEYS.items()
        if isinstance(env.get(key_name), str) and bool(env.get(key_name))
    ]
    requested = env.get(SEARCH_PROVIDER_SETTING, "").strip().casefold()
    selected = (
        requested if requested in available
        else None if requested
        else (available[0] if available else None)
    )
    enabled = env.get(SEARCH_OPT_IN) == "1" and selected is not None
    return {
        "enabled": enabled,
        "provider": selected if enabled else None,
        "configured_provider": selected,
        "provider_available": bool(selected),
        "search_interval_seconds": search_interval_seconds(env),
        "disabled_reason": (
            None if enabled else
            "operator_opt_in_required" if selected else
            "configured_search_provider_unavailable" if requested else
            "search_provider_not_configured"
        ),
    }


def search_interval_seconds(environ=None) -> int:
    """Bound provider-search frequency; normal 5-minute scans do not rebill."""
    env = os.environ if environ is None else environ
    try:
        configured = int(env.get(SEARCH_INTERVAL_SETTING, DEFAULT_SEARCH_INTERVAL_SECONDS))
    except (TypeError, ValueError):
        return DEFAULT_SEARCH_INTERVAL_SECONDS
    return min(MAX_SEARCH_INTERVAL_SECONDS, max(MIN_SEARCH_INTERVAL_SECONDS, configured))


def source_min_interval(source: str, environ=None) -> int:
    if source.startswith(("exa_", "tavily_", "platform_discovery_")):
        return search_interval_seconds(environ)
    return 0


def source_name(provider: str, platform: str) -> str:
    if provider not in _PROVIDER_KEYS:
        raise ValueError("unsupported_search_provider")
    return f"platform_discovery_{provider}_{normalize_platform(platform)}"


class DiscoveryRows(list):
    """A successful discovery scan may validly return no eligible observations."""

    def __init__(self, rows=(), *, scan_state="observed"):
        super().__init__(rows)
        self.scan_state = scan_state


def source_specs(environ=None) -> dict:
    """Provide bounded per-platform scheduler sources only after explicit opt-in."""
    state = provider_state(environ)
    if not state["enabled"]:
        return {}
    provider = state["provider"]
    endpoint = (
        "https://api.exa.ai/search"
        if provider == "exa"
        else "https://api.tavily.com/search"
    )
    from functools import partial
    from .sources import platform_search

    return {
        source_name(provider, platform): (
            "social", endpoint, partial(platform_search, provider, platform)
        )
        for platform in PLATFORMS
    }


def policy_for(platform: str) -> dict:
    canonical = normalize_platform(platform)
    return PLATFORM_DISCOVERY[canonical]


def platform_hosts() -> dict[str, set[str]]:
    return {platform: set(hosts) for platform, hosts in _PLATFORM_HOSTS.items()}


def query_for(platform: str, now=None) -> tuple[str, datetime]:
    """Build a rolling query window; no year or date is frozen in configuration."""
    canonical = normalize_platform(platform)
    instant = now or datetime.now(timezone.utc)
    if isinstance(instant, (int, float)):
        instant = datetime.fromtimestamp(instant, timezone.utc)
    if instant.tzinfo is None:
        raise ValueError("query_time_must_be_timezone_aware")
    instant = instant.astimezone(timezone.utc)
    since = instant - timedelta(days=FRESHNESS_WINDOW_DAYS)
    policy = policy_for(canonical)
    query = (
        f"{canonical.replace('_', ' ')} {policy['topics']} "
        f"music social content from the last {FRESHNESS_WINDOW_DAYS} days "
        f"after:{since.date().isoformat()}"
    )
    return query, since


def _public_https_url(value) -> tuple[str, str] | None:
    if not isinstance(value, str) or len(value) > 2048 or "\\" in value:
        return None
    try:
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in (None, 443) or parsed.fragment
                or any(ord(char) < 32 or ord(char) == 127 for char in value)):
            return None
        host = parsed.hostname.rstrip(".").casefold().removeprefix("www.")
    except ValueError:
        return None
    if "." not in host or host.startswith(".") or host.endswith("."):
        return None
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        return None
    return host, parsed.path or "/"


def classify_result(platform: str, url: str) -> tuple[str, str] | None:
    """Distinguish first-party indexed content from unverified third-party hits."""
    canonical = normalize_platform(platform)
    parsed = _public_https_url(url)
    if parsed is None:
        return None
    host, path = parsed
    policy = policy_for(canonical)
    for other_platform, other_policy in PLATFORM_DISCOVERY.items():
        if other_platform == canonical:
            continue
        if any(
            host == domain or host.endswith("." + domain)
            for domain in other_policy["domains"]
        ):
            # Do not mislabel another configured platform as independent news.
            return None
    first_party = any(
        host == domain or host.endswith("." + domain)
        for domain in policy["domains"]
    )
    if any(host.startswith(domain + ".") for domain in policy["domains"]):
        return None
    if not first_party:
        return "third_party_search", "third_party_search_index"
    if not any(re.search(pattern, path, re.IGNORECASE) for pattern in policy["paths"]):
        return None
    return "index_snippet", "platform_origin_search_index"


def parse_publication_date(value) -> str | None:
    if not isinstance(value, str) or not value.strip() or len(value) > 64:
        return None
    raw = value.strip()
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
                stamp = stamp.replace(tzinfo=timezone.utc)
            else:
                return None
        return stamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OverflowError):
        return None


def freshness_state(published_at: str | None, observed_at=None) -> str:
    if published_at is None:
        return "unknown"
    normalized = parse_publication_date(published_at)
    if normalized is None:
        return "unknown"
    observed = observed_at or datetime.now(timezone.utc).timestamp()
    try:
        age = observed - datetime.fromisoformat(normalized.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, OverflowError):
        return "unknown"
    if age < -300:
        return "unknown"
    return "fresh" if age <= FRESHNESS_WINDOW_DAYS * 86400 else "stale"


def safe_result_text(title, snippet) -> str:
    """Keep only a short sanitized title/snippet; drop contact details."""
    from .engine import clean

    pieces = []
    for value in (title, snippet):
        if isinstance(value, str) and value.strip():
            text = clean(value, MAX_RESULT_CHARS)
            if text and text not in pieces:
                pieces.append(text)
    result = " — ".join(pieces)[:MAX_RESULT_CHARS]
    if not result or _EMAIL_OR_PHONE.search(result):
        return ""
    return result


def content_fingerprint(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("invalid_content_fingerprint_input")
    normalized = unicodedata.normalize("NFKC", text)
    normalized = " ".join(normalized.casefold().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def make_provenance(
    *,
    platform: str,
    retrieval_method: str,
    source_type: str,
    provider: str,
    query: str,
    source_url: str,
    content: str,
    original_published_at=None,
    search_relevance=None,
) -> dict:
    """Create a bounded context-only provenance envelope."""
    canonical = normalize_platform(platform)
    if retrieval_method not in {"direct_public", "index_snippet", "third_party_search"}:
        raise ValueError("invalid_retrieval_method")
    if source_type not in {
        "official_public_atom_feed",
        "platform_origin_search_index",
        "third_party_search_index",
    }:
        raise ValueError("invalid_source_type")
    if retrieval_method == "direct_public" and source_type != "official_public_atom_feed":
        raise ValueError("unverified_direct_fetch_policy")
    if retrieval_method == "index_snippet" and source_type != "platform_origin_search_index":
        raise ValueError("retrieval_source_mismatch")
    if (retrieval_method == "third_party_search"
            and source_type != "third_party_search_index"):
        raise ValueError("retrieval_source_mismatch")
    if (retrieval_method == "direct_public" and provider != "youtube_atom") or (
        retrieval_method != "direct_public" and provider not in _PROVIDER_KEYS
    ):
        raise ValueError("invalid_provenance_provider")
    if not isinstance(query, str) or not 1 <= len(query) <= 300:
        raise ValueError("invalid_provenance_query")
    if _public_https_url(source_url) is None:
        raise ValueError("invalid_provenance_url")
    sanitized_content = safe_result_text(content, "")
    if not sanitized_content:
        raise ValueError("empty_provenance_content")
    published = parse_publication_date(original_published_at)
    relevance = search_relevance
    if relevance is not None:
        if type(relevance) not in (int, float) or not math.isfinite(relevance):
            relevance = None
        else:
            relevance = min(1.0, max(0.0, float(relevance)))
    return {
        "schema": 1,
        "platform": None if retrieval_method == "third_party_search" else canonical,
        "platform_scope": canonical,
        "retrieval_method": retrieval_method,
        "source_type": source_type,
        "provider": provider,
        "query": query[:300],
        "original_published_at": published,
        "freshness_state": freshness_state(published),
        "reuse_rights": "unknown",
        "training_eligible": False,
        "training_block_reason": "public_visibility_does_not_prove_training_rights",
        "safety_decision": "sanitized_context_only",
        "search_relevance": relevance,
        "content_hash": content_fingerprint(sanitized_content),
        "source_attribution_confidence": {
            "direct_public": "high",
            "index_snippet": "medium",
            "third_party_search": "low",
        }[retrieval_method],
        "region": "unspecified",
        "genre": "unclassified",
        "redaction_policy": "contact_details_removed_max_500_chars",
        "expires_at": None,
    }


def validate_provenance(
    value, *, source: str, citation: str, observed_at, text=None,
    require_expiry=False,
) -> dict:
    """Strictly validate persisted observation provenance, including rights."""
    if not isinstance(value, dict) or set(value) != _ALLOWED_PROVENANCE_FIELDS:
        raise ValueError("invalid_discovery_provenance")
    platform_scope = normalize_platform(value.get("platform_scope"))
    raw_platform = value.get("platform")
    platform = normalize_platform(raw_platform) if raw_platform is not None else None
    method, source_type, provider = (
        value.get("retrieval_method"), value.get("source_type"), value.get("provider")
    )
    if method == "direct_public":
        if (source_type != "official_public_atom_feed" or provider != "youtube_atom"
                or platform != "youtube" or platform_scope != platform
                or not source.startswith("youtube_")):
            raise ValueError("unverified_direct_fetch_policy")
    elif method in {"index_snippet", "third_party_search"}:
        if (source_type != (
                "platform_origin_search_index" if method == "index_snippet"
                else "third_party_search_index"
        ) or provider not in _PROVIDER_KEYS
                or source != f"platform_discovery_{provider}_{platform_scope}"
                or (method == "index_snippet" and platform != platform_scope)
                or (method == "third_party_search" and platform is not None)):
            raise ValueError("discovery_source_mismatch")
    else:
        raise ValueError("invalid_retrieval_method")
    if value.get("schema") != 1 or value.get("training_eligible") is not False:
        raise ValueError("invalid_discovery_schema_or_rights")
    if (value.get("reuse_rights") != "unknown"
            or value.get("training_block_reason")
            != "public_visibility_does_not_prove_training_rights"
            or value.get("safety_decision") != "sanitized_context_only"):
        raise ValueError("invalid_discovery_rights_or_safety")
    expected_confidence = {
        "direct_public": "high",
        "index_snippet": "medium",
        "third_party_search": "low",
    }[method]
    if (
        value.get("source_attribution_confidence") != expected_confidence
        or value.get("region") != "unspecified"
        or value.get("genre") != "unclassified"
        or value.get("redaction_policy")
        != "contact_details_removed_max_500_chars"
    ):
        raise ValueError("invalid_discovery_metadata")
    if text is not None:
        try:
            expected_hash = content_fingerprint(safe_result_text(text, ""))
        except ValueError as exc:
            raise ValueError("invalid_discovery_content") from exc
        if value.get("content_hash") != expected_hash:
            raise ValueError("discovery_content_hash_mismatch")
    elif not isinstance(value.get("content_hash"), str) or not re.fullmatch(
        r"[0-9a-f]{64}", value["content_hash"]
    ):
        raise ValueError("invalid_discovery_content_hash")
    expiry = value.get("expires_at")
    if require_expiry:
        from .engine import TTL
        if (type(expiry) not in (int, float) or not math.isfinite(expiry)
                or not math.isclose(expiry, observed_at + TTL, abs_tol=0.001)):
            raise ValueError("invalid_discovery_expiry")
    elif expiry is not None and (
        type(expiry) not in (int, float) or not math.isfinite(expiry)
    ):
        raise ValueError("invalid_discovery_expiry")
    query = value.get("query")
    if not isinstance(query, str) or not 1 <= len(query) <= 300:
        raise ValueError("invalid_discovery_query")
    from .engine import clean
    if clean(query, 300) != query:
        raise ValueError("unsafe_discovery_query")
    if value.get("original_published_at") is not None:
        if parse_publication_date(value["original_published_at"]) != value["original_published_at"]:
            raise ValueError("invalid_discovery_publication_date")
    expected_freshness = freshness_state(
        value.get("original_published_at"), observed_at
    )
    if expected_freshness == "stale":
        raise ValueError("stale_discovery_provenance")
    if value.get("freshness_state") != expected_freshness:
        raise ValueError("invalid_discovery_freshness")
    relevance = value.get("search_relevance")
    if (relevance is not None and (
            type(relevance) not in (int, float) or not math.isfinite(relevance)
            or not 0 <= relevance <= 1
    )):
        raise ValueError("invalid_search_relevance")
    if _public_https_url(citation) is None:
        raise ValueError("invalid_discovery_citation")
    if method == "direct_public":
        host, path = _public_https_url(citation)
        if host not in {"youtube.com", "youtu.be"} or not (
            path == "/watch" or path.startswith("/shorts/")
        ):
            raise ValueError("unverified_direct_fetch_policy")
    else:
        classification = classify_result(platform_scope, citation)
        expected = (
            (method, source_type)
            if classification == (method, source_type)
            else None
        )
        if expected is None:
            raise ValueError("discovery_citation_classification_mismatch")
    return dict(value)
