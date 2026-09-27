"""Fail-closed generation bindings. Expired jobs fail; they never refresh."""
from ai_model.awareness import bound_snapshot, conditioning
from functools import wraps


def generation_guard(method):
    """Legacy catch-and-continue handlers cannot turn agent failures into success."""
    @wraps(method)
    def checked(*args, **kwargs):
        try:
            snapshot = bound_snapshot()
            from .plan import active_plan
            from ai_model.awareness import AwarenessUnavailable
            plan = active_plan.get()
            if plan is None or plan.snapshot_hash != snapshot.id:
                raise AwarenessUnavailable(
                    "Direct agent generation requires a matching immutable GenerationPlan")
            return method(*args, **kwargs)
        except Exception as exc:
            from .release import candidate_errors
            errors = candidate_errors.get()
            if errors is not None:
                errors.append(exc)
            raise
    return checked


def require_context(platform="general", modality="text"):
    snapshot = bound_snapshot()
    return conditioning(snapshot, platform, modality)


def ensure_context_once(awareness, platform="general", modality="text"):
    """Prefix the canonical context without duplicating an existing prefix."""
    required = require_context(platform, modality)
    current = awareness or ""
    repeated_prefix = required + "\n"
    while current.startswith(repeated_prefix):
        current = current[len(repeated_prefix):]
    if current == required:
        current = ""
    return required + ("\n" + current if current else "")


def sampling_seed():
    from .plan import active_plan
    plan = active_plan.get()
    if plan is None:
        from hashlib import sha256
        return int(sha256(bound_snapshot().id.encode()).hexdigest()[:8], 16)
    return plan.seed


def snapshot_hash():
    return bound_snapshot().id