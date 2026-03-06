"""
Video Synthesizer — inference entry point for the from-scratch diffusion model.

Usage (CLI):
    python synthesizer.py "concert stage hip hop" --genre hip-hop --frames 15 --out /tmp/frames

Usage (Python API):
    from server.services.diffusion.synthesizer import DiffusionSynthesizer
    synth = DiffusionSynthesizer()
    synth.ensure_trained()
    frames = synth.generate(prompt="city nights trap", n_frames=15)
    # frames: list of PIL.Image objects at target resolution
"""

import os
import sys
import json
import time
import argparse
import numpy as np

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from .scheduler import DDPMScheduler, DDIMSampler
from .encoder   import TextEncoder, TimeEncoder, tokenize
from .unet      import UNet
from .trainer   import (train as run_training, load_for_inference,
                        is_trained, get_meta, WEIGHTS_PATH)

# Target resolution for the synthesizer output
SYNTH_RES   = 32    # model trains at 32×32 (fast CPU), upscaled at output time

# Genre → scene prompt mapping (mirrors videoGeneratorService.ts GENRE_DEFAULTS)
GENRE_PROMPT_MAP = {
    'hip-hop':      'concert stage hiphop crowd performer dark neon',
    'hip hop':      'concert stage hiphop crowd performer dark neon',
    'trap':         'neon cityscape dark trap city night rain glow',
    'r&b':          'studio session rnb soul neo warm booth console',
    'rnb':          'studio session rnb soul neo warm booth console',
    'pop':          'concert stage pop energetic crowd bright lights',
    'rock':         'concert stage rock energetic crowd arena live',
    'country':      'outdoor golden sunset nature field sky golden hour',
    'folk':         'outdoor golden sunset nature field sky acoustic',
    'electronic':   'neon cyberpunk edm dark city underground glow',
    'edm':          'neon cyberpunk edm dark city underground glow',
    'afrobeats':    'festival outdoor crowd hype stage live afrobeats',
    'latin':        'festival outdoor rooftop city warm romantic latin',
    'reggaeton':    'city night neon club dark energetic latin reggaeton',
    'gospel':       'warm golden light stage crowd soul gospel bright',
    'indie':        'rooftop city skyline sunset indie chill warm',
}


def _build_prompt(text_prompt: str, genre: str) -> str:
    """Combine user text prompt with genre defaults."""
    base = GENRE_PROMPT_MAP.get(genre.lower(), '')
    combined = f"{text_prompt} {base}".strip()
    return combined


