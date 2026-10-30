"""
Noise scheduler and latent diffusion training wrapper.

NoiseScheduler: linear beta schedule, q_sample (forward process).
LatentDiffusionVideo: wraps VAE (frozen) + DiT, computes MSE noise loss.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


class NoiseScheduler:
    def __init__(
        self,
        num_steps: int = 1000,
        beta_start: float = 1e-4,
        beta_end: float = 0.02,
        schedule: str = "linear",
    ):
        self.num_steps = num_steps
        if schedule == "cosine":
            # Cosine schedule (Nichol & Dhariwal 2021)
            steps = num_steps + 1
            x = torch.linspace(0, num_steps, steps)
            alphas_cumprod = torch.cos(((x / num_steps) + 0.008) / 1.008 * (torch.pi / 2)) ** 2
            alphas_cumprod = alphas_cumprod / alphas_cumprod[0]
            betas = 1 - (alphas_cumprod[1:] / alphas_cumprod[:-1])
            self.betas = torch.clamp(betas, 0.0001, 0.9999)
        else:
            self.betas = torch.linspace(beta_start, beta_end, num_steps)

        self.alphas            = 1.0 - self.betas
        self.alphas_cumprod    = torch.cumprod(self.alphas, dim=0)
        self.alphas_cumprod_prev = F.pad(self.alphas_cumprod[:-1], (1, 0), value=1.0)

        # Precomputed for q_sample
        self.sqrt_alphas_cumprod       = torch.sqrt(self.alphas_cumprod)
        self.sqrt_one_minus_alphas_cumprod = torch.sqrt(1.0 - self.alphas_cumprod)

        # Precomputed for posterior q(x_{t-1} | x_t, x_0)
        self.posterior_variance = (
            self.betas * (1.0 - self.alphas_cumprod_prev) / (1.0 - self.alphas_cumprod)
        )

    def to(self, device):
        for attr in [
            "betas", "alphas", "alphas_cumprod", "alphas_cumprod_prev",
            "sqrt_alphas_cumprod", "sqrt_one_minus_alphas_cumprod", "posterior_variance",
        ]:
            setattr(self, attr, getattr(self, attr).to(device))
        return self

    def sample_timesteps(self, batch_size: int, device) -> torch.Tensor:
        return torch.randint(0, self.num_steps, (batch_size,), device=device, dtype=torch.long)

    def q_sample(
        self,
        x0: torch.Tensor,
        t: torch.Tensor,
        noise: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        if noise is None:
            noise = torch.randn_like(x0)
        sqrt_a  = self.sqrt_alphas_cumprod[t].view(-1, 1, 1, 1, 1)
        sqrt_1a = self.sqrt_one_minus_alphas_cumprod[t].view(-1, 1, 1, 1, 1)
        return sqrt_a * x0 + sqrt_1a * noise, noise

    def predict_x0_from_noise(
        self, z_t: torch.Tensor, t: torch.Tensor, noise_pred: torch.Tensor
    ) -> torch.Tensor:
        sqrt_a  = self.sqrt_alphas_cumprod[t].view(-1, 1, 1, 1, 1)
        sqrt_1a = self.sqrt_one_minus_alphas_cumprod[t].view(-1, 1, 1, 1, 1)
        return (z_t - sqrt_1a * noise_pred) / sqrt_a


class LatentDiffusionVideo(nn.Module):
    """
    Training wrapper.  VAE is frozen; only DiT + conditioners are trained.
    Supports:
      - unconditional (text_cond=None, music_cond=None)
      - text-conditioned
      - music-conditioned (Max Booster integration)
      - jointly conditioned (text + music tokens concatenated)
    """
    def __init__(self, vae, dit, scheduler: NoiseScheduler,
                 cfg_dropout: float = 0.1):
        super().__init__()
        self.vae       = vae
        self.dit       = dit
        self.scheduler = scheduler
        self.cfg_dropout = cfg_dropout  # classifier-free guidance dropout rate

    def forward(
        self,
        x: torch.Tensor,
        text_cond: Optional[torch.Tensor] = None,
        music_cond: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        x:          [B, 3, T, H, W]   raw video frames, float32 [0, 1]
        text_cond:  [B, L1, D]        text conditioning tokens (optional)
        music_cond: [B, 1,  D]        music conditioning token (optional)
        Returns scalar loss.
        """
        self.scheduler.to(x.device)

        with torch.no_grad():
            z0, _, _ = self.vae.encode(x)

        B = x.size(0)
        t = self.scheduler.sample_timesteps(B, x.device)
        z_t, noise = self.scheduler.q_sample(z0, t)

        # Concatenate conditioning tokens along sequence dimension
        cond = self._build_cond(text_cond, music_cond, B, x.device)

        # Classifier-free guidance: randomly drop conditioning during training
        if self.training and self.cfg_dropout > 0:
            mask = torch.rand(B, device=x.device) < self.cfg_dropout
            if cond is not None:
                cond = cond * (~mask[:, None, None]).float()

        noise_pred = self.dit(z_t, t, cond=cond)
        return F.mse_loss(noise_pred, noise)

    @staticmethod
    def _build_cond(
        text_cond: Optional[torch.Tensor],
        music_cond: Optional[torch.Tensor],
        B: int,
        device,
    ) -> Optional[torch.Tensor]:
        parts = []
        if text_cond is not None:
            parts.append(text_cond)
        if music_cond is not None:
            parts.append(music_cond)
        if not parts:
            return None
        return torch.cat(parts, dim=1)  # [B, L_text + L_music, D]
