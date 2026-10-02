import unittest
from unittest.mock import patch
from ai_model.awareness.sources import APP_RSS, configured_sources, rss


class SourceCoverageTests(unittest.TestCase):
    def test_all_ten_original_feeds_are_retained_without_keys(self):
        with patch.dict("os.environ", {}, clear=True):
            configured = configured_sources()
        self.assertEqual(len(APP_RSS), 10)
        for name, domain, url in APP_RSS:
            self.assertEqual(configured[name][:2], (domain, url))
        self.assertFalse(any(n.startswith(("exa_", "tavily_")) for n in configured))

    def test_inherited_search_credentials_enable_both_providers(self):
        # Fixture credentials never leave the test: only source configuration.
        with patch.dict("os.environ", {"TAVILY_API_KEY": "fixture", "EXA_API_KEY": "fixture"}, clear=True):
            configured = configured_sources()
        for provider in ("tavily", "exa"):
            for domain in ("music", "social", "advertising", "culture"):
                self.assertEqual(configured[provider + "_" + domain][0], domain)

    def test_atom_editorial_feed_is_not_invented_engagement(self):
        xml = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>Fixture story</title><link href="https://example.org/story"/>
        </entry></feed>"""
        with patch("ai_model.awareness.sources.legacy._fetch", return_value=xml):
            rows = rss("https://example.org/feed")
        self.assertEqual(rows[0]["metric"], "editorial_feed_presence")
        self.assertEqual(rows[0]["citation"], "https://example.org/story")

class LandscapeSourceTests(unittest.TestCase):
    def test_landscape_feed_empty_without_endpoint(self):
        from ai_model.awareness.sources import landscape_feed
        with patch.dict("os.environ", {}, clear=True):
            for kind in ("hashtags", "sounds", "formats"):
                self.assertEqual(landscape_feed(kind), [])

    def test_landscape_feed_rejects_unknown_kind(self):
        from ai_model.awareness.sources import landscape_feed
        with patch.dict("os.environ", {"SOCIAL_LANDSCAPE_URL": "https://example.org/t"}, clear=True):
            self.assertEqual(landscape_feed("nope"), [])

    def test_landscape_feed_parses_fixture(self):
        from ai_model.awareness.sources import landscape_feed
        body = b"""{"trends": [
            {"text": "#newmusicalert", "url": "https://example.org/t1", "value": 12400, "platform": "tiktok"},
            {"text": "Sped-up night drive", "url": "", "value": 860, "platform": "instagram"},
            {"text": "", "url": "", "value": 1},
            {"nope": true}
        ]}"""
        with patch.dict("os.environ", {"SOCIAL_LANDSCAPE_URL": "https://example.org/t"}, clear=True):
            with patch("ai_model.awareness.sources.legacy._fetch", return_value=body):
                rows = landscape_feed("hashtags")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["metric"], "platform_trending_hashtag")
        self.assertEqual(rows[0]["text"], "#newmusicalert")
        self.assertEqual(rows[0]["value"], 12400)
        self.assertEqual(rows[1]["text"], "Sped-up night drive")

    def test_landscape_feed_degrades_on_bad_payloads(self):
        from ai_model.awareness.sources import landscape_feed
        with patch.dict("os.environ", {"SOCIAL_LANDSCAPE_URL": "https://example.org/t"}, clear=True):
            for bad in (b"not json", b'{"trends": "oops"}', b'{"nope": []}', b"[]"):
                with patch("ai_model.awareness.sources.legacy._fetch", return_value=bad):
                    self.assertEqual(landscape_feed("sounds"), [], bad)
            with patch("ai_model.awareness.sources.legacy._fetch",
                       side_effect=RuntimeError("fetch failed")):
                self.assertEqual(landscape_feed("formats"), [])

    def test_configured_sources_registers_landscape(self):
        from ai_model.awareness.sources import configured_sources
        env = {"SOCIAL_LANDSCAPE_URL": "https://example.org/t",
               "TAVILY_API_KEY": "fixture"}
        with patch.dict("os.environ", env, clear=True):
            configured = configured_sources()
        for kind in ("hashtags", "sounds", "formats"):
            self.assertEqual(configured[f"landscape_{kind}"][0], "social")
        landscape_search = [n for n in configured if n.startswith("tavily_social_landscape_")]
        self.assertEqual(len(landscape_search), 3)
        self.assertTrue(all(configured[n][0] == "social" for n in landscape_search))

    def test_configured_sources_omits_landscape_without_config(self):
        from ai_model.awareness.sources import configured_sources
        with patch.dict("os.environ", {}, clear=True):
            configured = configured_sources()
        self.assertFalse(any(n.startswith(("landscape_", "tavily_social_landscape_"))
                             for n in configured))

    def test_trends_lines_format(self):
        from ai_model.awareness.sources import trends_lines
        rows = [
            {"text": "#newmusicalert", "metric": "platform_trending_hashtag"},
            {"text": "#trapbeats", "metric": "platform_trending_hashtag"},
            {"text": "Sped-up night drive", "metric": "platform_trending_sound"},
            {"text": "POV transition", "metric": "platform_viral_format"},
            {"text": "", "metric": "platform_trending_hashtag"},
            "not-a-dict",
        ]
        lines = trends_lines(rows, platform="tiktok")
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[0].startswith("TRENDS: Trending trending hashtags on tiktok:"))
        self.assertIn("#newmusicalert", lines[0])
        self.assertIn("Sped-up night drive", lines[1])
        self.assertEqual(trends_lines([]), [])
        self.assertEqual(trends_lines(None), [])
