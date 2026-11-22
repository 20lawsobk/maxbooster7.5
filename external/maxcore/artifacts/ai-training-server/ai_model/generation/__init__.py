"""Lazy public exports for the unified conditioned generation engine.

Importing a lightweight policy or checkpoint utility must not eagerly load every
media-generation dependency. Public names remain available and load their owning
module only when requested.
"""

from importlib import import_module

_EXPORTS = {
    "TechniqueProfile": (".technique", "TechniqueProfile"),
    "extract_technique": (".technique", "extract_technique"),
    "GenerationContext": (".orchestrator", "GenerationContext"),
    "build_context": (".orchestrator", "build_context"),
    "merge_awareness": (".orchestrator", "merge_awareness"),
    "build_campaign": (".campaign", "build_campaign"),
    "GenerationPlan": (".plan", "GenerationPlan"),
    "validate_output": (".plan", "validate_output"),
}

__all__ = list(_EXPORTS)


def __getattr__(name: str):
    try:
        module_name, attribute_name = _EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(
            f"module {__name__!r} has no attribute {name!r}"
        ) from exc
    value = getattr(import_module(module_name, __name__), attribute_name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | set(__all__))
