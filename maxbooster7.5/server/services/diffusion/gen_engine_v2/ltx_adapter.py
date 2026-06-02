"""
LTX Adapter — Multi-Backend Video Generation
=============================================
Priority order (auto-selects best available backend):

  1. MaxCore  — MaxCore trained model (8 TB dataset).  Highest quality.
                Requires AI_SERVER_URL + AI_SERVER_KEY env vars.
  2. LTX-2.3  — Lightricks open-source model (GPU required, ~12 GB VRAM).
                Requires CUDA/MPS + diffusers installed.
  3. UNetV5   — Gen Engine v2 LITE (~22.7 M params, CPU-friendly).
                Always available as fallback.

All backends return the same dict:
  frames    : list of [H,W,3] uint8 numpy arrays
  mp4_bytes : bytes (H.264 MP4, empty if encoding fails)
  backend   : 'maxcore' | 'ltx-2.3' | 'unetv5'
  width, height, n_frames, fps, elapsed_sec, prompt
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import os
import sys
import time
import urllib.request
import urllib.error
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger('LTXAdapter')

# ── Path / GPU bootstrap ──────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_SVC  = os.path.dirname(os.path.dirname(_HERE))
for _p in (_SVC,):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from digitalgpu import get_gpu, gpu_info
    _GPU_CTX = get_gpu()
    _HAS_GPU = _GPU_CTX.has_gpu
except Exception:
    _GPU_CTX = None
    _HAS_GPU = False

# ── Optional HuggingFace diffusers (LTX-2.3) ──────────────────────────────
_LTX_AVAILABLE = False
_ltx_pipe      = None


def _try_load_ltx(model_id: str = 'Lightricks/LTX-Video-2.3',
                  dtype_pref: str = 'fp16') -> bool:
    global _LTX_AVAILABLE, _ltx_pipe
    if _LTX_AVAILABLE:
        return True
    if not _HAS_GPU:
        return False
    try:
        import torch
        from diffusers import LTXVideoConditioningPipeline
        dtype  = torch.float16 if dtype_pref == 'fp16' else torch.float32
        pipe   = LTXVideoConditioningPipeline.from_pretrained(model_id, torch_dtype=dtype)
        pipe.enable_model_cpu_offload()
        pipe.vae.enable_tiling()
        _ltx_pipe      = pipe
        _LTX_AVAILABLE = True
        return True
    except Exception as exc:
        logger.warning(f"LTX-2.3 load failed ({exc}), will use UNetV5 fallback.")
        return False


# ── PyAV MP4 encoder ──────────────────────────────────────────────────────

def _frames_to_mp4_bytes(frames: List[np.ndarray], fps: float = 24.0) -> bytes:
    try:
        import av
        buf       = io.BytesIO()
        container = av.open(buf, mode='w', format='mp4')
        stream    = container.add_stream('libx264', rate=int(round(fps)))
        H, W, _   = frames[0].shape
        stream.width   = W
        stream.height  = H
        stream.pix_fmt = 'yuv420p'
        stream.options = {'crf': '23', 'preset': 'fast'}
        for frame_rgb in frames:
            frame = av.VideoFrame.from_ndarray(frame_rgb, format='rgb24')
            for pkt in stream.encode(frame):
                container.mux(pkt)
        for pkt in stream.encode():
            container.mux(pkt)
        container.close()
        return buf.getvalue()
    except Exception:
        return b''.join(f.tobytes() for f in frames)


# ── MaxCore video backend ─────────────────────────────────────────────────

def _maxcore_generate(prompt: str, duration: float, fps: float,
                      width: int, height: int,
                      negative_prompt: str = '',
                      aspect_ratio: str = '16:9',
                      genre: str = 'hip-hop',
                      extra: Optional[dict] = None) -> Optional[Dict]:
    """
    Route video generation to MaxCore server (trained on 8 TB dataset).
    Handles both sync (url in response) and async (job_id polling) flows.
    Returns result dict or None if unavailable/failed.
    """
    base_url = os.environ.get('AI_SERVER_URL', '').rstrip('/')
    api_key  = os.environ.get('AI_SERVER_KEY', '')
    if not base_url:
        return None

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'X-API-Key': api_key,
    }

    # Build request payload — matches exact MaxCore contract
    # (hook / body / cta / topic / platform / aspect_ratio / template / duration /
    #  artist_name / genre / tone / goal / quality / voiceover)
    ex        = extra or {}
    hook_text = ex.get('hook', prompt)
    body_text = ex.get('body_text', prompt)
    cta_text  = ex.get('cta', 'Watch now')         # MaxCore requires non-empty cta
    payload   = {
        'hook':          hook_text,
        'body':          body_text,
        'cta':           cta_text,
        'topic':         prompt,
        'platform':      ex.get('platform', 'instagram'),
        'aspect_ratio':  aspect_ratio,
        'template':      ex.get('template', 'cinematic_promo'),
        'duration':      max(10, int(min(duration, 60))),   # MaxCore min is 10s
        'artist_name':   ex.get('artist_name', 'Artist'),
        'genre':         genre,
        'tone':          ex.get('tone', 'energetic'),
        'goal':          ex.get('goal', 'growth'),
        'quality':       'high',
        'voiceover':     False,
    }

    req_body = json.dumps(payload).encode()

    try:
        req = urllib.request.Request(
            f'{base_url}/api/generate-video',
            data=req_body, headers=headers, method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
    except Exception as exc:
        logger.warning(f"MaxCore /api/generate-video failed: {exc}")
        return None

    job_id  = result.get('job_id') or result.get('jobId')
    video_url = result.get('url') or result.get('video_url')

    # ── Async polling (MaxCore returns job_id) ────────────────────────────
    if job_id and not video_url:
        poll_urls = [
            f'{base_url}/api/video-job/{job_id}',
            f'{base_url}/api/jobs/{job_id}',
        ]
        deadline = time.time() + 300   # 5 min max
        while time.time() < deadline:
            for poll_url in poll_urls:
                try:
                    req = urllib.request.Request(poll_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        status_data = json.loads(resp.read())
                    st = status_data.get('status', '')
                    if st == 'done' or st == 'completed':
                        video_url = (status_data.get('url') or
                                     status_data.get('video_url') or
                                     status_data.get('filename'))
                        break
                    if st in ('error', 'failed'):
                        logger.warning(f"MaxCore job {job_id} failed: {status_data}")
                        return None
                except Exception:
                    pass
            if video_url:
                break
            time.sleep(5)

    if not video_url:
        return None

    # ── Download finished video ──────────────────────────────────────────
    # Try multiple download paths
    download_paths = [
        video_url,
        f'{base_url}/api/video-job/{job_id}/download',
        f'{base_url}/uploads/videos/{os.path.basename(video_url)}',
    ]
    video_bytes = None
    for dl_url in download_paths:
        if not dl_url:
            continue
        try:
            full_url = dl_url if dl_url.startswith('http') else f'{base_url}{dl_url}'
            req = urllib.request.Request(full_url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                video_bytes = resp.read()
            if len(video_bytes) > 1000:
                break
        except Exception as exc:
            logger.debug(f"Download from {dl_url} failed: {exc}")

    if not video_bytes or len(video_bytes) < 1000:
        # MaxCore returned url but download failed — still report success with
        # the URL so the TypeScript layer can stream it via video-proxy
        return {
            'frames':    [],
            'mp4_bytes': b'',
            'video_url': video_url if video_url.startswith('http') else f'{base_url}{video_url}',
            'backend':   'maxcore',
            'width':     width,
            'height':    height,
            'n_frames':  int(duration * fps),
            'fps':       fps,
        }

    # Decode MP4 into frame list
    frames = _mp4_to_frames(video_bytes, max_frames=int(duration * fps) + 4)
    return {
        'frames':    frames,
        'mp4_bytes': video_bytes,
        'backend':   'maxcore',
        'width':     frames[0].shape[1] if frames else width,
        'height':    frames[0].shape[0] if frames else height,
        'n_frames':  len(frames),
        'fps':       fps,
    }


def _mp4_to_frames(mp4_bytes: bytes, max_frames: int = 300) -> List[np.ndarray]:
    """Decode MP4 bytes to list of [H,W,3] uint8 numpy arrays."""
    try:
        import av
        container = av.open(io.BytesIO(mp4_bytes))
        frames = []
        for frame in container.decode(video=0):
            if len(frames) >= max_frames:
                break
            frames.append(frame.to_ndarray(format='rgb24'))
        container.close()
        return frames
    except Exception:
        return []


# ── LTX-2.3 backend ──────────────────────────────────────────────────────

def _ltx_generate(prompt: str, duration: float, fps: float,
                  width: int, height: int,
                  negative_prompt: str = '') -> Dict:
    import torch
    n_frames = int(duration * fps)
    n_frames = max(9, n_frames - (n_frames % 8) + 1)
    with torch.inference_mode():
        output = _ltx_pipe(
            prompt              = prompt,
            negative_prompt     = negative_prompt or 'blurry, low quality, watermark',
            width               = width,
            height              = height,
            num_frames          = n_frames,
            guidance_scale      = 7.5,
            num_inference_steps = 40,
            output_type         = 'np',
        )
    frames_np = (output.frames[0] * 255).clip(0, 255).astype(np.uint8)
    frames    = [frames_np[i] for i in range(len(frames_np))]
    mp4       = _frames_to_mp4_bytes(frames, fps=fps)
    return {'frames': frames, 'mp4_bytes': mp4, 'backend': 'ltx-2.3',
            'width': width, 'height': height, 'n_frames': len(frames), 'fps': fps}


# ── UNetV5 fallback backend ───────────────────────────────────────────────

def _unetv5_generate(engine: dict, prompt: str, duration: float,
                     fps: float, guidance_scale: float = 7.5) -> Dict:
    from diffusion.gen_engine_v2.scheduler_v2 import DPMSolver2M
    from diffusion.gen_engine_v2.text_encoder_v3 import tokenize_v3

    text_enc = engine['text_enc']
    vae      = engine['vae']
    unet     = engine['unet']
    sched    = engine['scheduler']
    cfg      = unet.cfg

    T   = cfg['T']
    Hd  = Wd = 32 if cfg['channels'][0] == 64 else 64
    H   = W  = Hd * 4
    C_in = cfg['in_channels']

    tokens       = tokenize_v3(prompt, max_len=cfg['text_seq_len'])
    seq_out, cls_out = text_enc.forward(tokens)
    sampler = DPMSolver2M(sched, n_steps=15, guidance_scale=guidance_scale)

    def model_fn(xt, t, text_seq, text_cls):
        return unet.forward(xt, t, text_seq, text_cls)

    n_clips = max(1, int(duration * fps / T))
    all_frames: List[np.ndarray] = []
    for _ in range(n_clips):
        latent = sampler.sample(model_fn, (T, Hd, Wd, C_in), seq_out, cls_out,
                                guidance_scale)
        for ti in range(T):
            pix    = vae.decode(latent[ti])
            pix_u8 = ((pix + 1.0) * 0.5 * 255).clip(0, 255).astype(np.uint8)
            all_frames.append(pix_u8)

    all_frames = all_frames[:int(duration * fps)]
    mp4        = _frames_to_mp4_bytes(all_frames, fps=fps)
    return {'frames': all_frames, 'mp4_bytes': mp4, 'backend': 'unetv5',
            'width': W, 'height': H, 'n_frames': len(all_frames), 'fps': fps}


# ── Unified adapter ───────────────────────────────────────────────────────

class LTXAdapter:
    """
    Unified video generation adapter.

    Auto-selects the best available backend in order:
      1. MaxCore  (AI_SERVER_URL set)  — trained model, highest quality
      2. LTX-2.3  (GPU + diffusers)   — open-source SOTA
      3. UNetV5   (always available)  — local NumPy fallback

    Usage:
      adapter = LTXAdapter(engine)
      result  = adapter.generate(prompt="rapper on stage, neon lights")
    """

    def __init__(self, engine: dict, ltx_model_id: str = 'Lightricks/LTX-Video-2.3'):
        self.engine       = engine
        self.ltx_model_id = ltx_model_id
        self._ltx_tried   = False
        self._maxcore_url = os.environ.get('AI_SERVER_URL', '').rstrip('/')

    def _ensure_ltx(self) -> bool:
        if not self._ltx_tried:
            self._ltx_tried = True
            _try_load_ltx(self.ltx_model_id)
        return _LTX_AVAILABLE

    @property
    def maxcore_available(self) -> bool:
        return bool(self._maxcore_url)

    def generate(self,
                 prompt:          str   = 'music performance cinematic',
                 duration:        float = 3.0,
                 fps:             float = 24.0,
                 width:           int   = 512,
                 height:          int   = 512,
                 guidance_scale:  float = 7.5,
                 negative_prompt: str   = '',
                 quality:         str   = 'auto',
                 genre:           str   = 'hip-hop',
                 extra_params:    Optional[dict] = None) -> Dict:
        """
        Generate video.

        quality:
          'auto'    → MaxCore → LTX-2.3 → UNetV5
          'maxcore' → Force MaxCore (raises RuntimeError if unavailable)
          'ltx'     → Force LTX-2.3  (raises if GPU/diffusers unavailable)
          'unet'    → Force UNetV5   (always works)
        """
        t0 = time.time()

        result = None

        if quality == 'maxcore':
            result = _maxcore_generate(prompt, duration, fps, width, height,
                                       negative_prompt, genre=genre,
                                       extra=extra_params)
            if not result:
                raise RuntimeError("MaxCore unavailable (AI_SERVER_URL not set or request failed)")

        elif quality == 'ltx':
            if not self._ensure_ltx():
                raise RuntimeError("LTX-2.3 not available (GPU/diffusers required)")
            result = _ltx_generate(prompt, duration, fps, width, height, negative_prompt)

        elif quality == 'unet':
            result = _unetv5_generate(self.engine, prompt, duration, fps, guidance_scale)

        else:  # auto — cascade
            # 1. Try MaxCore
            if self.maxcore_available:
                logger.info("LTXAdapter: routing to MaxCore")
                result = _maxcore_generate(prompt, duration, fps, width, height,
                                           negative_prompt, genre=genre,
                                           extra=extra_params)
                if result:
                    if result.get('mp4_bytes') or result.get('frames'):
                        logger.info(f"LTXAdapter: MaxCore returned {result.get('n_frames')} frames")
                    else:
                        # MaxCore returned a video_url but the file is not yet
                        # downloadable (their /uploads/ path is not served).
                        # Generate local frames with UNetV5 for immediate playback
                        # while preserving MaxCore's URL for reference.
                        mc_video_url = result.get('video_url', '')
                        logger.info(
                            f"LTXAdapter: MaxCore file unavailable "
                            f"({mc_video_url[:80]}) — generating local frames with UNetV5"
                        )
                        result = _unetv5_generate(self.engine, prompt, duration,
                                                  fps, guidance_scale)
                        result['video_url'] = mc_video_url   # preserve MaxCore URL

            # 2. Try LTX-2.3 (GPU)
            if not result and self._ensure_ltx():
                logger.info("LTXAdapter: routing to LTX-2.3")
                result = _ltx_generate(prompt, duration, fps, width, height, negative_prompt)

            # 3. UNetV5 local fallback
            if not result:
                logger.info("LTXAdapter: falling back to UNetV5")
                result = _unetv5_generate(self.engine, prompt, duration, fps, guidance_scale)

        result['elapsed_sec'] = round(time.time() - t0, 2)
        result['prompt']      = prompt
        return result

    def status(self) -> Dict:
        try:
            gi = gpu_info()
        except Exception:
            gi = {'device': 'cpu (NumPy)', 'backend': 'cpu', 'allocated_mb': 0,
                  'torch_available': False, 'cuda_available': False, 'mps_available': False}
        return {
            'maxcore_available': self.maxcore_available,
            'maxcore_url':       self._maxcore_url or None,
            'ltx_available':     _LTX_AVAILABLE,
            'has_gpu':           _HAS_GPU,
            'gpu_info':          gi,
            'default_backend':   ('maxcore' if self.maxcore_available
                                  else 'ltx-2.3' if _LTX_AVAILABLE
                                  else 'unetv5'),
        }
