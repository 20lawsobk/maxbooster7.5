"""
Scheduler v2 — v-Prediction + Karras Sigma Schedule + DPM-Solver-2M
====================================================================
Major upgrades over DDPMScheduler (scheduler.py):

  v-prediction   : model predicts v = √ᾱ·ε − √(1−ᾱ)·x₀
                   vs epsilon in v4 — stable loss at ALL noise levels
  Karras sigmas  : σ_i = σ_max · (σ_min/σ_max)^{i/(n−1)}
                   denser near low-noise end → richer detail in final steps
  DPM-Solver-2M  : 2nd-order multistep ODE solver (12-15 steps = old 50-100 DDIM)
  Cosine schedule: same as v4 (Nichol & Dhariwal, best for short T)
  CFG support    : proper null-conditioning dual-batch with dynamic scale

References:
  Salimans & Ho (2022) — Progressive Distillation v-parameterization
  Karras et al. (2022) — Elucidating Design Space of Diffusion Models
  Lu et al. (2022)     — DPM-Solver: Fast ODE solver for diffusion models
"""

from __future__ import annotations

import math
from typing import Callable, List, Optional

import numpy as np


# ── Cosine noise schedule (same as v4, best for short T) ──────────────────

def _cosine_alpha_bar(T: int, s: float = 0.008) -> np.ndarray:
    steps = np.linspace(0, T, T + 1)
    f     = np.cos((steps / T + s) / (1 + s) * math.pi * 0.5) ** 2
    ab    = f / f[0]
    betas = np.clip(1.0 - ab[1:] / ab[:-1], 0.0, 0.999)
    alphas = 1.0 - betas
    return np.cumprod(alphas).astype(np.float64)   # ᾱ_t  for t=1..T


# ── v-prediction helpers ───────────────────────────────────────────────────

def v_from_eps_x0(eps: np.ndarray, x0: np.ndarray,
                  alpha_bar: float) -> np.ndarray:
    """v = √ᾱ · ε − √(1−ᾱ) · x₀"""
    return math.sqrt(alpha_bar) * eps - math.sqrt(1 - alpha_bar) * x0


def eps_from_v_xt(v: np.ndarray, xt: np.ndarray,
                  alpha_bar: float) -> np.ndarray:
    """Recover ε from v-prediction and noisy sample."""
    return math.sqrt(alpha_bar) * v + math.sqrt(1 - alpha_bar) * xt


def x0_from_v_xt(v: np.ndarray, xt: np.ndarray,
                  alpha_bar: float) -> np.ndarray:
    """Recover x₀ from v-prediction and noisy sample."""
    return math.sqrt(alpha_bar) * xt - math.sqrt(1 - alpha_bar) * v


# ── SchedulerV2 ────────────────────────────────────────────────────────────

