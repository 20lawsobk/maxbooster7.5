import unittest

from ai_model.request_intelligence import (
    build_brief, compose_caption, score_candidate,
    _ask_count, _clean_topic, _HOOK_HISTORY,
    _hook_diversity_penalty, _record_hook,
)


def _brief(**kw):
    base = dict(modality="text", platform="instagram",
                topic="Midnight Voltage teaser clip",
                goal="drive_engagement", genre="trap", artist="B-Lawz",
                track="Midnight Voltage",
                themes=["midnight", "voltage", "trap"])
    base.update(kw)
    return build_brief(**base)


class ArcAwareLengthTests(unittest.TestCase):
    def test_three_act_body_not_penalized(self):
        brief = _brief()
        # A genuine HVC 3-act body (~110 words): hook tension, value build,
        # payoff CTA. Exceeds the short window but must not lose to a
        # thin one-liner on length.
        three_act = (
            "Nobody tells you what the last year cost 🔥\n\n"
            "Late nights in the studio, scrapped verses, 3am doubts — every "
            "second went into Midnight Voltage. This is the most honest trap "
            "record B-Lawz has ever made, and you can hear it in every bar. "
            "The 808s hit harder because they mean something. When the beat "
            "drops, everything makes sense and the whole room feels it.\n\n"
            "Stream Midnight Voltage now — link in bio 👇 Tag someone who "
            "needs to hear this.")
        one_liner = "New trap heat from B-Lawz. Stream Midnight Voltage now!"
        from ai_model.content_playbook import structure_score
        self.assertGreaterEqual(structure_score(three_act), 0.65)
        self.assertGreaterEqual(score_candidate(three_act, brief),
                                score_candidate(one_liner, brief) - 5.0)

    def test_thin_caption_still_loses_on_substance(self):
        # Length alone isn't enough — the arc must be real (struct>=0.65).
        brief = _brief()
        padded = "word " * 150 + "stream now"
        self.assertLess(score_candidate(padded, brief), 70.0)


class SingleAskTests(unittest.TestCase):
    def test_multi_ask_penalized(self):
        brief = _brief()
        single = "Stream Midnight Voltage today — link in bio."
        multi = "Stream, save, and get the merch for Midnight Voltage today."
        self.assertGreater(score_candidate(single, brief),
                           score_candidate(multi, brief))

    def test_ask_count(self):
        self.assertEqual(_ask_count("stream it now"), 1)
        self.assertGreaterEqual(_ask_count("stream, save, and share it"), 2)


class HookDiversityTests(unittest.TestCase):
    def setUp(self):
        _HOOK_HISTORY.clear()

    def test_repeat_hook_penalized(self):
        hook = "Nobody tells you what Midnight Voltage cost to make"
        _record_hook("B-Lawz", "Midnight Voltage", hook)
        pen = _hook_diversity_penalty(hook, "B-Lawz", "Midnight Voltage")
        self.assertGreater(pen, 0.0)
        fresh = _hook_diversity_penalty(
            "Something completely different about the trap sound",
            "B-Lawz", "Midnight Voltage")
        self.assertEqual(fresh, 0.0)

    def test_near_duplicate_hook_penalized(self):
        _record_hook("B-Lawz", "Midnight Voltage",
                     "Nobody tells you what Midnight Voltage cost")
        pen = _hook_diversity_penalty(
            "Nobody tells you what Midnight Voltage cost to make",
            "B-Lawz", "Midnight Voltage")
        self.assertGreater(pen, 0.0)


class KeywordDensityTests(unittest.TestCase):
    def test_stuffed_caption_capped(self):
        brief = _brief()
        # Density >3.0 keywords/sentence triggers the cap.
        stuffed = ("Midnight Voltage trap trap trap for trap listeners. "
                   "Trap trap trap energy all day. Stream trap now!")
        natural = ("Midnight Voltage hits different — late-night trap energy "
                   "with real emotion. Stream now.")
        self.assertGreater(score_candidate(natural, brief),
                           score_candidate(stuffed, brief))


class ScorerGateTests(unittest.TestCase):
    def test_lowercase_hook_penalized(self):
        brief = _brief()
        lower = "midnight voltage is finally here. stream now!"
        upper = "Midnight Voltage is finally here. Stream now!"
        self.assertGreater(score_candidate(upper, brief),
                           score_candidate(lower, brief))


class TopicHygieneTests(unittest.TestCase):
    def test_instruction_fragments_stripped(self):
        self.assertNotIn("teaser clip",
                         _clean_topic("Midnight Voltage teaser clip"))
        self.assertNotIn("video ad", _clean_topic("new video ad"))
        self.assertNotIn("presave campaign",
                         _clean_topic("Midnight Voltage presave campaign"))

    def test_real_topic_survives(self):
        cleaned = _clean_topic("Midnight Voltage teaser clip")
        self.assertIn("Midnight Voltage", cleaned)


class ComposeCaptionTests(unittest.TestCase):
    def test_compose_caption_end_to_end(self):
        brief = _brief()
        result = compose_caption("Midnight Voltage teaser clip",
                                 "B-Lawz", brief, genre="trap", variants=3)
        self.assertIsInstance(result, dict)
        caption = result["caption"]
        self.assertIsInstance(caption, str)
        self.assertTrue(len(caption.split()) >= 10)
        # No raw instruction leakage into the copy (regression: bodies
        # used to echo the uncleaned topic).
        self.assertNotIn("teaser clip", caption.lower())


if __name__ == "__main__":
    unittest.main()
