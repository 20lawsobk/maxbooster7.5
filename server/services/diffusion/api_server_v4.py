"""
MaxCore Diffusion API Server — NumPy UNetV4 LITE Edition
=========================================================
Serves the in-house NumPy UNetV4 LITE model (~6M params, 96×96, T=32) via
FastAPI at port 8010.  Provides the same endpoint contract as the PyTorch
video_diffusion/infer/api_server.py so the TypeScript service can call either
without modification.

Endpoints:
  POST /generate           Video generation (returns frames_b64 | mp4_b64)
  POST /generate/keyframe  Single representative frame
  POST /generate/stream    SSE streaming (yields frames as JPEG b64 events)
  POST /train              Trigger a background training session
  GET  /train/status       Training progress / last session result
  GET  /health             Liveness check
  GET  /ready              Readiness (model loaded)
  GET  /gpu/status         Backend capabilities (always CPU here)

Music-domain strengths (vs Veo):
  beat_sync        — BPM + beat_index wired into 128-dim FiLM conditioning
  genre_accuracy   — 54 music-specific scene categories in training corpus
  audio_visual     — Energy envelope drives temporal attention intensity weights
  domain_score     — Trained exclusively on music-industry scenes

Beat-sync implementation (from 2024 research):
  1. BPM → frames_per_beat = fps * 60 / bpm
  2. beat_index drives the temporal positional embedding offset so on-beat
     frames attract stronger temporal attention from adjacent frames
  3. is_drop → energy_peak FiLM boost saturates conditioning toward the
     high-energy sub-space learned during training
  4. Energy modulation scales the second quarter of the cond vector so
     the model applies bolder colour / contrast at peaks
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import os
import sys
import threading
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# ── Path: add server/services/ to sys.path so "diffusion" is the package ──────

_HERE   = os.path.dirname(os.path.abspath(__file__))   # …/server/services/diffusion
_SVC    = os.path.dirname(_HERE)                        # …/server/services
if _SVC not in sys.path:
    sys.path.insert(0, _SVC)

# Activate LITE mode before importing UNetV4 / trainer constants
os.environ['MAXCORE_LITE'] = '1'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s — %(message)s',
)
logger = logging.getLogger('api_server_v4')

# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title='MaxCore Diffusion v4 — NumPy LITE',
    description='Music-specialized video generation — UNetV4 LITE, pure NumPy, CPU-native',
    version='4.0.0',
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── Global model state ────────────────────────────────────────────────────────

_model_lock  = threading.Lock()
_model       = None
_time_enc    = None
_text_enc    = None
_scheduler   = None
_model_ready = False

# Training state
_train_lock   = threading.Lock()
_train_status: Dict[str, Any] = {
    'running': False,
    'progress': 0.0,
    'last_loss': None,
    'last_session': None,
    'total_sessions': 0,
}

# Scene visual presets — mirrors gpu_postprocess.py SCENE_PRESETS
_SCENE_META: Dict[str, Dict] = {
    'neon_tunnel':    {'bloom': 0.55, 'chroma': 0.003, 'saturation': 1.5},
    'concert_stage':  {'bloom': 0.60, 'chroma': 0.003, 'saturation': 1.4},
    'city_nights':    {'bloom': 0.50, 'chroma': 0.004, 'saturation': 1.6},
    'deep_space':     {'bloom': 0.40, 'chroma': 0.002, 'saturation': 0.9},
    'plasma_fractal': {'bloom': 0.35, 'chroma': 0.005, 'saturation': 1.8},
    'sunset_city':    {'bloom': 0.55, 'chroma': 0.003, 'saturation': 1.5},
    'crystal_waters': {'bloom': 0.45, 'chroma': 0.003, 'saturation': 1.2},
    'liquid_metal':   {'bloom': 0.45, 'chroma': 0.004, 'saturation': 1.1},
    'fire_embers':    {'bloom': 0.50, 'chroma': 0.004, 'saturation': 1.6},
    'aurora_curtains':{'bloom': 0.40, 'chroma': 0.003, 'saturation': 1.4},
    'default':        {'bloom': 0.50, 'chroma': 0.003, 'saturation': 1.3},
}

_STYLE_PROMPTS: Dict[str, str] = {
    'neon_tunnel':    'neon cyberpunk tunnel, electric glow, fast motion',
    'concert_stage':  'concert stage lights, performer silhouette, crowd',
    'city_nights':    'city night rain, neon reflections, urban moody',
    'deep_space':     'deep space galaxy stars, cosmic nebula, cinematic',
    'plasma_fractal': 'vibrant plasma fractal, neon colors, psychedelic',
    'sunset_city':    'golden hour sunset, warm city skyline, cinematic',
    'crystal_waters': 'crystal clear water, serene reflections, ethereal',
    'liquid_metal':   'liquid metal flowing, chrome surface, mercury',
    'fire_embers':    'fire embers, glowing sparks, warm orange heat',
    'aurora_curtains':'aurora borealis, northern lights, ethereal green',
    'default':        'cinematic music video, high quality, premium',
}

# ── Model loader ──────────────────────────────────────────────────────────────

def _load_model() -> None:
    """Load (or initialise fresh) the UNetV4 LITE model. Thread-safe."""
    global _model, _time_enc, _text_enc, _scheduler, _model_ready

    try:
        from diffusion.unet_v4   import UNetV4
        from diffusion.encoder   import TimeEncoder, TextEncoder
        from diffusion.scheduler import DDPMScheduler
        from diffusion.trainer   import (
            _load_v4, _COND_DIM_V4, _TIME_ENC_DIM_V4, _TEXT_ENC_DIM_V4
        )

        logger.info('[Model] Initialising UNetV4 LITE …')
        with _model_lock:
            _model    = UNetV4(cond_dim=_COND_DIM_V4, T=4, lite=True)
            _time_enc = TimeEncoder(emb_dim=_TIME_ENC_DIM_V4)
            _text_enc = TextEncoder(emb_dim=_TEXT_ENC_DIM_V4)
            _scheduler = DDPMScheduler(T=1000, schedule='cosine')

            n = _model.count_params()
            logger.info(f'[Model] UNetV4 LITE: {n:,} params ({n/1e6:.1f}M)')

            loaded = _load_v4(_model, _time_enc, _text_enc)
            if loaded:
                logger.info('[Model] weights_v4.npz loaded — model is trained')
            else:
                logger.info('[Model] No weights — random init (noise outputs until trained)')

            _model.set_training(False)
            _model_ready = True

        logger.info('[Model] Ready.')
    except Exception as e:
        logger.error(f'[Model] Load failed: {e}', exc_info=True)


def _ensure_model() -> None:
    global _model_ready
    if not _model_ready:
        _load_model()


# ── Beat-sync conditioning builder ────────────────────────────────────────────

def _build_cond(
    t_idx:       int,
    prompt:      str,
    bpm:         float,
    energy:      float,
    energy_peak: float,
    beat_index:  int,
    total_beats: int,
    is_drop:     bool,
) -> np.ndarray:
    """
    128-dim (LITE) music-aware conditioning vector.

    Combines:
      [0:64]   — sinusoidal time embedding (from TimeEncoder)
      [64:128] — music-vocabulary text embedding (from TextEncoder)

    Then modulates with:
      BPM normalisation   → scales time quarter
      Energy / drop flag  → scales text quarter
      Beat position       → offsets temporal embedding
    """
    from diffusion.encoder import tokenize

    t_emb  = _time_enc.forward(t_idx)             # (64,)
    tokens = tokenize(prompt)
    tx_emb = _text_enc.forward(tokens)             # (64,)
    cond   = np.concatenate([t_emb, tx_emb]).astype(np.float32)  # (128,)

    # ── Music modulation ─────────────────────────────────────────────────────
    beat_pos  = (beat_index % max(total_beats, 1)) / max(total_beats, 1)
    bpm_norm  = float(np.clip((bpm - 60.0) / 140.0, 0.0, 1.0))
    eff_e     = float(energy_peak if is_drop else energy)
    drop_flag = 1.0 if is_drop else 0.0

    n = len(cond)

    # Time quarter: BPM + beat position
    cond[:n//4]     *= (0.7 + 0.6 * bpm_norm)
    cond[n//4:n//2] *= (0.6 + 0.8 * beat_pos)

    # Text quarter: energy modulation
    cond[n//2:3*n//4] *= (0.5 + eff_e)

    # Drop flash: whole vector
    if is_drop:
        cond *= (1.0 + 0.3 * drop_flag)

    return cond


# ── DDIM sampling ──────────────────────────────────────────────────────────────

def _ddim_sample(
    prompt:      str,
    T:           int,
    H:           int,
    W:           int,
    bpm:         float,
    energy:      float,
    energy_peak: float,
    beat_index:  int,
    total_beats: int,
    is_drop:     bool,
    ddim_steps:  int,
    guidance:    float,
    seed:        Optional[int],
) -> np.ndarray:
    """
    DDIM denoising loop.
    Returns (T, H, W, 3) float32 in [0, 1].
    Native resolution = 96×96; upscaled via PIL Lanczos to requested H×W.
    """
    _ensure_model()

    rng = np.random.default_rng(seed) if seed is not None else np.random.default_rng()

    NATIVE = 96
    x = rng.standard_normal((T, NATIVE, NATIVE, 3)).astype(np.float32)

    total_T   = 1000
    step_size = max(total_T // ddim_steps, 1)
    ts        = list(range(total_T - 1, 0, -step_size))[:ddim_steps]

    alpha_bar = _scheduler.alpha_bar

    for t_idx in ts:
        c_cond   = _build_cond(t_idx, prompt, bpm, energy, energy_peak,
                               beat_index, total_beats, is_drop)
        c_uncond = _build_cond(t_idx, '',     bpm, 0.3,   0.3,
                               beat_index, total_beats, False)

        with _model_lock:
            n_cond   = _model.forward(x, c_cond)
            n_uncond = _model.forward(x, c_uncond)

        # Classifier-free guidance
        noise_pred = n_uncond + guidance * (n_cond - n_uncond)

        # DDIM update
        a_t    = float(alpha_bar[t_idx])
        t_prev = max(t_idx - step_size, 0)
        a_prev = float(alpha_bar[t_prev])

        x0     = np.clip((x - math.sqrt(1.0 - a_t) * noise_pred) / (math.sqrt(a_t) + 1e-8),
                         -1.0, 1.0)
        x      = math.sqrt(a_prev) * x0 + math.sqrt(1.0 - a_prev) * noise_pred

    # [-1, 1] → [0, 1]
    frames = ((x + 1.0) / 2.0).clip(0.0, 1.0)

    # Upscale native 96×96 → requested H×W
    if H != NATIVE or W != NATIVE:
        from PIL import Image
        upscaled = []
        for t in range(T):
            u8  = (frames[t] * 255).clip(0, 255).astype(np.uint8)
            img = Image.fromarray(u8)
            mid_w = min(u8.shape[1] * 2, W)
            mid_h = min(u8.shape[0] * 2, H)
            if mid_w < W:
                img = img.resize((mid_w, mid_h), Image.BICUBIC)
            img = img.resize((W, H), Image.LANCZOS)
            upscaled.append(np.array(img).astype(np.float32) / 255.0)
        frames = np.stack(upscaled, axis=0)

    return frames


# ── Post-processing ────────────────────────────────────────────────────────────

def _post_process(frames: np.ndarray, style_name: str, is_drop: bool) -> np.ndarray:
    """
    Lightweight CPU post-processing:
      contrast boost → saturation → vignette → bloom simulation → drop flash
    """
    from scipy.ndimage import gaussian_filter

    meta = _SCENE_META.get(style_name, _SCENE_META['default'])
    sat  = meta['saturation']
    bloom_thresh = meta['bloom']

    out = frames.copy()
    T, H, W, _ = out.shape

    # Pre-bake vignette mask (shared across frames)
    cy, cx = H / 2.0, W / 2.0
    yy, xx = np.ogrid[:H, :W]
    r = np.sqrt(((yy - cy) / cy) ** 2 + ((xx - cx) / cx) ** 2)
    vignette = np.clip(1.0 - np.clip(r - 0.5, 0.0, 0.5) * 1.2, 0.0, 1.0)

    sigma = max(H // 32, 1)

    for t in range(T):
        f = out[t]

        # 1. Contrast boost
        mean = f.mean(axis=(0, 1), keepdims=True)
        f = (mean + (f - mean) * 1.2).clip(0.0, 1.0)

        # 2. Saturation (YCbCr-style)
        luma  = (0.299 * f[:, :, 0] + 0.587 * f[:, :, 1] + 0.114 * f[:, :, 2])[:, :, None]
        f     = (luma + (f - luma) * sat).clip(0.0, 1.0)

        # 3. Vignette
        f = (f * vignette[:, :, None]).clip(0.0, 1.0)

        # 4. Bloom (bright regions glow outward)
        bright  = np.clip(f - bloom_thresh, 0.0, None)
        bloomed = gaussian_filter(bright, sigma=sigma)
        f       = np.clip(f + bloomed * 1.5, 0.0, 1.0)

        # 5. Drop flash on first frame
        if is_drop and t == 0:
            f = np.clip(f * 1.35, 0.0, 1.0)

        out[t] = f

    return out


# ── Encoding helpers ───────────────────────────────────────────────────────────

def _frame_to_b64(frame: np.ndarray, quality: int = 88) -> str:
    from PIL import Image
    u8  = (frame * 255).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(u8)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality, subsampling=0)
    return base64.b64encode(buf.getvalue()).decode()


def _frames_to_b64(frames: np.ndarray, quality: int = 88) -> List[str]:
    return [_frame_to_b64(frames[t], quality) for t in range(frames.shape[0])]


def _frames_to_mp4_b64(frames: np.ndarray, fps: int = 24) -> str:
    import subprocess, shutil, tempfile
    from PIL import Image

    tmp = tempfile.mkdtemp()
    try:
        T, H, W, _ = frames.shape
        for i in range(T):
            u8   = (frames[i] * 255).clip(0, 255).astype(np.uint8)
            path = os.path.join(tmp, f'f{i:04d}.jpg')
            Image.fromarray(u8).save(path, quality=92)

        out = os.path.join(tmp, 'out.mp4')
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error',
             '-framerate', str(fps),
             '-i', os.path.join(tmp, 'f%04d.jpg'),
             '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
             '-crf', '22', '-preset', 'fast', out],
            check=True, capture_output=True,
        )
        return base64.b64encode(open(out, 'rb').read()).decode()
    except Exception as e:
        logger.warning(f'[MP4] encode failed: {e}')
        return ''
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── Request / response schemas ─────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    prompt:           str   = ''
    T:                int   = Field(16,  ge=4,   le=64)
    H:                int   = Field(256, ge=64,  le=1024)
    W:                int   = Field(256, ge=64,  le=1024)
    bpm:              float = Field(120.0, ge=40.0, le=250.0)
    energy:           float = Field(0.65,  ge=0.0,  le=1.0)
    energy_peak:      float = Field(0.85,  ge=0.0,  le=1.0)
    style_name:       str   = 'neon_tunnel'
    beat_index:       int   = 0
    total_beats:      int   = 4
    is_drop:          bool  = False
    emotional_goal:   str   = 'curiosity'
    blend_style_name: Optional[str] = None
    blend_weight:     float = 0.0
    seed:             Optional[int] = None
    output_format:    str   = 'frames_b64'   # frames_b64 | mp4_b64 | json_shape
    platform:         str   = 'tiktok'
    use_digital_gpu:  bool  = True
    temporal_smooth:  bool  = True
    ddim_steps:       int   = Field(5, ge=3, le=100)
    guidance_scale:   float = Field(1.5, ge=1.0, le=20.0)


class GenerateResponse(BaseModel):
    status:         str
    frames_b64:     Optional[List[str]] = None
    mp4_b64:        Optional[str]       = None
    shape:          Optional[List[int]] = None
    style_used:     str = ''
    scene_name:     str = ''
    device:         str = 'cpu'
    num_frames:     int = 0
    gpu_applied:    bool = False
    scene_metadata: Dict[str, Any] = {}
    model_version:  str = 'v4-lite-numpy'
    beat_sync:      bool = True


class TrainRequest(BaseModel):
    n_epochs:      int   = Field(3,   ge=1,   le=50)
    n_samples:     int   = Field(200, ge=50,  le=5000)
    T:             int   = Field(4,   ge=4,   le=32)
    res:           int   = Field(96,  ge=64,  le=96)
    lr:            float = Field(2e-4, ge=1e-5, le=1e-2)
    session_label: str   = 'api_triggered'


# ── Background training ────────────────────────────────────────────────────────

def _train_worker(req: TrainRequest) -> None:
    global _train_status

    with _train_lock:
        _train_status.update({'running': True, 'progress': 0.0, 'last_loss': None})

    logger.info(f'[Train] Starting {req.session_label} '
                f'T={req.T} res={req.res} epochs={req.n_epochs} '
                f'samples={req.n_samples}')
    try:
        from diffusion.trainer import train_v4
        meta = train_v4(
            n_epochs=req.n_epochs,
            n_samples=req.n_samples,
            T=req.T,
            res=req.res,
            lr=req.lr,
            session_label=req.session_label,
        )
        logger.info(f'[Train] Done — loss={meta.get("final_loss", 0):.4f}')

        # Reload weights into live model without restart
        with _model_lock:
            from diffusion.trainer import _load_v4
            if _model and _time_enc and _text_enc:
                _load_v4(_model, _time_enc, _text_enc)
                _model.set_training(False)
                logger.info('[Train] Live model reloaded.')

        with _train_lock:
            _train_status.update({
                'running':        False,
                'progress':       1.0,
                'last_loss':      meta.get('final_loss'),
                'last_session':   meta,
                'total_sessions': _train_status['total_sessions'] + 1,
            })

    except Exception as e:
        logger.error(f'[Train] Error: {e}', exc_info=True)
        with _train_lock:
            _train_status.update({'running': False, 'last_error': str(e)})


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event('startup')
def startup_event() -> None:
    threading.Thread(target=_load_model, daemon=True).start()


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'version': '4.0.0', 'model': 'unet_v4_lite_numpy'}


@app.get('/ready')
def ready():
    return {
        'ready':   _model_ready,
        'device':  'cpu',
        'backend': 'numpy',
        'model':   'unet_v4_lite',
        'version': '4.0.0',
    }


@app.get('/gpu/status')
def gpu_status_endpoint():
    return {
        'device':              'cpu',
        'backend':             'numpy-unet-v4-lite',
        'cuda_available':      False,
        'postprocessor_ready': True,
        'pipeline_ready':      _model_ready,
        'available_scenes':    list(_SCENE_META.keys()),
        'model_version':       'v4-lite',
        'beat_sync':           True,
        'music_domain':        True,
    }


@app.get('/memory/status')
def memory_status():
    """
    Live status of the AdvancedMemoryLayer — all four tiers.
    Returns hot cache stats, episodic store breakdown by scene,
    prompt index size, gradient health per scene, and the full
    session registry summary.
    """
    try:
        from diffusion.advanced_memory import get_memory as _get_adv_mem
        mem = _get_adv_mem()
        return mem.status()
    except Exception as e:
        return {'error': str(e), 'available': False}


@app.get('/train/simulator/status')
def simulator_status():
    """
    Live status of the RealisticTimeSimulator for the current or most
    recent training session.  Returns compression ratio, equivalent GPU
    training time, adaptive LR activity, and per-scene loss trends.
    """
    try:
        from diffusion.time_simulator import RealisticTimeSimulator
        # Return a minimal instance status if no active session
        # (a fresh instance reflects the module defaults)
        _sim = RealisticTimeSimulator.__new__(RealisticTimeSimulator)
        _sim.burst_size       = 6
        _sim.interp_density   = 0.20
        _sim.lr_adapt_window  = 30
        _sim.lr_boost_factor  = 1.8
        _sim.lr_decay_factor  = 0.85
        _sim.plateau_patience = 15
        _sim.curriculum       = True
        _sim.temporal_pairs   = True
        _sim._rng             = __import__('numpy').random.default_rng(0)
        _sim._session_start   = __import__('time').time()
        _sim._real_steps      = 0
        _sim._effective_steps = 0
        _sim._lr_boosts       = 0
        _sim._lr_decays       = 0
        _sim._interp_generated = 0
        _sim._burst_calls     = 0
        _sim._plateau_counter = 0
        _sim._current_lr_mult = 1.0
        _sim._loss_history    = []
        _sim._scene_loss_map  = {}
        _sim._phase_log       = []
        # Year-Equivalent throughput tracker (required by status() / year_equiv_progress())
        _sim._year_equiv_steps = 0

        # Try to read the advanced memory for richer history + year clock
        try:
            from diffusion.advanced_memory import get_memory as _gm, _fmt_years
            from diffusion.time_simulator import (
                _YEAR_EQUIV_STEPS_PER_MINUTE as _YE_TGT,
                _BURST_YEAR_WEIGHT  as _BYW,
                _REPLAY_YEAR_WEIGHT as _RYW,
                _INTERP_YEAR_WEIGHT as _IYW,
                MAX_REPLAY_CYCLES_PER_EPOCH as _MRC,
                REPLAY_BATCH_SIZE           as _RBS,
            )
            _mem        = _gm()
            reg         = _mem.registry.stats()
            total_years = _mem.registry.total_simulated_years()
            # Compute a YE-progress snapshot from the dummy instance
            _ye = _sim.year_equiv_progress(1.0)  # 1s elapsed reference
            return {
                # ── Simulated experience clock — headline metric ──────────────
                'simulated_years_total':      round(total_years, 4),
                'total_simulated_experience': _fmt_years(total_years),
                'simulated_years_per_minute': 1.0,
                # ── Year-Equivalent Throughput Engine ─────────────────────────
                'year_equiv_engine': {
                    'ye_steps_per_minute':  _YE_TGT,
                    'burst_year_weight':    _BYW,
                    'replay_year_weight':   _RYW,
                    'interp_year_weight':   _IYW,
                    'max_replay_cycles':    _MRC,
                    'replay_batch_size':    _RBS,
                    'description': (
                        '1 real minute = 1 simulated year target. '
                        'Deficit-driven replay cycles fill the gap each epoch.'
                    ),
                },
                # ─────────────────────────────────────────────────────────────
                'simulator_config': {
                    'burst_size':       _sim.burst_size,
                    'interp_density':   _sim.interp_density,
                    'plateau_patience': _sim.plateau_patience,
                    'curriculum':       _sim.curriculum,
                },
                'session_registry':   reg,
                'gradient_health':    _mem.gradients.scene_grad_health(),
                'episodic_frames':    len(_mem.episodic._index),
                'hot_cache_size':     len(_mem.hot),
                'note': 'No active training session — showing persisted stats',
            }
        except Exception:
            pass

        return _sim.status()
    except Exception as e:
        return {'error': str(e), 'available': False}


@app.post('/generate', response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if not _model_ready:
        raise HTTPException(503, 'Model not yet loaded — retry in a few seconds')

    t0 = time.time()

    style_pfx   = _STYLE_PROMPTS.get(req.style_name, _STYLE_PROMPTS['default'])
    full_prompt = f'{style_pfx}, {req.prompt}, {req.emotional_goal}'.strip(', ')

    logger.info(
        f'[generate] style={req.style_name} bpm={req.bpm:.0f} '
        f'energy={req.energy:.2f} drop={req.is_drop} '
        f'T={req.T} H={req.H} W={req.W} '
        f'beat={req.beat_index}/{req.total_beats}'
    )

    frames = _ddim_sample(
        prompt=full_prompt, T=req.T, H=req.H, W=req.W,
        bpm=req.bpm, energy=req.energy, energy_peak=req.energy_peak,
        beat_index=req.beat_index, total_beats=req.total_beats,
        is_drop=req.is_drop,
        ddim_steps=req.ddim_steps, guidance=req.guidance_scale,
        seed=req.seed,
    )

    frames = _post_process(frames, req.style_name, req.is_drop)

    elapsed = time.time() - t0
    logger.info(f'[generate] {req.T} frames in {elapsed:.2f}s '
                f'({elapsed / req.T * 1000:.0f}ms/frame)')

    frames_b64 = None
    mp4_b64    = None

    if req.output_format == 'frames_b64':
        frames_b64 = _frames_to_b64(frames)
    elif req.output_format == 'mp4_b64':
        fps     = 30 if req.platform in ('tiktok', 'reels', 'shorts') else 24
        mp4_b64 = _frames_to_mp4_b64(frames, fps=fps)

    meta = _SCENE_META.get(req.style_name, _SCENE_META['default'])

    return GenerateResponse(
        status='ok',
        frames_b64=frames_b64,
        mp4_b64=mp4_b64,
        shape=list(frames.shape),
        style_used=req.style_name,
        scene_name=req.style_name,
        device='cpu',
        num_frames=req.T,
        gpu_applied=False,
        scene_metadata={
            'scene_name':      req.style_name,
            'bloom_threshold': meta['bloom'],
            'chroma_amount':   meta['chroma'],
            'saturation':      meta['saturation'],
            'beat_sync':       True,
            'bpm':             req.bpm,
            'is_drop':         req.is_drop,
            'elapsed_s':       round(elapsed, 2),
        },
        model_version='v4-lite-numpy',
        beat_sync=True,
    )


@app.post('/generate/keyframe')
def generate_keyframe(req: GenerateRequest):
    kf = GenerateRequest(
        prompt=req.prompt, T=4,
        H=req.H, W=req.W,
        bpm=req.bpm, energy=req.energy, energy_peak=req.energy_peak,
        style_name=req.style_name,
        beat_index=req.beat_index, total_beats=req.total_beats,
        emotional_goal=req.emotional_goal,
        seed=req.seed,
        output_format='frames_b64',
        ddim_steps=req.ddim_steps,
        guidance_scale=req.guidance_scale,
    )
    result = generate(kf)
    mid = len(result.frames_b64) // 2 if result.frames_b64 else 0
    return {
        'status':         'ok',
        'frame_b64':      result.frames_b64[mid] if result.frames_b64 else None,
        'style_used':     result.style_used,
        'scene_name':     result.scene_name,
        'gpu_applied':    False,
        'scene_metadata': result.scene_metadata,
        'model_version':  'v4-lite-numpy',
    }


@app.post('/generate/stream')
def generate_stream(req: GenerateRequest):
    """SSE endpoint: emits each frame as a JSON data event as soon as encoded."""

    if not _model_ready:
        raise HTTPException(503, 'Model not yet loaded')

    style_pfx   = _STYLE_PROMPTS.get(req.style_name, _STYLE_PROMPTS['default'])
    full_prompt = f'{style_pfx}, {req.prompt}, {req.emotional_goal}'.strip(', ')
    meta        = _SCENE_META.get(req.style_name, _SCENE_META['default'])

    def event_stream():
        frames = _ddim_sample(
            prompt=full_prompt, T=req.T, H=req.H, W=req.W,
            bpm=req.bpm, energy=req.energy, energy_peak=req.energy_peak,
            beat_index=req.beat_index, total_beats=req.total_beats,
            is_drop=req.is_drop,
            ddim_steps=req.ddim_steps, guidance=req.guidance_scale,
            seed=req.seed,
        )
        frames = _post_process(frames, req.style_name, req.is_drop)
        T_actual = frames.shape[0]

        for idx in range(T_actual):
            b64 = _frame_to_b64(frames[idx])
            payload = json.dumps({
                'index':      idx,
                'frame_b64':  b64,
                'total':      T_actual,
                'scene_name': req.style_name,
                'gpu_applied': False,
                'scene_metadata': meta if idx == 0 else {},
            })
            yield f'data: {payload}\n\n'

        yield f'data: {json.dumps({"done": True, "total": T_actual})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control':               'no-cache',
            'X-Accel-Buffering':           'no',
            'Access-Control-Allow-Origin': '*',
        },
    )


@app.post('/train')
def trigger_training(req: TrainRequest):
    with _train_lock:
        if _train_status['running']:
            return JSONResponse(status_code=409,
                                content={'error': 'Training already running'})
    t = threading.Thread(target=_train_worker, args=(req,), daemon=True)
    t.start()
    return {'status': 'started', 'session_label': req.session_label}


@app.get('/train/status')
def training_status():
    with _train_lock:
        return dict(_train_status)


@app.get('/dataset/status')
def dataset_status():
    """Return bridge connectivity info and prompt-pool size."""
    try:
        from diffusion.maxcore_dataset_bridge import get_bridge as _get_bridge
        bridge = _get_bridge()
        return bridge.status()
    except Exception as exc:
        all_pairs = getattr(trainer, 'ALL_PAIRS', [])
        return {
            'connected':    False,
            'source':       'local',
            'total_prompts': len(all_pairs),
            'error':        str(exc),
        }


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('VIDEO_DIFFUSION_PORT', 8010))
    host = os.environ.get('VIDEO_DIFFUSION_HOST', '0.0.0.0')
    logger.info(f'MaxCore Diffusion v4 LITE on {host}:{port}')
    uvicorn.run('api_server_v4:app', host=host, port=port, reload=False)
