"""Model components with lightweight imports for checkpoint utilities."""

from .tokenizer import CONTROL_TOKENS, SimpleTokenizer

__all__ = [
    "CONTROL_TOKENS",
    "SimpleTokenizer",
    "TransformerLM",
    "CreativeModel",
]


def __getattr__(name: str):
    if name == "TransformerLM":
        from .transformer import TransformerLM

        return TransformerLM
    if name == "CreativeModel":
        from .creative_model import CreativeModel

        return CreativeModel
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
