"""Durable model state can live independently of replaceable application capsules."""
import os
from pathlib import Path


def training_root(service_root):
    configured = os.environ.get("MAXCORE_MODEL_STATE_DIR")
    if not configured:
        return Path(service_root) / "ai_model/training"
    directory = Path(configured)
    if not directory.is_absolute() or directory.resolve() != directory:
        raise ValueError("MAXCORE_MODEL_STATE_DIR must be an absolute path without symlinks")
    return directory
