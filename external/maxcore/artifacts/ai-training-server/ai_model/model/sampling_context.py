"""Request-local sampling metadata; never reseed a process-wide RNG."""
import secrets


def sampling_context(seed=None, snapshot_hash=None, *, default_seed=None):
    from ai_model.generation.plan import active_plan

    plan = active_plan.get()
    data = plan.to_dict() if plan is not None else {}
    if seed is None:
        seed = getattr(plan, "seed", None)
        if seed is None:
            seed = data.get("seed")
    if seed is None:
        seed = default_seed if default_seed is not None else secrets.randbits(63)
    if type(seed) is not int or not 0 <= seed < 2**64:
        raise ValueError("seed must be an integer in 0..2**64-1")
    if snapshot_hash is None:
        snapshot_hash = getattr(plan, "snapshot_hash", None)
        if snapshot_hash is None:
            snapshot_hash = data.get("snapshot_hash", "")
    if not isinstance(snapshot_hash, str):
        raise ValueError("snapshot_hash must be a string")
    return seed, snapshot_hash