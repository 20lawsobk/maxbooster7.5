"""Generation plans are mandatory; fresh awareness is an optional context."""
import json
from functools import wraps


def generation_guard(method):
    """Legacy catch-and-continue handlers cannot turn agent failures into success."""
    @wraps(method)
    def checked(*args, **kwargs):
        try:
            from .plan import active_plan
            plan = active_plan.get()
            if plan is None:
                raise ValueError("Direct agent generation requires an immutable GenerationPlan")
            return method(*args, **kwargs)
        except Exception as exc:
            from .release import candidate_errors
            errors = candidate_errors.get()
            if errors is not None:
                errors.append(exc)
            raise
    return checked


def require_context(platform="general", modality="text"):
    # Live trends remain relevant regardless of historical corpus size.
    # Use the same engine as /api/awareness/unified/context, pinned to the
    # immutable generation plan so a worker cannot mix scan revisions.
    snapshot = sampling_snapshot()
    if snapshot is None:
        return ""
    from ai_model.awareness import conditioning
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
        raise ValueError("Generation sampling requires an immutable GenerationPlan")
    return plan.seed


def snapshot_hash():
    snapshot = sampling_snapshot()
    return snapshot.id if snapshot is not None else None


def sampling_snapshot():
    """Preserve optional legacy context; captured live scans must stay valid."""
    from .plan import active_plan
    from ai_model.awareness import Snapshot, current_snapshot
    plan = active_plan.get()
    if plan is None:
        return current_snapshot()
    snapshot_data = json.loads(plan.snapshot_json)
    if snapshot_data is None:
        return None
    try:
        return Snapshot.parse(snapshot_data)
    except Exception as exc:
        from ai_model.awareness import AwarenessUnavailable
        raise AwarenessUnavailable("Generation plan awareness expired or is invalid") from exc
