"""
LTX-2.3 Adapter — GPU-Optional High-Resolution Video Generation
================================================================
LTX-2.3 is an open-source text-to-video model by Lightricks (Apr 2025)
that produces up to 4K video with synchronized audio.

When to use:
  GPU (CUDA/MPS) available  → use LTX-2.3 via HuggingFace diffusers
  CPU-only                  → fall back to UNetV5 (Gen Engine v2 LITE)

The adapter auto-detects which path to take and exposes a unified
generate() call so api_server_v5.py does not need to know the difference.

LTX-2.3 Installation (GPU server only — not required for CPU inference):
  pip install diffusers transformers accelerate sentencepiece
  # Model weights download automatically on first use (~12GB)
  # Model ID: Lightricks/LTX-Video-2.3

GPU memory requirements:
  fp16 (16-bit): ~8GB VRAM  (RTX 3080 / A10G)
  fp8  (8-bit):  ~5GB VRAM  (RTX 3060 / T4)
  cpu  (float32):~48GB RAM  (not recommended — use UNetV5 instead)

PyAV / MoviePy integration:
  When LTX-2.3 returns raw frames (list of PIL images),
  the adapter encodes them to MP4 using PyAV for low-overhead output.
"""

from __future__ import annotations

import math
import os
import sys
import time
from typing import Dict, List, Optional, Union

import numpy as np

# ── Import GPU info ────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_SVC  = os.path.dirname(os.path.dirname(_HERE))
for _p in (_SVC,):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from digitalgpu import get_gpu, gpu_info
    _GPU_CTX  = get_gpu()
    _HAS_GPU  = _GPU_CTX.has_gpu
except Exception:
    _GPU_CTX = None
    _HAS_GPU = False

# ── Optional HuggingFace diffusers (LTX-2.3) ──────────────────────────────
_LTX_AVAILABLE = False
_ltx_pipe      = None

def _try_load_ltx(model_id: str = 'Lightricks/LTX-Video-2.3',
                  dtype_pref: str = 'fp16') -> bool:
    """
    Attempt to load LTX-2.3 pipeline. Returns True if successful.
    Only called when GPU is available and diffusers is installed.
    """
    global _LTX_AVAILABLE, _ltx_pipe
    if _LTX_AVAILABLE:
        return True
    if not _HAS_GPU:
        return False

    try:
        import torch
        from diffusers import LTXVideoConditioningPipeline, LTXVideoTransformer3DModel
        from transformers import T5EncoderModel

        dtype = torch.float16 if dtype_pref == 'fp16' else torch.float32
        device = str(_GPU_CTX._torch_device) if _GPU_CTX else 'cpu'

        # Load pipeline with CPU offloading to fit smaller GPUs
        pipe = LTXVideoConditioningPipeline.from_pretrained(
            model_id,
            torch_dtype=dtype,
        )
        pipe.enable_model_cpu_offload()
        pipe.vae.enable_tiling()   # reduces VRAM for large frames

        _ltx_pipe      = pipe
        _LTX_AVAILABLE = True
        return True

    except ImportError:
        # diffusers not installed — silent fallback to UNetV5
        return False
    except Exception as e:
        # Model download failed or weights unavailable
        print(f"[LTXAdapter] LTX-2.3 load failed ({e}), using UNetV5 fallback.")
        return False


# ── PyAV encoder (for MP4 output) ─────────────────────────────────────────

def _frames_to_mp4_bytes(frames: List[np.ndarray], fps: float = 24.0) -> bytes:
    """
    Encode a list of RGB frames ([H,W,3] uint8) to MP4 bytes using PyAV.
    Falls back to raw frame bytes if PyAV is unavailable.
    """
    try:
        import av, io
        buf = io.BytesIO()
        container = av.open(buf, mode='w', format='mp4')
        stream    = container.add_stream('libx264', rate=fps)
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
        # Fallback: concatenate raw frames (no compression)
        return b''.join(f.tobytes() for f in frames)


# ── Unified generator ──────────────────────────────────────────────────────

