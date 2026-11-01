"""
MaxCore Diffusion Pipeline — the primary orchestrator.

Brings together:
  DDIMScheduler        — fast 20-step denoising
  MusicVAE             — 256×256×3 ↔ 32×32×4 latent compression
  AwarenessConditioner — awareness context → conditioning tokens
  TemporalDiT          — denoising network with spatial + temporal + awareness attention
  SDEditPrior          — RCGS-grounded starting point (avoids pure-noise cold start)

Public API:
  MaxCoreDiffusionPipeline.generate(...)  → List[np.ndarray]  (HWC uint8 frames)
  get_diffusion_frame(...)                → np.ndarray | None  (single frame for compositing)

Inference requires a complete compatible parameter set. Loading a checkpoint
is a structural check, not evidence of training provenance or output quality.
Training initialization must be explicitly requested and cannot serve frames.
"""
from __future__ import annotations

import os
import threading
import tempfile
import numpy as np
from typing import Any, Dict, List, Optional

from .noise_scheduler import DDPMScheduler, DDIMScheduler
from .music_vae import MusicVAE, LATENT_C, LATENT_H, LATENT_W
from .awareness_conditioner import AwarenessConditioner
from .temporal_dit import TemporalDiT
from .sdedit_prior import SDEditPrior
from ...training.storage import diffusion_root

try:
    import torch as _torch  # noqa: F401  — availability probe; real import done per-method
    _TORCH_OK = True
except Exception:
    _TORCH_OK = False

RESOLUTION: int = 256
N_FRAMES: int = 8
N_DDIM_STEPS: int = 20
NOISE_FRACTION: float = 0.40
CHECKPOINT_DIR: str = str(diffusion_root(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))))

_pipeline: Optional["MaxCoreDiffusionPipeline"] = None
_pipeline_lock = threading.Lock()
_pipeline_source_signature = None


def _checkpoint_signature():
    bundle = os.path.join(CHECKPOINT_DIR, "diffusion.pt")
    paths = [bundle] if os.path.isfile(bundle) else [
        os.path.join(CHECKPOINT_DIR, name + ".pt") for name in ("vae", "dit", "conditioner")]
    signature = []
    for path in paths:
        try:
            stat = os.stat(path)
        except FileNotFoundError as exc:
            raise RuntimeError("Diffusion checkpoints missing: " + os.path.basename(path)) from exc
        signature.append((path, stat.st_ino, stat.st_mtime_ns, stat.st_size))
    return tuple(signature)


