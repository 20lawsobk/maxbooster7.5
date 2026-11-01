"""Model admission belongs to executing work, not queued callers or caches."""
from contextlib import contextmanager
from types import SimpleNamespace

import pytest

from ai_model import dynamic_batching as batching


@pytest.fixture
def scope(monkeypatch):
    events = []
    state = {"admitted": False, "life": None}

    class Gate:
        @contextmanager
        def slot(self):
            assert not state["admitted"], "double admission"
            events.append("admit")
            state["admitted"] = True
            try:
                yield
            finally:
                events.append("release")
                state["admitted"] = False

    class Pool:
        @contextmanager
        def spawn_sync(self, digest):
            assert state["admitted"]
            assert state["life"] is None
            events.append("spawn")
            state["life"] = {"operations": 0}
            try:
                yield state["life"]
            finally:
                events.append(("snapshot", state["life"]["operations"]))
                state["life"] = None
                events.append("retire")

    monkeypatch.setattr(batching, "INFERENCE_GATE", Gate())
    return Pool(), state, events


def test_batch_admitted_once_and_snapshots_actual_scoped_execution(scope):
    pool, state, events = scope

    def forward(rows):
        assert state["admitted"] and state["life"] is not None
        state["life"]["operations"] += 1
        return ["real result" for _ in rows]

    coalescer = batching.GenerateCoalescer(
        forward, lambda row: pytest.fail("unscoped retry"), gpu_pool=pool)
    batch = [batching._Pending({"prompt": "one"}), batching._Pending({"prompt": "two"})]
    coalescer._run_batch(batch)
    assert all(row.result == "real result" and row.event.is_set() for row in batch)
    assert events == ["admit", "spawn", ("snapshot", 1), "retire", "release"]


def test_batch_failure_is_explicit_and_never_unscoped_retry(scope):
    pool, state, events = scope

    def fail(rows):
        raise ValueError("real inference failure")

    coalescer = batching.GenerateCoalescer(
        fail, lambda row: pytest.fail("silent retry"), gpu_pool=pool)
    row = batching._Pending({"prompt": "one"})
    coalescer._run_batch([row])
    assert isinstance(row.error, ValueError)
    assert row.event.is_set()
    assert coalescer.stats["fallbacks"] == 0
    assert events[-1] == "release"


def test_disabled_batching_still_scopes_actual_model(scope, monkeypatch):
    pool, state, events = scope
    monkeypatch.setenv("AI_DYNAMIC_BATCHING", "0")

    def generate(prompt, **kwargs):
        assert state["life"] is not None
        state["life"]["operations"] += 1
        return prompt

    model = SimpleNamespace(generate=generate)
    assert batching.install(model, gpu_pool=pool) is None
    assert model.generate("checkpoint text") == "checkpoint text"
    assert events == ["admit", "spawn", ("snapshot", 1), "retire", "release"]