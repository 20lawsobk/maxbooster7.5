"""Public source adapters reusing the quality harvester's fetch policy/config.

Feed presence/position is editorial evidence, never engagement or usage rights.
An observation timestamp means fetched now, not necessarily published now.
"""
import functools
import json
import os
import math
import re
import time
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
from ai_model.safe_feed_xml import parse_feed_xml
from workers import quality_harvester as legacy
from .platform_discovery import (
    DiscoveryRows,
    PLATFORM_DISCOVERY,
    content_fingerprint,
    freshness_state,
    make_provenance,
    parse_publication_date,
    provider_state,
    safe_result_text,
    source_name,
)


def _fetch(url):
    # Explicit operator opt-in for cloud egress; the public HTTP reader retains
    # address pinning, redirect validation, TLS verification and size/deadlines.
    if os.environ.get("MAXCORE_AWARENESS_USE_PROXY") == "1":
        data, _ = legacy.fetch_bytes(
            url, max_bytes=8 * 1024 * 1024,
            allowed_content_types=("application", "text"),
            deadline_seconds=legacy._TIMEOUT,
            proxy_url=os.environ.get("HTTPS_PROXY"),
        )
        return data
    return legacy._fetch(url)


def _row(text, citation, value, metric):
    return {"text": text, "citation": citation, "value": value, "metric": metric}


def apple():
    data = json.loads(_fetch(legacy.APPLE_SONGS_URL))
    return [_row(r.get("name"), r.get("url"), i, "chart_position")
            for i, r in enumerate(data["feed"]["results"][:50], start=1)]


def deezer():
    url = legacy.DEEZER_CHART_URL.format(id=0)
    data = json.loads(_fetch(url))
    return [_row(r.get("title"), r.get("link"), r.get("rank", 0),
                 "deezer_popularity") for r in data.get("data", [])[:25]]


# Only complete short-form text accompanied by actual public counters is a
# learning example. Headlines, chart labels and search scores remain context.
PEAK_METRIC = "public_complete_post_likes_plus_reposts_v1"
PEAK_TOPICS = {
    "music": ("music", "song", "album", "artist", "musician", "guitar", "concert"),
    "social": ("creator", "creators", "social media", "content creation", "reels"),
    "advertising": ("marketing", "advertising", "campaign", "brand", "brands"),
    "culture": ("culture", "art", "arts", "film", "cinema", "literature", "theatre"),
}
PEAK_QUERIES = {"music": "music", "social": "creator", "advertising": "marketing",
                "culture": "art"}
BLUESKY_SEARCH = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"


def relevant_peak_text(text, domain):
    return domain in PEAK_TOPICS and any(
        re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", text, re.I)
        for word in PEAK_TOPICS[domain])