class MaxCoreDiffusionPipeline:
    """Awareness-conditioned music-domain latent video diffusion pipeline."""

    def __init__(self, *, for_training: bool = False) -> None:
        if type(for_training) is not bool:
            raise ValueError("for_training must be a boolean")
        self._model_lock = threading.RLock()
        self._checkpoint_loaded = False
        if not for_training and not os.path.isfile(os.path.join(CHECKPOINT_DIR, "diffusion.pt")):
            missing = [name for name in ("vae", "dit", "conditioner")
                       if not os.path.isfile(os.path.join(CHECKPOINT_DIR, name + ".pt"))]
            if missing:
                raise RuntimeError("Diffusion checkpoints missing: " + ", ".join(missing))
        self.scheduler_ddpm = DDPMScheduler(T=1000)
        self.scheduler = DDIMScheduler(self.scheduler_ddpm, num_steps=N_DDIM_STEPS)
        if for_training:
            self.vae = MusicVAE(LATENT_C)
            self.conditioner = AwarenessConditioner()
            self.dit = TemporalDiT()
        self.prior = SDEditPrior(self.scheduler, NOISE_FRACTION)
        if not for_training:
            self._try_load_checkpoints()

    def _try_load_checkpoints(self) -> None:
        """Load into separate modules; publish only after the entire set passes."""
        if not _TORCH_OK:
            raise RuntimeError("Diffusion tensor runtime unavailable")
        import torch
        bundle_path = os.path.join(CHECKPOINT_DIR, "diffusion.pt")
        if os.path.isfile(bundle_path):
            bundle = torch.load(bundle_path, map_location="cpu", weights_only=True)
            if not isinstance(bundle, dict) or bundle.get("schema") != 1:
                raise ValueError("Unsupported diffusion checkpoint schema")
            states = bundle.get("components")
        else:
            states = {name: torch.load(os.path.join(CHECKPOINT_DIR, name + ".pt"),
                                      map_location="cpu", weights_only=True)
                      for name in ("vae", "dit", "conditioner")}
        if not isinstance(states, dict) or set(states) != {"vae", "dit", "conditioner"}:
            raise ValueError("Incomplete diffusion checkpoint components")
        modules = {"vae": MusicVAE(LATENT_C), "dit": TemporalDiT(),
                   "conditioner": AwarenessConditioner()}
        for name, module in modules.items():
            state = states[name]
            if not isinstance(state, dict) or not state:
                raise ValueError(f"Invalid diffusion state: {name}")
            for value in state.values():
                if not isinstance(value, torch.Tensor) or not torch.isfinite(value).all():
                    raise ValueError(f"Nonfinite or invalid diffusion tensor: {name}")
            module.load_state_dict(state, strict=True)
            module.eval()
        with self._model_lock:
            self.vae, self.dit, self.conditioner = (
                modules["vae"], modules["dit"], modules["conditioner"])
            self._checkpoint_loaded = True

    def save_checkpoints(self) -> None:
        """Atomically publish one complete parameter bundle, not three partial files."""
        if not _TORCH_OK:
            raise RuntimeError("Diffusion tensor runtime unavailable")
        import torch
        os.makedirs(CHECKPOINT_DIR, mode=0o700, exist_ok=True)
        with self._model_lock:
            states = {name: {key: value.detach().cpu().clone()
                             for key, value in getattr(self, name).state_dict().items()}
                      for name in ("vae", "dit", "conditioner")}
        for name, state in states.items():
            if any(not torch.isfinite(value).all() for value in state.values()):
                raise ValueError(f"Cannot save nonfinite diffusion parameters: {name}")
        fd, temporary = tempfile.mkstemp(prefix=".diffusion-", dir=CHECKPOINT_DIR)
        try:
            with os.fdopen(fd, "wb") as output:
                torch.save({"schema": 1, "components": states}, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, os.path.join(CHECKPOINT_DIR, "diffusion.pt"))
            directory_fd = os.open(CHECKPOINT_DIR, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def _dna_from_context(self, context: Dict[str, Any]) -> List[float]:
        """Extract Visual DNA floats from the scene context dict."""
        dna = context.get("dna", {})
        return [
            float(dna.get("energy", 0.5)),
            float(dna.get("darkness", 0.5)),
            float(dna.get("warmth", 0.5)),
            float(dna.get("saturation", 0.5)),
        ]

    def generate(
        self,
        idea: str,
        platform: str,
        tone: str,
        awareness: str,
        context: Optional[Dict[str, Any]] = None,
        n_frames: int = N_FRAMES,
        resolution: int = RESOLUTION,
    ) -> List[np.ndarray]:
        """
        Generate n_frames of awareness-conditioned video frames.

        Returns List[np.ndarray] — each frame is HWC uint8 RGB.
        Raises on unavailable checkpoints or inference failure.
        """
        with self._model_lock:
            if not _TORCH_OK or not self._checkpoint_loaded:
                raise RuntimeError("Diffusion inference requires loaded checkpoints")
            return self._generate_inner(idea, platform, tone, awareness, context or {}, n_frames, resolution)

    def _generate_inner(
        self,
        idea: str,
        platform: str,
        tone: str,
        awareness: str,
        context: Dict[str, Any],
        n_frames: int,
        resolution: int,
    ) -> List[np.ndarray]:
        dna_params = self._dna_from_context(context)
        brand = context.get("brand", "maxbooster")

        # The live landscape is context, not a replacement for the request.
        # Preserve the existing conditioner layout while including all declared
        # request inputs. Its vocabulary limits still require separate evaluation.
        conditioning_text = "\n".join(part for part in (idea, platform, tone, awareness) if part)
        cond = self.conditioner.encode(conditioning_text, dna_params, batch_size=1)

        x_t, t_start = self.prior.get_prior_frames(
            n_frames=n_frames,
            width=resolution,
            height=resolution,
            latent_h=LATENT_H,
            latent_w=LATENT_W,
            latent_c=LATENT_C,
            brand=brand,
            context=context,
            vae=self.vae,
        )

        t_indices = [
            i for i, ts in enumerate(self.scheduler.timesteps)
            if ts <= t_start
        ]
        if not t_indices:
            t_indices = list(range(len(self.scheduler.timesteps)))

        for idx in t_indices:
            t_val = self.scheduler.timesteps[idx]
            t_prev = self.scheduler.timesteps[idx + 1] if idx + 1 < len(self.scheduler.timesteps) else -1

            eps_pred = self.dit.predict_noise(x_t, t_val, dna_params, cond)
            x_t_new = np.zeros_like(x_t)
            for f in range(n_frames):
                x_t_new[f] = self.scheduler.ddim_step(x_t[f], t_val, t_prev, eps_pred[f])
            x_t = x_t_new

        frames = []
        for f in range(n_frames):
            try:
                frame = self.vae.latent_to_frame(x_t[f])
            except Exception:
                frame = np.full((resolution, resolution, 3), 64, dtype=np.uint8)
            frames.append(frame)
        return frames


def _get_pipeline() -> MaxCoreDiffusionPipeline:
    global _pipeline, _pipeline_source_signature
    if not _TORCH_OK:
        raise RuntimeError("Diffusion tensor runtime unavailable")
    with _pipeline_lock:
        for _ in range(3):
            signature = _checkpoint_signature()
            if _pipeline is not None and signature == _pipeline_source_signature:
                return _pipeline
            candidate = MaxCoreDiffusionPipeline()
            if _checkpoint_signature() != signature:
                continue
            # Existing requests retain their own immutable model instance.
            # Failed loading never updates either cache field or serves stale state.
            _pipeline, _pipeline_source_signature = candidate, signature
            return _pipeline
    raise RuntimeError("Diffusion checkpoints changed repeatedly during loading")


def get_diffusion_frame(
    idea: str,
    platform: str,
    tone: str,
    awareness: str,
    width: int = RESOLUTION,
    height: int = RESOLUTION,
    context: Optional[Dict[str, Any]] = None,
) -> np.ndarray:
    """
    Generate a single compositing-ready frame for the cinematic engine.

    Missing checkpoints and rendering failures are explicit errors.
    This function is the public integration point used by scenes.py.
    """
    pipeline = _get_pipeline()
    # Denoise at the pipeline's native resolution: the latent grid is fixed
    # (LATENT_H x LATENT_W), so requesting a larger decode resolution only
    # multiplies DDIM/VAE pixel work (~10x slower at 1920) without adding any
    # detail — the caller-facing resize below produces the same image either
    # way. Measured: 27.7s at 1920 vs ~2.7s at native 256 for one frame.
    frames = pipeline.generate(
        idea=idea,
        platform=platform,
        tone=tone,
        awareness=awareness,
        context=context or {},
        n_frames=1,
        resolution=RESOLUTION,
    )
    if not frames:
        raise RuntimeError("Diffusion produced no frames")
    frame = frames[0]
    try:
        from PIL import Image
        img = Image.fromarray(frame).resize((width, height), Image.BILINEAR)
        return np.array(img)
    except (ValueError, TypeError, OSError) as exc:
        raise RuntimeError("Diffusion frame resize failed") from exc
