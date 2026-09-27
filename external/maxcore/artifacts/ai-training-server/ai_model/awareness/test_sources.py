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