def _counter(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def _recent_publication(value, now=None):
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            return False
        age = (time.time() if now is None else now) - stamp.timestamp()
        return -5 <= age <= 7 * 86400
    except (AttributeError, TypeError, ValueError, OverflowError):
        return False


def _complete_text(value):
    from .engine import clean
    if not isinstance(value, str) or len(value) > 20000:
        return ""
    # Clean before checking size: never relabel a truncated excerpt as a
    # complete post. Masked links/identifiers are safe, but prompt payloads fail.
    text = clean(value, 20000)
    return text if 60 <= len(text) <= 4096 and len(text.split()) >= 8 else ""


def social():
    from .engine import MAX_OBSERVATION_TEXT, clean, citation

    data = json.loads(_fetch(legacy.MASTODON_TRENDS_STATUSES))
    if not isinstance(data, list):
        return []
    rows = []
    for post in data[:40]:
        if (not isinstance(post, dict) or post.get("visibility") != "public"
                or post.get("sensitive") is not False or post.get("reblog")):
            continue
        likes, reposts = post.get("favourites_count"), post.get("reblogs_count")
        if not _counter(likes) or not _counter(reposts):
            continue
        content = post.get("content")
        if not isinstance(content, str):
            continue
        context_text, cite = clean(content, MAX_OBSERVATION_TEXT), citation(post.get("url"))
        # Media-only posts can legitimately have no text. They are not text
        # observations; never emit an empty or unsafe contextual row merely
        # because its public engagement counters are present.
        if not context_text or not cite:
            continue
        text = _complete_text(content)
        eligible = (text and post.get("visibility") == "public"
                    and post.get("sensitive") is False and not post.get("reblog")
                    and _recent_publication(post.get("created_at"))
                    and relevant_peak_text(text, "social") and likes + reposts > 0)
        rows.append(_row(text if eligible else context_text, cite,
                         likes + reposts, PEAK_METRIC if eligible else
                         "mastodon_reblogs_plus_favourites"))
    return rows


MASTODON_TAGS = {"music": "music", "social": "creator", "advertising": "marketing", "culture": "art"}
MASTODON_PUBLIC_TAG = "https://mastodon.social/api/v1/timelines/tag/"


def mastodon_peak(domain):
    """Fixed anonymous public topic timeline with actual engagement counters."""
    from urllib.parse import urlsplit
    if domain not in MASTODON_TAGS:
        return []
    data = json.loads(_fetch(MASTODON_PUBLIC_TAG + MASTODON_TAGS[domain] + "?limit=40"))
    if not isinstance(data, list):
        return []
    # Include the server's explicitly trending public content as well as the
    # topical timeline. Both expose identical counters; filter relevance before
    # choosing leaders, never manufacture performance from tag presence.
    try:
        trending = json.loads(_fetch(legacy.MASTODON_TRENDS_STATUSES))
    except Exception:
        trending = []
    candidates = (trending[:20] if isinstance(trending, list) else []) + data[:40]
    rows = []
    seen = set()
    for post in candidates:
        if (not isinstance(post, dict) or post.get("visibility") != "public"
                or post.get("sensitive") is not False or post.get("reblog")):
            continue
        text = _complete_text(post.get("content"))
        likes, reposts = post.get("favourites_count"), post.get("reblogs_count")
        url = post.get("url")
        try:
            public_citation = isinstance(url, str) and urlsplit(url).hostname == "mastodon.social"
        except ValueError:
            public_citation = False
        if (not text or not relevant_peak_text(text, domain) or not public_citation
                or not _recent_publication(post.get("created_at"))
                or not _counter(likes) or not _counter(reposts) or likes + reposts <= 0):
            continue
        if url not in seen:
            rows.append(_row(text, url, likes + reposts, PEAK_METRIC))
            seen.add(url)
    return rows


def bluesky_peak(domain):
    """Anonymous official public search; topic-filtered complete public posts.

    Public API counters are observations, not evidence of causality or rights.
    No tokens, private feeds, arbitrary source URLs or synthetic zero defaults.
    """
    if domain not in PEAK_QUERIES:
        return []
    since = datetime.fromtimestamp(time.time() - 7 * 86400, timezone.utc).isoformat()
    url = BLUESKY_SEARCH + "?" + urlencode({
        "q": PEAK_QUERIES[domain], "sort": "top", "limit": 50, "since": since,
    })
    data = json.loads(_fetch(url))
    posts = data.get("posts", []) if isinstance(data, dict) else []
    if not isinstance(posts, list):
        return []
    rows = []
    for post in posts[:50]:
        if not isinstance(post, dict):
            continue
        record = post.get("record")
        author = post.get("author")
        if not isinstance(record, dict) or not isinstance(author, dict):
            continue
        # Labels can indicate sensitive/removed content. Conservative omission
        # also prevents using account-level flagged material as examples.
        if post.get("labels") or author.get("labels") or (isinstance(post.get("embed"), dict) and post["embed"].get("blocked")):
            continue
        text = _complete_text(record.get("text"))
        likes, reposts = post.get("likeCount"), post.get("repostCount")
        if (not text or not relevant_peak_text(text, domain)
                or not _recent_publication(record.get("createdAt"))
                or not _counter(likes) or not _counter(reposts) or likes + reposts <= 0):
            continue
        uri = post.get("uri", "")
        # Address the canonical record by DID, never an untrusted author URL.
        match = re.fullmatch(r"at://(did:plc:[a-z2-7]{24})/app\.bsky\.feed\.post/([a-zA-Z0-9]+)", uri)
        if not match or author.get("did") != match[1]:
            continue
        cite = "https://bsky.app/profile/" + match[1] + "/post/" + match[2]
        rows.append(_row(text, cite, likes + reposts, PEAK_METRIC))
    return rows


def rss(url):
    root = parse_feed_xml(_fetch(url))
    rows = []
    for entry in root.findall(".//item")[:30]:
        rows.append(_row(entry.findtext("title"), entry.findtext("link"), 1,
                         "editorial_feed_presence"))
    atom = "{http://www.w3.org/2005/Atom}"
    for entry in root.findall(atom + "entry")[:30]:
        links = entry.findall(atom + "link")
        link = next((e.get("href") for e in links if e.get("rel", "alternate") == "alternate"), "")
        rows.append(_row(entry.findtext(atom + "title"), link, 1, "editorial_feed_presence"))
    return rows


# All ten original app feeds retained. Their category describes their editorial
# coverage; feed appearance is never passed off as engagement/performance.
APP_RSS = (
    ("music_business_worldwide", "music", "https://www.musicbusinessworldwide.com/feed/"),
    ("digital_music_news", "music", "https://www.digitalmusicnews.com/feed/"),
    ("music_ally", "music", "https://musically.com/feed/"),
    ("musicradar", "music", "https://www.musicradar.com/rss"),
    ("spotify_newsroom", "music", "https://newsroom.spotify.com/rss/"),
    ("meta_creators", "social", "https://about.fb.com/news/tag/creators/feed/"),
    ("hypebot", "music", "https://www.hypebot.com/hypebot/atom.xml"),
    ("landr", "music", "https://blog.landr.com/feed/"),
    ("distrokid", "music", "https://blog.distrokid.com/feed"),
    ("tunecore", "music", "https://www.tunecore.com/blog/feed/"),
)


def search(provider, query):
    """Credentials inherited only; fixed origins, bounded bodies, no redirects.

    Never put credentials in URLs, errors, records or health telemetry.
    Search relevance is explicitly not engagement or campaign effectiveness.
    """
    from trusted_http import request, validated_origin
    name = "TAVILY_API_KEY" if provider == "tavily" else "EXA_API_KEY"
    key = os.environ.get(name)
    if not key:
        raise RuntimeError("search_not_configured")
    if provider == "tavily":
        url = "https://api.tavily.com/search"
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        payload = {"query": query, "max_results": 5, "search_depth": "basic", "topic": "news"}
    else:
        url = "https://api.exa.ai/search"
        headers = {"x-api-key": key, "Content-Type": "application/json"}
        payload = {"query": query, "numResults": 5, "type": "auto"}
    response = request("POST", url, origin=validated_origin(url),
                       headers=headers, body=json.dumps(payload).encode(),
                       timeout=12, max_bytes=1024 * 1024)
    if response.status != 200:
        raise RuntimeError("search_source_failed")
    return [_row(r.get("title"), r.get("url"),
                 r["score"] if isinstance(r.get("score"), (int, float)) else 1,
                 provider + "_search_relevance" if isinstance(r.get("score"), (int, float))
                 else "search_result_presence")
            for r in json.loads(response.body).get("results", [])[:5]]


def platform_search(provider, platform):
    """Collect at most five indexed results for one canonical platform.

    This intentionally does not fetch result pages. First-party snippets remain
    platform-index evidence; non-platform URLs are labelled as unverified
    third-party search results, and neither class implies engagement or reuse rights.
    """
    from trusted_http import request, validated_origin
    from ai_model.native_analysis.safe_http import SafeHTTPError
    from .platform_discovery import (
        SEARCH_OPT_IN,
        SEARCH_PROVIDER_SETTING,
        classify_result,
        policy_for,
        query_for,
        safe_result_text,
    )

    state = provider_state()
    if (os.environ.get(SEARCH_OPT_IN) != "1"
            or state["provider"] != provider
            or os.environ.get(SEARCH_PROVIDER_SETTING, "").strip().casefold()
            not in ("", provider)):
        raise RuntimeError("platform_discovery_not_enabled")
    key_name = "TAVILY_API_KEY" if provider == "tavily" else "EXA_API_KEY"
    key = os.environ.get(key_name)
    if not key:
        raise RuntimeError("search_not_configured")

    query, since = query_for(platform)
    if provider == "tavily":
        url = "https://api.tavily.com/search"
        headers = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
        payload = {
            "query": query,
            "max_results": 5,
            "search_depth": "basic",
            "topic": "news",
            "time_range": "week",
        }
    elif provider == "exa":
        url = "https://api.exa.ai/search"
        headers = {"x-api-key": key, "Content-Type": "application/json"}
        payload = {
            "query": query,
            "numResults": 5,
            "type": "auto",
            "startPublishedDate": since.isoformat().replace("+00:00", "Z"),
            "contents": {"text": {"maxCharacters": MAX_SEARCH_SNIPPET_CHARS}},
        }
    else:
        raise ValueError("unsupported_search_provider")

    response = request(
        "POST", url, origin=validated_origin(url), headers=headers,
        body=json.dumps(payload).encode(), timeout=12, max_bytes=1024 * 1024,
    )
    if response.status != 200:
        raise SafeHTTPError(f"Remote server returned HTTP {response.status}")
    document = json.loads(response.body)
    raw_results = document.get("results", []) if isinstance(document, dict) else None
    if not isinstance(raw_results, list):
        raise ValueError("invalid_search_results")

    rows = []
    seen = set()
    seen_content = set()
    policy_for(platform)  # Validate the canonical ID before processing results.
    for result in raw_results[:5]:
        if not isinstance(result, dict):
            continue
        result_url = result.get("url")
        classification = classify_result(platform, result_url)
        if classification is None:
            continue
        from .engine import citation
        cite = citation(result_url)
        if not cite or cite in seen:
            continue
        title = result.get("title")
        snippet = result.get("content", result.get("text", result.get("snippet", "")))
        text = safe_result_text(title, snippet)
        if len(text) < 16:
            continue
        fingerprint = content_fingerprint(text)
        if fingerprint in seen_content:
            continue
        published = parse_publication_date(
            result.get("published_date", result.get("publishedDate"))
        )
        state_of_freshness = freshness_state(published)
        if state_of_freshness == "stale":
            continue
        score = result.get("score")
        if type(score) not in (int, float) or not math.isfinite(score):
            score = None
        relevance = min(1.0, max(0.0, float(score))) if score is not None else None
        method, source_type = classification
        provenance = make_provenance(
            platform=platform,
            retrieval_method=method,
            source_type=source_type,
            provider=provider,
            query=query,
            source_url=cite,
            content=text,
            original_published_at=published,
            search_relevance=relevance,
        )
        rows.append(_row(
            text, cite, relevance if relevance is not None else 1.0,
            "search_index_relevance" if relevance is not None
            else "search_result_presence",
        ) | {"discovery": provenance})
        seen.add(cite)
        seen_content.add(fingerprint)

    return DiscoveryRows(rows, scan_state="observed" if rows else (
        "filtered" if raw_results else "no_results"
    ))


MAX_SEARCH_SNIPPET_CHARS = 500


def hn(url):
    data = json.loads(_fetch(url))
    return [_row(h.get("title"), "https://news.ycombinator.com/item?id=" + str(h["objectID"]),
                 h.get("points") or 0, "hn_story_votes")
            for h in data.get("hits", [])[:30] if str(h.get("objectID", "")).isdigit()]


# ── Live social-platform landscape ──────────────────────────────────────
# The social domain historically saw charts, Mastodon trends and creator news,
# but nothing from the platforms captions are actually written for. These
# adapters close that gap: trending hashtags, trending sounds and viral
# formats per platform. Rows reuse the standard _row shape so they flow
# through snapshots, conditioning and TRENDS: lines untouched. Every fetcher
# degrades to [] — landscape data is optional context, never a gate.

LANDSCAPE_METRICS = {
    "hashtags": "platform_trending_hashtag",
    "sounds": "platform_trending_sound",
    "formats": "platform_viral_format",
}

# Trend-specific search queries for the credential-inheriting providers
# (tavily/exa). Registered in the social domain alongside the generic
# per-domain queries when provider keys are present.
LANDSCAPE_SEARCH_QUERIES = (
    "trending hashtags TikTok Instagram Reels this week music",
    "trending sounds TikTok Instagram Reels viral audio",
    "viral content formats TikTok Instagram creators trending now",
)


def landscape_feed(kind):
    """Fetch structured trend rows from the configured landscape endpoint.

    Contract: ``SOCIAL_LANDSCAPE_URL`` must serve JSON shaped like
    ``{"trends": [{"text": "#tag", "url": "...", "value": 1234,
    "platform": "tiktok"}, ...]}``. ``kind`` is one of "hashtags",
    "sounds", "formats" and selects the row metric. Anything unexpected —
    missing env, bad JSON, wrong shape — returns [].
    """
    if kind not in LANDSCAPE_METRICS:
        return []
    url = os.environ.get("SOCIAL_LANDSCAPE_URL", "").strip()
    if not url:
        return []
    try:
        data = json.loads(_fetch(url))
    except Exception:
        return []
    trends = data.get("trends") if isinstance(data, dict) else None
    if not isinstance(trends, list):
        return []
    metric = LANDSCAPE_METRICS[kind]
    rows = []
    for t in trends[:20]:
        if not isinstance(t, dict):
            continue
        text = t.get("text")
        if not isinstance(text, str) or not text.strip():
            continue
        value = t.get("value", 1)
        if not isinstance(value, (int, float)):
            value = 1
        url_v = t.get("url") if isinstance(t.get("url"), str) else ""
        rows.append(_row(text.strip()[:120], url_v, value, metric))
    return rows


def trends_lines(rows, platform=""):
    """Render trend rows as TRENDS: lines for the awareness string.

    The distribution agent's hashtag parser prioritises lines containing the
    platform name or a "Trending:" marker, so live tags flow into hashtag
    selection automatically. Pure formatting — never raises.
    """
    try:
        plat = (platform or "").strip().lower()
        by_kind = {}
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            metric = str(r.get("metric", ""))
            text = str(r.get("text", "")).strip()
            if not text:
                continue
            by_kind.setdefault(metric, []).append(text)
        lines = []
        order = [
            ("platform_trending_hashtag", "trending hashtags"),
            ("platform_trending_sound", "trending sounds"),
            ("platform_viral_format", "viral formats"),
        ]
        for metric, label in order:
            tags = by_kind.get(metric)
            if not tags:
                continue
            head = f"Trending {label}"
            if plat:
                head += f" on {plat}"
            lines.append(f"TRENDS: {head}: " + " ".join(tags[:8]))
        return lines
    except Exception:
        return []


def _youtube_rows(root):
    atom = "{http://www.w3.org/2005/Atom}"
    media = "{http://search.yahoo.com/mrss/}"
    rows = []
    for entry in root.findall(atom + "entry")[:15]:
        link = entry.find(atom + "link")
        stats = entry.find(".//" + media + "statistics")
        if link is None:
            continue
        value = int(stats.get("views", "0")) if stats is not None else 1
        cite = link.get("href")
        published = entry.findtext(atom + "published") or entry.findtext(atom + "updated")
        if freshness_state(parse_publication_date(published)) == "stale":
            continue
        title = safe_result_text(entry.findtext(atom + "title"), "")
        if not title:
            continue
        try:
            discovery = make_provenance(
                platform="youtube",
                retrieval_method="direct_public",
                source_type="official_public_atom_feed",
                provider="youtube_atom",
                query="official public YouTube Atom channel feed",
                source_url=cite,
                content=title,
                original_published_at=published,
            )
        except ValueError:
            discovery = None
        row = _row(
            title, cite, value,
            "youtube_feed_views" if stats is not None else "curated_feed_presence",
        )
        if discovery:
            row["discovery"] = discovery
        rows.append(row)
    return rows


def _youtube_profile_rows(root, feed_url, channel_name):
    """Expose public video citations as candidates without inventing quality scores."""
    from .engine import MAX_OBSERVATION_TEXT, citation, clean

    atom = "{http://www.w3.org/2005/Atom}"
    media = "{http://search.yahoo.com/mrss/}"
    rows = []
    for entry in root.findall(atom + "entry")[:15]:
        link = entry.find(atom + "link")
        profile = entry.find(atom + "author/" + atom + "uri")
        stats = entry.find(".//" + media + "statistics")
        if link is None or not link.get("href"):
            continue
        post_citation = citation(link.get("href"))
        profile_citation = citation(profile.text if profile is not None else "")
        post_url = urlsplit(post_citation)
        profile_url = urlsplit(profile_citation)
        post_params = dict(
            pair.split("=", 1) for pair in post_url.query.split("&") if "=" in pair
        )
        title = clean(entry.findtext(atom + "title"), MAX_OBSERVATION_TEXT)
        if (not title or not post_citation or not profile_citation
                or post_url.hostname not in ("www.youtube.com", "youtube.com")
                or post_url.path != "/watch"
                or not re.fullmatch(r"[A-Za-z0-9_-]{11}", post_params.get("v", ""))
                or profile_url.hostname not in ("www.youtube.com", "youtube.com")):
            continue

        # A public feed timestamp measures freshness only; missing creator and
        # platform-specific quality evidence remains missing for the scorer.
        published = entry.findtext(atom + "published") or entry.findtext(atom + "updated")
        factors = {}
        freshness = _freshness_score(published)
        if freshness is not None:
            factors["freshness"] = freshness

        metrics = {}
        if stats is not None:
            raw_views = stats.get("views")
            if raw_views and len(raw_views) <= 18 and raw_views.isdigit():
                metrics["views"] = int(raw_views)
        rows.append({
            "text": title,
            "citation": post_citation,
            "profile_source": True,
            "quality_factors": factors,
            "profile_evidence": {
                "platform": "youtube",
                "profile_citation": profile_citation,
                "post_citation": post_citation,
                "channel_name": clean(channel_name, 120),
                "published_at": published,
                "public_metrics": metrics,
                "provenance": {
                    "source_kind": "public_youtube_atom_feed",
                    "feed_citation": citation(feed_url),
                },
                "measured_factors": {
                    "freshness": {
                        "value": freshness,
                        "method": "linear_age_decay_30_days",
                    } if freshness is not None else None,
                },
            },
        })
    return rows


def _freshness_score(published_at):
    """Map a valid publication age to 0–100; unknown dates stay unmeasured."""
    if not isinstance(published_at, str):
        return None
    try:
        stamp = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            return None
        age_seconds = time.time() - stamp.timestamp()
        if age_seconds < -300:
            return None
        age_days = max(0.0, age_seconds / 86400)
        return round(max(0.0, 100.0 * (1.0 - age_days / 30.0)), 2)
    except (ValueError, OverflowError):
        return None


def youtube(url):
    return _youtube_rows(parse_feed_xml(_fetch(url)))


def youtube_with_profile_candidates(url, channel_name):
    root = parse_feed_xml(_fetch(url))
    return (_youtube_rows(root)
            + _youtube_profile_rows(root, url, channel_name))


def profile_source_status(source_health=None):
    """Report exact platform discovery paths without implying account access."""
    from ai_model.platform_optimization import PLATFORMS
    from ai_model.awareness.profile_quality import summarize_quality_cohort

    configured = {
        f"youtube_{feed['name']}": feed for feed in legacy.YOUTUBE_FEEDS
    }
    health = source_health if isinstance(source_health, dict) else {}
    search = provider_state()
    search_sources = {
        platform: (
            source_name(search["provider"], platform) if search["enabled"] else None
        )
        for platform in PLATFORMS
    }
    platforms = {}
    all_candidates = []
    for platform in PLATFORMS:
        entries = []
        source_health_rows = []
        platform_candidates = []
        missing = set()
        invalid = set()
        source_names = (
            list(configured) if platform == "youtube" else []
        )
        if search_sources[platform]:
            source_names.append(search_sources[platform])
        for name in source_names:
            item = health.get(name, {})
            item = item if isinstance(item, dict) else {}
            candidate_rows = item.get("profile_candidates", [])
            if isinstance(candidate_rows, list):
                platform_candidates.extend(
                    row for row in candidate_rows if isinstance(row, dict)
                )
            missing.update(item.get("profile_missing_metrics", []))
            invalid.update(item.get("profile_invalid_metrics", []))
            entries.append(name)
            failure = item.get("failure_class") or item.get("error")
            platform_count = item.get(
                "platform_origin_observation_count",
                item.get("discovery_observation_count", 0),
            )
            third_party_count = item.get("third_party_search_result_count", 0)
            if not item:
                item_status = "not_scanned"
            elif item.get("ok") and platform_count:
                item_status = "observations_ingested"
            elif item.get("ok") and third_party_count:
                item_status = "third_party_only"
            elif item.get("ok"):
                item_status = item.get("discovery_scan_state", "no_observations")
            else:
                item_status = "failed"
            source_health_rows.append({
                "source": name,
                "status": item_status,
                "failure": failure,
                "http_status": item.get("http_status"),
                "observation_count": platform_count,
                "third_party_result_count": third_party_count,
                "freshness_state": item.get("discovery_freshness_state", "unknown"),
                "last_observed_at": item.get("observed_at"),
                "schedule_state": item.get("schedule_state", "scheduled"),
                "next_scan_at": item.get("next_scan_at"),
                "last_attempt_outcome": item.get("last_attempt_outcome"),
                "candidate_count": item.get("profile_candidate_count", 0),
                "eligible_count": item.get("profile_eligible_count", 0),
            })
        ingestion_state = "available" if any(
            row["status"] == "observations_ingested" for row in source_health_rows
        ) else "failed" if any(
            row["status"] == "failed" for row in source_health_rows
        ) else "stale" if any(
            row["status"] == "stale_waiting_interval" for row in source_health_rows
        ) else "empty" if any(
            row["status"] in {"no_results", "filtered"} for row in source_health_rows
        ) else "third_party_only" if any(
            row["status"] == "third_party_only" for row in source_health_rows
        ) else "not_scanned"
        platform_candidates = _dedupe_profile_observations(platform_candidates)
        candidates = len(platform_candidates)
        eligible = sum(
            row.get("status") == "eligible" for row in platform_candidates
        )
        all_candidates.extend(platform_candidates)
        if search_sources[platform]:
            availability_status = "search_index_configured"
            availability_reason = None
            authorization_mode = "public_search_index_only"
            connection_state = "public_search_no_account_connection"
        elif search["provider_available"]:
            availability_status = "search_disabled"
            availability_reason = search["disabled_reason"]
            authorization_mode = "none"
            connection_state = "not_connected"
        elif platform == "youtube":
            availability_status = "public_feed_configured"
            availability_reason = None
            authorization_mode = "public_atom_feed"
            connection_state = "not_applicable_public_feed"
        else:
            availability_status = "unavailable"
            availability_reason = "search_provider_not_configured"
            authorization_mode = "none"
            connection_state = "not_connected"
        if platform == "youtube" and configured:
            availability_status = "public_feed_configured"
            authorization_mode = (
                "public_atom_feed_and_search_index"
                if search_sources[platform] else "public_atom_feed"
            )
            connection_state = "not_applicable_public_feed"
        observed = [
            row.get("last_observed_at")
            for row in source_health_rows
            if type(row.get("last_observed_at")) in (int, float)
        ]
        freshness_values = {
            row.get("freshness_state")
            for row in source_health_rows
            if row.get("status") == "observations_ingested"
        }
        freshness = (
            "fresh" if "fresh" in freshness_values else
            "unknown" if "unknown" in freshness_values else
            "unavailable"
        )
        observation_count = sum(
            row.get("observation_count", 0) for row in source_health_rows
            if type(row.get("observation_count")) is int
        )
        direct_policy = PLATFORM_DISCOVERY[platform]
        provider_item = health.get(search_sources[platform], {}) if search_sources[platform] else {}
        provider_item = provider_item if isinstance(provider_item, dict) else {}
        if not search_sources[platform]:
            provider_query_status = "disabled_or_not_configured"
        elif not provider_item:
            provider_query_status = "configured_not_live_verified"
        elif provider_item.get("ok"):
            provider_query_status = "last_query_succeeded"
        else:
            provider_query_status = "last_query_failed"
        platforms[platform] = {
            "network_group": direct_policy["network_group"],
            "status": availability_status,
            "reason": availability_reason,
            "authorization_mode": authorization_mode,
            "connection_state": connection_state,
            "ingestion_state": ingestion_state,
            "freshness_state": freshness,
            "observation_count": observation_count,
            "last_observed_at": max(observed) if observed else None,
            "training_eligibility": {
                "eligible": False,
                "reason": "public_visibility_does_not_prove_training_rights",
            },
            "search_provider": search["provider"] if search_sources[platform] else None,
            "search_provider_available": search["provider_available"],
            "search_provider_configured_name": search["configured_provider"],
            "search_provider_configured": bool(search_sources[platform]),
            "search_provider_query_status": provider_query_status,
            "search_provider_last_query_at": (
                provider_item.get("observed_at") if provider_item else None
            ),
            "direct_fetch_policy": "disabled_until_terms_and_robots_review",
            "allowed_platform_domains": list(direct_policy["domains"]),
            "source_count": len(source_names),
            "candidate_count": candidates,
            "eligible_count": eligible,
            "missing_metrics": sorted(missing),
            "invalid_metrics": sorted(invalid),
            "sources": entries,
            "source_health": source_health_rows,
            "quality_cohort": summarize_quality_cohort(
                [_profile_assessment(row) for row in platform_candidates]
            ),
        }
    all_candidates = _dedupe_profile_observations(all_candidates)
    return {
        "platforms": platforms,
        "quality_cohort": summarize_quality_cohort(
            [_profile_assessment(row) for row in all_candidates]
        ),
    }


def _profile_assessment(candidate):
    score = candidate.get("quality_potential_score")
    status = candidate.get("status")
    return {
        "qualityPotentialScore": score,
        "status": status if isinstance(status, str) else "insufficient_evidence",
    }


def _dedupe_profile_observations(candidates):
    unique = {}
    for candidate in candidates:
        key = (
            candidate.get("platform"),
            candidate.get("post_citation"),
        )
        if key[1]:
            unique.setdefault(key, candidate)
    return list(unique.values())


def configured_sources():
    # Narrow source/category claims: trade press is not campaign performance;
    # Guardian culture is editorial coverage, not an all-world popularity index.
    sources = {
        "apple_charts": ("music", legacy.APPLE_SONGS_URL, apple),
        "deezer_charts": ("music", legacy.DEEZER_CHART_URL.format(id=0), deezer),
        "mastodon_trending": ("social", legacy.MASTODON_TRENDS_STATUSES, social),
        "marketing_dive": ("advertising", "https://www.marketingdive.com/feeds/news/",
                           functools.partial(rss, "https://www.marketingdive.com/feeds/news/")),
        "guardian_culture": ("culture", "https://www.theguardian.com/culture/rss",
                             functools.partial(rss, "https://www.theguardian.com/culture/rss")),
        "hn_music": ("music", legacy.HN_URL, functools.partial(hn, legacy.HN_URL)),
        "hn_marketing_discussion": ("advertising", legacy.HN_ADS_URL,
                                    functools.partial(hn, legacy.HN_ADS_URL)),
    }
    for domain in MASTODON_TAGS:
        sources["mastodon_peak_" + domain] = (
            domain, MASTODON_PUBLIC_TAG + MASTODON_TAGS[domain],
            functools.partial(mastodon_peak, domain))
    for domain in PEAK_QUERIES:
        sources["bluesky_peak_" + domain] = (
            domain, BLUESKY_SEARCH, functools.partial(bluesky_peak, domain))
    for feed in legacy.YOUTUBE_FEEDS:
        sources["youtube_" + feed["name"]] = (
            "music", feed["url"],
            functools.partial(youtube_with_profile_candidates, feed["url"],
                              feed["name"]))
    from .platform_discovery import source_specs
    sources.update(source_specs())
    for name, domain, url in APP_RSS:
        sources[name] = (domain, url, functools.partial(rss, url))
    queries = {
        "music": "music industry streaming platform independent artist technology news",
        "social": "social media creator platform algorithm content policy update",
        "advertising": "digital advertising marketing platform targeting policy news",
        "culture": "culture arts music audience cultural news",
    }
    for provider, env, url in (
        ("tavily", "TAVILY_API_KEY", "https://api.tavily.com/search"),
        ("exa", "EXA_API_KEY", "https://api.exa.ai/search"),
    ):
        if os.environ.get(env):
            for domain, query in queries.items():
                sources[provider + "_" + domain] = (
                    domain, url, functools.partial(search, provider, query))
            # Live platform landscape: trend-specific queries in the social
            # domain so trending hashtags/sounds/formats reach the snapshot
            # through the same credential-inheriting pipe.
            for i, lq in enumerate(LANDSCAPE_SEARCH_QUERIES):
                sources[f"{provider}_social_landscape_{i}"] = (
                    "social", url, functools.partial(search, provider, lq))
    if os.environ.get("SOCIAL_LANDSCAPE_URL", "").strip():
        for kind in LANDSCAPE_METRICS:
            sources[f"landscape_{kind}"] = (
                "social", os.environ["SOCIAL_LANDSCAPE_URL"].strip(),
                functools.partial(landscape_feed, kind))
    return sources