class SchedulerV2:
    """
    DDPM-style noising with v-parameterization and Karras inference schedule.

    Training:
      xt, v_target = sched.add_noise_v(x0, t)
      loss = MSE(unet(xt, t, ...), v_target)

    Inference:
      Use DPMSolver2M.sample() or KarrasSampler.sample()
    """

    def __init__(self,
                 T_train:  int   = 1000,
                 schedule: str   = 'cosine',
                 sigma_min: float = 0.002,
                 sigma_max: float = 80.0):
        self.T        = T_train
        self.schedule = schedule
        self.sigma_min = sigma_min
        self.sigma_max = sigma_max

        # Alpha-bar schedule
        if schedule == 'cosine':
            self.alpha_bar = _cosine_alpha_bar(T_train)
        else:
            betas = np.linspace(0.0001, 0.02, T_train)
            self.alpha_bar = np.cumprod(1.0 - betas).astype(np.float64)

        self.sqrt_ab    = np.sqrt(self.alpha_bar)
        self.sqrt_1m_ab = np.sqrt(1.0 - self.alpha_bar)

        # Karras sigma sequence (for inference samplers)
        self._karras_sigmas: Optional[np.ndarray] = None

    def _t_to_sigma(self, t: int) -> float:
        """Convert discrete timestep to continuous sigma."""
        ab = float(self.alpha_bar[t])
        return math.sqrt((1 - ab) / (ab + 1e-8))

    def karras_sigmas(self, n_steps: int, rho: float = 7.0) -> np.ndarray:
        """
        Karras ODE timestep schedule.
        σ_i = (σ_max^{1/ρ} + i/(n−1)·(σ_min^{1/ρ} − σ_max^{1/ρ}))^ρ
        Denser at low σ (fine detail) — outperforms linear/DDIM spacing.
        """
        if self._karras_sigmas is not None and len(self._karras_sigmas) == n_steps + 1:
            return self._karras_sigmas
        lo = self.sigma_min ** (1 / rho)
        hi = self.sigma_max ** (1 / rho)
        i  = np.linspace(0, 1, n_steps)
        sigmas = (hi + i * (lo - hi)) ** rho
        sigmas = np.append(sigmas, 0.0)   # terminal σ=0
        self._karras_sigmas = sigmas.astype(np.float32)
        return self._karras_sigmas

    def sigma_to_t(self, sigma: float) -> int:
        """Map continuous sigma back to nearest discrete timestep."""
        target_ab = 1.0 / (1.0 + sigma**2)
        idx = int(np.argmin(np.abs(self.alpha_bar - target_ab)))
        return max(0, min(idx, self.T - 1))

    # ── Training noise (v-prediction) ──────────────────────────────────

    def add_noise_v(self, x0: np.ndarray, t: int):
        """
        Sample a noisy latent and v-prediction target.

        x0   : [*] clean latent in [-1,+1]
        t    : int ∈ [0, T)
        returns: (xt, v_target, eps)
          xt       = √ᾱ_t · x₀ + √(1−ᾱ_t) · ε
          v_target = √ᾱ_t · ε  − √(1−ᾱ_t) · x₀
        """
        eps  = np.random.randn(*x0.shape).astype(np.float32)
        sab  = float(self.sqrt_ab[t])
        s1ab = float(self.sqrt_1m_ab[t])
        xt   = (sab * x0 + s1ab * eps).astype(np.float32)
        v    = (sab * eps - s1ab * x0).astype(np.float32)
        return xt, v, eps

    # ── DDPM reverse step (for fallback DDPM sampling) ──────────────────

    def ddpm_step_v(self, xt: np.ndarray, v_pred: np.ndarray, t: int) -> np.ndarray:
        ab  = float(self.alpha_bar[t])
        sab = math.sqrt(ab); s1ab = math.sqrt(1 - ab)
        # Recover x0 and eps from v
        x0_pred = sab * xt - s1ab * v_pred
        x0_pred = x0_pred.clip(-1, 1)
        eps_pred = s1ab * xt + sab * v_pred
        # DDPM posterior
        ab_prev = float(self.alpha_bar[t - 1]) if t > 0 else 1.0
        beta_t  = 1 - ab / (ab_prev + 1e-8)
        beta_t  = float(np.clip(beta_t, 0, 0.999))
        coef1   = math.sqrt(ab_prev) * beta_t / (1 - ab + 1e-8)
        coef2   = math.sqrt(1 - beta_t) * (1 - ab_prev) / (1 - ab + 1e-8)
        mu      = coef1 * x0_pred + coef2 * xt
        if t > 0:
            var = beta_t * (1 - ab_prev) / (1 - ab + 1e-8)
            mu  = mu + math.sqrt(max(0, var) + 1e-8) * np.random.randn(*xt.shape).astype(np.float32)
        return mu.astype(np.float32)


# ── DPM-Solver 2M ──────────────────────────────────────────────────────────

