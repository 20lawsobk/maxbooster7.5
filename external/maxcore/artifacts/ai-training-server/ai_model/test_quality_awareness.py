"""Mandatory-awareness compatibility tests; replaces obsolete retirement tests."""
import os
import unittest
from unittest.mock import patch
from ai_model.awareness.engine import AwarenessUnavailable, Engine, bind
from ai_model.awareness.test_engine import MemoryStore, sources
from ai_model import quality_awareness as qa


class PhraseStore:
    def __init__(self, counts=None, available=True):
        self.counts = counts or {}
        self.available = available

    def status(self):
        return {"available": self.available}

    def keys(self, pattern):
        return [f"mb:{key}" for key in self.counts]

    def llen(self, key):
        return self.counts.get(key, 0)


class FacadeTests(unittest.TestCase):
    def setUp(self):
        qa._corpus_cache.clear()
        self.storage_patch = patch.object(qa, "_get_storage", return_value=PhraseStore())
        self.storage_patch.start()
        self.addCleanup(self.storage_patch.stop)

    def test_missing_binding_never_silently_falls_back(self):
        for fn, args in (
            (qa.get_doc, ()), (qa.scene_phrases, ("hook",)),
            (qa.editing_pattern, ("seed",)), (qa.music_targets, ("trap",)),
            (qa.platform_awareness_string, ("tiktok",)), (qa.veo_dna, ()),
            (qa.brief_enrichment, ()), (qa.audio_seeding_targets, ()),
        ):
            with self.subTest(fn=fn.__name__), self.assertRaises(AwarenessUnavailable):
                fn(*args)
        self.assertFalse(qa.self_sufficiency("video")["retired"])

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

    def test_own_corpus_retires_external_awareness_at_configured_threshold(self):
        qa._get_storage = lambda: PhraseStore({
            "phrases:hook": 2,
            "phrases:body": 1,
            "phrases:cta": 1,
        })
        qa._corpus_cache.clear()
        snapshot = Engine(sources=sources(), store=MemoryStore()).refresh()
        with patch.dict(os.environ, {"MB_AWARENESS_RETIRE_AT": "4"}), bind(snapshot):
            state = qa.self_sufficiency()
            self.assertEqual(state["own_corpus"], 4)
            self.assertEqual(state["buffer_weight"], 0.0)
            self.assertTrue(state["retired"])
            self.assertEqual(qa.platform_awareness_string("tiktok"), "")
            self.assertEqual(qa.scene_phrases("hook"), [])
            self.assertEqual(qa.brief_enrichment()["directive"], "")

    def test_unavailable_corpus_never_claims_retirement(self):
        qa._get_storage = lambda: PhraseStore({"phrases:hook": 900}, available=False)
        qa._corpus_cache.clear()
        state = qa.self_sufficiency()
        self.assertFalse(state["corpus_measurement_available"])
        self.assertFalse(state["retired"])
        self.assertEqual(state["buffer_weight"], 1.0)


if __name__ == "__main__":
    unittest.main()