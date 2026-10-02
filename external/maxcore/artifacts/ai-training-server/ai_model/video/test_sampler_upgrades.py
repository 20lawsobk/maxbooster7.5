import random
import unittest

from ai_model.video.dataset_sampler import (
    _trim, _UsedSet, _PHRASE_HISTORY, HOOK_PHRASES,
    sample_all_scenes,
)
from ai_model.request_intelligence import score_scene_phrase


class TrimTests(unittest.TestCase):
    def test_trims_at_last_clause_boundary(self):
        # Regression: the old _trim left "Midnight Voltage is" dangling.
        out = _trim("From the studio to the streets — Midnight Voltage is live now baby", 10)
        self.assertFalse(out.rstrip().endswith(("is", "the", "to")))
        self.assertLessEqual(len(out.split()), 10)

    def test_reported_dangling_cases(self):
        # Neither the mid-thought fragment nor a trailing dash survives.
        out1 = _trim("From the studio to the streets — Midnight Voltage is here today", 10)
        self.assertNotIn("Midnight Voltage is", out1)
        self.assertFalse(out1.rstrip().endswith("—"))
        out2 = _trim("Full send — Midnight Voltage lofi session does not hold back ever", 10)
        # At the word budget with no clean boundary, we keep the 10 words
        # but never a trailing dash or dangling function word.
        self.assertFalse(out2.rstrip().endswith("—"))
        self.assertFalse(out2.rstrip().endswith((" is", " the", " a", " to")))

    def test_no_dangling_function_word(self):
        out = _trim("The story behind Midnight Voltage drop is bigger than the music", 10)
        self.assertFalse(out.rstrip().endswith((" the", " a", " to", " of")))

    def test_short_text_untouched(self):
        self.assertEqual(_trim("Short hook here", 10), "Short hook here")


class DiversityTests(unittest.TestCase):
    def setUp(self):
        _PHRASE_HISTORY.clear()
        random.seed(7)

    def test_repeated_picks_diversify(self):
        # 6 videos, same pool: the old top-third sampling converged to 1/6
        # unique templates. Diversity weighting must break that.
        seen = set()
        for _ in range(6):
            used = _UsedSet()
            seen.add(used.pick(HOOK_PHRASES, "hook"))
        self.assertGreaterEqual(len(seen), 3,
                                f"still convergent: {seen}")

    def test_recency_penalty_decays(self):
        from ai_model.video.dataset_sampler import _phrase_recency_penalty, _record_phrase
        _PHRASE_HISTORY.clear()
        _record_phrase("hook", "alpha")
        self.assertGreater(_phrase_recency_penalty("alpha", "hook"), 0)
        self.assertEqual(_phrase_recency_penalty("beta", "hook"), 0.0)


class ScenePhraseScoreTests(unittest.TestCase):
    def test_placeholder_count_matters(self):
        full = score_scene_phrase("{artist} drops {idea} — pure {genre} fire 🔥", "hook")
        idea_only = score_scene_phrase("Your playlist needs {idea} right now", "hook")
        none = score_scene_phrase("The anticipation is real today", "hook")
        self.assertGreater(full, idea_only)
        self.assertGreater(idea_only, none)

    def test_one_tap_cta_bonus(self):
        one_tap = score_scene_phrase("Save this sound before it blows up", "cta")
        generic = score_scene_phrase("Stream on all platforms now today", "cta")
        self.assertGreater(one_tap, generic)

    def test_arc_markers(self):
        tense_hook = score_scene_phrase("Here's what nobody tells you about the drop", "hook")
        flat_hook = score_scene_phrase("This song is really quite good today", "hook")
        self.assertGreater(tense_hook, flat_hook)
        payoff_drop = score_scene_phrase("This is the payoff — all the way up", "drop")
        flat_drop = score_scene_phrase("The music plays very loudly here", "drop")
        self.assertGreater(payoff_drop, flat_drop)


class SampleScenesTests(unittest.TestCase):
    def test_sample_all_scenes_runs(self):
        random.seed(3)
        scenes, tier = sample_all_scenes(
            ["hook", "build", "body", "drop", "cta"],
            idea="Midnight Voltage", genre="trap", tone="dark",
            platform="tiktok", artist_name="B-Lawz")
        self.assertEqual(len(scenes), 5)
        self.assertTrue(all(isinstance(t, str) and t for t in scenes.values()))
        # No dangling fragments: no scene ends mid-thought on a bare verb/article.
        for t in scenes.values():
            self.assertFalse(t.rstrip().endswith((" is", " the", " a", " to")))


if __name__ == "__main__":
    unittest.main()
