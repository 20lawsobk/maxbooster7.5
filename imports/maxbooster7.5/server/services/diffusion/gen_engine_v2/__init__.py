"""
Gen Engine v2 — Production-Grade Music-Industry Generation Stack
================================================================
Upgrades over the existing diffusion package (v4):

  TextEncoderV3   — 1,500-token transformer (4-layer self-attn) → [seq, 128]
  CrossAttention  — visual Q × text K/V at every deep level (Stable Diffusion style)
  VAELite         — pixel↔latent compression  128×128×3 ↔ 32×32×8  (16× fewer pixels)
  UNetV5          — latent-space U-Net with cross-attention, v-prediction, bilinear upsample
  SchedulerV2     — v-parameterization + Karras sigma schedule + DPM-Solver-2M
  AudioSynthV2    — neural additive synthesis / mel+Griffin-Lim / WaveNet-lite (three modes)
  TrainerV5       — joint VAE+UNet training, perceptual loss, mixed-precision FP16 grads

LITE config (CPU / Replit):
  Latent dim   : 32×32×8  (128×128 pixels → 4× spatial downscale)
  UNet channels: [64, 128, 256, 256]  (~15 M params)
  Text seq len : 32 tokens, 128 dim
  T            : 4 frames (training), 8 (inference with interpolation)

FULL config (GPU server):
  Latent dim   : 64×64×16  (256×256 pixels)
  UNet channels: [128, 256, 512, 1024]  (~300 M params)
  Text seq len : 64 tokens, 256 dim
  T            : 16 frames

Public API
----------
  from diffusion.gen_engine_v2 import (
      TextEncoderV3, CrossAttention, VAELite, UNetV5,
      SchedulerV2, DPMSolver2M, AudioSynthV2,
      load_engine_v2, save_engine_v2,
  )
"""

from .text_encoder_v3 import TextEncoderV3
from .cross_attention  import CrossAttention
from .latent_encoder   import VAELite
from .unet_v5          import UNetV5, UNET_V5_LITE_CONFIG, UNET_V5_FULL_CONFIG
from .scheduler_v2     import SchedulerV2, DPMSolver2M, KarrasSampler
from .audio_synth_v2   import AudioSynthV2

import os as _os
import numpy as _np

_HERE    = _os.path.dirname(_os.path.abspath(__file__))
_WEIGHTS = _os.path.join(_HERE, 'weights_v5.npz')


def load_engine_v2(lite: bool = True):
    """
    Load (or fresh-init) a complete Gen Engine v2 pipeline.

    Returns dict with keys: text_enc, vae, unet, scheduler, audio.
    If weights_v5.npz exists, all weights are loaded from it.
    Otherwise every module starts from random init.
    """
    cfg  = UNET_V5_LITE_CONFIG if lite else UNET_V5_FULL_CONFIG
    T    = cfg['T']
    cd   = cfg['cond_dim']
    sd   = cfg['text_seq_dim']

    enc  = TextEncoderV3(emb_dim=cd, seq_dim=sd, max_len=32)
    vae  = VAELite(lite=lite)
    unet = UNetV5(cfg=cfg)
    sched= SchedulerV2(T_train=1000, schedule='cosine')
    aud  = AudioSynthV2()

    if _os.path.exists(_WEIGHTS):
        _load_weights_v5({
            'text_enc': enc, 'vae': vae, 'unet': unet,
            'audio': aud,
        })

    return {
        'text_enc': enc,
        'vae':      vae,
        'unet':     unet,
        'scheduler':sched,
        'audio':    aud,
    }


def load_engine_v2_full():
    """Convenience wrapper: load FULL (high-res) engine."""
    return load_engine_v2(lite=False)


def save_engine_v2(engine: dict, path: str = _WEIGHTS) -> None:
    """Serialize all engine weights to a single .npz archive."""
    arrays = {}
    for prefix, module in engine.items():
        if prefix in ('scheduler',):
            continue
        if hasattr(module, 'collect_params'):
            for k, v in module.collect_params().items():
                arrays[f'{prefix}/{k}'] = v
    _np.savez_compressed(path, **arrays)


def _load_weights_v5(modules: dict) -> None:
    data = _np.load(_WEIGHTS, allow_pickle=False)
    for prefix, module in modules.items():
        if not hasattr(module, 'load_params'):
            continue
        subset = {
            k[len(prefix) + 1:]: data[k]
            for k in data.files
            if k.startswith(f'{prefix}/')
        }
        if subset:
            module.load_params(subset)
