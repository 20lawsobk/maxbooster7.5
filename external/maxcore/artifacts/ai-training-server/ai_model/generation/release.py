"""Explicit serving selection only; never trains, selects, or edits weights."""
import json
import inspect
from contextvars import ContextVar
from pathlib import Path

candidate_errors = ContextVar("candidate_generation_errors", default=None)


class FailClosedCandidateAdapter:
    """Remember adapter failures even when legacy agents catch and template them."""
    def __init__(self, adapter):
        self._adapter = adapter

    def __getattr__(self, name):
        return getattr(self._adapter, name)

    def _call(self, name, *args, **kwargs):
        failures = candidate_errors.get()
        if failures:
            raise failures[0]
        try:
            from .awareness import sampling_seed, snapshot_hash
            identity = snapshot_hash()
            if kwargs.get("snapshot_hash") not in (None, identity):
                raise ValueError("Sampling snapshot does not match bound awareness")
            if name != "generate_batch_rows":
                kwargs.setdefault("seed", sampling_seed())
                kwargs.setdefault("snapshot_hash", identity)
            return getattr(self._adapter, name)(*args, **kwargs)
        except Exception as exc:
            if failures is not None:
                failures.append(exc)
            raise

    def generate(self, *args, **kwargs):
        return self._call("generate", *args, **kwargs)

    def generate_batch(self, *args, **kwargs):
        return self._call("generate_batch", *args, **kwargs)

    def generate_batch_rows(self, *args, **kwargs):
        from .awareness import sampling_seed, snapshot_hash
        identity = snapshot_hash()
        rows = args[0] if args else kwargs.get("rows")
        pinned = []
        for row in rows:
            if row.get("snapshot_hash") not in (None, identity):
                raise ValueError("Batch row snapshot does not match bound awareness")
            pinned.append({**row, "seed": row.get("seed", sampling_seed()),
                           "snapshot_hash": identity})
        if args:
            return self._call("generate_batch_rows", pinned, *args[1:], **kwargs)
        return self._call("generate_batch_rows", **{**kwargs, "rows": pinned})

    def generate_stream(self, *args, **kwargs):
        from ai_model.awareness import bind, bound_snapshot
        snapshot = bound_snapshot()
        stream = self._call("generate_stream", *args, **kwargs)
        def pinned():
            try:
                with bind(snapshot):
                    for chunk in stream:
                        bound_snapshot()
                        yield chunk
            except Exception as exc:
                failures = candidate_errors.get()
                if failures is not None:
                    failures.append(exc)
                raise
            finally:
                if hasattr(stream, "close"):
                    stream.close()
        return pinned()


def load_selected_release(mode="legacy", *, registry=None, factory=None):
    if mode not in {"legacy", "reviewed-candidate"}:
        raise ValueError("MAXCORE_SERVING_RELEASE must be legacy or reviewed-candidate")
    status = {"requested": mode, "active": None, "candidate_quality": "not_selected",
              "backend_exclusive": "not_verified"}
    if mode == "legacy":
        return None, status
    if registry is None:
        from ai_model.training.candidate_registry import REGISTRY
        registry = REGISTRY
    pointer = Path(registry) / "selected.json"
    if pointer.is_symlink():
        raise ValueError("Selected candidate pointer must not be a symlink")
    if not pointer.exists():
        return None, {**status, "candidate_quality": "no_selected_candidate"}
    raw = pointer.read_bytes()
    selected = json.loads(raw)
    if selected.get("schema") != 1 or selected.get("scope") != "candidate-only-not-production":
        raise ValueError("Invalid selected candidate registry schema/scope")
    if factory is None:
        from ai_model.model.candidate_serving import create_candidate_adapter
        factory = create_candidate_adapter
    # Production cannot opt out of backend policy, bypass review, or load smoke
    # artifacts. Inference and training exclusivity are distinct capabilities.
    adapter = factory(runtime_only=False, require_exclusive_backend=True)
    if pointer.read_bytes() != raw:
        raise ValueError("Selected candidate changed during startup")
    if getattr(adapter, "runtime_only", True):
        raise ValueError("Runtime-only/smoke adapter cannot serve production")
    if not getattr(adapter, "backend_exclusive", False):
        raise ValueError("Selected candidate cannot satisfy production backend policy")
    parameters = inspect.signature(adapter.generate).parameters
    sampling = {name: parameter.default for name, parameter in parameters.items()
                if name in {"temperature", "top_p", "top_k", "repetition_penalty", "min_length", "seed"}
                and parameter.default is not inspect.Parameter.empty}
    return FailClosedCandidateAdapter(adapter), {
        **status, "active": "reviewed-candidate",
        "checkpoint_sha256": selected["fingerprints"]["checkpoint_sha256"],
        "candidate_quality": "independently_reviewed_not_general_quality_certification",
        "backend_exclusive": bool(getattr(adapter, "training_backend_exclusive", False)),
        "inference_backend_exclusive": bool(getattr(adapter, "inference_backend_exclusive", False)),
        "training_backend_exclusive": bool(getattr(adapter, "training_backend_exclusive", False)),
        "unreleased": bool(getattr(adapter, "unreleased", True)),
        "agent_pipeline": "adapter_validated_no_fallback",
        "sampling_defaults": sampling,
        "supported_sampling": list(sampling),
        "context_tokens": getattr(adapter.model, "context", None),
    }