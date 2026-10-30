"""
End-to-end video generation pipeline — powered by DigitalGPU backend.

Accepts text + music metadata → returns pixel video [B, 3, T, H, W] float32 [0,1].

Two-stage cascade:
  Stage 1: base diffusion at low resolution (e.g. 256×256, 16 frames)
  Stage 2: SR UNet upsamples to target resolution (e.g. 512×512, 32 frames)
           (optional — base-only mode also supported)

DigitalGPU integration:
  - Device selection and TF32/BF16 config delegated to DigitalGPUManager
  - torch.compile() applied to DiT and SR-UNet for kernel fusion
  - Autocast context used during inference for 2× speed on Ampere+ GPUs
"""

import os
import torch
from typing import Optional
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.autoencoder_3d import VideoVAE3D
from models.dit_video import VideoDiT
from models.sr_unet import SRUNet3D
from models.conditioning import TextConditioner, MusicConditioner, STYLE_NAME_TO_ID
from models.diffusion import NoiseScheduler
from infer.sampler import DDIMSampler
from utils.digital_gpu import get_digital_gpu


class VideoGenerationPipeline:
    def __init__(self, cfg: dict):
        # Use DigitalGPUManager for device + capability detection
        self._gpu    = get_digital_gpu()
        self.device  = str(self._gpu.device)
        self.cfg     = cfg

        # VAE — do NOT compile (decoder benefits less from fusion)
        self.vae = VideoVAE3D(cfg["vae"]).to(self.device).eval()
        self._load(self.vae, cfg.get("vae_ckpt"))

        # Base DiT — compile with reduce-overhead for 30–60% speedup on CUDA
        dit_raw = VideoDiT(cfg["dit"]).to(self.device).eval()
        self.dit = self._gpu.compile(dit_raw, mode="reduce-overhead")
        self._load(dit_raw, cfg.get("dit_ckpt"))

        # Text conditioner
        self.text_cond = TextConditioner(
            cfg["text"]["dim"], cfg["dit"]["embed_dim"]
        ).to(self.device).eval()
        self._load(self.text_cond, cfg.get("text_cond_ckpt"))

        # Music conditioner (core Max Booster integration)
        self.music_cond = MusicConditioner(cfg["dit"]["embed_dim"]).to(self.device).eval()
        self._load(self.music_cond, cfg.get("music_cond_ckpt"))

        # Noise scheduler
        self.scheduler = NoiseScheduler(
            num_steps=cfg["diffusion"]["num_steps"],
            schedule=cfg["diffusion"].get("schedule", "cosine"),
        )

        # DDIM sampler
        self.sampler = DDIMSampler(
            model=self,  # exposes .dit for noise prediction
            scheduler=self.scheduler,
            num_steps=cfg["infer"].get("steps", 50),
            guidance_scale=cfg["infer"].get("guidance_scale", 7.5),
            eta=cfg["infer"].get("eta", 0.0),
        )

        # Optional SR UNet — compile for throughput (larger kernels benefit more)
        self.sr_unet = None
        if cfg.get("sr") and cfg.get("sr_ckpt"):
            sr_raw = SRUNet3D(cfg["sr"]).to(self.device).eval()
            self.sr_unet = self._gpu.compile(sr_raw, mode="max-autotune")
            self._load(sr_raw, cfg["sr_ckpt"])

        self.latent_scale_factor = cfg["vae"].get("scale_factor", 8)

    def _load(self, module: torch.nn.Module, path: Optional[str]) -> None:
        if path and os.path.exists(path):
            ckpt = torch.load(path, map_location=self.device)
            state = ckpt.get("model", ckpt.get("ema", ckpt))
            module.load_state_dict(state)

    @torch.no_grad()
    def __call__(  # noqa: C901
        self,
        text_emb: Optional[torch.Tensor],
        T: int = 16,
        H: int = 256,
        W: int = 256,
        # ── Max Booster music intelligence ──────────────────────────────
        bpm: float = 120.0,
        energy: float = 0.65,
        energy_peak: float = 0.85,
        style_name: str = "neon_tunnel",
        beat_index: int = 0,
        total_beats: int = 4,
        is_drop: bool = False,
        emotional_goal: str = "curiosity",
        blend_style_name: Optional[str] = None,
        blend_weight: float = 0.0,
        seed: Optional[int] = None,
    ) -> torch.Tensor:
        """
        Generate a video clip conditioned on text and music metadata.

        Returns [B, 3, T, H, W] float32 in [0, 1].
        """
        B = 1 if text_emb is None else text_emb.size(0)
        if text_emb is None:
            text_emb = torch.zeros(B, 1, self.cfg["text"]["dim"], device=self.device)

        with self._gpu.autocast():
            # Text conditioning tokens
            t_tok = self.text_cond(text_emb.to(self.device))  # [B, L, D]

            # Music conditioning token
            style_id = STYLE_NAME_TO_ID.get(style_name, 2)
            emotional_heat = MusicConditioner.emotional_heat_from_label(emotional_goal)

            m_tok = self.music_cond(
                bpm_norm       = torch.full((B,), bpm / 200.0, device=self.device),
                energy         = torch.full((B,), energy, device=self.device),
                energy_peak    = torch.full((B,), energy_peak, device=self.device),
                style_id       = torch.full((B,), style_id, device=self.device, dtype=torch.long),
                beat_norm      = torch.full((B,), beat_index / max(1, total_beats - 1), device=self.device),
                is_drop        = torch.full((B,), float(is_drop), device=self.device),
                emotional_heat = torch.full((B,), emotional_heat, device=self.device),
                blend_weight   = torch.full((B,), blend_weight, device=self.device),
            )  # [B, 1, D]

            # Latent shape (VAE downsampling: 8× spatial, 8× temporal default)
            sf = self.latent_scale_factor
            latent_ch = self.cfg["vae"].get("latent_ch", 16)
            Tp = max(1, T // 8)
            Hp = H // sf
            Wp = W // sf
            shape = (B, latent_ch, Tp, Hp, Wp)

            z0 = self.sampler.sample(
                shape, self.device,
                text_cond=t_tok,
                music_cond=m_tok,
                seed=seed,
            )

            # Optional SR upsampling
            if self.sr_unet is not None:
                sr_scheduler = NoiseScheduler(num_steps=self.cfg["diffusion"]["num_steps"])
                sr_sampler   = DDIMSampler(
                    model=self, scheduler=sr_scheduler,
                    num_steps=self.cfg["infer"].get("sr_steps", 20),
                    guidance_scale=self.cfg["infer"].get("sr_guidance", 4.0),
                )
                z_hr_shape = (B, latent_ch, Tp, Hp * 2, Wp * 2)
                z0 = sr_sampler.sample(z_hr_shape, self.device, text_cond=t_tok, music_cond=m_tok)

            # Decode latent → pixel
            x = self.vae.decode(z0)

        return x.float().clamp(0, 1)  # always return float32 regardless of amp dtype
