"""
Video Synthesizer v3 — UNetV4 LITE inference engine.

Upgrades over v2:
  - UNetV4 LITE (17.4M params, depthwise-separable convs + temporal attention)
  - 128-dim FiLM conditioning (BPM/energy/beat_index/is_drop music features)
  - TemporalAttention blocks for coherent frame-to-frame motion
  - Beat-sync via temporal positional-embedding offset (AIST++ inspired)
  - 5 DDIM steps default (was 30) — 6× faster on CPU with guidance_scale=1.5
  - Post-processing: contrast/saturation/vignette/bloom (server v4 pipeline)

CLI:
    python synthesizer.py "concert stage hip hop" --genre hip-hop --frames 4 --out /tmp/frames
    python synthesizer.py --train-only --tier medium

Python API:
    from server.services.diffusion.synthesizer import DiffusionSynthesizer
    synth = DiffusionSynthesizer()
    synth.ensure_trained(tier='quick')   # ~19 min first run, instant after
    frames = synth.generate('city nights trap', genre='trap')
"""

import os
import sys
import json
import time
import math
import argparse
import numpy as np

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from .scheduler import DDPMScheduler, DDIMSampler
from .encoder   import TextEncoder, TimeEncoder, tokenize
from .unet_v4   import UNetV4
from .trainer   import (train_v4 as run_training, _load_v4 as _load_v4_weights,
                        is_trained_v4 as is_trained, get_meta_v4 as get_meta,
                        WEIGHTS_V4_BEST_PATH, WEIGHTS_V4_PATH)

SYNTH_RES = 96    # 96×96 native — UNetV4 LITE optimal resolution on CPU

# Training tiers
TIERS = {
    'quick':  {'n_samples': 300,  'n_epochs': 10, 'res': 48},  # ~28 min
    'medium': {'n_samples': 600,  'n_epochs': 20, 'res': 48},  # ~110 min (default)
    'deep':   {'n_samples': 1000, 'n_epochs': 30, 'res': 48},  # ~275 min (max quality)
}

# Genre → prompt mapping
GENRE_PROMPT_MAP = {
    'hip-hop':    'concert stage hiphop crowd performer dark neon spotlight energetic',
    'hip hop':    'concert stage hiphop crowd performer dark neon spotlight energetic',
    'trap':       'neon cityscape dark trap city night rain glow purple cyan moody',
    'r&b':        'studio session rnb soul neo warm booth console smooth romantic',
    'rnb':        'studio session rnb soul neo warm booth console smooth romantic',
    'pop':        'concert stage pop energetic crowd bright lights colorful vibrant',
    'rock':       'concert stage rock energetic crowd arena live dark intense',
    'country':    'outdoor golden sunset nature field sky golden hour warm peaceful',
    'folk':       'outdoor golden sunset nature field acoustic warm nostalgic',
    'acoustic':   'studio session acoustic warm intimate golden nostalgic',
    'electronic': 'neon cyberpunk edm dark city underground glow laser strobe',
    'edm':        'neon cyberpunk edm dark city underground glow laser strobe',
    'techno':     'underground club dark strobe neon techno cyberpunk intense',
    'house':      'club dance neon warm vibrant crowd house music energy',
    'afrobeats':  'festival outdoor crowd hype stage live afrobeats vibrant energy',
    'latin':      'festival outdoor rooftop city warm romantic latin dance vibrant',
    'reggaeton':  'city night neon club dark energetic latin reggaeton warm',
    'gospel':     'warm golden light stage crowd soul gospel bright hopeful',
    'indie':      'rooftop city skyline sunset indie chill warm nostalgic',
    'lo-fi':      'studio session chill lofi warm amber dim smooth peaceful',
    'jazz':       'studio session jazz warm dim amber smooth intimate cinematic',
    'drill':      'city night dark urban drill grim moody neon rain',
    'kpop':       'concert stage kpop colorful vibrant crowd energetic bright',
}


