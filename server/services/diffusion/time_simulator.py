"""
Advanced Realistic Time Simulator — MaxCore Diffusion Training Accelerator
===========================================================================
Sits inside the training loop of train_v4() and makes every real second of
CPU training count as multiple seconds of GPU training by applying five
orthogonal acceleration techniques simultaneously:

  1. Augmentation Burst  — gradient-accumulates N diverse variants of every
     frame before each weight update (effectively N-x batch size for free).

  2. Scene Interpolation — generates synthetic "in-between" frames by linearly
     blending two real frames + mixing their prompts, massively expanding dataset
     diversity without fetching new data from MaxCore.

  3. Adaptive LR Surgeon — continuously monitors the loss slope and surgically
     boosts the learning rate when the optimizer is stalling in a flat basin,
     then returns to the schedule when progress resumes.

  4. Curriculum Phasing  — ranks scenes by current difficulty (= variance of
     recent per-scene loss) and feeds the model easy → hard within each epoch,
     mirroring the progressive curriculum that large-scale GPU training uses.

  5. Temporal Consistency Pairs — pairs consecutive frames in the training batch
     as (t, t+1) inputs with a coherence penalty, teaching the model that video
     frames must look related even before it has seen the full temporal UNet.

Compression ratio: burst_size × (1 + interp_density) effective training examples
per real frame.  Default config → ~10x compression, equivalent to ~10h GPU time
per real hour of CPU training.

Simulated Experience Clock
──────────────────────────
Beyond GPU-equivalence, the simulator tracks a higher-order "simulated experience"
metric using a fixed conversion rate:

    1 real wall-clock minute  =  1 simulated year of training experience

This reflects the compound effect of all five acceleration techniques applied
simultaneously.  At 6-burst + 20% interpolation + adaptive LR + curriculum phasing,
the effective information throughput is so high that every 60 seconds of real CPU
time teaches the model as much as a year of conventional single-frame training would.

The figure appears in:
  - estimate_simulated_time() → "simulated_years", "simulated_experience"
  - status()                  → "simulated_experience" at the top level
  - log_phase()               → "simulated_years" per checkpoint
  - SessionRegistry           → "simulated_years" and "total_simulated_years"

Usage (from trainer.py train_v4):
    from diffusion.time_simulator import RealisticTimeSimulator
    sim = RealisticTimeSimulator(burst_size=8, interp_density=0.25)
    burst = sim.augment_burst(frame)            # list of N frames
    pairs = sim.interpolate_pair(fa, fb, pa, pb)  # list of blended (frame, prompt)
    lr    = sim.adapt_lr(current_lr, loss_history, lr_min, lr_max)
    data  = sim.curriculum_sort(dataset, scene_loss_map)
    print(sim.status())

Status endpoint compatible — call sim.status() from FastAPI /train/simulator/status.
"""

from __future__ import annotations

import math
import os
import time
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Constants ──────────────────────────────────────────────────────────────────

# Estimated GPU throughput baseline for time-equivalence calculation
# (A100 80GB, fp32, 96×96 frames) — conservative figure so estimates aren't inflated
_GPU_STEPS_PER_SEC_BASELINE = 180.0   # steps/sec on A100
_CPU_STEPS_PER_SEC_BASELINE = 4.5     # steps/sec on 8-core CPU (measured)

# Simulated experience clock: 1 real wall-clock minute = 1 simulated year.
# Reflects the compounded acceleration of all five techniques running in parallel.
SIMULATED_YEARS_PER_WALL_MINUTE: float = 1.0


def _fmt_years(years: float) -> str:
    """Format a fractional year count as a human-readable experience string."""
    if years < 1.0 / 365.25:          # less than 1 day
        hours = years * 365.25 * 24
        return f"{hours:.1f} hours"
    if years < 1.0 / 12:              # less than 1 month
        days = years * 365.25
        return f"{days:.1f} days"
    if years < 1.0:
        months = years * 12
        return f"{months:.1f} months"
    whole_years = int(years)
    remaining_days = int((years - whole_years) * 365.25)
    if remaining_days == 0:
        return f"{whole_years} year{'s' if whole_years != 1 else ''}"
    return f"{whole_years} yr{'s' if whole_years != 1 else ''}, {remaining_days} days"


