"""Mandatory-awareness compatibility tests; replaces obsolete retirement tests."""
import unittest
from ai_model.awareness.engine import AwarenessUnavailable, Engine, bind
from ai_model.awareness.test_engine import MemoryStore, sources
from ai_model import quality_awareness as qa


class FacadeTests(unittest.TestCase):
    def test_missing_binding_never_silently_falls_back(self):
        for fn, args in (
            (qa.get_doc, ()), (qa.scene_phrases, ("hook",)),
            (qa.editing_pattern, ("seed",)), (qa.music_targets, ("trap",)),
            (qa.platform_awareness_string, ("tiktok",)), (qa.veo_dna, ()),
            (qa.brief_enrichment, ()), (qa.audio_seeding_targets, ()),
            (qa.self_sufficiency, ("video",)),
        ):
            with self.subTest(fn=fn.__name__), self.assertRaises(AwarenessUnavailable):
                fn(*args)

    def test_bound_knowledge_does_not_retire_and_secondary_is_preserved(self):
        snapshot = Engine(sources=sources(), store=MemoryStore()).refresh()
        with bind(snapshot):
            self.assertFalse(qa.self_sufficiency("image")["retired"])
            self.assertIn(snapshot.id, qa.veo_dna("youtube"))
            self.assertIn(snapshot.id, qa.brief_enrichment()["directive"])
            self.assertEqual(qa.hook_candidates("song", "artist"),
                             ["Listen to song by artist"])
            # No fabricated camera, audio or campaign-performance measurements.
            self.assertIsNone(qa.editing_pattern("seed"))
            self.assertEqual(qa.music_targets("trap"), {})


if __name__ == "__main__":
    unittest.main()