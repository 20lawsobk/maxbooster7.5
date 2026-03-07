"""
MaxCore Model Knowledge Server
================================
Runs on your local machine (D:/ai_server) and serves as the authoritative
storage layer for all BASE AI model knowledge:

  D:/ai_server/
    models/           ← weights, checkpoints, version history
    datasets/         ← HMDB51, UCF101, FMA, GTZAN, MusicCaps, etc.
    knowledge/        ← curriculum progress, loss logs, session records
    logs/             ← training session logs

The Replit server handles:
  - User journey data  → Pocket Dimension (per-user encrypted space)
  - Live API / serving → Node.js app

Together they form a two-tier knowledge architecture:
  Base Model Knowledge (D: drive) + User Journey Knowledge (Pocket Dimension)

SETUP:
  1. pip install fastapi uvicorn numpy
  2. Copy server/services/diffusion/ folder next to this file
  3. Set PEER_TRAINING_NODE=http://<this-machine-ip>:8000 in Replit secrets
  4. python maxcore_server.py

Endpoints (all prefixed /):
  GET  /health                        — system status
  GET  /models/list                   — all saved model versions
  GET  /models/weights                — download current weights_v4.npz
  GET  /models/best                   — download best checkpoint
  POST /models/weights                — receive + FedAvg merge weights
  GET  /knowledge/curriculum          — curriculum progress JSON
  POST /knowledge/curriculum          — update curriculum progress
  GET  /knowledge/loss-history        — all-time loss history
  GET  /datasets/list                 — datasets on D: drive with sizes
  POST /train/start                   — start background training
  POST /train/stop                    — stop background training
  GET  /train/status                  — live training metrics
"""

import io
import json
import os
import shutil
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel

# ── Directory layout ─────────────────────────────────────────────────────────

ROOT       = Path(__file__).resolve().parent
MODELS_DIR = ROOT / "models"
DATA_DIR   = ROOT / "datasets"
KNOW_DIR   = ROOT / "knowledge"
LOGS_DIR   = ROOT / "logs"
DIFFUSION  = ROOT / "diffusion"