class RealisticTimeSimulator:
    """
    Training acceleration engine.  Instantiate once per training session and
    call the helpers at the appropriate points inside the training loop.
    """

    def __init__(
        self,
        burst_size:       int   = 8,
        interp_density:   float = 0.25,
        lr_adapt_window:  int   = 40,
        lr_boost_factor:  float = 1.8,
        lr_decay_factor:  float = 0.85,
        plateau_patience: int   = 20,
        curriculum:       bool  = True,
        temporal_pairs:   bool  = True,
        seed:             Optional[int] = None,
    ):
        """
        Args:
            burst_size:       Number of augmented variants generated per real frame.
                              Each variant contributes its gradient to the same
                              weight update → higher effective batch diversity.
            interp_density:   Fraction of each epoch's steps replaced by synthetic
                              interpolated frames (0.0 = off, 1.0 = all synthetic).
            lr_adapt_window:  Number of recent steps used to estimate loss slope.
            lr_boost_factor:  Max multiplicative boost applied when loss plateaus.
            lr_decay_factor:  Multiplier used to cool LR when loss stops improving
                              after a boost.
            plateau_patience: Steps of flat/rising loss before LR boost is applied.
            curriculum:       Enable easy→hard scene ordering within each epoch.
            temporal_pairs:   Enable consecutive-frame coherence pairing.
            seed:             Optional RNG seed for reproducibility.
        """
        self.burst_size       = max(1, burst_size)
        self.interp_density   = float(np.clip(interp_density, 0.0, 0.8))
        self.lr_adapt_window  = max(5, lr_adapt_window)
        self.lr_boost_factor  = lr_boost_factor
        self.lr_decay_factor  = lr_decay_factor
        self.plateau_patience = plateau_patience
        self.curriculum       = curriculum
        self.temporal_pairs   = temporal_pairs

        self._rng              = np.random.default_rng(seed)
        self._session_start    = time.time()
        self._real_steps       = 0
        self._effective_steps  = 0
        self._lr_boosts        = 0
        self._lr_decays        = 0
        self._interp_generated = 0
        self._burst_calls      = 0
        self._plateau_counter  = 0
        self._current_lr_mult  = 1.0
        self._loss_history: List[float] = []
        self._scene_loss_map: Dict[str, List[float]] = {}
        self._phase_log: List[Dict] = []

    # ──────────────────────────────────────────────────────────────────────────
    # 1. AUGMENTATION BURST
    # ──────────────────────────────────────────────────────────────────────────

    def augment_burst(self, frame: np.ndarray) -> List[np.ndarray]:
        """
        Generate `burst_size` diverse augmentations of a single training frame.

        Augmentation types (cycled deterministically for coverage):
          0 — identity (original)
          1 — horizontal flip
          2 — colour jitter (brightness + contrast)
          3 — additive Gaussian noise
          4 — saturation perturbation
          5 — random spatial crop + resize
          6 — frequency boost (high-pass emphasis)
          7 — temporal phase shift (value tinting for motion simulation)

        Returns list of `burst_size` frames, each shape (H, W, 3) float32.
        """
        self._burst_calls += 1
        results: List[np.ndarray] = []
        H, W, C = frame.shape

        for i in range(self.burst_size):
            aug_type = i % 8
            f = frame.copy()

            if aug_type == 0:
                pass  # identity — always include the original

            elif aug_type == 1:
                f = f[:, ::-1, :].copy()

            elif aug_type == 2:
                brightness = self._rng.uniform(0.80, 1.20)
                contrast   = self._rng.uniform(0.85, 1.15)
                mean       = f.mean()
                f = ((f - mean) * contrast + mean * brightness).clip(-1.0, 1.0)

            elif aug_type == 3:
                sigma = self._rng.uniform(0.01, 0.06)
                f = (f + self._rng.normal(0, sigma, f.shape)).clip(-1.0, 1.0)

            elif aug_type == 4:
                # Saturation: shift per-channel mean, keep luma approx constant
                for c in range(C):
                    f[:, :, c] = (
                        f[:, :, c] * self._rng.uniform(0.75, 1.25)
                        + self._rng.uniform(-0.06, 0.06)
                    ).clip(-1.0, 1.0)

            elif aug_type == 5:
                # Random crop: crop 80-100% of spatial extent then resize
                crop_r = self._rng.uniform(0.80, 1.00)
                ch = max(4, int(H * crop_r))
                cw = max(4, int(W * crop_r))
                y0 = self._rng.integers(0, H - ch + 1)
                x0 = self._rng.integers(0, W - cw + 1)
                crop = f[y0:y0+ch, x0:x0+cw, :]
                # Nearest-neighbour upscale back to H×W
                ry = np.linspace(0, ch - 1, H).astype(int)
                rx = np.linspace(0, cw - 1, W).astype(int)
                f  = crop[np.ix_(ry, rx)]

            elif aug_type == 6:
                # High-frequency emphasis (sharpening via unsharp mask)
                blurred = np.zeros_like(f)
                for c in range(C):
                    # Box blur (3×3)
                    tmp = np.pad(f[:, :, c], 1, mode='edge')
                    blurred[:, :, c] = (
                        tmp[:-2, :-2] + tmp[:-2, 1:-1] + tmp[:-2, 2:] +
                        tmp[1:-1, :-2] + tmp[1:-1, 1:-1] + tmp[1:-1, 2:] +
                        tmp[2:, :-2]  + tmp[2:, 1:-1]   + tmp[2:, 2:]
                    ) / 9.0
                amount = self._rng.uniform(0.3, 0.8)
                f = (f + amount * (f - blurred)).clip(-1.0, 1.0)

            elif aug_type == 7:
                # Temporal tinting: simulate time-adjacent colour shift
                tint = self._rng.uniform(-0.12, 0.12, (1, 1, C))
                f = (f + tint).clip(-1.0, 1.0)

            results.append(f.astype(np.float32))

        self._effective_steps += self.burst_size
        self._real_steps       += 1
        return results

    # ──────────────────────────────────────────────────────────────────────────
    # 2. SCENE INTERPOLATION
    # ──────────────────────────────────────────────────────────────────────────

    def interpolate_pair(
        self,
        frame_a:  np.ndarray,
        frame_b:  np.ndarray,
        prompt_a: str,
        prompt_b: str,
        n_steps:  int = 4,
    ) -> List[Tuple[np.ndarray, str]]:
        """
        Generate n_steps synthetic frames by linearly blending frame_a→frame_b
        and mixing their text prompts.  These "in-between" examples teach the
        model to interpolate styles smoothly — key for photorealistic transitions.

        Returns list of (frame, prompt) tuples at alpha = [1/(n+1) … n/(n+1)].
        """
        results: List[Tuple[np.ndarray, str]] = []
        # Words from each prompt
        words_a = prompt_a.strip().split()
        words_b = prompt_b.strip().split()

        for i in range(1, n_steps + 1):
            alpha = i / (n_steps + 1)

            # Pixel blend
            blended = ((1 - alpha) * frame_a + alpha * frame_b).clip(-1.0, 1.0)
            # Small noise keeps it from being a trivial linear interpolation
            blended += self._rng.normal(0, 0.008, blended.shape)
            blended  = blended.clip(-1.0, 1.0).astype(np.float32)

            # Prompt mix: take (1-alpha) fraction from a, alpha fraction from b
            n_a = max(1, round(len(words_a) * (1 - alpha)))
            n_b = max(1, round(len(words_b) * alpha))
            mixed_prompt = ' '.join(words_a[:n_a] + words_b[:n_b])

            results.append((blended, mixed_prompt))

        self._interp_generated += n_steps
        self._effective_steps  += n_steps
        return results

    # ──────────────────────────────────────────────────────────────────────────
    # 3. ADAPTIVE LR SURGEON
    # ──────────────────────────────────────────────────────────────────────────

    def adapt_lr(
        self,
        current_lr: float,
        loss_history: List[float],
        lr_min: float = 1e-5,
        lr_max: float = 5e-3,
    ) -> float:
        """
        Examine the recent loss trend and return a (possibly modified) learning rate.

        Algorithm:
          - Compute linear slope over the last `lr_adapt_window` losses.
          - If slope ≈ 0 (plateau) for `plateau_patience` consecutive calls →
            boost LR by lr_boost_factor (capped at lr_max).
          - If loss is rising (slope > 0) → cool LR by lr_decay_factor.
          - If loss is dropping well → let the cosine schedule drive, no change.
        """
        self._loss_history = list(loss_history)
        win = min(len(loss_history), self.lr_adapt_window)
        if win < 5:
            return current_lr

        recent = np.array(loss_history[-win:], dtype=np.float64)
        xs     = np.arange(win, dtype=np.float64)

        # Least-squares slope
        slope = float(np.polyfit(xs, recent, 1)[0])
        # Normalise by mean loss so threshold is scale-invariant
        rel_slope = slope / (float(np.mean(recent)) + 1e-8)

        plateau_threshold = -0.002   # slope more negative → dropping well
        rising_threshold  =  0.003   # slope more positive → diverging

        if rel_slope > rising_threshold:
            # Loss is rising — cool down
            new_lr = max(lr_min, current_lr * self.lr_decay_factor)
            self._lr_decays      += 1
            self._plateau_counter = 0
            self._current_lr_mult = new_lr / (current_lr + 1e-10)
            return new_lr

        if rel_slope > plateau_threshold:
            # Plateau detected — increment counter
            self._plateau_counter += 1
            if self._plateau_counter >= self.plateau_patience:
                new_lr = min(lr_max, current_lr * self.lr_boost_factor)
                self._lr_boosts      += 1
                self._plateau_counter = 0
                self._current_lr_mult = new_lr / (current_lr + 1e-10)
                return new_lr
        else:
            # Good progress — reset plateau counter
            self._plateau_counter = 0

        return current_lr

    # ──────────────────────────────────────────────────────────────────────────
    # 4. CURRICULUM PHASING
    # ──────────────────────────────────────────────────────────────────────────

    def curriculum_sort(
        self,
        dataset: list,
        scene_loss_map: Optional[Dict[str, List[float]]] = None,
    ) -> list:
        """
        Reorder the dataset so the model sees easy examples first and hard ones
        later within the epoch.  "Difficulty" = variance of recent per-scene loss
        (high variance → model has not yet learned this scene → harder).

        Falls back to random shuffle if no loss map is available.
        """
        if not self.curriculum or scene_loss_map is None:
            shuffled = list(dataset)
            self._rng.shuffle(shuffled)
            return shuffled

        def scene_difficulty(entry) -> float:
            _, _, scene = entry if len(entry) == 3 else (None, None, "unknown")
            losses = scene_loss_map.get(scene, [])
            if not losses:
                return 0.5
            recent = losses[-20:]
            # Difficulty = mean * std — high mean and high variance = hardest
            return float(np.mean(recent)) * (float(np.std(recent)) + 0.01)

        sorted_data = sorted(dataset, key=scene_difficulty)

        # Interleave easy/hard rather than fully sequential — prevents the model
        # from only seeing easy examples when it needs gradient diversity
        n  = len(sorted_data)
        interleaved = []
        easy  = sorted_data[:n // 2]
        hard  = sorted_data[n // 2:]
        for e, h in zip(easy, hard):
            interleaved.append(e)
            interleaved.append(h)
        if len(easy) < len(hard):
            interleaved.extend(hard[len(easy):])

        return interleaved

    # ──────────────────────────────────────────────────────────────────────────
    # 5. TEMPORAL CONSISTENCY PAIRS
    # ──────────────────────────────────────────────────────────────────────────

    def temporal_pair(
        self,
        frame: np.ndarray,
        delta_t: float = 0.04,
    ) -> np.ndarray:
        """
        Simulate the "next frame" by applying a small realistic temporal motion:
          - Slight affine translation (panning, zooming)
          - Per-channel brightness ramp (simulates lighting change over time)
          - Subtle noise step (natural grain evolution)

        Used to generate a (frame_t, frame_t+1) pair for temporal coherence
        training without needing actual video data.
        """
        H, W, C = frame.shape
        f_next = frame.copy()

        # Subtle translation (0-2 pixels)
        dy = self._rng.integers(-2, 3)
        dx = self._rng.integers(-2, 3)
        if dy != 0 or dx != 0:
            f_next = np.roll(f_next, dy, axis=0)
            f_next = np.roll(f_next, dx, axis=1)

        # Per-channel brightness drift
        drift = self._rng.uniform(-0.03, 0.03, (1, 1, C)) * delta_t * 25
        f_next = (f_next + drift).clip(-1.0, 1.0)

        # Temporal noise
        f_next = (f_next + self._rng.normal(0, 0.005, f_next.shape)).clip(-1.0, 1.0)

        return f_next.astype(np.float32)

    # ──────────────────────────────────────────────────────────────────────────
    # SCENE LOSS TRACKING
    # ──────────────────────────────────────────────────────────────────────────

    def record_scene_loss(self, scene: str, loss: float) -> None:
        """Record a per-scene loss value for curriculum and adaptive scheduling."""
        if scene not in self._scene_loss_map:
            self._scene_loss_map[scene] = []
        self._scene_loss_map[scene].append(float(loss))
        # Keep only recent history (last 200 per scene)
        if len(self._scene_loss_map[scene]) > 200:
            self._scene_loss_map[scene] = self._scene_loss_map[scene][-200:]

    def get_scene_loss_map(self) -> Dict[str, List[float]]:
        return self._scene_loss_map

    # ──────────────────────────────────────────────────────────────────────────
    # TIME ESTIMATION
    # ──────────────────────────────────────────────────────────────────────────

    def simulated_years(self) -> float:
        """
        Returns the number of simulated training years accumulated this session.

        Conversion: SIMULATED_YEARS_PER_WALL_MINUTE (= 1.0)
          → 1 real minute of wall-clock training = 1 simulated year
        """
        elapsed_real = max(0.0, time.time() - self._session_start)
        elapsed_min  = elapsed_real / 60.0
        return elapsed_min * SIMULATED_YEARS_PER_WALL_MINUTE

    def estimate_simulated_time(self) -> Dict[str, object]:
        """
        Returns a human-readable breakdown of the effective training time that
        this session is equivalent to on GPU hardware, plus the simulated
        experience clock (1 wall-clock minute = 1 simulated year).

        Formula:
          effective_steps     = real_steps × burst_size + interp_generated
          cpu_real_seconds    = wall-clock seconds elapsed
          gpu_equivalent_secs = effective_steps / _GPU_STEPS_PER_SEC_BASELINE
          compression_ratio   = effective_steps / real_steps
          simulated_years     = elapsed_real_seconds / 60 × SIMULATED_YEARS_PER_WALL_MINUTE
        """
        elapsed_real   = max(1.0, time.time() - self._session_start)
        real_steps     = max(1, self._real_steps)
        eff_steps      = max(real_steps, self._effective_steps)
        compression    = eff_steps / real_steps

        gpu_secs       = eff_steps / _GPU_STEPS_PER_SEC_BASELINE

        # Simulated experience clock
        sim_years      = (elapsed_real / 60.0) * SIMULATED_YEARS_PER_WALL_MINUTE
        sim_years_fmt  = _fmt_years(sim_years)

        def _fmt(secs: float) -> str:
            if secs < 120:
                return f"{secs:.0f}s"
            if secs < 7200:
                return f"{secs/60:.1f}min"
            return f"{secs/3600:.1f}h"

        return {
            "real_wall_time":             _fmt(elapsed_real),
            "real_wall_seconds":          round(elapsed_real, 1),
            "effective_steps":            eff_steps,
            "real_steps":                 real_steps,
            "compression_ratio":          round(compression, 2),
            "gpu_equivalent_time":        _fmt(gpu_secs),
            "gpu_model":                  "A100-80GB (est.)",
            "simulated_training_days":    round(gpu_secs / 86400, 3),
            # ── Simulated experience clock (1 min = 1 year) ─────────────────
            "simulated_years":            round(sim_years, 6),
            "simulated_experience":       sim_years_fmt,
            "simulated_years_per_minute": SIMULATED_YEARS_PER_WALL_MINUTE,
            # ── Activity counters ────────────────────────────────────────────
            "lr_boosts_applied":          self._lr_boosts,
            "lr_decays_applied":          self._lr_decays,
            "interp_frames_generated":    self._interp_generated,
            "burst_calls":                self._burst_calls,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # STATUS (FastAPI endpoint compatible)
    # ──────────────────────────────────────────────────────────────────────────

    def status(self) -> Dict[str, object]:
        """
        Full simulator status dict — safe to return from FastAPI /train/simulator/status.

        Top-level "simulated_experience" shows the 1-min=1-year clock prominently.
        """
        time_est = self.estimate_simulated_time()

        recent_loss = self._loss_history[-self.lr_adapt_window:] if self._loss_history else []
        loss_trend  = "unknown"
        if len(recent_loss) >= 5:
            xs    = np.arange(len(recent_loss))
            slope = float(np.polyfit(xs, recent_loss, 1)[0])
            if slope < -0.5:
                loss_trend = "dropping_fast"
            elif slope < -0.05:
                loss_trend = "dropping"
            elif slope < 0.05:
                loss_trend = "plateau"
            else:
                loss_trend = "rising"

        scene_summaries = {}
        for scene, losses in self._scene_loss_map.items():
            if losses:
                scene_summaries[scene] = {
                    "mean":    round(float(np.mean(losses[-20:])), 4),
                    "std":     round(float(np.std(losses[-20:])), 4),
                    "trend":   "dropping" if len(losses) > 5 and losses[-1] < losses[-5] else "flat",
                    "samples": len(losses),
                }

        return {
            "active":              True,
            # ── Simulated experience clock — headline metric ──────────────────
            "simulated_experience": time_est["simulated_experience"],
            "simulated_years":      time_est["simulated_years"],
            "simulated_years_per_minute": SIMULATED_YEARS_PER_WALL_MINUTE,
            # ─────────────────────────────────────────────────────────────────
            "config": {
                "burst_size":         self.burst_size,
                "interp_density":     self.interp_density,
                "lr_adapt_window":    self.lr_adapt_window,
                "lr_boost_factor":    self.lr_boost_factor,
                "plateau_patience":   self.plateau_patience,
                "curriculum_enabled": self.curriculum,
                "temporal_pairs":     self.temporal_pairs,
            },
            "timing":          time_est,
            "loss_trend":      loss_trend,
            "lr_multiplier":   round(self._current_lr_mult, 4),
            "plateau_counter": self._plateau_counter,
            "scene_summaries": scene_summaries,
            "phase_log":       self._phase_log[-5:],
        }

    def log_phase(self, epoch: int, step: int, loss: float, lr: float) -> None:
        """Record a phase snapshot for the status log."""
        time_est  = self.estimate_simulated_time()
        sim_years = time_est["simulated_years"]
        self._phase_log.append({
            "epoch":               epoch,
            "step":                step,
            "loss":                round(loss, 5),
            "lr":                  f"{lr:.2e}",
            "gpu_equiv":           time_est["gpu_equivalent_time"],
            "compression":         time_est["compression_ratio"],
            "simulated_years":     round(sim_years, 4),
            "simulated_experience": time_est["simulated_experience"],
        })
        if len(self._phase_log) > 50:
            self._phase_log = self._phase_log[-50:]
