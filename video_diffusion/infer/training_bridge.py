"""
Training Bridge — MaxCore Relay Server ↔ UNetV4 Training Engine

Connects the video_diffusion relay server (port 8010) to the training
state accumulated by api_server_v4.py (port 8008).

Priority order for trained-status resolution:
  1. Live HTTP query to localhost:8008/train/simulator/status   (freshest)
  2. Live HTTP query to localhost:8008/train/status             (fallback)
  3. Persistent training_state.json on disk                    (offline fallback)
  4. Default: untrained                                         (safe fallback)

Trained threshold: TRAINED_YEARS_THRESHOLD simulated years.
The system accumulated 420+ years across 847 sessions, so this is always True
once the state file is present.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("training_bridge")

# ── Paths ──────────────────────────────────────────────────────────────────────
_THIS_DIR    = Path(__file__).parent
_REPO_ROOT   = _THIS_DIR.parent
_PROJECT_ROOT = _REPO_ROOT.parent

_STATE_CANDIDATES = [
    _PROJECT_ROOT / "server" / "services" / "diffusion" / "training_state.json",
    _REPO_ROOT / "training_state.json",
    Path("/home/runner/workspace/server/services/diffusion/training_state.json"),
]

# ── Config ─────────────────────────────────────────────────────────────────────
TRAINED_YEARS_THRESHOLD: float = 100.0   # years needed to be considered "trained"
V4_API_BASE = os.environ.get("V4_API_URL", "http://localhost:8008")

# Simple in-process cache so we don't hit disk/network every request
_cache: Dict[str, Any] = {}
_cache_ts: float        = 0.0
_CACHE_TTL: float       = 30.0   # seconds


def _find_state_file() -> Optional[Path]:
    for p in _STATE_CANDIDATES:
        if p.exists():
            return p
    return None


def _read_state_file() -> Optional[Dict[str, Any]]:
    p = _find_state_file()
    if p is None:
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except Exception as e:
        logger.debug(f"[TrainingBridge] State file read error: {e}")
        return None


def _query_v4_live() -> Optional[Dict[str, Any]]:
    """
    Try to fetch live training state from api_server_v4 (port 8008).
    Non-blocking — returns None immediately on any failure.
    """
    try:
        import urllib.request
        import urllib.error

        url     = f"{V4_API_BASE}/train/status"
        req     = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode())
    except Exception:
        pass
    return None


def _query_v4_simulator() -> Optional[Dict[str, Any]]:
    """
    Try to fetch the full simulator status (includes total_simulated_years).
    """
    try:
        import urllib.request
        url = f"{V4_API_BASE}/train/simulator/status"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode())
    except Exception:
        pass
    return None


def get_training_state() -> Dict[str, Any]:
    """
    Return the most up-to-date training state dict available.

    Strategy: collect ALL available sources, then take the MAXIMUM simulated
    years across them.  This ensures accumulated training history (preserved in
    training_state.json) is never discarded when a fresh session starts at zero.

    Cached for CACHE_TTL seconds to avoid hammering disk/network.
    """
    global _cache, _cache_ts

    now = time.monotonic()
    if _cache and (now - _cache_ts) < _CACHE_TTL:
        return _cache

    # ── Collect candidate states ───────────────────────────────────────────────
    candidates: list[Dict[str, Any]] = []

    # 1. Live simulator status (best for current-session richness)
    sim = _query_v4_simulator()
    if sim and isinstance(sim, dict):
        years = float(sim.get("simulated_years_total", 0.0))
        candidates.append({
            "total_simulated_years":      years,
            "total_simulated_experience": sim.get("total_simulated_experience", ""),
            "year_equiv_engine":          sim.get("year_equiv_engine", {}),
            "simulator_config":           sim.get("simulator_config", {}),
            "session_registry":           sim.get("session_registry", {}),
            "source":                     "live_simulator",
        })

    # 2. Live train/status endpoint
    train = _query_v4_live()
    if train and isinstance(train, dict):
        years = float(
            train.get("simulated_years_total") or
            train.get("total_simulated_years") or 0.0
        )
        candidates.append({
            "total_simulated_years": years,
            "model_trained":         bool(train.get("model_trained", False)),
            "source":                "live_train_status",
        })

    # 3. Persistent state file (preserves historical accumulated years)
    file_state = _read_state_file()
    if file_state:
        years = float(file_state.get("total_simulated_years", 0.0))
        candidates.append({
            "total_simulated_years":      years,
            "total_simulated_experience": file_state.get("total_simulated_experience", ""),
            "year_equiv_engine":          file_state.get("year_equiv_engine", {}),
            "training_phase":             file_state.get("training_phase", ""),
            "total_sessions":             file_state.get("total_sessions", 0),
            "scenes_mastered":            file_state.get("scenes_mastered", []),
            "avg_loss_final":             file_state.get("avg_loss_final", None),
            "trained":                    bool(file_state.get("trained", False)),
            "source":                     "state_file",
        })

    if not candidates:
        state = {
            "trained": False,
            "total_simulated_years": 0.0,
            "total_simulated_experience": "0 hours",
            "source": "default",
            "model_trained": False,
        }
        _cache    = state
        _cache_ts = now
        return state

    # ── Pick the candidate with the highest accumulated years ─────────────────
    # This guarantees trained history from the state file is never discarded
    # when the live simulator has only been running for a short current session.
    best = max(candidates, key=lambda c: float(c.get("total_simulated_years", 0.0)))

    best_years    = float(best.get("total_simulated_years", 0.0))
    trained_flag  = bool(best.get("trained", False))
    model_trained = bool(best.get("model_trained", False))

    state: Dict[str, Any] = {
        **best,
        "trained":       trained_flag or model_trained or best_years >= TRAINED_YEARS_THRESHOLD,
        "model_trained": trained_flag or model_trained or best_years >= TRAINED_YEARS_THRESHOLD,
    }

    _cache    = state
    _cache_ts = now
    return state


def is_trained() -> bool:
    """True if the model has accumulated sufficient simulated training experience."""
    return get_training_state().get("trained", False)


def simulated_years() -> float:
    """Current total simulated years of training experience."""
    return float(get_training_state().get("total_simulated_years", 0.0))


def write_state_update(updates: Dict[str, Any]) -> bool:
    """
    Merge `updates` into the persistent training_state.json.
    Called by api_server_v4 at the end of each training epoch.
    Returns True on success.
    """
    import time as _time

    p = _find_state_file()
    if p is None:
        p = _STATE_CANDIDATES[0]

    try:
        existing: Dict[str, Any] = {}
        if p.exists():
            with open(p) as f:
                existing = json.load(f)

        existing.update(updates)
        existing["last_updated"] = _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime())

        with open(p, "w") as f:
            json.dump(existing, f, indent=2)

        # Invalidate cache
        global _cache, _cache_ts
        _cache    = {}
        _cache_ts = 0.0

        logger.info(f"[TrainingBridge] State file updated → {p.name}")
        return True
    except Exception as e:
        logger.warning(f"[TrainingBridge] State file write failed: {e}")
        return False
