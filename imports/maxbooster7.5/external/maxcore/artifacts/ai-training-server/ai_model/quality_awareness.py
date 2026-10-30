"""Compatibility facade for continuously refreshed, optional scan context.

Admin-generated phrases may retire external awareness only after an authoritative
corpus measurement. The engine is the only refresh scheduler; requests never
fetch or train, and generation does not wait for a scan.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional
from ai_model.awareness import conditioning, current_snapshot, get_engine

DOC_KEY = "awareness:quality:doc"  # legacy document retained, never overwritten
_lock = threading.Lock()
_recent_hooks: Dict[str, str] = {}
_recent_image_headlines: Dict[str, str] = {}
_CORPUS_CACHE_TTL = 60.0
_corpus_cache: Dict[str, tuple[int, float]] = {}
_MODALITY_CORPUS_PREFIX = {
    "text": "phrases:hook",
    "hook": "phrases:hook",
    "image": "phrases:image_headline",
    "image_headline": "phrases:image_headline",
}
_SCENE_MAP = {
    "hook": "hook", "drop": "hook", "build": "hook", "chorus": "hook",
    "body": "body", "verse": "body", "bridge": "body", "transition": "body",
    "cta": "cta", "outro": "cta",
}


def get_doc(trigger_harvest: bool = True) -> Dict[str, Any]:
    """Return current scan data, or an explicitly empty not-ready view."""
    snapshot = current_snapshot()
    if snapshot is None:
        return {"ready": False, "snapshot_id": None, "domains": {},
                "templates": {}, "music_features": {}, "exemplars": [],
                "sources": {}}
    doc = snapshot.to_dict()
    secondary = doc.get("secondary", {})
    return {**doc, "templates": secondary.get("phrases", {}),
            "music_features": secondary.get("music_features", {}),
            "exemplars": [r for rows in doc["domains"].values() for r in rows],
            "sources": doc["source_health"], "ready": True}


def start_scheduler() -> bool:
    return get_engine().start()


def stop_scheduler() -> bool:
    return get_engine().stop()


def _spawn_harvest(replace: bool = False):
    return start_scheduler()


def start_audio_seeding_watchdog() -> bool:
    """Compatibility lifecycle entry, no hidden training/checkpoint mutation."""
    return start_scheduler()


def self_sufficiency(modality: Optional[str] = None) -> Dict[str, Any]:
    """Retire external awareness as admin-generated corpus becomes sufficient.

    Only a live, authoritative PDIM measurement can advance retirement. If the
    corpus cannot be measured, keep the awareness weight at 1 and report that
    measurement as unavailable rather than claiming the system is self-sufficient.
    """
    threshold = _retire_threshold(modality)
    count, measured = _own_corpus_size(modality)
    weight = max(0.0, 1.0 - count / threshold) if measured else 1.0
    return {
        "own_corpus": count,
        "retire_threshold": threshold,
        "buffer_weight": round(weight, 3),
        "retired": measured and count >= threshold,
        "corpus_measurement_available": measured,
        "modality": modality,
    }


def _retire_threshold(modality: Optional[str]) -> int:
    name = f"MB_AWARENESS_RETIRE_AT_{modality.upper()}" if modality else ""
    raw = os.environ.get(name) if name else None
    raw = raw or os.environ.get("MB_AWARENESS_RETIRE_AT", "500")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 500


def _own_corpus_size(modality: Optional[str] = None) -> tuple[int, bool]:
    cache_key = modality or "all"
    now = time.monotonic()
    with _lock:
        cached = _corpus_cache.get(cache_key)
        if cached and now - cached[1] < _CORPUS_CACHE_TTL:
            return cached[0], True

    try:
        store = _get_storage()
        if store is None:
            raise RuntimeError("Flywheel storage is unavailable")
        storage_status = store.status()
        if not isinstance(storage_status, dict) or storage_status.get("available") is not True:
            raise RuntimeError("Flywheel storage is not authoritative")

        prefix = _MODALITY_CORPUS_PREFIX.get(modality or "")
        if prefix:
            total = int(store.llen(prefix))
        else:
            total = 0
            for key in store.keys("mb:phrases:*"):
                if not isinstance(key, str) or not key.startswith("mb:phrases:"):
                    continue
                total += int(store.llen(key[3:]))
        if total < 0:
            raise ValueError("Negative flywheel corpus count")
    except Exception:
        with _lock:
            previous = _corpus_cache.get(cache_key)
        return (previous[0] if previous else 0), False

    with _lock:
        _corpus_cache[cache_key] = (total, now)
    return total, True


def _get_storage():
    from storage_client import get_storage
    return get_storage()


def scene_phrases(scene_type: str) -> List[str]:
    if self_sufficiency()["retired"]:
        return []
    doc = get_doc()
    return list(doc["templates"].get(_SCENE_MAP.get(scene_type, "body"), []))


def _candidates(topic, artist, recent):
    out = []
    for template in scene_phrases("hook"):
        try:
            text = template.format(idea=topic or "this drop", artist=artist or "the artist")
        except (KeyError, IndexError, ValueError):
            continue
        out.append(text)
        with _lock:
            if len(recent) >= 200:
                recent.pop(next(iter(recent)))
            recent[text] = template
    return out


def hook_candidates(topic: str, artist: str) -> List[str]:
    return _candidates(topic, artist, _recent_hooks)


def image_headline_candidates(topic: str, artist: str) -> List[str]:
    doc = get_doc()
    out = _candidates(topic, artist, _recent_image_headlines)
    for template in doc["templates"].get("image_headline", []):
        try:
            text = template.format(idea=topic or "this drop", artist=artist or "the artist")
        except (KeyError, IndexError, ValueError):
            continue
        if text not in out:
            out.append(text)
            with _lock:
                if len(_recent_image_headlines) >= 200:
                    _recent_image_headlines.pop(next(iter(_recent_image_headlines)))
                _recent_image_headlines[text] = template
    return out


def _graduate(recent, winner, corpus_key):
    with _lock:
        template = recent.get(winner)
    if not template:
        return False
    from storage_client import get_storage
    store = get_storage()
    if template in store.lrange(corpus_key, 0, 499):
        return False
    store.lpush(corpus_key, template)
    store.ltrim(corpus_key, 0, 499)
    return True


def graduate_hook(winner: str) -> bool:
    return _graduate(_recent_hooks, winner, "phrases:hook")


def graduate_image_headline(winner: str) -> bool:
    return _graduate(_recent_image_headlines, winner, "phrases:image_headline")


def platform_awareness_string(platform: str) -> str:
    if self_sufficiency()["retired"]:
        return ""
    snapshot = current_snapshot()
    if snapshot is None:
        return ""
    return conditioning(snapshot, platform, "text")


def veo_dna(platform: str = "") -> str:
    if self_sufficiency("video")["retired"]:
        return ""
    snapshot = current_snapshot()
    if snapshot is None:
        return ""
    return conditioning(snapshot, platform, "video")


def brief_enrichment() -> Dict[str, str]:
    if self_sufficiency()["retired"]:
        return {"directive": "", "note": "Admin corpus reached its configured self-sufficiency threshold"}
    snapshot = current_snapshot()
    if snapshot is None:
        return {"directive": "", "note": "Live awareness is not currently available"}
    return {"directive": conditioning(snapshot, "", "brief"),
            "note": "Live awareness snapshot " + snapshot.id}


def editing_pattern(seed_key: str, modality: str = "video") -> Optional[Dict[str, Any]]:
    # Chart genres do not measure camera motion or transition performance.
    return None


def music_targets(genre: str = "") -> Dict[str, Any]:
    if self_sufficiency("audio")["retired"]:
        return {}
    doc = get_doc()
    feats = doc["music_features"]
    name = (genre or "").lower().strip()
    entry = feats.get(name)
    if not entry:
        name, entry = "global", feats.get("global")
    if not entry or not entry.get("bpm_median"):
        return {}  # Optional measured audio capability; never fake a BPM.
    return {"bpm": entry["bpm_median"], "bpm_range": entry.get("bpm_range", []),
            "energy": entry.get("energy_mean"), "duration_sec": entry.get("duration_median_sec"),
            "source_genre": name, "measured_previews": entry.get("measured_previews")}


def audio_seeding_targets() -> List[Dict[str, Any]]:
    if self_sufficiency("audio")["retired"]:
        return []
    doc = get_doc()
    # Read-only compatibility: returning measured targets does not train.
    return [{"genre": name, "bpm": f["bpm_median"], "bpm_range": f.get("bpm_range", []),
             "energy": f.get("energy_mean"), "source_previews": f["measured_previews"]}
            for name, f in sorted(doc["music_features"].items())
            if name != "global" and f.get("bpm_median") and f.get("measured_previews")]


def status() -> Dict[str, Any]:
    engine_status = get_engine().status()
    return {**engine_status, **self_sufficiency(),
            "buffer_present": bool(engine_status.get("ready"))}