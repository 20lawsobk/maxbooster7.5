import unittest

from ai_model.director.story_bible import StoryBible, build_story_bible
from ai_model.director.awareness_bus import AwarenessBus
from ai_model.director.platforms import get_platform_directive, platform_list
from ai_model.director.critic import Critic
from ai_model.director.campaign import CampaignDirector, CampaignBrief


class StoryBibleTests(unittest.TestCase):
    def test_build_bible(self):
        bible = build_story_bible(
            artist="B-Lawz", track="Midnight Voltage", genre="trap",
            narrative="The 3am sessions that almost broke me",
            trends=["#newmusic"],
        )
        self.assertTrue(bible.is_complete())
        self.assertEqual(bible.artist, "B-Lawz")
        self.assertIn("3am", bible.emotional_core)
        self.assertTrue(len(bible.language_patterns) > 0)

    def test_for_platform(self):
        bible = build_story_bible(artist="X", track="Y")
        sliced = bible.for_platform("tiktok")
        self.assertIn("emotional_core", sliced)
        self.assertIn("tension", sliced)


class AwarenessBusTests(unittest.TestCase):
    def test_snapshot(self):
        bus = AwarenessBus()
        snap = bus.snapshot(platforms=["tiktok", "instagram"])
        # Should not raise; may be empty in test env.
        self.assertIsNotNone(snap)
        self.assertIsInstance(snap.has_landscape(), bool)

    def test_for_platform(self):
        bus = AwarenessBus()
        snap = bus.snapshot(platforms=["tiktok"])
        sliced = snap.for_platform("tiktok")
        self.assertIn("signals", sliced)


class PlatformTests(unittest.TestCase):
    def test_all_platforms(self):
        platforms = platform_list()
        self.assertEqual(len(platforms), 8)
        for p in platforms:
            d = get_platform_directive(p)
            self.assertIn("algorithm", d)
            self.assertIn("audio", d)
            self.assertIn("video", d)
            self.assertIn("social", d)
            self.assertIn("ads", d)

    def test_tiktok_specific(self):
        d = get_platform_directive("tiktok")
        self.assertIn("completion", d["algorithm"].lower())


class CriticTests(unittest.TestCase):
    def test_critique_social(self):
        critic = Critic()
        report = critic.critique_social(
            caption="Test caption with fire energy for you",
            hook="Short hook",
            body="Body text",
            cta="Save this",
            platform="instagram",
        )
        self.assertTrue(len(report.critiques) > 0)
        # Should have specific indictments for failures.
        for c in report.failures():
            self.assertTrue(c.indictment)
            self.assertTrue(c.prescription)


class CampaignDirectorTests(unittest.TestCase):
    def test_full_campaign(self):
        director = CampaignDirector()
        brief = CampaignBrief(
            artist="B-Lawz",
            track="Midnight Voltage",
            genre="trap",
            platforms=["tiktok"],
        )
        output = director.direct(brief)

        # Bible.
        self.assertTrue(output.bible.is_complete())

        # Audio.
        self.assertIn("target_lufs", output.audio)

        # Video per platform.
        self.assertIn("tiktok", output.video)
        self.assertIn("scenes", output.video["tiktok"])

        # Social per platform.
        self.assertIn("tiktok", output.social)
        self.assertIn("caption", output.social["tiktok"])

        # Ads per platform (tiktok has paid).
        self.assertIn("tiktok", output.ads)
        self.assertTrue(output.ads["tiktok"]["is_paid"])

    def test_multi_platform(self):
        director = CampaignDirector()
        brief = CampaignBrief(
            artist="Test", track="Test Track",
            platforms=["tiktok", "instagram", "youtube"],
        )
        output = director.direct(brief)
        self.assertEqual(len(output.video), 3)
        self.assertEqual(len(output.social), 3)


class IterativeLoopTests(unittest.TestCase):
    def test_loop_improves(self):
        from ai_model.director.iterative import IterativeLoop
        from ai_model.director.critic import Critic

        calls = []

        def generate(params):
            calls.append(dict(params))
            # Simulate improvement when keywords are added.
            kw = params.get("keywords", [])
            score_boost = len(kw) * 0.1
            return {"score_boost": score_boost, "caption": "test " * 10}

        def critique(output):
            from ai_model.director.critic import CritiqueReport, Critique
            boost = output.get("score_boost", 0)
            return CritiqueReport(critiques=[
                Critique("engagement", 0.5 + boost, 0.65, "", ""),
            ])

        def mutate(params, failures, iteration=0):
            params = dict(params)
            kw = list(params.get("keywords", []))
            kw.append("fire")
            params["keywords"] = kw
            return params

        loop = IterativeLoop(max_iterations=3)
        result = loop.run(generate, critique, mutate, {"topic": "x"})
        # Should have mutated (added keywords) across iterations.
        self.assertTrue(len(calls) >= 2)
        self.assertIn("loop_history", result)

    def test_loop_handles_generation_failure(self):
        from ai_model.director.iterative import IterativeLoop

        def bad_generate(params):
            raise ValueError("boom")

        def critique(output):
            from ai_model.director.critic import CritiqueReport
            return CritiqueReport()

        loop = IterativeLoop(max_iterations=2)
        result = loop.run(bad_generate, critique, lambda p, f: p, {})
        self.assertIn("error", result)


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        from ai_model.director import config
        self.assertEqual(config.get("loop.max_iterations"), 5)
        self.assertEqual(config.get("nonexistent", "fallback"), "fallback")

    def test_env_override(self):
        import os
        from ai_model.director import config
        os.environ["DIRECTOR_LOOP_MAX_ITERATIONS"] = "10"
        try:
            self.assertEqual(config.get("loop.max_iterations"), 10)
        finally:
            del os.environ["DIRECTOR_LOOP_MAX_ITERATIONS"]


class PersistenceTests(unittest.TestCase):
    def test_save_load_bible(self):
        from ai_model.director.persistence import save_bible, load_bible
        import uuid
        bid = f"test_{uuid.uuid4().hex[:8]}"
        data = {"artist": "Test", "emotional_core": "test core"}
        self.assertTrue(save_bible(bid, data))
        loaded = load_bible(bid)
        self.assertEqual(loaded["artist"], "Test")


if __name__ == "__main__":
    unittest.main()