class DiffusionSynthesizer:
    """
    Full text-to-video neural synthesizer.

    - First call auto-trains if no weights exist (~5-8 min on CPU)
    - Subsequent calls load from disk — inference only (~30-60s per clip)
    - Supports any number of output frames with temporal coherence
    """

    def __init__(self, T: int = 100, ddim_steps: int = 20):
        self.T          = T
        self.ddim_steps = ddim_steps
        self._loaded    = False

        self.scheduler  = DDPMScheduler(T=T)
        self.time_enc   = TimeEncoder(sin_dim=32, emb_dim=32)
        self.text_enc   = TextEncoder(emb_dim=32,  token_emb_dim=24)
        self.model      = UNet(cond_dim=64)
        self.sampler    = DDIMSampler(self.scheduler, n_steps=ddim_steps, eta=0.0)

    def ensure_trained(self,
                       n_samples: int = 600,
                       n_epochs:  int = 25,
                       force_retrain: bool = False) -> dict:
        """
        Train if not already trained. Returns training metadata.
        Safe to call multiple times — no-op if weights already exist.
        """
        if is_trained() and not force_retrain:
            meta = get_meta()
            print(f"[DiffusionSynth] Model already trained. "
                  f"final_loss={meta.get('final_loss','?'):.4f}, "
                  f"epochs={meta.get('epochs','?')}")
            self._load()
            return meta

        print(f"[DiffusionSynth] Training from scratch …")
        meta = run_training(n_samples=n_samples, n_epochs=n_epochs, T=self.T)
        self._load()
        return meta

    def _load(self):
        if not self._loaded:
            load_for_inference(self.model, self.time_enc, self.text_enc)
            self.model.set_training(False)
            self._loaded = True

    def _build_cond(self, prompt: str) -> np.ndarray:
        t_emb  = self.time_enc.forward(0)   # placeholder t=0 for inference cond
        tokens = tokenize(prompt)
        tx_emb = self.text_enc.forward(tokens)
        return np.concatenate([t_emb, tx_emb]).astype(np.float32)

    def _model_fn(self, x_t: np.ndarray, t: int,
                  text_emb: np.ndarray) -> np.ndarray:
        """Adapter: builds conditioning and calls U-Net."""
        t_emb  = self.time_enc.forward(t)
        cond   = np.concatenate([t_emb, text_emb]).astype(np.float32)
        return self.model.forward(x_t, cond)

    def generate(self, prompt: str = '',
                 genre:  str = 'hip-hop',
                 n_frames: int = 15,
                 fps: int = 30,
                 guidance_scale: float = 2.5,
                 upscale_to: tuple = None) -> list:
        """
        Generate a list of video frames from text.

        prompt:       free-text description
        genre:        music genre (used for additional context)
        n_frames:     number of frames to generate
        fps:          target fps (used for timing in sequence)
        guidance_scale: classifier-free guidance strength (1.0 = disabled)
        upscale_to:   (W, H) tuple to upscale output frames; None = 64×64

        Returns: list of PIL.Image objects, length = n_frames
        """
        if not self._loaded:
            self._load()

        from PIL import Image

        full_prompt = _build_prompt(prompt, genre)
        print(f"[DiffusionSynth] Generating {n_frames} frames: '{full_prompt}'")

        tokens  = tokenize(full_prompt)
        text_emb = self.text_enc.forward(tokens).astype(np.float32)

        # model_fn for sampler (uses stored text_emb)
        def model_fn(x_t, t, _text_emb):
            return self._model_fn(x_t, t, _text_emb)

        t0 = time.time()
        raw_frames = self.sampler.sample_sequence(
            model_fn,
            shape=(SYNTH_RES, SYNTH_RES, 3),
            text_emb=text_emb,
            n_frames=n_frames,
            fps=fps,
            guidance_scale=guidance_scale,
        )
        elapsed = time.time() - t0
        print(f"[DiffusionSynth] {n_frames} frames generated in {elapsed:.1f}s "
              f"({elapsed/n_frames:.2f}s/frame)")

        pil_frames = []
        for arr in raw_frames:
            img = Image.fromarray(arr, mode='RGB')
            if upscale_to:
                img = img.resize(upscale_to, Image.BILINEAR)
            pil_frames.append(img)

        return pil_frames

    def generate_to_files(self, out_dir: str,
                          prompt: str = '',
                          genre:  str = 'hip-hop',
                          n_frames: int = 15,
                          upscale_to: tuple = (512, 512),
                          guidance_scale: float = 2.5) -> list:
        """
        Generate frames and save as PNGs to out_dir.
        Returns list of file paths.
        """
        os.makedirs(out_dir, exist_ok=True)
        frames = self.generate(
            prompt=prompt, genre=genre, n_frames=n_frames,
            upscale_to=upscale_to, guidance_scale=guidance_scale)
        paths = []
        for i, img in enumerate(frames):
            path = os.path.join(out_dir, f'frame_{i:04d}.png')
            img.save(path)
            paths.append(path)
        print(f"[DiffusionSynth] Saved {len(paths)} frames to {out_dir}")
        return paths


# ── CLI entry point ────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Max Booster In-House Video Diffusion Engine')
    ap.add_argument('prompt',         nargs='?', default='concert stage hip hop')
    ap.add_argument('--genre',        default='hip-hop')
    ap.add_argument('--frames',       type=int,   default=15)
    ap.add_argument('--out',          default='/tmp/diffusion_frames')
    ap.add_argument('--train',        action='store_true', help='Force retrain')
    ap.add_argument('--train-only',   action='store_true', help='Train then exit')
    ap.add_argument('--samples',      type=int,   default=600)
    ap.add_argument('--epochs',       type=int,   default=25)
    ap.add_argument('--guidance',     type=float, default=2.5)
    ap.add_argument('--size',         type=int,   default=512, help='Output frame size (pixels)')
    args = ap.parse_args()

    synth = DiffusionSynthesizer()
    synth.ensure_trained(
        n_samples=args.samples,
        n_epochs=args.epochs,
        force_retrain=args.train,
    )

    if args.train_only:
        print("[DiffusionSynth] Training complete. Exiting.")
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
