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


if __name__ == "__main__":
    unittest.main()
