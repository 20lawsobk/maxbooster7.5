"""Focused immutable plan and fail-closed binding regressions."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from ai_model.awareness import AwarenessUnavailable, bound_snapshot, Snapshot, bind

spec = importlib.util.spec_from_file_location(
    "_snapshot_plan_test", Path(__file__).parents[1] / "ai_model/generation/plan.py")
plan_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = plan_module
spec.loader.exec_module(plan_module)
GenerationPlan = plan_module.GenerationPlan


class FakeSnapshot:
    def __init__(self, identity):
        self.id = identity
        self.expires_at = 12345

    def to_dict(self):
        return {"id": self.id, "expires_at": 12345}


class SnapshotContractTests(unittest.TestCase):
    def test_direct_plan_requires_binding(self):
        with self.assertRaises(AwarenessUnavailable):
            GenerationPlan.from_request({"topic": "music"}, "text")

    def test_invalid_and_empty_snapshots_rejected(self):
        for payload in ({}, {"id": "x"}, {"id": "x", "expires_at": 0}):
            with self.assertRaises(AwarenessUnavailable):
                Snapshot.parse(payload)

    def test_snapshot_checkpoint_and_facts_change_identity(self):
        data = {"topic": "music", "facts": ["a" * 20000], "direction": "b" * 20000}
        with patch("ai_model.awareness.bound_snapshot", return_value=FakeSnapshot("one")):
            a = GenerationPlan.from_request(data, "text", "checkpoint-a")
            again = GenerationPlan.from_request(data, "text", "checkpoint-a")
            other_checkpoint = GenerationPlan.from_request(data, "text", "checkpoint-b")
        with patch("ai_model.awareness.bound_snapshot", return_value=FakeSnapshot("two")):
            b = GenerationPlan.from_request(data, "text", "checkpoint-a")
        self.assertEqual(a.seed, again.seed)
        self.assertEqual(a.plan_hash, again.plan_hash)
        self.assertNotEqual(a.plan_hash, b.plan_hash)
        self.assertNotEqual(a.seed, other_checkpoint.seed)
        self.assertEqual(a.to_dict()["request"], data)
        data["facts"].append("changed")
        self.assertEqual(len(a.to_dict()["facts"]), 1)

    def test_explicit_seed_and_invalid_seed(self):
        with patch("ai_model.awareness.bound_snapshot", return_value=FakeSnapshot("one")):
            self.assertEqual(GenerationPlan.from_request({"seed": 42}, "text").seed, 42)
            for value in (True, -1, 2**32, "1"):
                with self.assertRaises(ValueError):
                    GenerationPlan.from_request({"seed": value}, "text")

    def test_binding_cleanup_after_error(self):
        snapshot = FakeSnapshot("pinned")
        with patch.object(Snapshot, "parse", return_value=snapshot):
            with self.assertRaisesRegex(RuntimeError, "worker failed"):
                with bind(snapshot):
                    self.assertEqual(bound_snapshot().id, "pinned")
                    raise RuntimeError("worker failed")
            with self.assertRaises(AwarenessUnavailable):
                bound_snapshot()

    def test_context_copy_retains_exact_snapshot(self):
        from contextvars import copy_context
        snapshot = FakeSnapshot("pinned")
        with patch.object(Snapshot, "parse", return_value=snapshot):
            with bind(snapshot):
                context = copy_context()
            self.assertEqual(context.run(bound_snapshot).id, "pinned")
            with self.assertRaises(AwarenessUnavailable):
                bound_snapshot()


if __name__ == "__main__":
    unittest.main()