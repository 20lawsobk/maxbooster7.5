"""Deterministic tests for the opt-in eight-platform awareness discovery layer."""

import hashlib
import json
import time
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from ai_model.awareness.engine import (
    DOMAINS,
    Engine,
    Snapshot,
    _retry_delay,
    canonical,
    conditioning,
    validate_source_observation_document,
)
from ai_model.awareness.platform_discovery import (
    DiscoveryRows,
    FRESHNESS_WINDOW_DAYS,
    PLATFORM_DISCOVERY,
    SEARCH_OPT_IN,
    SEARCH_PROVIDER_SETTING,
    DEFAULT_SEARCH_INTERVAL_SECONDS,
    MAX_SEARCH_INTERVAL_SECONDS,
    MIN_SEARCH_INTERVAL_SECONDS,
    classify_result,
    make_provenance,
    provider_state,
    query_for,
    search_interval_seconds,
    source_min_interval,
    source_name,
    source_specs,
    validate_provenance,
)
from ai_model.awareness.sources import platform_search, profile_source_status
from ai_model.awareness.test_engine import MemoryStore
from ai_model.platform_optimization import ALIASES, PLATFORMS


class PlatformDiscoveryTests(unittest.TestCase):
    def test_registry_is_exact_and_aliases_are_canonical(self):
        self.assertEqual(set(PLATFORM_DISCOVERY), set(PLATFORMS))
        self.assertEqual(ALIASES["twitter"], "x")
        self.assertEqual(source_name("exa", "twitter"), "platform_discovery_exa_x")

    def test_search_is_disabled_without_explicit_opt_in(self):
        env = {"EXA_API_KEY": "fixture", "TAVILY_API_KEY": "fixture"}
        self.assertFalse(provider_state(env)["enabled"])
        self.assertEqual(source_specs(env), {})

    def test_explicit_provider_opt_in_registers_one_source_per_platform(self):
        env = {
            "EXA_API_KEY": "fixture",
            "TAVILY_API_KEY": "fixture",
            SEARCH_OPT_IN: "1",
            SEARCH_PROVIDER_SETTING: "tavily",
        }
        configured = source_specs(env)
        self.assertEqual(len(configured), 8)
        self.assertEqual(
            set(configured),
            {source_name("tavily", platform) for platform in PLATFORMS},
        )
        self.assertEqual(
            {platform for platform in PLATFORMS
             if source_name("tavily", platform) in configured},
            set(PLATFORMS),
        )
        self.assertTrue(all(row[0] == "social" for row in configured.values()))
        self.assertTrue(all(row[1] == "https://api.tavily.com/search"
                            for row in configured.values()))

    def test_query_uses_a_rolling_window_without_a_frozen_year(self):
        instant = datetime(2027, 2, 3, 12, tzinfo=timezone.utc)
        query, since = query_for("x", instant)
        self.assertEqual((instant - since).days, FRESHNESS_WINDOW_DAYS)
        self.assertIn("after:2027-01-27", query)
        self.assertIn("music marketing", query)
        self.assertNotIn("2026", query)

    def test_url_classification_keeps_platform_and_independent_evidence_distinct(self):
        self.assertEqual(
            classify_result("twitter", "https://x.com/artist/status/123"),
            ("index_snippet", "platform_origin_search_index"),
        )
        self.assertEqual(
            classify_result("instagram", "https://news.example.org/music-update"),
            ("third_party_search", "third_party_search_index"),
        )
        self.assertIsNone(classify_result("instagram", "https://instagram.com/artist/"))
        self.assertIsNone(classify_result("facebook", "http://facebook.com/artist/posts/1"))
        self.assertIsNone(classify_result("tiktok", "https://127.0.0.1/@artist/video/123"))
        self.assertIsNone(classify_result("youtube", "https://youtube.com.evil.test/watch"))

    def test_all_eight_platform_content_paths_are_registered(self):
        examples = {
            "facebook": "https://www.facebook.com/artist/posts/123",
            "instagram": "https://www.instagram.com/p/Abc123/",
            "x": "https://x.com/artist/status/123",
            "youtube": "https://www.youtube.com/watch?v=abcdefghijk",
            "tiktok": "https://www.tiktok.com/@artist/video/123",
            "linkedin": "https://www.linkedin.com/posts/artist_music-activity-123",
            "threads": "https://www.threads.net/@artist/post/123",
            "google_business": "https://www.google.com/maps/place/Music+Venue",
        }
        self.assertEqual(set(examples), set(PLATFORMS))
        self.assertEqual(PLATFORM_DISCOVERY["facebook"]["network_group"], "meta")
        self.assertEqual(PLATFORM_DISCOVERY["instagram"]["network_group"], "meta")
        self.assertEqual(PLATFORM_DISCOVERY["threads"]["network_group"], "meta")
        self.assertIsNone(
            classify_result("facebook", "https://www.instagram.com/p/Abc123/")
        )
        for platform, url in examples.items():
            with self.subTest(platform=platform):
                self.assertEqual(
                    classify_result(platform, url),
                    ("index_snippet", "platform_origin_search_index"),
                )

    def test_stale_indexed_content_cannot_enter_live_awareness(self):
        from datetime import timedelta

        observed = time.time()
        published = (
            datetime.fromtimestamp(observed, timezone.utc) - timedelta(days=30)
        ).isoformat()
        provenance = make_provenance(
            platform="facebook",
            retrieval_method="index_snippet",
            source_type="platform_origin_search_index",
            provider="exa",
            query="music trends",
            source_url="https://www.facebook.com/artist/posts/123",
            content="A stale public music item",
            original_published_at=published,
            search_relevance=0.7,
        )
        with self.assertRaisesRegex(ValueError, "stale_discovery_provenance"):
            validate_provenance(
                provenance,
                source="platform_discovery_exa_facebook",
                citation="https://www.facebook.com/artist/posts/123",
                observed_at=observed,
            )

    def test_provider_search_interval_is_bounded_and_not_applied_to_free_feeds(self):
        configured = provider_state({"EXA_API_KEY": "fixture-only"})
        self.assertTrue(configured["provider_available"])
        self.assertEqual(configured["configured_provider"], "exa")
        self.assertFalse(configured["enabled"])
        self.assertEqual(
            search_interval_seconds({}),
            DEFAULT_SEARCH_INTERVAL_SECONDS,
        )
        self.assertEqual(source_min_interval("exa_music", {}), DEFAULT_SEARCH_INTERVAL_SECONDS)
        self.assertEqual(source_min_interval("platform_discovery_exa_x", {}),
                         DEFAULT_SEARCH_INTERVAL_SECONDS)
        self.assertEqual(source_min_interval("youtube_feed", {}), 0)
        self.assertEqual(
            search_interval_seconds({"MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS": "1"}),
            MIN_SEARCH_INTERVAL_SECONDS,
        )
        self.assertEqual(
            search_interval_seconds({
                "MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS": str(MAX_SEARCH_INTERVAL_SECONDS * 2)
            }),
            MAX_SEARCH_INTERVAL_SECONDS,
        )
        for failures in range(1, 10):
            base = min(3600, 30 * (2 ** min(failures, 7)))
            delay = _retry_delay("source-a", failures)
            self.assertGreaterEqual(delay, base * 0.8)
            self.assertLessEqual(delay, base)
        self.assertEqual(_retry_delay("source-a", 2), _retry_delay("source-a", 2))
        self.assertNotEqual(_retry_delay("source-a", 2), _retry_delay("source-b", 2))

    def test_provider_search_is_bounded_temporal_and_provenance_labeled(self):
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        response_body = {
            "results": [
                {
                    "title": "New independent music release",
                    "content": "A public music creator shared a new release and short performance.",
                    "url": "https://www.instagram.com/p/Abc123/",
                    "published_date": now,
                    "score": 0.82,
                },
                {
                    "title": "Industry report on music creators",
                    "content": "An independent report describes current creator marketing trends.",
                    "url": "https://news.example.org/music-creators",
                    "published_date": now,
                    "score": 0.71,
                },
                {
                    "title": "Not a post path",
                    "content": "This is not an eligible Instagram content URL.",
                    "url": "https://instagram.com/artist/",
                    "published_date": now,
                    "score": 0.99,
                },
                {
                    "title": "Too old",
                    "content": "A dated result outside the freshness window.",
                    "url": "https://www.instagram.com/p/Old123/",
                    "published_date": "2020-01-01T00:00:00Z",
                    "score": 0.99,
                },
            ]
        }
        env = {
            "TAVILY_API_KEY": "fixture-never-displayed",
            SEARCH_OPT_IN: "1",
            SEARCH_PROVIDER_SETTING: "tavily",
        }
        with patch.dict("os.environ", env, clear=True):
            with patch(
                "trusted_http.request",
                return_value=SimpleNamespace(
                    status=200, body=json.dumps(response_body).encode()
                ),
            ) as request:
                rows = platform_search("tavily", "instagram")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["discovery"]["retrieval_method"], "index_snippet")
        self.assertEqual(rows[0]["discovery"]["source_type"],
                         "platform_origin_search_index")
        self.assertEqual(rows[1]["discovery"]["retrieval_method"],
                         "third_party_search")
        self.assertEqual(rows[1]["discovery"]["source_type"],
                         "third_party_search_index")
        self.assertIsNone(rows[1]["discovery"]["platform"])
        self.assertEqual(rows[1]["discovery"]["platform_scope"], "instagram")
        for row in rows:
            self.assertFalse(row["discovery"]["training_eligible"])
            self.assertEqual(row["discovery"]["reuse_rights"], "unknown")
            self.assertNotIn("engagement", row["metric"])
        from ai_model.gpu.awareness_kernels import rank_signals
        source = source_name("tavily", "instagram")
        engine = Engine(
            sources={source: ("social", "https://api.tavily.com/search", lambda: rows)}
        )
        engine._health[source] = {}
        normalized = engine._normalize_source_records(
            source, rows, time.time(), rank_signals
        )
        self.assertEqual(len(normalized), 2)
        self.assertEqual(normalized[1]["discovery"]["platform"], None)
        self.assertEqual(
            normalized[1]["discovery"]["platform_scope"], "instagram"
        )
        sent = json.loads(request.call_args.kwargs["body"])
        self.assertEqual(sent["time_range"], "week")
        self.assertEqual(sent["max_results"], 5)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.args[1], "https://api.tavily.com/search")
        self.assertNotIn("fixture-never-displayed", repr(rows))

    def test_search_results_deduplicate_content_hashes_across_distinct_urls(self):
        response_body = {
            "results": [
                {
                    "title": "Music creator shares a new independent release",
                    "content": "A public performance accompanies the new music release.",
                    "url": "https://www.facebook.com/artist/posts/123",
                },
                {
                    "title": "Music creator shares a new independent release",
                    "content": "A public performance accompanies the new music release.",
                    "url": "https://www.facebook.com/artist/videos/456",
                },
            ]
        }
        env = {
            "EXA_API_KEY": "fixture-never-displayed",
            SEARCH_OPT_IN: "1",
            SEARCH_PROVIDER_SETTING: "exa",
        }
        with patch.dict("os.environ", env, clear=True):
            with patch(
                "trusted_http.request",
                return_value=SimpleNamespace(
                    status=200, body=json.dumps(response_body).encode()
                ),
            ):
                rows = platform_search("exa", "facebook")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["citation"], "https://www.facebook.com/artist/posts/123")
        self.assertEqual(len(rows[0]["discovery"]["content_hash"]), 64)

    def test_search_provider_denial_is_explicit_and_secret_free(self):
        from ai_model.native_analysis.safe_http import SafeHTTPError
        for code in (403, 429):
            env = {
                "EXA_API_KEY": "private-fixture",
                SEARCH_OPT_IN: "1",
                SEARCH_PROVIDER_SETTING: "exa",
            }
            with self.subTest(status=code), patch.dict("os.environ", env, clear=True):
                with patch(
                    "trusted_http.request",
                    return_value=SimpleNamespace(status=code, body=b""),
                ):
                    with self.assertRaises(SafeHTTPError) as caught:
                        platform_search("exa", "facebook")
            self.assertIn(str(code), str(caught.exception))
            self.assertNotIn("private-fixture", str(caught.exception))

    def test_empty_provider_result_is_a_successful_scan_not_a_fake_observation(self):
        env = {
            "EXA_API_KEY": "fixture",
            SEARCH_OPT_IN: "1",
            SEARCH_PROVIDER_SETTING: "exa",
        }
        with patch.dict("os.environ", env, clear=True):
            with patch(
                "trusted_http.request",
                return_value=SimpleNamespace(
                    status=200, body=b'{"results":[]}'
                ),
            ):
                rows = platform_search("exa", "facebook")
        self.assertEqual(rows, [])
        self.assertEqual(rows.scan_state, "no_results")

    def test_engine_records_empty_scan_as_healthy_without_fabricating_content(self):
        source = "platform_discovery_exa_facebook"
        engine = Engine(
            sources={
                source: (
                    "social", "https://api.exa.ai/search",
                    lambda: DiscoveryRows([], scan_state="no_results"),
                ),
                "fixture_music": (
                    "music", "https://example.org/music",
                    lambda: [{
                        "text": "A current music industry announcement",
                        "citation": "https://example.org/music",
                        "value": 1,
                        "metric": "fixture_presence",
                    }],
                ),
            },
            store=MemoryStore(),
            timeout=2,
        )
        engine.refresh()
        status = engine.status()["latest_scan_health"][source]
        self.assertTrue(status["ok"])
        self.assertEqual(status["discovery_scan_state"], "no_results")
        self.assertEqual(status["discovery_observation_count"], 0)
        snapshot_status = engine.current_snapshot().to_dict()["source_health"][source]
        self.assertTrue(snapshot_status["ok"])
        self.assertEqual(snapshot_status["discovery_observation_count"], 0)

    def test_provider_search_quota_survives_engine_recreation(self):
        from ai_model.gpu.awareness_kernels import rank_signals

        now = time.time()
        name = "exa_music"
        source = (
            "music", "https://api.exa.ai/search",
            lambda: self.fail("search should be deferred"),
        )
        store = MemoryStore()
        first = Engine(sources={name: source}, store=store, clock=lambda: now)
        first._health[name] = {}
        rows = first._normalize_source_records(
            name,
            [{
                "text": "A fresh independent music industry report",
                "citation": "https://news.example.org/music",
                "value": 0.8,
                "metric": "search_index_relevance",
            }],
            now,
            rank_signals,
        )
        first._store_source_observations(
            name, "music", rows, attempt_at=now, scan_state="observed"
        )

        restored = Engine(sources={name: source}, store=store, clock=lambda: now + 30)
        results = {}
        with patch.dict(
            "os.environ",
            {"MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS": "3600"},
            clear=True,
        ):
            self.assertTrue(restored._defer_interval_source(name, now + 30, results))
        self.assertEqual(results[name][0]["observed_at"], now)
        self.assertEqual(restored._health[name]["schedule_state"], "interval_deferred")
        self.assertEqual(restored._health[name]["next_scan_at"], now + 3600)

        interrupted = Engine(sources={name: source}, store=store, clock=lambda: now + 40)
        interrupted._store_source_observations(
            name, "music", [], attempt_at=now + 40, scan_state="attempting"
        )
        restarted = Engine(sources={name: source}, store=store, clock=lambda: now + 50)
        results = {}
        with patch.dict(
            "os.environ",
            {"MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS": "3600"},
            clear=True,
        ):
            self.assertTrue(restarted._defer_interval_source(name, now + 50, results))
        self.assertEqual(results, {})
        self.assertEqual(
            restarted._health[name]["last_attempt_outcome"], "interrupted"
        )
        self.assertFalse(restarted._health[name]["ok"])

    def test_deferred_no_result_scan_does_not_serve_expired_rows(self):
        from ai_model.gpu.awareness_kernels import rank_signals

        now = time.time()
        name = "platform_discovery_exa_facebook"
        source = (
            "social", "https://api.exa.ai/search", lambda: [],
        )
        store = MemoryStore()
        engine = Engine(sources={name: source}, store=store, clock=lambda: now)
        engine._health[name] = {}
        rows = engine._normalize_source_records(
            name,
            [{
                "text": "A recent indexed music creator result",
                "citation": "https://www.facebook.com/artist/posts/123",
                "value": 0.7,
                "metric": "search_index_relevance",
                "discovery": make_provenance(
                    platform="facebook",
                    retrieval_method="index_snippet",
                    source_type="platform_origin_search_index",
                    provider="exa",
                    query="music creators",
                    source_url="https://www.facebook.com/artist/posts/123",
                    content="A recent indexed music creator result",
                    search_relevance=0.7,
                ),
            }],
            now,
            rank_signals,
        )
        engine._store_source_observations(
            name, "social", rows, attempt_at=now, scan_state="observed"
        )
        second_scan = Engine(
            sources={name: source}, store=store, clock=lambda: now + 200
        )
        second_scan._store_source_observations(
            name, "social", [], attempt_at=now + 200, scan_state="no_results"
        )
        restarted = Engine(sources={name: source}, store=store, clock=lambda: now + 3700)
        restarted._health[name] = {
            "ok": True,
            "domain": "social",
            "url": "https://api.exa.ai/search",
            "observed_at": now + 200,
            "discovery_observation_count": 0,
            "platform_origin_observation_count": 0,
            "third_party_search_result_count": 0,
            "discovery_scan_state": "no_results",
            "discovery_freshness_state": "unavailable",
        }
        results = {}
        with patch.dict(
            "os.environ",
            {"MAXCORE_AWARENESS_SEARCH_INTERVAL_SECONDS": "3600"},
            clear=True,
        ):
            self.assertTrue(
                restarted._defer_interval_source(name, now + 3700, results)
            )
        self.assertEqual(results, {})
        self.assertEqual(
            restarted._health[name]["discovery_scan_state"],
            "no_results",
        )
        self.assertEqual(restarted._health[name]["discovery_observation_count"], 0)
        self.assertEqual(
            restarted._health[name]["discovery_freshness_state"], "unavailable"
        )

    def test_admin_matrix_distinguishes_configured_search_from_real_ingestion(self):
        observed = time.time()
        provider = "tavily"
        name = source_name(provider, "tiktok")
        health = {
            name: {
                "ok": True,
                "observed_at": observed,
                "discovery_observation_count": 3,
                "discovery_scan_state": "observed",
                "discovery_freshness_state": "fresh",
            }
        }
        env = {
            "TAVILY_API_KEY": "fixture-do-not-return",
            SEARCH_OPT_IN: "1",
            SEARCH_PROVIDER_SETTING: provider,
        }
        with patch.dict("os.environ", env, clear=True):
            result = profile_source_status(health)["platforms"]
        self.assertEqual(result["tiktok"]["status"], "search_index_configured")
        self.assertEqual(result["tiktok"]["ingestion_state"], "available")
        self.assertEqual(result["tiktok"]["observation_count"], 3)
        self.assertEqual(result["tiktok"]["freshness_state"], "fresh")
        self.assertEqual(
            result["tiktok"]["search_provider_query_status"], "last_query_succeeded"
        )
        self.assertEqual(result["tiktok"]["search_provider_last_query_at"], observed)
        self.assertEqual(
            result["facebook"]["search_provider_query_status"],
            "configured_not_live_verified",
        )
        third_party_only = {
            name: {
                "ok": True,
                "observed_at": observed,
                "discovery_observation_count": 1,
                "platform_origin_observation_count": 0,
                "third_party_search_result_count": 1,
                "discovery_scan_state": "third_party_only",
            }
        }
        with patch.dict("os.environ", env, clear=True):
            third_party_status = profile_source_status(third_party_only)["platforms"]
        self.assertEqual(third_party_status["tiktok"]["observation_count"], 0)
        self.assertEqual(third_party_status["tiktok"]["ingestion_state"], "third_party_only")
        self.assertEqual(
            result["tiktok"]["direct_fetch_policy"],
            "disabled_until_terms_and_robots_review",
        )
        self.assertFalse(result["tiktok"]["training_eligibility"]["eligible"])
        self.assertNotIn("fixture-do-not-return", repr(result))
        self.assertEqual(result["facebook"]["ingestion_state"], "not_scanned")

    def test_admin_source_status_route_requires_admin_authentication(self):
        from fastapi import HTTPException
        import server

        route = next(
            row for row in server.app.routes
            if getattr(row, "path", None)
            == "/api/awareness/unified/admin/source-status"
        )
        self.assertIn(
            server.verify_admin,
            [dependency.call for dependency in route.dependant.dependencies],
        )
        with self.assertRaises(HTTPException) as caught:
            server.verify_admin(x_admin_key=None, authorization=None)
        self.assertEqual(caught.exception.status_code, 401)

    def test_discovery_provenance_survives_snapshot_but_never_enters_training(self):
        now = time.time()
        name = "platform_discovery_exa_instagram"
        cite = "https://www.instagram.com/p/Abc123/"
        provenance = make_provenance(
            platform="instagram",
            retrieval_method="index_snippet",
            source_type="platform_origin_search_index",
            provider="exa",
            query="instagram music artist recent",
            source_url=cite,
            content="Public artist announced a new single and short performance",
            original_published_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            search_relevance=0.8,
        )
        store = MemoryStore()
        engine = Engine(
            sources={name: ("social", "https://api.exa.ai/search", lambda: [])},
            store=store,
        )
        engine._health[name] = {}
        rows = engine._normalize_source_records(
            name,
            [{
                "text": "Public artist announced a new single and short performance",
                "citation": cite,
                "value": 0.8,
                "metric": "search_index_relevance",
                "discovery": provenance,
            }],
            now,
            __import__("ai_model.gpu.awareness_kernels", fromlist=["rank_signals"]).rank_signals,
        )
        self.assertEqual(len(rows), 1)
        engine._store_source_observations(name, "social", rows)
        persisted = validate_source_observation_document(
            store.get("awareness:v1:source-observations:" + name),
            name, "social", now,
        )
        self.assertFalse(persisted[0]["discovery"]["training_eligible"])
        discovery_metadata = persisted[0]["discovery"]
        self.assertEqual(discovery_metadata["source_attribution_confidence"], "medium")
        self.assertEqual(discovery_metadata["region"], "unspecified")
        self.assertEqual(discovery_metadata["genre"], "unclassified")
        self.assertEqual(discovery_metadata["expires_at"], now + 3600)
        self.assertEqual(discovery_metadata["redaction_policy"],
                         "contact_details_removed_max_500_chars")
        self.assertEqual(
            discovery_metadata["content_hash"],
            hashlib.sha256(
                "public artist announced a new single and short performance".encode()
            ).hexdigest(),
        )
        training = engine.training_observations()
        self.assertEqual(training["records"], [])
        tampered = store.get("awareness:v1:source-observations:" + name)
        tampered["records"][0]["discovery"]["training_eligible"] = True
        tampered.pop("id")
        tampered["id"] = hashlib.sha256(canonical(tampered).encode()).hexdigest()
        from ai_model.awareness.engine import AwarenessUnavailable
        with self.assertRaises(AwarenessUnavailable):
            validate_source_observation_document(tampered, name, "social", now)
        tampered_text = json.loads(json.dumps(store.get(
            "awareness:v1:source-observations:" + name
        )))
        replacement_text = "A different indexed music announcement"
        tampered_text["records"][0]["text"] = replacement_text
        tampered_text["records"][0]["id"] = hashlib.sha256(canonical([
            name, cite, replacement_text,
        ]).encode()).hexdigest()
        tampered_text.pop("id")
        tampered_text["id"] = hashlib.sha256(canonical(tampered_text).encode()).hexdigest()
        with self.assertRaises(AwarenessUnavailable):
            validate_source_observation_document(tampered_text, name, "social", now)

        record = {**rows[0], "score": 0.8}
        domains = {domain: [] for domain in DOMAINS}
        domains["social"] = [record]
        source_health = {
            name: {"ok": True, "domain": "social", "observed_at": now}
        }
        payload = {
            "schema": 1,
            "created_at": now,
            "expires_at": now + 60,
            "domains": domains,
            "source_health": source_health,
            "ranking": "digital_gpu_awareness_software:v1;stable-id-ties;seed=0",
        }
        payload["id"] = hashlib.sha256(canonical(payload).encode()).hexdigest()
        snapshot = Snapshot.parse(payload, now + 1)
        context = json.loads(conditioning(snapshot, "instagram", "text").split("\n", 1)[1])
        metadata = context["observations"]["social"][0]["discovery"]
        self.assertEqual(metadata["platform"], "instagram")
        self.assertEqual(metadata["retrieval_method"], "index_snippet")
        self.assertFalse(metadata["training_eligible"])

    def test_legacy_search_provider_text_is_not_training_data_without_rights(self):
        from ai_model.gpu.awareness_kernels import rank_signals

        now = time.time()
        name = "tavily_social_landscape_hashtags"
        store = MemoryStore()
        engine = Engine(
            sources={name: ("social", "https://api.tavily.com/search", lambda: [])},
            store=store,
            clock=lambda: now,
        )
        engine._health[name] = {}
        rows = engine._normalize_source_records(
            name,
            [{
                "text": "Public search result with no documented training rights",
                "citation": "https://news.example.org/music",
                "value": 0.5,
                "metric": "search_result_presence",
            }],
            now,
            rank_signals,
        )
        engine._store_source_observations(name, "social", rows)
        self.assertEqual(engine.training_observations()["records"], [])


if __name__ == "__main__":
    unittest.main()
