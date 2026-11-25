"""Policy and transport bounds for the native awareness source downloader."""

import unittest
import time
from unittest.mock import patch

from ai_model.awareness.native_downloader import (
    MAX_SOURCE_REDIRECTS,
    MAX_SOURCE_BYTES,
    SOURCE_DEADLINE_SECONDS,
    download_registered_source,
    source_outcome,
    source_registry,
    validate_source_registry,
)
from ai_model.awareness.platform_discovery import PLATFORM_RIGHTS_POLICIES
from ai_model.awareness.public_access import NATIVE_CRAWL_POLICIES
from ai_model.native_analysis.safe_http import (
    FetchResult,
    ResponseTooLarge,
    SafeHTTPError,
)
from ai_model.platform_optimization import PLATFORMS


class NativeDownloaderTests(unittest.TestCase):
    def test_registry_covers_eight_canonical_platforms_without_unapproved_sources(self):
        registry = source_registry()
        self.assertEqual(set(registry), set(PLATFORMS))
        youtube_ids = [source["id"] for source in registry["youtube"]]
        self.assertEqual(len(youtube_ids), len(set(youtube_ids)))
        self.assertTrue(registry["youtube"])
        for platform in set(PLATFORMS) - {"youtube"}:
            self.assertEqual(registry[platform], ())

    def test_all_eight_platforms_report_policy_block_without_fake_attempts(self):
        for platform in PLATFORMS:
            with self.subTest(platform=platform):
                result = source_outcome(platform)
                self.assertFalse(result["authorized"])
                self.assertEqual(result["authorized_source_count"], 0)
                self.assertEqual(result["policy_outcome"], "blocked")
                self.assertEqual(result["last_attempt_outcome"], "not_attempted")
                self.assertEqual(result["request_state"], "not_attempted")
                self.assertFalse(result["training_eligible"])

    def test_scheduled_youtube_policy_denial_is_reported_as_blocked(self):
        source = source_registry()["youtube"][0]
        result = source_outcome("youtube", {
            source["id"]: {
                "ok": False,
                "failure_class": "terms_review_required",
                "observed_at": 1234,
            },
        })
        self.assertEqual(result["last_attempt_outcome"], "blocked")
        self.assertEqual(result["last_attempt_at"], 1234)
        self.assertEqual(result["request_state"], "blocked_before_request")
        self.assertEqual(result["first_party_observation_count"], 0)

    def test_blocked_youtube_feed_does_not_request_robots_or_content(self):
        source = source_registry()["youtube"][0]

        def fetcher(*args, **kwargs):
            self.fail("blocked source must not start an HTTP request")

        with patch(
            "ai_model.awareness.public_access.assert_platform_feed_access",
            side_effect=AssertionError("blocked before access probing"),
        ):
            with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                download_registered_source(
                    "youtube", source["id"], source["url"], fetcher=fetcher,
                )

    def test_unregistered_and_malformed_urls_are_rejected_before_authorization(self):
        source = source_registry()["youtube"][0]
        for platform, source_id, url in (
            ("youtube", source["id"], "http://127.0.0.1/feed"),
            ("youtube", "youtube_unregistered", source["url"]),
            ("instagram", source["id"], source["url"]),
        ):
            with self.subTest(url=url, source=source_id):
                with self.assertRaisesRegex(SafeHTTPError, "not registered"):
                    download_registered_source(platform, source_id, url)

    def test_registry_rejects_unsafe_or_noncanonical_endpoints(self):
        registry = {key: list(value) for key, value in source_registry().items()}
        registry["youtube"][0] = {
            **registry["youtube"][0],
            "url": "https://youtube.com.evil.test/feeds/videos.xml?user=music",
        }
        with self.assertRaisesRegex(RuntimeError, "native_source_registry_invalid"):
            validate_source_registry(registry)

    def test_authorized_fixture_fetch_uses_native_http_limits_and_no_redirects(self):
        source = source_registry()["youtube"][0]
        body = b"<feed/>"
        calls = []

        def fetcher(url, **kwargs):
            calls.append((url, kwargs))
            return body, FetchResult(url, "application/atom+xml", len(body))

        with (
            patch(
                "ai_model.awareness.public_access._platform_authorized",
                return_value=True,
            ),
            patch(
                "ai_model.awareness.public_access.assert_platform_feed_access",
            ) as access_check,
        ):
            self.assertEqual(
                download_registered_source(
                    "youtube", source["id"], source["url"], fetcher=fetcher,
                ),
                body,
            )
        access_check.assert_called_once_with("youtube", source["url"])
        self.assertEqual(len(calls), 1)
        url, options = calls[0]
        self.assertEqual(url, source["url"])
        self.assertEqual(options["max_bytes"], MAX_SOURCE_BYTES)
        self.assertEqual(options["deadline_seconds"], SOURCE_DEADLINE_SECONDS)
        self.assertEqual(options["max_redirects"], MAX_SOURCE_REDIRECTS)
        self.assertEqual(MAX_SOURCE_REDIRECTS, 0)
        self.assertIn("application/atom+xml", options["allowed_content_types"])

    def test_redirect_and_oversize_results_are_rejected_without_fallback(self):
        source = source_registry()["youtube"][0]
        with (
            patch(
                "ai_model.awareness.public_access._platform_authorized",
                return_value=True,
            ),
            patch("ai_model.awareness.public_access.assert_platform_feed_access"),
        ):
            with self.assertRaisesRegex(SafeHTTPError, "origin changed"):
                download_registered_source(
                    "youtube",
                    source["id"],
                    source["url"],
                    fetcher=lambda url, **kwargs: (
                        b"<feed/>",
                        FetchResult(
                            "https://www.youtube.com.evil.test/feeds/videos.xml",
                            "application/atom+xml",
                            7,
                        ),
                    ),
                )
            with self.assertRaises(ResponseTooLarge):
                download_registered_source(
                    "youtube", source["id"], source["url"],
                    fetcher=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                        ResponseTooLarge("fixture exceeds bounded response")
                    ),
                )

    def test_policy_authorization_requires_both_policy_and_rights_evidence(self):
        access = NATIVE_CRAWL_POLICIES["youtube"]
        rights = PLATFORM_RIGHTS_POLICIES["youtube"]
        self.assertEqual(access["state"], "blocked")
        self.assertIsNone(access["authorization_record"])
        self.assertNotEqual(rights["direct_collection"], "approved_source_access")

    def test_authorization_for_one_feed_does_not_enable_another_registered_feed(self):
        sources = source_registry()["youtube"]
        self.assertGreaterEqual(len(sources), 2)
        now = time.time()
        record = {
            "authorization_id": "scoped-review",
            "source_ids": [sources[0]["id"]],
            "approved_at": now - 1,
            "expires_at": now + 3600,
        }

        with (
            patch.dict(
                NATIVE_CRAWL_POLICIES["youtube"],
                {"state": "authorized", "authorization_record": record},
            ),
            patch.dict(
                PLATFORM_RIGHTS_POLICIES["youtube"],
                {"direct_collection": "approved_source_access"},
            ),
        ):
            with self.assertRaisesRegex(SafeHTTPError, "terms review required"):
                download_registered_source(
                    "youtube",
                    sources[1]["id"],
                    sources[1]["url"],
                    fetcher=lambda *_args, **_kwargs: self.fail(
                        "source not covered by approval must not be fetched"
                    ),
                )


if __name__ == "__main__":
    unittest.main()
