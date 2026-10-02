"""Persistence — Story Bibles and campaigns survive restarts.

Uses the pdim corpus when available, falls back to local JSON files.
Never raises — persistence is best-effort, generation must not block on it.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, Optional, Any

from .observability import get_logger

log = get_logger("persistence")

# Local fallback directory.
_STORE_DIR = Path.home() / ".maxcore" / "director"
_STORE_DIR.mkdir(parents=True, exist_ok=True)


def _pdim():
    """Get pdim store if available."""
    try:
        from storage_client import get_storage
        return get_storage()
    except Exception:
        return None


def save_bible(bible_id: str, bible_dict: Dict[str, Any]) -> bool:
    """Persist a Story Bible."""
    try:
        store = _pdim()
        if store:
            key = f"director:bible:{bible_id}"
            store.set(key, json.dumps(bible_dict))
            return True
    except Exception as e:
        log.warn("pdim_save_failed", error=str(e))

    # Fallback to local file.
    try:
        path = _STORE_DIR / f"bible_{bible_id}.json"
        path.write_text(json.dumps(bible_dict, indent=2))
        return True
    except Exception as e:
        log.error("save_bible_failed", error=str(e))
        return False


def load_bible(bible_id: str) -> Optional[Dict[str, Any]]:
    """Load a Story Bible."""
    try:
        store = _pdim()
        if store:
            key = f"director:bible:{bible_id}"
            raw = store.get(key)
            if raw:
                return json.loads(raw)
    except Exception:
        pass

    try:
        path = _STORE_DIR / f"bible_{bible_id}.json"
        if path.is_file():
            return json.loads(path.read_text())
    except Exception:
        pass

    return None


def save_campaign(campaign_id: str, output_dict: Dict[str, Any]) -> bool:
    """Persist a full campaign output."""
    # Strip non-serializable fields.
    safe = {}
    for k, v in output_dict.items():
        try:
            json.dumps(v)
            safe[k] = v
        except (TypeError, ValueError):
            safe[k] = str(v)

    safe["_saved_at"] = time.time()

    try:
        store = _pdim()
        if store:
            key = f"director:campaign:{campaign_id}"
            store.set(key, json.dumps(safe))
            return True
    except Exception:
        pass

    try:
        path = _STORE_DIR / f"campaign_{campaign_id}.json"
        path.write_text(json.dumps(safe, indent=2))
        return True
    except Exception as e:
        log.error("save_campaign_failed", error=str(e))
        return False
