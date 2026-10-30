from types import SimpleNamespace
import unittest
from unittest.mock import patch

from ai_model.generation.awareness import generation_guard
from ai_model.generation.plan import active_plan
from ai_model.awareness.engine import Engine
from ai_model.awareness.test_engine import MemoryStore, sources
from workers import admin_content_loop


class GuardedScriptAgent:
    def __init__(self):
        self.requests = []
        self.snapshot_hashes = []

    @generation_guard
    def run(self, request):
        plan = active_plan.get()
        assert plan is not None
        self.snapshot_hashes.append(plan.snapshot_hash)
        self.requests.append(request)
        return SimpleNamespace(
            hook=f"Original {request.idea} hook",
            body=f"Original {request.idea} body",
            cta=f"Original {request.idea} call to action",
            source="test-agent",
        )


class Flywheel:
    def __init__(self):
        self.rows = []

    def ingest(self, content_type, payload, meta, key_id="admin"):
        self.rows.append((content_type, payload, meta, key_id))


class AdminContentLoopTests(unittest.TestCase):
    def setUp(self):
        self.engine = Engine(sources=sources(), store=MemoryStore())
        self.engine.refresh()

    def test_cycle_uses_available_snapshot_and_feeds_admin_flywheel(self):
        agent = GuardedScriptAgent()
        flywheel = Flywheel()
        sufficiency = {
            "retired": False,
            "own_corpus": 12,
            "retire_threshold": 500,
            "buffer_weight": 0.976,
        }
        with (
            patch("ai_model.awareness.engine.get_engine", return_value=self.engine),
            patch("ai_model.quality_awareness.self_sufficiency", return_value=sufficiency),
            patch("ai_model.quality_awareness.music_targets", return_value={}),
            patch("workers.admin_flywheel.get_flywheel", return_value=flywheel),
        ):
            outcome = admin_content_loop._run_cycle(lambda: agent, [0, 0])

        self.assertEqual(outcome, "generated")
        self.assertEqual(len(agent.requests), 3)
        self.assertEqual({row[0] for row in flywheel.rows}, {"scripts", "social", "daw"})
        self.assertTrue(all(row[3] == "admin" for row in flywheel.rows))
        self.assertTrue(all(row[2]["snapshot_id"] == self.engine.require_snapshot().id
                            for row in flywheel.rows))
        self.assertEqual(agent.snapshot_hashes, [self.engine.require_snapshot().id] * 3)
        self.assertTrue(all(row[2]["own_corpus"] == 12 for row in flywheel.rows))
        self.assertIsNone(active_plan.get())

    def test_cycle_generates_and_feeds_flywheel_without_any_snapshot(self):
        engine = Engine(sources=sources(), store=MemoryStore())
        agent = GuardedScriptAgent()
        flywheel = Flywheel()
        sufficiency = {"retired": False, "own_corpus": 0, "retire_threshold": 500,
                       "buffer_weight": 1.0}
        with (
            patch("ai_model.awareness.engine.get_engine", return_value=engine),
            patch("ai_model.quality_awareness.self_sufficiency", return_value=sufficiency),
            patch("ai_model.quality_awareness.music_targets", return_value={}),
            patch("workers.admin_flywheel.get_flywheel", return_value=flywheel),
        ):
            outcome = admin_content_loop._run_cycle(lambda: agent, [0, 0])

        self.assertEqual(outcome, "generated")
        self.assertEqual(len(flywheel.rows), 3)
        self.assertEqual(agent.snapshot_hashes, [None, None, None])
        self.assertTrue(all("snapshot_id" not in row[2] for row in flywheel.rows))
        self.assertIsNone(active_plan.get())

    def test_retired_corpus_skips_external_awareness_generation(self):
        sufficiency = {
            "retired": True,
            "own_corpus": 500,
            "retire_threshold": 500,
            "buffer_weight": 0.0,
        }
        with (
            patch("ai_model.awareness.engine.get_engine", return_value=self.engine),
            patch("ai_model.quality_awareness.self_sufficiency", return_value=sufficiency),
            patch("workers.admin_flywheel.get_flywheel") as get_flywheel,
        ):
            outcome = admin_content_loop._run_cycle(lambda: self.fail("must not generate"), [0, 0])

        self.assertEqual(outcome, "retired")
        get_flywheel.assert_not_called()


if __name__ == "__main__":
    unittest.main()