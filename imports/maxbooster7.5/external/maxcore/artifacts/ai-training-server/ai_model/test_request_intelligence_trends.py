import unittest

from ai_model.request_intelligence import (
    _trend_relevance_bonus,
    build_brief,
    score_candidate,
)


def _brief_with_trends():
    return build_brief(
        modality="text",
        platform="instagram",
        topic="Midnight Voltage release",
        artist="B-Lawz",
        genre="trap",
        awareness="TRENDS: Trending trending hashtags on tiktok: #newmusicalert #trapbeats\n",
    )


def _brief_without_trends():
    return build_brief(
        modality="text",
        platform="instagram",
        topic="Midnight Voltage release",
        artist="B-Lawz",
        genre="trap",
    )


class TrendBonusTests(unittest.TestCase):
    def test_trends_fold_into_directives(self):
        brief = _brief_with_trends()
        joined = " ".join(brief.directives).lower()
        self.assertIn("live chart signals", joined)
        self.assertIn("#newmusicalert", joined)

    def test_bonus_scales_with_hits(self):
        brief = _brief_with_trends()
        self.assertEqual(_trend_relevance_bonus("stream it #newmusicalert", brief), 1.5)
        self.assertEqual(_trend_relevance_bonus("stream #newmusicalert #trapbeats", brief), 3.0)
        self.assertEqual(_trend_relevance_bonus("stream it now", brief), 0.0)

    def test_generic_single_words_do_not_false_positive(self):
        # "session" appears in ordinary copy; only the distinctive bigram
        # "studio session" (or a hashtag) may trigger the bonus.
        brief = build_brief(
            modality="text", platform="tiktok", topic="clip",
            awareness="TRENDS: Trending viral formats on tiktok: "
                      "POV studio session transition\n",
        )
        self.assertEqual(
            _trend_relevance_bonus("three sessions in the studio today", brief), 0.0)
        # Overlapping distinctive bigrams stack: "pov studio" + "studio session"
        # + "session transition" = 4.5.
        self.assertEqual(
            _trend_relevance_bonus("a pov studio session transition", brief), 4.5)

    def test_bonus_capped_at_five(self):
        brief = build_brief(
            modality="text", platform="instagram", topic="release",
            awareness="TRENDS: Trending trending hashtags on instagram: "
                      "#newmusic #trendingreels #newmusicfriday #rapmusic #edm\n",
        )
        stacked = "#newmusic #trendingreels #newmusicfriday #rapmusic #edm"
        self.assertEqual(_trend_relevance_bonus(stacked, brief), 5.0)

    def test_no_bonus_without_trend_directives(self):
        brief = _brief_without_trends()
        self.assertEqual(_trend_relevance_bonus("stream #newmusicalert", brief), 0.0)

    def test_score_candidate_applies_bonus(self):
        text = "Stream Midnight Voltage tonight #newmusicalert"
        with_trends = _brief_with_trends()
        without_trends = _brief_without_trends()
        # identical text and identical non-trend components: the delta must
        # equal the helper's bonus exactly.
        delta = (score_candidate(text, with_trends)
                 - score_candidate(text, without_trends))
        self.assertAlmostEqual(
            delta, _trend_relevance_bonus(text.lower(), with_trends), places=6)
        self.assertGreater(delta, 0.0)


if __name__ == "__main__":
    unittest.main()
