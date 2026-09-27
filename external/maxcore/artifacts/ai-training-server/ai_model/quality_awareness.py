"""Compatibility facade for mandatory pinned awareness.

Live knowledge never retires. The learned phrase vault and its graduation
mechanism remain secondary creative material, not evidence of current trends.
The engine is the only refresh scheduler; requests never fetch or train.
"""
from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional
from ai_model.awareness import bound_snapshot, conditioning, get_engine

DOC_KEY = "awareness:quality:doc"  # legacy document retained, never overwritten
_lock = threading.Lock()
_recent_hooks: Dict[str, str] = {}
_recent_image_headlines: Dict[str, str] = {}
_SCENE_MAP = {
    "hook": "hook", "drop": "hook", "build": "hook", "chorus": "hook",
    "body": "body", "verse": "body", "bridge": "body", "transition": "body",
    "cta": "cta", "outro": "cta",
}


def get_doc(trigger_harvest: bool = True) -> Dict[str, Any]:
    """Never lazily harvest or substitute the old unvalidated quality document."""
    doc = bound_snapshot().to_dict()
    secondary = doc.get("secondary", {})
    return {**doc, "templates": secondary.get("phrases", {}),
            "music_features": secondary.get("music_features", {}),
            "exemplars": [r for rows in doc["domains"].values() for r in rows],
            "sources": doc["source_health"]}


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
    doc = get_doc()
    phrases = doc.get("templates", {})
    return {"retired": False, "buffer_weight": 1.0, "mandatory": True,
            "own_corpus": sum(len(v) for v in phrases.values()),
            "snapshot_id": doc["id"], "modality": modality}


def scene_phrases(scene_type: str) -> List[str]:
    # These are own learned phrases pinned with the snapshot, never new
    # fabricated 'chart-proven' templates. No phrases is an optional capability
    # limit; the mandatory knowledge itself has already been required.
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
    bound_snapshot()
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
    return conditioning(bound_snapshot(), platform, "text")


def veo_dna(platform: str = "") -> str:
    return conditioning(bound_snapshot(), platform, "video")


def brief_enrichment() -> Dict[str, str]:
    snapshot = bound_snapshot()
    return {"directive": conditioning(snapshot, "", "brief"),
            "note": "Mandatory evidence snapshot " + snapshot.id}


def editing_pattern(seed_key: str, modality: str = "video") -> Optional[Dict[str, Any]]:
    bound_snapshot()
    # Chart genres do not measure camera motion or transition performance.
    return None


def music_targets(genre: str = "") -> Dict[str, Any]:
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
    doc = get_doc()
    # Read-only compatibility: returning measured targets does not train.
    return [{"genre": name, "bpm": f["bpm_median"], "bpm_range": f.get("bpm_range", []),
             "energy": f.get("energy_mean"), "source_previews": f["measured_previews"]}
            for name, f in sorted(doc["music_features"].items())
            if name != "global" and f.get("bpm_median") and f.get("measured_previews")]


def status() -> Dict[str, Any]:
    return get_engine().status()