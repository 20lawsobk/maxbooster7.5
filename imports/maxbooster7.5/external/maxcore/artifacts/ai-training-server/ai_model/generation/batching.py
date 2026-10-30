"""Snapshot-aware adaptation of the existing scoped dynamic batch scheduler."""
from collections import OrderedDict
from contextlib import ExitStack, nullcontext
from contextvars import ContextVar
from ai_model.awareness import AwarenessUnavailable, bind
from .plan import active_plan
from .awareness import sampling_seed, sampling_snapshot, snapshot_hash

active_batch_plans = ContextVar("generation_batch_plans", default=())


def execute_rows(model, rows):
    """Partition by optional pinned scan; validate before model execution."""
    groups = OrderedDict()
    for index, row in enumerate(rows):
        snapshot = row.get("_snapshot")
        groups.setdefault(snapshot.id if snapshot is not None else None, []).append((index, row))
    outputs = [None] * len(rows)
    for group in groups.values():
        snapshot = group[0][1].get("_snapshot")
        scope = ExitStack()
        if snapshot is not None:
            try:
                scope.enter_context(bind(snapshot))
            except AwarenessUnavailable:
                # Expired scan data is optional context, not a generation gate.
                snapshot = None
        with scope:
            # GPU context belongs to the executor, not a waiting submitter.
            # Per-row seeds/hashes are explicit; never inherit row one's seed.
            clean = [{k: v for k, v in row.items() if not k.startswith("_")}
                     for _, row in group]
            for row in clean:
                expected_hash = snapshot.id if snapshot is not None else None
                if expected_hash is None:
                    row.pop("snapshot_hash", None)
                elif row.get("snapshot_hash") != expected_hash:
                    raise ValueError("Batch row identity differs from its optional awareness scan")
            token = active_batch_plans.set(tuple(row["_plan"] for _, row in group))
            try:
                result = model.generate_batch_rows(clean)
            finally:
                active_batch_plans.reset(token)
            if not isinstance(result, list) or len(result) != len(group):
                raise RuntimeError("Generation batch returned an invalid output count")
            for (index, _), value in zip(group, result):
                outputs[index] = value
    return outputs


def install(model, gpu_pool=None):
    from ai_model.dynamic_batching import GenerateCoalescer, is_enabled
    from ai_model.adaptive_concurrency import INFERENCE_GATE
    original = model.generate
    model._orig_generate = original

    def direct(*args, **kwargs):
        snapshot = sampling_snapshot()
        identity = snapshot.id if snapshot is not None else None
        if kwargs.get("snapshot_hash") not in (None, identity):
            raise ValueError("Sampling identity does not match the generation plan")
        kwargs.setdefault("seed", sampling_seed())
        if identity is not None:
            kwargs.setdefault("snapshot_hash", identity)
        else:
            kwargs.pop("snapshot_hash", None)
        with INFERENCE_GATE.slot():
            if gpu_pool is not None:
                with gpu_pool.spawn_sync("unbatched-checkpoint"):
                    return original(*args, **kwargs)
            return original(*args, **kwargs)

    if not is_enabled():
        model.generate = direct
        return None

    def no_fallback(row):
        raise RuntimeError("Failed snapshot batch cannot rerun as fallback")

    coalescer = GenerateCoalescer(
        batch_fn=lambda rows: execute_rows(model, rows),
        fallback_fn=no_fallback, gpu_pool=gpu_pool)

    def generate(prompt, max_new_tokens=200, temperature=.85, top_p=.92,
                 top_k=50, repetition_penalty=1.15, min_length=10,
                 seed=None, snapshot_hash=None):
        snapshot = sampling_snapshot()
        identity = snapshot.id if snapshot is not None else None
        if snapshot_hash not in (None, identity):
            raise ValueError("Sampling identity does not match the generation plan")
        plan = active_plan.get()
        if plan is None:
            raise ValueError("Queued generation requires an immutable generation plan")
        row = {
            "prompt": prompt, "max_new_tokens": max_new_tokens,
            "temperature": temperature, "top_p": top_p, "top_k": top_k,
            "repetition_penalty": repetition_penalty, "min_length": min_length,
            "seed": sampling_seed() if seed is None else seed,
            "_snapshot": snapshot,
            "_plan": plan,
        }
        if identity is not None:
            row["snapshot_hash"] = identity
        else:
            row["snapshot_hash"] = None
        return coalescer.submit(row)

    model.generate = generate
    coalescer.start()
    return coalescer