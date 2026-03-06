"""
DDPM / DDIM Noise Scheduler — built from scratch.

DDPM (Ho et al. 2020): learn to reverse a Markovian noising process.
DDIM (Song et al. 2020): deterministic reverse process — 20 steps vs 1000,
                          same quality as DDPM with 50x speedup.

Forward process: q(x_t | x_0) = N(sqrt(ᾱ_t)*x_0, (1-ᾱ_t)*I)
Reverse process: p_θ(x_{t-1}|x_t) = predict noise ε_θ, reconstruct x_{t-1}
"""

import numpy as np
import math


class DDPMScheduler:
    """
    Linear beta schedule from β_start to β_end over T timesteps.
    Pre-computes all derived quantities used in training and inference.
    """

    def __init__(self, T: int = 100,
                 beta_start: float = 0.0001,
                 beta_end: float   = 0.02):
        self.T = T

        # Linear schedule β_1 ... β_T
        self.betas = np.linspace(beta_start, beta_end, T, dtype=np.float64)

        # Pre-compute derived quantities
        self.alphas          = 1.0 - self.betas
        self.alpha_bar       = np.cumprod(self.alphas)               # ᾱ_t
        self.alpha_bar_prev  = np.concatenate([[1.0], self.alpha_bar[:-1]])

        self.sqrt_alpha_bar      = np.sqrt(self.alpha_bar)
        self.sqrt_one_minus_ab   = np.sqrt(1.0 - self.alpha_bar)

        # For reverse (DDPM posterior)
        self.posterior_var = (
            self.betas * (1.0 - self.alpha_bar_prev) /
            (1.0 - self.alpha_bar)
        )

    # ── Forward process ────────────────────────────────────────────────────

    def add_noise(self, x0: np.ndarray, t: int) -> tuple:
        """
        Sample x_t ~ q(x_t|x_0) given clean x0 and timestep t.

        x0:      [H, W, C] float32 in [-1, 1]
        t:       int timestep in [0, T-1]
        returns: (x_t, noise) both [H, W, C]
        """
        noise = np.random.randn(*x0.shape).astype(np.float32)
        x_t = (self.sqrt_alpha_bar[t] * x0 +
               self.sqrt_one_minus_ab[t] * noise).astype(np.float32)
        return x_t, noise

    def add_noise_batch(self, x0: np.ndarray, t: int) -> tuple:
        """Batch version — x0: [B, H, W, C]."""
        noise = np.random.randn(*x0.shape).astype(np.float32)
        ab = self.sqrt_alpha_bar[t]
        sab = self.sqrt_one_minus_ab[t]
        x_t = (ab * x0 + sab * noise).astype(np.float32)
        return x_t, noise

    # ── Reverse step (DDPM) ────────────────────────────────────────────────

    def ddpm_step(self, x_t: np.ndarray, pred_noise: np.ndarray,
                  t: int) -> np.ndarray:
        """
        One DDPM reverse step: x_t → x_{t-1}
        x_t:        [H, W, C]
        pred_noise: [H, W, C]  (model output ε_θ)
        """
        beta_t    = self.betas[t]
        alpha_t   = self.alphas[t]
        ab_t      = self.alpha_bar[t]

        # Predicted x0 from noise
        x0_pred = (x_t - self.sqrt_one_minus_ab[t] * pred_noise) / (
            self.sqrt_alpha_bar[t] + 1e-8)
        x0_pred = x0_pred.clip(-1, 1)

        # Posterior mean
        coef1 = np.sqrt(self.alpha_bar_prev[t]) * beta_t / (1 - ab_t + 1e-8)
        coef2 = np.sqrt(alpha_t) * (1 - self.alpha_bar_prev[t]) / (1 - ab_t + 1e-8)
        mu = coef1 * x0_pred + coef2 * x_t

        if t > 0:
            noise = np.random.randn(*x_t.shape).astype(np.float32)
            sigma = np.sqrt(self.posterior_var[t] + 1e-8)
            return (mu + sigma * noise).astype(np.float32)
        return mu.astype(np.float32)


