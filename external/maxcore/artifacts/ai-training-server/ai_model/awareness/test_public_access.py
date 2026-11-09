"""Robots and authorization gates for native platform-page access."""

import unittest
from unittest.mock import patch

from ai_model.awareness.public_access import (
    NATIVE_CRAWL_POLICIES,
    assert_platform_feed_access,
    clear_robots_cache_for_tests,
    native_crawl_status,
)
from ai_model.native_analysis.safe_http import FetchResult, SafeHTTPError
from ai_model.platform_optimization import PLATFORMS


class PublicAccessTests(unittest.TestCase):
    def setUp(self):
        clear_robots_cache_for_tests()

    def tearDown(self):
        clear_robots_cache_for_tests()

    def test_exact_eight_are_fail_closed_without_authorization(self):
        self.assertEqual(set(NATIVE_CRAWL_POLICIES), set(PLATFORMS))
        for platform in PLATFORMS:
            with self.subTest(platform=platform):
                state = native_crawl_status(platform)
                self.assertFalse(state["authorized"])
                self.assertEqual(state["first_party_observation_count"], 0)
                self.assertEqual(state["implementation_state"],
                                 "not_available_without_source_authorization")

    def test_youtube_robots_disallow_prevents_feed_access(self):
        body = b"User-agent: *\nDisallow: /feeds/videos.xml\n"
        def fetcher(url, **kwargs):
            self.assertEqual(url, "https://www.youtube.com/robots.txt")
            self.assertEqual(kwargs["max_bytes"], 32 * 1024)
            self.assertEqual(kwargs["max_redirects"], 0)
            return body, FetchResult(url, "text/plain", len(body))

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(SafeHTTPError, "robots policy denied"):
                assert_platform_feed_access(
                    "youtube",
                    "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
                    fetcher=fetcher,
                )

    def test_robots_allow_is_not_a_terms_or_permission_grant(self):
        body = b"User-agent: *\nAllow: /\n"
        def fetcher(url, **kwargs):
            return body, FetchResult(url, "text/plain", len(body))

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                assert_platform_feed_access(
                    "youtube",
                    "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
                    fetcher=fetcher,
                )

    def test_robots_network_or_parse_failure_fails_closed(self):
        def fetcher(url, **kwargs):
            raise SafeHTTPError("upstream unavailable")

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(SafeHTTPError, "robots policy could not be verified"):
                assert_platform_feed_access(
                    "youtube",
                    "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
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

        with patch.dict("os.environ", {}, clear=True):
            for _ in range(2):
                with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                    assert_platform_feed_access(
                        "youtube",
                        "https://www.youtube.com/feeds/videos.xml?channel_id=UC123",
                        fetcher=fetcher,
                    )
        self.assertEqual(calls, ["https://www.youtube.com/robots.txt"])


if __name__ == "__main__":
    unittest.main()