class DPMSolver2M:
    """
    DPM-Solver++ (2M) — 2nd-order multistep ODE solver.

    10-step DPM-Solver-2M ≈ quality of 50-step DDIM.
    Operates on continuous sigmas (Karras schedule).

    Usage:
      sampler = DPMSolver2M(scheduler, n_steps=12)
      frames  = sampler.sample(model_fn, shape, text_seq, text_cls)
    """

    def __init__(self, scheduler: SchedulerV2, n_steps: int = 12,
                 guidance_scale: float = 7.5):
        self.sched  = scheduler
        self.steps  = n_steps
        self.cfg    = guidance_scale

    def sample(self,
               model_fn: Callable,
               shape: tuple,
               text_seq: np.ndarray,
               text_cls: np.ndarray,
               guidance_scale: Optional[float] = None,
               ) -> np.ndarray:
        """
        Generate one latent from noise.
        model_fn(xt, t, text_seq, text_cls) → v_pred  [same shape as xt]
        shape: (T, Hd, Wd, C_in)
        Returns x0 in [-1,+1]
        """
        gs  = guidance_scale if guidance_scale is not None else self.cfg
        sigmas = self.sched.karras_sigmas(self.steps)   # [n_steps+1]

        # Start from pure noise scaled to σ_max
        x = np.random.randn(*shape).astype(np.float32) * sigmas[0]

        # Null text conditioning for CFG
        null_seq = np.zeros_like(text_seq)
        null_cls = np.zeros_like(text_cls)

        h_prev: Optional[np.ndarray] = None   # previous ODE step (for 2nd order)

        for i in range(self.steps):
            sigma  = float(sigmas[i])
            sigma2 = float(sigmas[i + 1])
            t      = self.sched.sigma_to_t(sigma)

            # Scale input to unit variance (DPM++ convention)
            x_in = x / math.sqrt(1 + sigma**2)

            # Model call (cond)
            v_cond = model_fn(x_in, t, text_seq, text_cls)

            if gs > 1.0:
                v_uncond = model_fn(x_in, t, null_seq, null_cls)
                # Dynamic CFG: ramp from gs*0.7 to gs over first 40% of steps
                ramp   = min(1.0, i / max(1, int(self.steps * 0.4)))
                dyn_gs = gs * (0.7 + 0.3 * ramp)
                v      = v_uncond + dyn_gs * (v_cond - v_uncond)
            else:
                v = v_cond

            # Convert v-prediction → denoised x0
            ab = self.sched.alpha_bar[t]
            x0 = x0_from_v_xt(v, x_in, float(ab))
            x0 = x0.clip(-1, 1)

            # DPM-Solver-2M update
            lam_i   = -math.log(sigma)
            lam_i2  = -math.log(sigma2) if sigma2 > 0 else lam_i + 1

            if h_prev is None or i == 0:
                # 1st-order (Euler) step for first iteration
                d = (x - x0) / sigma
                dt = sigma2 - sigma
                x  = x + d * dt
            else:
                # 2nd-order (DPM-Solver-2M) step
                h   = lam_i2 - lam_i
                phi1 = math.expm1(-h)
                coef = 1 + 0.5 * h * (1 - h_prev_coef / h) if h > 0 else 1
                d     = (x - x0) / sigma
                d_prev = h_prev
                x = x * math.exp(-h) + x0 * (-phi1) + 0.5 * h * (d - d_prev)

            h_prev       = (x - x0) / max(sigma, 1e-8) if sigma2 > 0 else None
            h_prev_coef  = lam_i2 - lam_i

        return x0.clip(-1, 1).astype(np.float32)

    def sample_sequence(self,
                        model_fn: Callable,
                        shape: tuple,
                        text_seq: np.ndarray,
                        text_cls: np.ndarray,
                        n_frames: int = 8,
                        guidance_scale: Optional[float] = None,
                        ) -> List[np.ndarray]:
        """
        Generate n_frames with SLERP-interpolated noise for temporal coherence.
        Same Veo/Sora-style approach as DDIMSampler.sample_sequence but
        using DPM-Solver-2M for each frame → higher quality per frame.
        """
        gs = guidance_scale if guidance_scale is not None else self.cfg
        T, Hd, Wd, C = shape

        z_start = np.random.randn(T, Hd, Wd, C).astype(np.float32)
        z_end   = np.random.randn(T, Hd, Wd, C).astype(np.float32)

        frames = []
        for fi in range(n_frames):
            t_frac = fi / max(n_frames - 1, 1)
            ease   = 0.5 - 0.5 * math.cos(math.pi * t_frac)

            z0f = z_start.ravel(); z1f = z_end.ravel()
            n0  = np.linalg.norm(z0f); n1 = np.linalg.norm(z1f)
            if n0 > 1e-8 and n1 > 1e-8:
                u0 = z0f / n0; u1 = z1f / n1
                dot = float(np.clip(u0 @ u1, -1, 1))
                theta = math.acos(abs(dot))
                if theta > 1e-4:
                    st = math.sin(theta)
                    z_interp = ((math.sin((1-ease)*theta)/st * z0f +
                                 math.sin(ease*theta)/st   * z1f)
                                ).reshape(z_start.shape)
                else:
                    z_interp = (1-ease)*z_start + ease*z_end
            else:
                z_interp = (1-ease)*z_start + ease*z_end

            z0_pred = self.sample(model_fn, shape, text_seq, text_cls, gs)
            frames.append(((z0_pred + 1.0) * 0.5 * 255).clip(0, 255).astype(np.uint8))

        return frames


# ── Simple Karras DDPM sampler (for quick iteration) ──────────────────────

class KarrasSampler:
    """
    Euler Ancestral sampler on Karras sigma schedule.
    Faster than DPM-Solver-2M, lower quality. Good for previews.
    """

    def __init__(self, scheduler: SchedulerV2, n_steps: int = 20,
                 eta: float = 1.0, guidance_scale: float = 7.5):
        self.sched = scheduler
        self.steps = n_steps
        self.eta   = eta
        self.cfg   = guidance_scale

    def sample(self, model_fn: Callable, shape: tuple,
               text_seq: np.ndarray, text_cls: np.ndarray,
               guidance_scale: Optional[float] = None) -> np.ndarray:
        gs     = guidance_scale if guidance_scale is not None else self.cfg
        sigmas = self.sched.karras_sigmas(self.steps)
        x      = np.random.randn(*shape).astype(np.float32) * sigmas[0]
        null_seq = np.zeros_like(text_seq)
        null_cls = np.zeros_like(text_cls)

        for i in range(self.steps):
            sigma  = float(sigmas[i])
            sigma2 = float(sigmas[i + 1])
            t      = self.sched.sigma_to_t(sigma)
            x_in   = x / math.sqrt(1 + sigma**2)

            v_c = model_fn(x_in, t, text_seq, text_cls)
            if gs > 1.0:
                v_u = model_fn(x_in, t, null_seq, null_cls)
                v   = v_u + gs * (v_c - v_u)
            else:
                v = v_c

            ab  = float(self.sched.alpha_bar[t])
            x0  = x0_from_v_xt(v, x_in, ab).clip(-1, 1)
            d   = (x - x0) / sigma
            dt  = sigma2 - sigma
            x   = x + d * dt
            if sigma2 > 0 and self.eta > 0:
                noise_scale = self.eta * math.sqrt(abs(dt) * sigma2 / sigma)
                x = x + noise_scale * np.random.randn(*x.shape).astype(np.float32)

        return x0.clip(-1, 1).astype(np.float32)
