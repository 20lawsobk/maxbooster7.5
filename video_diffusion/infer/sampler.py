"""
DDIM sampler for the latent video diffusion model.

Supports:
  - DDIM deterministic sampling (eta=0)
  - DDPM stochastic sampling (eta=1)
  - Classifier-free guidance with configurable scale
  - Music-conditioned generation (text_cond + music_cond concatenated)
"""

import torch
from typing import Optional


class DDIMSampler:
    def __init__(
        self,
        model,
        scheduler,
        num_steps: int = 50,
        guidance_scale: float = 7.5,
        eta: float = 0.0,
    ):
        """
        model:          LatentDiffusionVideo (or raw VideoDiT)
        scheduler:      NoiseScheduler instance
        num_steps:      DDIM inference steps (much fewer than training steps)
        guidance_scale: classifier-free guidance scale (1.0 = no guidance)
        eta:            0.0 = deterministic DDIM, 1.0 = DDPM
        """
        self.model          = model
        self.scheduler      = scheduler
        self.num_steps      = num_steps
        self.guidance_scale = guidance_scale
        self.eta            = eta

    @torch.no_grad()
    def sample(
        self,
        shape: tuple,
        device,
        text_cond: Optional[torch.Tensor] = None,
        music_cond: Optional[torch.Tensor] = None,
        seed: Optional[int] = None,
    ) -> torch.Tensor:
        """
        Sample a latent video tensor.

        shape:      (B, C, T, H, W)  — latent shape
        text_cond:  [B, L, D]        — text conditioning tokens
        music_cond: [B, 1, D]        — music conditioning token
        Returns:    [B, C, T, H, W]  — denoised latent z0
        """
        if seed is not None:
            torch.manual_seed(seed)

        self.scheduler.to(device)
        B = shape[0]

        # Build full conditioning (text + music concatenated)
        cond = self._build_cond(text_cond, music_cond)

        # Unconditional conditioning (zeros) for CFG
        uncond = torch.zeros_like(cond) if (cond is not None and self.guidance_scale > 1.0) else None

        z = torch.randn(shape, device=device)

        # DDIM timestep schedule
        timesteps = torch.linspace(
            self.scheduler.num_steps - 1, 0, self.num_steps, dtype=torch.long, device=device
        )

        for i, t in enumerate(timesteps):
            t_batch = torch.full((B,), t, device=device, dtype=torch.long)

            # Predict noise
            eps = self._predict_noise(z, t_batch, cond)

            # Classifier-free guidance
            if uncond is not None and self.guidance_scale > 1.0:
                eps_unc = self._predict_noise(z, t_batch, uncond)
                eps = eps_unc + self.guidance_scale * (eps - eps_unc)

            z = self._ddim_step(z, eps, t, timesteps, i)

        return z

    def _predict_noise(
        self, z: torch.Tensor, t: torch.Tensor, cond: Optional[torch.Tensor]
    ) -> torch.Tensor:
        dit = (
            self.model.module.dit if hasattr(self.model, "module")
            else getattr(self.model, "dit", self.model)
        )
        return dit(z, t, cond=cond)

    def _ddim_step(
        self,
        z: torch.Tensor,
        eps: torch.Tensor,
        t: torch.Tensor,
        timesteps: torch.Tensor,
        i: int,
    ) -> torch.Tensor:
        sc = self.scheduler
        alpha_bar     = sc.alphas_cumprod[t]
        alpha_bar_prev = (
            sc.alphas_cumprod[timesteps[i + 1]] if i + 1 < len(timesteps) else torch.tensor(1.0)
        ).to(z.device)

        alpha_bar     = alpha_bar.to(z.device).view(-1, 1, 1, 1, 1)
        alpha_bar_prev = alpha_bar_prev.to(z.device)

        # Predict x0
        x0_pred = (z - torch.sqrt(1 - alpha_bar) * eps) / torch.sqrt(alpha_bar)
        x0_pred = x0_pred.clamp(-1, 1)

        # Variance term (eta controls stochasticity)
        sigma = (
            self.eta
            * torch.sqrt((1 - alpha_bar_prev) / (1 - alpha_bar))
            * torch.sqrt(1 - alpha_bar / alpha_bar_prev)
        )

        # Direction pointing to z_t
        dir_xt = torch.sqrt(1 - alpha_bar_prev - sigma ** 2) * eps
        noise  = sigma * torch.randn_like(z) if self.eta > 0 else 0.0

        return torch.sqrt(alpha_bar_prev) * x0_pred + dir_xt + noise

    @staticmethod
    def _build_cond(
        text_cond: Optional[torch.Tensor],
        music_cond: Optional[torch.Tensor],
    ) -> Optional[torch.Tensor]:
        parts = [c for c in [text_cond, music_cond] if c is not None]
        if not parts:
            return None
        return torch.cat(parts, dim=1)