class DDIMSampler:
    """
    Deterministic DDIM sampler — 20 inference steps instead of 100.

    Song et al. "Denoising Diffusion Implicit Models" (2020).
    Skips timesteps non-uniformly for best quality/speed tradeoff.
    """

    def __init__(self, scheduler: DDPMScheduler, n_steps: int = 20,
                 eta: float = 0.0):
        self.sched   = scheduler
        self.n_steps = n_steps
        self.eta     = eta          # 0 = fully deterministic

        # Select evenly spaced timesteps from T down to 0
        step_ratio = scheduler.T // n_steps
        self.timesteps = list(reversed(range(0, scheduler.T, step_ratio)))[:n_steps]

    def sample(self, model_fn, shape: tuple,
               text_emb: np.ndarray,
               guidance_scale: float = 2.0) -> np.ndarray:
        """
        Generate a single frame from pure noise.

        model_fn:  callable(x_t, t, text_emb) → pred_noise  [H,W,C]
        shape:     (H, W, C)
        text_emb:  [emb_dim]  conditioning vector
        returns:   [H, W, C] float32 in [0, 1]
        """
        sched = self.sched
        x = np.random.randn(*shape).astype(np.float32)

        for i, t in enumerate(self.timesteps):
            t_prev = self.timesteps[i + 1] if i + 1 < len(self.timesteps) else 0

            # Conditional prediction
            eps_cond = model_fn(x, t, text_emb)

            if guidance_scale > 1.0:
                # Unconditional prediction (zero embedding)
                null_emb = np.zeros_like(text_emb)
                eps_uncond = model_fn(x, t, null_emb)
                # Classifier-free guidance
                eps = eps_uncond + guidance_scale * (eps_cond - eps_uncond)
            else:
                eps = eps_cond

            # DDIM update step
            ab_t      = sched.alpha_bar[t]
            ab_t_prev = sched.alpha_bar[t_prev] if t_prev > 0 else 1.0

            x0_pred = (x - np.sqrt(1 - ab_t) * eps) / (np.sqrt(ab_t) + 1e-8)
            x0_pred = x0_pred.clip(-1, 1)

            sigma_t = (self.eta *
                       np.sqrt((1 - ab_t_prev) / (1 - ab_t + 1e-8)) *
                       np.sqrt(1 - ab_t / (ab_t_prev + 1e-8)))

            x = (np.sqrt(ab_t_prev) * x0_pred +
                 np.sqrt(max(0.0, 1 - ab_t_prev - sigma_t ** 2)) * eps)

            if self.eta > 0 and t > 0:
                x = x + sigma_t * np.random.randn(*shape).astype(np.float32)

        # Map [-1, 1] → [0, 1]
        return np.clip((x + 1.0) * 0.5, 0.0, 1.0).astype(np.float32)

    def sample_sequence(self, model_fn, shape: tuple,
                        text_emb: np.ndarray,
                        n_frames: int = 15,
                        fps: int = 30,
                        guidance_scale: float = 2.0) -> list:
        """
        Generate a sequence of frames forming smooth video motion.

        Uses temporal interpolation of the initial noise seed to produce
        coherent motion: all frames share the same base noise, with a small
        per-frame perturbation that drifts smoothly over time.

        Returns: list of n_frames numpy arrays [H, W, C] uint8
        """
        H, W, C = shape

        # Shared latent base + per-frame noise drift
        z_base = np.random.randn(H, W, C).astype(np.float32)
        z_drift = np.random.randn(H, W, C).astype(np.float32) * 0.12

        frames = []
        for fi in range(n_frames):
            t_frac = fi / max(n_frames - 1, 1)
            # Smooth cubic ease: slow at start/end, faster in middle
            ease = t_frac * t_frac * (3 - 2 * t_frac)
            seed = (z_base + z_drift * ease).astype(np.float32)
            seed = seed / (np.linalg.norm(seed) + 1e-8) * math.sqrt(H * W * C)

            frame_float = self._sample_from_seed(
                model_fn, seed, text_emb, guidance_scale)

            frame_uint8 = (frame_float * 255).clip(0, 255).astype(np.uint8)
            frames.append(frame_uint8)

        return frames

    def _sample_from_seed(self, model_fn, x_init: np.ndarray,
                          text_emb: np.ndarray,
                          guidance_scale: float) -> np.ndarray:
        """Run DDIM from a specific initial noise tensor."""
        sched = self.sched
        x = x_init.copy()

        for i, t in enumerate(self.timesteps):
            t_prev = self.timesteps[i + 1] if i + 1 < len(self.timesteps) else 0

            eps_cond = model_fn(x, t, text_emb)

            if guidance_scale > 1.0:
                null_emb = np.zeros_like(text_emb)
                eps_uncond = model_fn(x, t, null_emb)
                eps = eps_uncond + guidance_scale * (eps_cond - eps_uncond)
            else:
                eps = eps_cond

            ab_t      = sched.alpha_bar[t]
            ab_t_prev = sched.alpha_bar[t_prev] if t_prev > 0 else 1.0
            x0_pred   = (x - np.sqrt(1 - ab_t) * eps) / (np.sqrt(ab_t) + 1e-8)
            x0_pred   = x0_pred.clip(-1, 1)
            x = (np.sqrt(ab_t_prev) * x0_pred +
                 np.sqrt(max(0.0, 1 - ab_t_prev)) * eps)

        return np.clip((x + 1.0) * 0.5, 0.0, 1.0).astype(np.float32)