for d in [MODELS_DIR / "versions", DATA_DIR, KNOW_DIR, LOGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

WEIGHTS      = MODELS_DIR / "weights_v4.npz"
WEIGHTS_BEST = MODELS_DIR / "weights_v4_best.npz"
META         = MODELS_DIR / "meta_v4.json"
CURRICULUM   = KNOW_DIR   / "curriculum_progress.json"
LOSS_LOG     = KNOW_DIR   / "loss_history.json"
SESSION_LOG  = KNOW_DIR   / "session_log.json"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# ── Training state ────────────────────────────────────────────────────────────

_lock  = threading.Lock()
_stop  = threading.Event()
_thread: Optional[threading.Thread] = None
_best_loss = [float("inf")]

_state: Dict[str, Any] = {
    "status":        "idle",
    "phase":         0,
    "phase_name":    "",
    "session_count": 0,
    "total_steps":   0,
    "elapsed_sec":   0.0,
    "loss":          None,
    "last_merge_ts": None,
    "error":         None,
    "start_time":    None,
}


def _upd(**kw):
    with _lock:
        _state.update(kw)


# ── Loss + session logging ────────────────────────────────────────────────────

def _append_loss(session: int, loss: float, phase: int):
    history = []
    if LOSS_LOG.exists():
        try:
            history = json.loads(LOSS_LOG.read_text())
        except Exception:
            pass
    history.append({"session": session, "loss": loss,
                     "phase": phase, "ts": time.time()})
    LOSS_LOG.write_text(json.dumps(history[-2000:], indent=2))


def _append_session(meta: dict):
    log = []
    if SESSION_LOG.exists():
        try:
            log = json.loads(SESSION_LOG.read_text())
        except Exception:
            pass
    log.append({**meta, "saved_at": datetime.utcnow().isoformat()})
    SESSION_LOG.write_text(json.dumps(log[-500:], indent=2))


# ── Model version archiving ──────────────────────────────────────────────────

def _archive_weights(tag: str = ""):
    """Copy current weights to models/versions/ with a timestamped name."""
    if not WEIGHTS.exists():
        return
    ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    name = f"weights_v4_{ts}{'_' + tag if tag else ''}.npz"
    dest = MODELS_DIR / "versions" / name
    shutil.copy2(str(WEIGHTS), str(dest))
    # Keep only the 20 most recent versions to avoid filling the drive
    versions = sorted((MODELS_DIR / "versions").glob("weights_v4_*.npz"))
    for old in versions[:-20]:
        old.unlink()
    return dest.name


# ── FedAvg merge ─────────────────────────────────────────────────────────────

def _fedavg(local_path: Path, remote_bytes: bytes) -> int:
    if not local_path.exists():
        local_path.write_bytes(remote_bytes)
        return 0
    local  = dict(np.load(str(local_path), allow_pickle=False))
    remote = dict(np.load(io.BytesIO(remote_bytes), allow_pickle=False))
    merged, n = {}, 0
    for k in local:
        if k in remote and local[k].shape == remote[k].shape:
            merged[k] = (local[k].astype(np.float32)
                         + remote[k].astype(np.float32)) * 0.5
            n += 1
        else:
            merged[k] = local[k]
    np.savez_compressed(str(local_path), **merged)
    # Update best checkpoint if current loss is a record
    loss = _state.get("loss")
    if loss is not None and float(loss) < _best_loss[0]:
        _best_loss[0] = float(loss)
        shutil.copy2(str(local_path), str(WEIGHTS_BEST))
    print(f"[FedAvg] Merged {n}/{len(local)} arrays", flush=True)
    return n


# ── Background training worker ────────────────────────────────────────────────

def _worker():
    try:
        if not DIFFUSION.exists():
            raise RuntimeError(
                f"diffusion/ folder not found at {DIFFUSION}. "
                "Copy server/services/diffusion/ next to this file."
            )

        from diffusion.training_curriculum import CurriculumTrainer

        trainer    = CurriculumTrainer(progress_path=str(CURRICULUM))
        _orig_rs   = trainer.run_session

        def _patched(phase=None):
            sched   = trainer.scheduler
            phase_o = phase if phase else sched.current_phase
            _upd(status="running",
                 phase=phase_o.phase_id,
                 phase_name=phase_o.name)
            t0   = time.time()
            meta = _orig_rs(phase)
            elapsed = time.time() - t0
            loss = meta.get("final_loss", meta.get("mean_loss"))
            with _lock:
                _state["session_count"] += 1
                _state["total_steps"]   += (meta.get("samples_per_epoch", 0)
                                            * meta.get("epochs", 0))
                _state["elapsed_sec"]   += elapsed
                if loss is not None:
                    _state["loss"] = round(float(loss), 6)
                    _append_loss(_state["session_count"],
                                 round(float(loss), 6),
                                 _state["phase"])
            _append_session(meta)
            # Archive weights every 10 sessions
            if _state["session_count"] % 10 == 0:
                _archive_weights(f"s{_state['session_count']}")
            return meta

        trainer.run_session = _patched
        trainer.run_month(
            sleep_between_sessions_sec=15,
            stop_event=_stop,
            deadline_str="2026-04-03",
        )
        _upd(status="stopped" if _stop.is_set() else "idle")

    except Exception as e:
        import traceback
        _upd(status="error", error=str(e))
        print(f"[Worker] {e}\n{traceback.format_exc()}", flush=True)


# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="MaxCore Model Knowledge Server", version="3.0.0")


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    versions = len(list((MODELS_DIR / "versions").glob("*.npz")))
    datasets = {p.name: round(sum(f.stat().st_size for f in p.rglob("*")
                                   if f.is_file()) / 1e9, 2)
                for p in DATA_DIR.iterdir() if p.is_dir()}
    with _lock:
        snap = dict(_state)
    return {
        "status":          snap["status"],
        "phase":           snap["phase"],
        "phase_name":      snap["phase_name"],
        "session_count":   snap["session_count"],
        "loss":            snap["loss"],
        "weights_kb":      (WEIGHTS.stat().st_size // 1024) if WEIGHTS.exists() else 0,
        "versions_saved":  versions,
        "datasets":        datasets,
        "diffusion_ready": DIFFUSION.exists(),
        "knowledge_root":  str(ROOT),
        "last_merge":      snap["last_merge_ts"],
        "error":           snap["error"],
    }


# ── Model endpoints ────────────────────────────────────────────────────────────

@app.get("/models/list")
def models_list():
    """List all saved model versions with size and timestamp."""
    versions = []
    for p in sorted((MODELS_DIR / "versions").glob("weights_v4_*.npz")):
        versions.append({
            "name":       p.name,
            "kb":         p.stat().st_size // 1024,
            "created_at": datetime.utcfromtimestamp(p.stat().st_mtime).isoformat(),
        })
    return {
        "current": {
            "exists": WEIGHTS.exists(),
            "kb":     (WEIGHTS.stat().st_size // 1024) if WEIGHTS.exists() else 0,
        },
        "best": {
            "exists": WEIGHTS_BEST.exists(),
            "kb":     (WEIGHTS_BEST.stat().st_size // 1024) if WEIGHTS_BEST.exists() else 0,
        },
        "versions": versions[-20:],
    }


@app.get("/models/weights")
def get_weights():
    if not WEIGHTS.exists():
        raise HTTPException(404, "No weights yet.")
    return Response(
        content=WEIGHTS.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=weights_v4.npz"},
    )


@app.get("/models/best")
def get_best():
    p = WEIGHTS_BEST if WEIGHTS_BEST.exists() else WEIGHTS
    if not p.exists():
        raise HTTPException(404, "No weights yet.")
    return Response(
        content=p.read_bytes(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=weights_v4_best.npz"},
    )


@app.post("/models/weights")
async def post_weights(request: Request):
    """Receive weights from Replit node and FedAvg merge."""
    body = await request.body()
    if len(body) < 100:
        raise HTTPException(400, "Empty payload.")
    n = _fedavg(WEIGHTS, body)
    _upd(last_merge_ts=time.time())
    _archive_weights("merge")
    return {"merged_arrays": n,
            "weights_kb": WEIGHTS.stat().st_size // 1024}


# ── Knowledge endpoints ────────────────────────────────────────────────────────

@app.get("/knowledge/curriculum")
def get_curriculum():
    if not CURRICULUM.exists():
        return {}
    return json.loads(CURRICULUM.read_text())


@app.post("/knowledge/curriculum")
async def post_curriculum(request: Request):
    body = await request.body()
    CURRICULUM.write_bytes(body)
    return {"ok": True, "bytes": len(body)}


@app.get("/knowledge/loss-history")
def get_loss_history():
    if not LOSS_LOG.exists():
        return []
    return json.loads(LOSS_LOG.read_text())


@app.get("/knowledge/sessions")
def get_sessions():
    if not SESSION_LOG.exists():
        return []
    sessions = json.loads(SESSION_LOG.read_text())
    return sessions[-50:]


# ── Dataset registry ────────────────────────────────────────────────────────────

@app.get("/datasets/list")
def datasets_list():
    """
    List datasets available on the D: drive with size and status.
    The Replit training node uses this to know what data is accessible.
    """
    result = {}
    for p in DATA_DIR.iterdir():
        if not p.is_dir():
            continue
        files = list(p.rglob("*"))
        total = sum(f.stat().st_size for f in files if f.is_file())
        result[p.name] = {
            "path":      str(p),
            "files":     len([f for f in files if f.is_file()]),
            "total_gb":  round(total / 1e9, 3),
            "available": total > 0,
        }
    return {"datasets": result, "root": str(DATA_DIR)}


# ── Training control ───────────────────────────────────────────────────────────

@app.post("/train/start")
def train_start():
    global _thread
    with _lock:
        if _state["status"] == "running":
            return {"ok": False, "detail": "Already running."}
        _stop.clear()
        _state["error"]      = None
        _state["status"]     = "running"
        _state["start_time"] = time.time()
    _thread = threading.Thread(target=_worker, daemon=True, name="KnowledgeTrainer")
    _thread.start()
    return {"ok": True, "detail": "Training started (continuous, deadline 2026-04-03)"}


@app.post("/train/stop")
def train_stop():
    _stop.set()
    _upd(status="stopping")
    return {"ok": True}


@app.get("/train/status")
def train_status():
    with _lock:
        return dict(_state)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 65)
    print("  MaxCore Model Knowledge Server")
    print("=" * 65)
    print(f"  Knowledge root : {ROOT}")
    print(f"  Models dir     : {MODELS_DIR}")
    print(f"  Datasets dir   : {DATA_DIR}")
    print(f"  Diffusion pkg  : {'READY' if DIFFUSION.exists() else 'MISSING — copy diffusion/ folder'}")
    print()

    # Print dataset inventory
    dsets = [p for p in DATA_DIR.iterdir() if p.is_dir()] if DATA_DIR.exists() else []
    if dsets:
        print("  Datasets found:")
        for d in sorted(dsets):
            gb = sum(f.stat().st_size for f in d.rglob("*") if f.is_file()) / 1e9
            print(f"    {d.name:<25} {gb:.2f} GB")
    else:
        print("  No datasets yet — move training data to:", DATA_DIR)

    print()
    print("  Replit config:")
    print("    PEER_TRAINING_NODE = http://<your-ip>:8000")
    print()

    def _delayed():
        time.sleep(5)
        train_start()

    threading.Thread(target=_delayed, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