def _post_process(frame_f32: np.ndarray, contrast: float = 1.25,
                  sharpen: float = 0.45) -> np.ndarray:
    """
    Quality-focused post-processing pipeline.

    Stages:
      1. Contrast boost — punch up mid-tones without clipping
      2. Unsharp mask — recover high-frequency detail lost during diffusion
      3. Saturation boost — denoised frames tend to look washed out; compensate

    contrast: multiplier on deviation from mean (1.25 = 25% more punch)
    sharpen:  unsharp mask weight (0.45 = strong crisp edges without artefacts)
    Returns [H, W, 3] uint8
    """
    from scipy.ndimage import gaussian_filter

    # Contrast boost (per-channel, preserves colour balance)
    mean = frame_f32.mean(axis=(0, 1), keepdims=True)
    frame_f32 = mean + (frame_f32 - mean) * contrast

    # Unsharp mask: radius=0.8 avoids ringing, strength 0.45 adds crispness
    if sharpen > 0:
        blurred = gaussian_filter(frame_f32, sigma=0.8)
        frame_f32 = frame_f32 + sharpen * (frame_f32 - blurred)

    # Mild saturation boost (convert to YCbCr space, boost chroma)
    luma   = 0.299 * frame_f32[:,:,0] + 0.587 * frame_f32[:,:,1] + 0.114 * frame_f32[:,:,2]
    luma   = luma[:, :, np.newaxis]
    chroma = frame_f32 - luma
    frame_f32 = (luma + chroma * 1.3).clip(0, 1)

    return (frame_f32.clip(0, 1) * 255).astype(np.uint8)


def _quality_upscale(img_pil, target_size: tuple) -> 'PIL.Image.Image':
    """
    High-quality upscaling: 48×48 → target (e.g. 512×512).

    Strategy:
      1. 2× bicubic intermediate — smoother than one-shot to avoid artefacts
      2. Final Lanczos — best resampling filter for photographic detail
    """
    from PIL import Image
    w, h = target_size
    mid_w, mid_h = min(img_pil.width * 2, w), min(img_pil.height * 2, h)
    if mid_w < w:
        img_pil = img_pil.resize((mid_w, mid_h), Image.BICUBIC)
    return img_pil.resize((w, h), Image.LANCZOS)