class LTXAdapter:
    """
    Unified video generation adapter.

    Auto-selects the best available backend:
      1. LTX-2.3 (Lightricks)   — GPU, highest quality, up to 4K
      2. UNetV5 (Gen Engine v2) — CPU/GPU, good quality, 128×128

    API:
      adapter = LTXAdapter(engine)   # engine from load_engine_v2()
      result  = adapter.generate(
          prompt   = "rapper performing on rooftop, neon lights, cinematic",
          duration = 3.0,   # seconds
          fps      = 24,
          width    = 512,   # LTX mode (ignored in LITE mode → always 128)
          height   = 512,
          quality  = 'auto',  # 'ltx' | 'unet' | 'auto'
      )
      # result['frames']   : list of [H,W,3] uint8 arrays
      # result['mp4_bytes']: bytes MP4 encoded video
      # result['backend']  : 'ltx' or 'unetv5'
    """

    def __init__(self, engine: dict, ltx_model_id: str = 'Lightricks/LTX-Video-2.3'):
        self.engine       = engine
        self.ltx_model_id = ltx_model_id
        self._ltx_tried   = False

    def _ensure_ltx(self) -> bool:
        if not self._ltx_tried:
            self._ltx_tried = True
            _try_load_ltx(self.ltx_model_id)
        return _LTX_AVAILABLE

    def _generate_ltx(self, prompt: str, duration: float, fps: float,
                      width: int, height: int,
                      negative_prompt: str = '') -> Dict:
        """Generate using LTX-2.3 pipeline."""
        import torch
        n_frames = int(duration * fps)
        n_frames = max(9, n_frames - (n_frames % 8) + 1)   # LTX frame count constraint

        with torch.inference_mode():
            output = _ltx_pipe(
                prompt            = prompt,
                negative_prompt   = negative_prompt or 'blurry, low quality, watermark',
                width             = width,
                height            = height,
                num_frames        = n_frames,
                guidance_scale    = 7.5,
                num_inference_steps = 40,
                output_type       = 'np',   # return numpy arrays
            )

        # frames: [n_frames, H, W, 3] float32 [0,1]
        frames_np = (output.frames[0] * 255).clip(0, 255).astype(np.uint8)
        frames    = [frames_np[i] for i in range(len(frames_np))]
        mp4       = _frames_to_mp4_bytes(frames, fps=fps)

        return {
            'frames':    frames,
            'mp4_bytes': mp4,
            'backend':   'ltx-2.3',
            'width':     width,
            'height':    height,
            'n_frames':  len(frames),
            'fps':       fps,
        }

    def _generate_unetv5(self, prompt: str, duration: float, fps: float,
                         guidance_scale: float = 7.5) -> Dict:
        """Generate using UNetV5 (Gen Engine v2 LITE, CPU-friendly)."""
        from .scheduler_v2 import DPMSolver2M

        text_enc = self.engine['text_enc']
        vae      = self.engine['vae']
        unet     = self.engine['unet']
        sched    = self.engine['scheduler']
        cfg      = unet.cfg

        T   = cfg['T']
        Hd  = Wd = 32 if cfg['channels'][0] == 64 else 64   # latent spatial
        H   = W  = Hd * 4    # pixel resolution (128 or 256)
        C_in = cfg['in_channels']

        from .text_encoder_v3 import tokenize_v3
        tokens       = tokenize_v3(prompt, max_len=cfg['text_seq_len'])
        seq_out, cls_out = text_enc.forward(tokens)

        sampler = DPMSolver2M(sched, n_steps=15, guidance_scale=guidance_scale)

        def model_fn(xt, t, text_seq, text_cls):
            return unet.forward(xt, t, text_seq, text_cls)

        n_clips = max(1, int(duration * fps / T))
        all_frames: List[np.ndarray] = []

        for _ in range(n_clips):
            shape  = (T, Hd, Wd, C_in)
            latent = sampler.sample(model_fn, shape, seq_out, cls_out, guidance_scale)

            # VAE decode each frame
            for ti in range(T):
                z_frame   = latent[ti]   # [Hd, Wd, C_in]
                pix       = vae.decode(z_frame)    # [H, W, 3] in [-1,+1]
                pix_u8    = ((pix + 1.0) * 0.5 * 255).clip(0, 255).astype(np.uint8)
                all_frames.append(pix_u8)

        all_frames = all_frames[:int(duration * fps)]
        mp4        = _frames_to_mp4_bytes(all_frames, fps=fps)

        return {
            'frames':    all_frames,
            'mp4_bytes': mp4,
            'backend':   'unetv5',
            'width':     W,
            'height':    H,
            'n_frames':  len(all_frames),
            'fps':       fps,
        }

    def generate(self,
                 prompt:          str   = 'music performance cinematic',
                 duration:        float = 3.0,
                 fps:             float = 24.0,
                 width:           int   = 512,
                 height:          int   = 512,
                 guidance_scale:  float = 7.5,
                 negative_prompt: str   = '',
                 quality:         str   = 'auto') -> Dict:
        """
        Generate video frames.

        quality:
          'auto'  → LTX-2.3 if GPU available, UNetV5 otherwise
          'ltx'   → Force LTX-2.3 (raises if unavailable)
          'unet'  → Force UNetV5 (always works)
        """
        t0 = time.time()

        if quality == 'ltx':
            if not self._ensure_ltx():
                raise RuntimeError("LTX-2.3 not available (GPU/diffusers required)")
            result = self._generate_ltx(prompt, duration, fps, width, height, negative_prompt)
        elif quality == 'unet':
            result = self._generate_unetv5(prompt, duration, fps, guidance_scale)
        else:  # auto
            if self._ensure_ltx():
                result = self._generate_ltx(prompt, duration, fps, width, height, negative_prompt)
            else:
                result = self._generate_unetv5(prompt, duration, fps, guidance_scale)

        result['elapsed_sec'] = round(time.time() - t0, 2)
        result['prompt']      = prompt
        return result

    def status(self) -> Dict:
        from digitalgpu import gpu_info as _gi
        try: gi = _gi()
        except Exception: gi = {'device': 'unknown'}
        return {
            'ltx_available': _LTX_AVAILABLE,
            'has_gpu':       _HAS_GPU,
            'gpu_info':      gi,
            'default_backend': 'ltx-2.3' if _LTX_AVAILABLE else 'unetv5',
        }
