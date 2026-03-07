"""
MaxCore Local Peak Training Node
=================================
Run this on your local Windows machine alongside the Replit server.
Both nodes train independently and periodically merge weights via
Federated Averaging — combining the gradient progress from two machines.

SETUP (one-time):
  1. pip install fastapi uvicorn numpy
  2. Copy the entire  server/services/diffusion/  folder next to this file
     so the layout is:
         D:/ai_server/maxcore_server.py
         D:/ai_server/diffusion/trainer.py
         D:/ai_server/diffusion/unet_v4.py
         D:/ai_server/diffusion/...
  3. python maxcore_server.py

The Replit server will automatically detect PEER_TRAINING_NODE env var
and sync weights with this node every 10 sessions.

Endpoints:
  GET  /health              — status + training state
  GET  /weights             — download this node's weights_v4.npz
  POST /weights             — upload weights + trigger FedAvg merge
  POST /train/start         — start background training
  POST /train/stop          — stop background training
  GET  /train/status        — live training metrics
"""

import io
import json
import math
import os
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).resolve().parent
DIFFUSION   = ROOT / "diffusion"
WEIGHTS     = ROOT / "weights_v4.npz"
WEIGHTS_BEST= ROOT / "weights_v4_best.npz"
META        = ROOT / "meta_v4.json"
PROGRESS    = ROOT / "curriculum_progress.json"

# Make the diffusion package importable
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT.parent) not in sys.path:
    sys.path.insert(0, str(ROOT.parent))

# ── Training state ─────────────────────────────────────────────────────────────
_train_lock  = threading.Lock()
_stop_event  = threading.Event()
_train_thread: Optional[threading.Thread] = None

_state: Dict[str, Any] = {
    "status":        "idle",
    "phase":         0,
    "phase_name":    "",
    "session_count": 0,
    "total_samples": 0,
    "elapsed_sec":   0,
    "loss":          None,
    "loss_history":  [],
    "last_merge":    None,
    "error":         None,
    "start_time":    None,
}

_best_loss = [float("inf")]


def _set(**kwargs):
    with _train_lock:
        _state.update(kwargs)


# ── FedAvg weight merge ────────────────────────────────────────────────────────

def merge_weights(local_path: Path, remote_bytes: bytes) -> int:
    """
    Federated Averaging: average local and remote weights element-wise.
    Returns number of arrays merged.
    """
    if not local_path.exists():
        local_path.write_bytes(remote_bytes)
        return 0

    local  = dict(np.load(str(local_path),  allow_pickle=False))
    remote = dict(np.load(io.BytesIO(remote_bytes), allow_pickle=False))

    merged = {}
    for k in local:
        if k in remote and local[k].shape == remote[k].shape:
            merged[k] = ((local[k].astype(np.float32)
                          + remote[k].astype(np.float32)) * 0.5)
        else:
            merged[k] = local[k]

    np.savez_compressed(str(local_path), **merged)
    print(f"[FedAvg] Merged {len(merged)} arrays", flush=True)

    # Update best checkpoint
    if _state["loss"] is not None:
        loss = float(_state["loss"])
        if loss < _best_loss[0]:
            _best_loss[0] = loss
            import shutil
            shutil.copy2(str(local_path), str(WEIGHTS_BEST))

    return len(merged)


# ── Background training worker ─────────────────────────────────────────────────

def _training_worker():
    try:
        if not DIFFUSION.exists():
            raise RuntimeError(
                f"diffusion/ folder not found at {DIFFUSION}\n"
                "Copy server/services/diffusion/ next to this file."
            )

        from diffusion.training_curriculum import CurriculumTrainer

        trainer = CurriculumTrainer(progress_path=str(PROGRESS))
        _orig_rs = trainer.run_session

        def _patched_rs(phase=None):
            import time as _t
            sched   = trainer.scheduler
            phase_o = phase if phase else sched.current_phase
            _set(status="running",
                 phase=phase_o.phase_id,
                 phase_name=phase_o.name)
            t0   = _t.time()
            meta = _orig_rs(phase)
            elapsed = _t.time() - t0
            loss = meta.get("final_loss", meta.get("mean_loss"))
            with _train_lock:
                _state["session_count"] += 1
                _state["total_samples"] += (
                    meta.get("samples_per_epoch", 0) * meta.get("epochs", 0)
                )
                _state["elapsed_sec"] += elapsed
                if loss is not None:
                    _state["loss"] = round(float(loss), 6)
                    _state["loss_history"].append({
                        "session": _state["session_count"],
                        "loss":    round(float(loss), 6),
                        "phase":   _state["phase"],
                        "ts":      _t.time(),
                    })
                    if len(_state["loss_history"]) > 200:
                        _state["loss_history"] = _state["loss_history"][-200:]
            return meta

        trainer.run_session = _patched_rs
        trainer.run_month(
            sleep_between_sessions_sec=15,
            stop_event=_stop_event,
            deadline_str="2026-04-03",
        )
        _set(status="stopped" if _stop_event.is_set() else "idle")

    except Exception as e:
        import traceback
        _set(status="error", error=str(e))
        print(f"[TrainingWorker] Error: {e}\n{traceback.format_exc()}", flush=True)


# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(title="MaxCore Local Peak Node", version="2.0.0")


@app.get("/health")
def health():
    with _train_lock:
        snap = dict(_state)
    return {
        "status":          snap["status"],
        "weights_exist":   WEIGHTS.exists(),
        "weights_kb":      (WEIGHTS.stat().st_size // 1024) if WEIGHTS.exists() else 0,
        "session_count":   snap["session_count"],
        "loss":            snap["loss"],
        "phase":           snap["phase"],
        "phase_name":      snap["phase_name"],
        "last_merge":      snap["last_merge"],
        "diffusion_ready": DIFFUSION.exists(),
    }


# ── Weight endpoints ────────────────────────────────────────────────────────────

@app.get("/weights")
def get_weights():
    """Download this node's weights_v4.npz."""
    if not WEIGHTS.exists():
        raise HTTPException(status_code=404, detail="No weights yet — training hasn't saved yet.")
    data = WEIGHTS.read_bytes()
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=weights_v4.npz"},
    )


@app.post("/weights")
async def post_weights(request: Request):
    """
    Receive weights from Replit node.
    If we already have weights, performs FedAvg merge and saves result.
    """
    body = await request.body()
    if len(body) < 100:
        raise HTTPException(status_code=400, detail="Empty or too-small weight payload.")
    n = merge_weights(WEIGHTS, body)
    _set(last_merge=time.time())
    return {"merged_arrays": n, "weights_kb": WEIGHTS.stat().st_size // 1024}


@app.get("/weights/best")
def get_best_weights():
    """Download the best (lowest-loss) checkpoint."""
    path = WEIGHTS_BEST if WEIGHTS_BEST.exists() else WEIGHTS
    if not path.exists():
        raise HTTPException(status_code=404, detail="No best weights yet.")
    data = path.read_bytes()
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=weights_v4_best.npz"},
    )


# ── Training control endpoints ─────────────────────────────────────────────────

@app.post("/train/start")
def train_start():
    global _train_thread
    with _train_lock:
        if _state["status"] == "running":
            return {"ok": False, "detail": "Already running."}
        _stop_event.clear()
        _state["error"]      = None
        _state["status"]     = "running"
        _state["start_time"] = time.time()

    _train_thread = threading.Thread(
        target=_training_worker, daemon=True, name="MaxCoreTrainer"
    )
    _train_thread.start()
    return {"ok": True, "detail": "Training started (continuous, deadline 2026-04-03)"}


@app.post("/train/stop")
def train_stop():
    _stop_event.set()
    _set(status="stopping")
    return {"ok": True, "detail": "Stop signal sent."}


@app.get("/train/status")
def train_status():
    with _train_lock:
        snap = dict(_state)
        snap["loss_history"] = snap["loss_history"][-20:]
    return snap


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  MaxCore Local Peak Training Node")
    print("=" * 60)
    print(f"  Root:      {ROOT}")
    print(f"  Weights:   {WEIGHTS}")
    print(f"  Diffusion: {DIFFUSION} ({'OK' if DIFFUSION.exists() else 'MISSING — copy diffusion/ folder'})")
    print()
    print("  Auto-starting training in 5 seconds...")
    print("  Replit will sync weights to this node every 10 sessions.")
    print()

    # Auto-start training after 5 sec delay
    def _delayed_start():
        time.sleep(5)
        train_start()

    threading.Thread(target=_delayed_start, daemon=True).start()

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