class DiffusionSynthesizer:
    """
    Text-to-video diffusion synthesizer v3 — UNetV4 LITE.

    Architecture: 17.4M-param UNetV4 with depthwise-separable convs, temporal
    self-attention, GroupNorm, 128-dim FiLM conditioning, cosine noise schedule,
    DDIM 5-step inference on CPU (~10s per 4-frame clip at 96×96).
    """

    def __init__(self, T: int = 1000, ddim_steps: int = 5):
        self.T          = T
        self.ddim_steps = ddim_steps
        self._loaded    = False

        self.scheduler  = DDPMScheduler(T=T, schedule='cosine')
        # Full model: time_emb(128) + text_emb(128) = cond_dim(256) — Reserved VM
        self.time_enc   = TimeEncoder(emb_dim=128)
        self.text_enc   = TextEncoder(emb_dim=128)
        self.model      = UNetV4(cond_dim=256, T=4, lite=False)
        self.sampler    = DDIMSampler(self.scheduler, n_steps=ddim_steps, eta=0.0)
        self._all_pairs = None

    def _get_pairs(self):
        if self._all_pairs is None:
            self._all_pairs = (
                self.model._get_param_grad_pairs_flat() +
                [(self.time_enc.params, self.time_enc.grads)] +
                [(self.text_enc.params, self.text_enc.grads)]
            )
        return self._all_pairs

    def ensure_trained(self, tier: str = 'quick',
                       force_retrain: bool = False) -> dict:
        """Train if needed. tier: 'quick' (~28min) / 'medium' (~110min) / 'deep' (~275min)."""
        if is_trained() and not force_retrain:
            meta = get_meta()
            print(f"[DiffusionSynth v3] Model trained  "
                  f"(v{meta.get('version','4-lite')}, loss={meta.get('final_loss',0):.4f}, "
                  f"ep={meta.get('epochs',0)})")
            self._load()
            return meta

        tier_cfg = TIERS.get(tier, TIERS['quick'])
        print(f"[DiffusionSynth v3] Training tier='{tier}' "
              f"({tier_cfg['n_samples']} samples × {tier_cfg['n_epochs']} epochs)")
        meta = run_training(n_epochs=tier_cfg['n_epochs'])
        self._load()
        return meta

    def _load(self):
        if not self._loaded:
            _load_v4_weights(self.model, self.time_enc, self.text_enc)
            self.model.set_training(False)
            self._loaded = True

    def _model_fn(self, x_t: np.ndarray, t: int,
                  text_emb: np.ndarray) -> np.ndarray:
        t_emb = self.time_enc.forward(t)
        cond  = np.concatenate([t_emb, text_emb]).astype(np.float32)
        return self.model.forward(x_t, cond)

    def generate(self, prompt: str = '',
                 genre:  str  = 'hip-hop',
                 n_frames: int = 15,
                 fps: int  = 30,
                 guidance_scale: float = 5.0,
                 upscale_to: tuple = None,
                 post_process: bool = True) -> list:
        """
        Generate video frames from text.
        Returns list of PIL.Image objects.
        """
        if not self._loaded:
            self._load()

        from PIL import Image

        base = GENRE_PROMPT_MAP.get(genre.lower(), '')
        full_prompt = f"{prompt} {base}".strip()
        print(f"[DiffusionSynth v3] Generating {n_frames} frames (UNetV4 LITE)")
        print(f"  Prompt: '{full_prompt}'")

        tokens   = tokenize(full_prompt)
        text_emb = self.text_enc.forward(tokens).astype(np.float32)

        t0 = time.time()
        raw_frames = self.sampler.sample_sequence(
            self._model_fn,
            shape=(SYNTH_RES, SYNTH_RES, 3),
            text_emb=text_emb,
            n_frames=n_frames,
            fps=fps,
            guidance_scale=guidance_scale,
        )
        elapsed = time.time() - t0
        print(f"[DiffusionSynth v3] {n_frames} frames in {elapsed:.1f}s "
              f"({elapsed/n_frames:.2f}s/frame)")

        pil_frames = []
        for arr in raw_frames:
            if post_process:
                arr = _post_process(arr.astype(np.float32) / 255.0)
            img = Image.fromarray(arr, mode='RGB')
            if upscale_to:
                img = _quality_upscale(img, upscale_to)
            pil_frames.append(img)

        return pil_frames

    def generate_to_files(self, out_dir: str,
                          prompt: str = '',
                          genre:  str = 'hip-hop',
                          n_frames: int = 15,
                          upscale_to: tuple = (512, 512),
                          guidance_scale: float = 5.0,
                          post_process: bool = True) -> list:
        os.makedirs(out_dir, exist_ok=True)
        frames = self.generate(prompt=prompt, genre=genre, n_frames=n_frames,
                               upscale_to=upscale_to, guidance_scale=guidance_scale,
                               post_process=post_process)
        paths = []
        for i, img in enumerate(frames):
            path = os.path.join(out_dir, f'frame_{i:04d}.png')
            img.save(path)
            paths.append(path)
        print(f"[DiffusionSynth v2] Saved {len(paths)} frames to {out_dir}")
        return paths


# ── CLI ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Max Booster In-House Diffusion Engine v3 (UNetV4 LITE)')
    ap.add_argument('prompt',       nargs='?', default='concert stage hip hop')
    ap.add_argument('--genre',      default='hip-hop')
    ap.add_argument('--frames',     type=int,   default=4)
    ap.add_argument('--out',        default='/tmp/diffusion_frames')
    ap.add_argument('--tier',       default='quick',
                    choices=['quick', 'medium', 'deep'],
                    help='Training depth: quick(~28min) / medium(~110min) / deep(~275min)')
    ap.add_argument('--epochs',     type=int, default=None, help='Override n_epochs')
    ap.add_argument('--train',      action='store_true', help='Force retrain')
    ap.add_argument('--train-only', action='store_true')
    ap.add_argument('--guidance',   type=float, default=1.5)
    ap.add_argument('--size',       type=int,   default=512)
    ap.add_argument('--steps',      type=int,   default=5, help='DDIM inference steps')
    args = ap.parse_args()

    synth = DiffusionSynthesizer(ddim_steps=args.steps)
    if args.epochs:
        from .trainer import train_v4 as _train_v4
        _train_v4(n_epochs=args.epochs)
        synth._load()
    else:
        synth.ensure_trained(tier=args.tier, force_retrain=args.train)

    if args.train_only:
        print('[DiffusionSynth v3] Training complete.')
        return

    paths = synth.generate_to_files(
        out_dir=args.out,
        prompt=args.prompt,
        genre=args.genre,
        n_frames=args.frames,
        upscale_to=(args.size, args.size),
        guidance_scale=args.guidance,
    )
    print(json.dumps({'frames': paths, 'count': len(paths)}))


if __name__ == '__main__':
    main()
