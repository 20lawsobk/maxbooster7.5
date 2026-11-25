"""Robots and authorization gates for native platform-page access."""

import unittest
import time
from unittest.mock import patch

from ai_model.awareness.public_access import (
    NATIVE_CRAWL_POLICIES,
    assert_platform_feed_access,
    clear_robots_cache_for_tests,
    native_crawl_status,
)
from ai_model.awareness.platform_discovery import (
    PLATFORM_RIGHTS_POLICIES,
    RIGHTS_POLICY_REVIEWED_ON,
    rights_policy_for,
)
from ai_model.native_analysis.safe_http import FetchResult, SafeHTTPError
from ai_model.platform_optimization import PLATFORMS
from workers import quality_harvester


YOUTUBE_FEED_URL = quality_harvester.YOUTUBE_FEEDS[0]["url"]


def youtube_test_authorization():
    now = time.time()
    return {
        "authorization_id": "reviewed-test-record",
        "source_ids": ["youtube_NoCopyrightSounds"],
        "approved_at": now - 1,
        "expires_at": now + 3600,
    }


class PublicAccessTests(unittest.TestCase):
    def setUp(self):
        clear_robots_cache_for_tests()

    def tearDown(self):
        clear_robots_cache_for_tests()

    def test_exact_eight_are_fail_closed_without_authorization(self):
        self.assertEqual(set(NATIVE_CRAWL_POLICIES), set(PLATFORMS))
        self.assertEqual(set(PLATFORM_RIGHTS_POLICIES), set(PLATFORMS))
        for platform in PLATFORMS:
            with self.subTest(platform=platform):
                state = native_crawl_status(platform)
                self.assertFalse(state["authorized"])
                self.assertEqual(state["first_party_observation_count"], 0)
                self.assertIn(
                    state["implementation_state"],
                    {
                        "registered_source_blocked_by_policy",
                        "no_native_source_registered",
                    },
                )
                rights = rights_policy_for(platform)
                self.assertEqual(rights["reviewed_on"], RIGHTS_POLICY_REVIEWED_ON)
                self.assertFalse(rights["training_eligible"])
                self.assertFalse(rights["owner_authorization_sufficient"])
                self.assertEqual(rights["reuse_rights"], "unknown")
                self.assertEqual(
                    rights["awareness_path"],
                    "conditional_search_index_snippet_only",
                )
                self.assertTrue(rights["policy_sources"])
                self.assertEqual(state["policy_sources"], rights["policy_sources"])

    def test_platform_specific_terms_restrictions_are_visible(self):
        self.assertEqual(
            rights_policy_for("x")["platform_training_restriction"],
            "x_api_content_cannot_train_foundation_or_frontier_models",
        )
        self.assertEqual(
            rights_policy_for("twitter")["platform"],
            "x",
        )
        self.assertEqual(
            rights_policy_for("tiktok")["direct_collection"],
            "blocked_without_written_tiktok_approval",
        )
        self.assertEqual(
            rights_policy_for("linkedin")["direct_collection"],
            "blocked_for_automated_scraping",
        )
        self.assertIn(
            "person who created them",
            " ".join(rights_policy_for("threads")["constraints"]),
        )
        self.assertIn(
            "30 calendar days",
            " ".join(rights_policy_for("google_business")["constraints"]),
        )

    def test_youtube_robots_disallow_prevents_feed_access(self):
        body = b"User-agent: *\nDisallow: /feeds/videos.xml\n"
        def fetcher(url, **kwargs):
            self.assertEqual(url, "https://www.youtube.com/robots.txt")
            self.assertEqual(kwargs["max_bytes"], 32 * 1024)
            self.assertEqual(kwargs["max_redirects"], 0)
            return body, FetchResult(url, "text/plain", len(body))

        with (
            patch.dict(
                NATIVE_CRAWL_POLICIES["youtube"],
                {
                    "state": "authorized",
                    "authorization_record": youtube_test_authorization(),
                },
            ),
            patch.dict(
                PLATFORM_RIGHTS_POLICIES["youtube"],
                {"direct_collection": "approved_source_access"},
            ),
            patch.dict("os.environ", {}, clear=True),
        ):
            with self.assertRaisesRegex(SafeHTTPError, "robots policy denied"):
                assert_platform_feed_access(
                    "youtube", YOUTUBE_FEED_URL, fetcher=fetcher,
                )

    def test_robots_allow_is_not_a_terms_or_permission_grant(self):
        body = b"User-agent: *\nAllow: /\n"
        def fetcher(url, **kwargs):
            return body, FetchResult(url, "text/plain", len(body))

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                assert_platform_feed_access(
                    "youtube", YOUTUBE_FEED_URL, fetcher=fetcher,
                )

    def test_robots_network_or_parse_failure_fails_closed(self):
        def fetcher(url, **kwargs):
            raise SafeHTTPError("upstream unavailable")

        with (
            patch.dict(
                NATIVE_CRAWL_POLICIES["youtube"],
                {
                    "state": "authorized",
                    "authorization_record": youtube_test_authorization(),
                },
            ),
            patch.dict(
                PLATFORM_RIGHTS_POLICIES["youtube"],
                {"direct_collection": "approved_source_access"},
            ),
            patch.dict("os.environ", {}, clear=True),
        ):
            with self.assertRaisesRegex(
                SafeHTTPError, "robots policy could not be verified"
            ):
                assert_platform_feed_access(
                    "youtube", YOUTUBE_FEED_URL,
                    fetcher=fetcher,
                )

    def test_wrong_platform_host_is_rejected_before_robots_request(self):
        def fetcher(*args, **kwargs):
            self.fail("robots must not be fetched for a foreign host")

        with self.assertRaisesRegex(SafeHTTPError, "outside the approved public origin"):
            assert_platform_feed_access(
                "youtube", "https://youtube.com.evil.test/feeds/videos.xml",
                fetcher=fetcher,
            )

    def test_invalid_port_is_rejected_without_leaking_parser_errors(self):
        with self.assertRaisesRegex(SafeHTTPError, "platform feed URL is invalid"):
            assert_platform_feed_access(
                "youtube", "https://www.youtube.com:bad/feeds/videos.xml",
            )

    def test_cache_bounds_robots_traffic(self):
        body = b"User-agent: *\nAllow: /\n"
        calls = []
        def fetcher(url, **kwargs):
            calls.append(url)
            return body, FetchResult(url, "text/plain", len(body))

        with (
            patch.dict(
                NATIVE_CRAWL_POLICIES["youtube"],
                {
                    "state": "authorized",
                    "authorization_record": youtube_test_authorization(),
                },
            ),
            patch.dict(
                PLATFORM_RIGHTS_POLICIES["youtube"],
                {"direct_collection": "approved_source_access"},
            ),
            patch.dict("os.environ", {}, clear=True),
        ):
            for _ in range(2):
                assert_platform_feed_access(
                    "youtube", YOUTUBE_FEED_URL, fetcher=fetcher,
                )
        self.assertEqual(calls, ["https://www.youtube.com/robots.txt"])

    def test_current_policy_blocks_feed_before_any_network_request(self):
        def fetcher(*args, **kwargs):
            self.fail("blocked platform policy must prevent all HTTP requests")

        with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
            assert_platform_feed_access(
                "youtube", YOUTUBE_FEED_URL, fetcher=fetcher,
            )

    def test_expired_or_wrong_source_authorization_stays_blocked(self):
        now = time.time()
        invalid_records = (
            {
                "authorization_id": "expired",
                "source_ids": ["youtube_NoCopyrightSounds"],
                "approved_at": now - 7200,
                "expires_at": now - 1,
            },
            {
                "authorization_id": "wrong-scope",
                "source_ids": ["youtube_unregistered"],
                "approved_at": now - 1,
                "expires_at": now + 3600,
            },
        )
        for record in invalid_records:
            with self.subTest(record=record["authorization_id"]), patch.dict(
                NATIVE_CRAWL_POLICIES["youtube"],
                {"state": "authorized", "authorization_record": record},
            ), patch.dict(
                PLATFORM_RIGHTS_POLICIES["youtube"],
                {"direct_collection": "approved_source_access"},
            ):
                with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                    assert_platform_feed_access(
                        "youtube",
                        YOUTUBE_FEED_URL,
                        fetcher=lambda *_args, **_kwargs: self.fail(
                            "invalid source approval must block before HTTP"
                        ),
                    )
                status = native_crawl_status("youtube")
                self.assertEqual(status["state"], "blocked")
                self.assertEqual(
                    status["reason"],
                    "source_authorization_expired"
                    if record["authorization_id"] == "expired"
                    else "source_authorization_record_invalid_or_scope_mismatch",
                )


if __name__ == "__main__":
    unittest.main()
