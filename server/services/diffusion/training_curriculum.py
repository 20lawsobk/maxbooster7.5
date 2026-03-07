"""
Veo-for-Music Training Curriculum (C)
==============================================================
Month-long progressive training schedule for UNetV4.

Phases
------
Phase 1 (Days 1-7):   Spatial Foundation   — T=4,  64×64
Phase 2 (Days 8-14):  Motion Coherence     — T=8,  64×64
Phase 3 (Days 15-21): Music Specificity    — T=16, 96×96
Phase 4 (Days 22-30): Audio-Visual Fusion  — T=32, 96×96

Components
----------
CurriculumPhase      — dataclass for one training phase
CurriculumScheduler  — tracks progress, auto-advances phases
CurriculumTrainer    — runs sessions, saves phase checkpoints
QualityEvaluator     — measures model quality at phase transitions
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

_here          = os.path.dirname(os.path.abspath(__file__))
_PROGRESS_PATH = os.path.join(_here, 'curriculum_progress.json')


# ═══════════════════════════════════════════════════════════════════════════════
# Phase Definition
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CurriculumPhase:
    """
    One phase of the progressive training curriculum.

    training_focus options:
      'spatial_quality'  — learn scene appearance, color, composition
      'motion_coherence' — learn temporal consistency and fluid motion
      'music_specificity'— learn genre aesthetics and music-visual alignment
      'audiovisual_fusion'— learn beat-sync, audio-reactive generation
    """
    phase_id:           int
    name:               str
    day_start:          int
    day_end:            int
    T:                  int
    res:                int
    lr:                 float
    n_samples_per_session: int
    n_epochs_per_session:  int
    training_focus:     str
    datasets:           List[str]
    quality_targets:    Dict[str, float]
    ema_decay:          float       = 0.9998
    use_perceptual:     bool        = True
    session_label:      str         = ""
    notes:              str         = ""

    def __post_init__(self):
        if not self.session_label:
            self.session_label = f"phase{self.phase_id}_{self.name.replace(' ', '_').lower()}"

    @property
    def duration_days(self) -> int:
        return self.day_end - self.day_start + 1

    @property
    def sessions_per_day(self) -> float:
        """Estimated sessions per day based on resolution and T."""
        step_sec = 60.0 * (self.T / 4.0) * ((self.res / 64.0) ** 2)
        session_sec = self.n_samples_per_session * self.n_epochs_per_session * step_sec
        return max(0.1, 86400 / session_sec)

    def to_train_v4_kwargs(self) -> Dict[str, Any]:
        return {
            'T':             self.T,
            'res':           self.res,
            'lr':            self.lr,
            'n_epochs':      self.n_epochs_per_session,
            'n_samples':     self.n_samples_per_session,
            'ema_decay':     self.ema_decay,
            'use_perceptual': self.use_perceptual,
            'session_label': self.session_label,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Phase Library (30-day curriculum)
# ═══════════════════════════════════════════════════════════════════════════════

def build_curriculum() -> List[CurriculumPhase]:
    """
    Build the complete 30-day Veo-for-Music training curriculum.

    The progression mirrors how humans learn visual art:
    1. Shapes and composition (spatial foundation)
    2. Movement and timing (motion coherence)
    3. Style and genre identity (music specificity)
    4. Holistic integration (audio-visual fusion)
    """
    return [

        # ── Phase 1: Spatial Foundation (Days 1-7) ───────────────────────────
        CurriculumPhase(
            phase_id    = 1,
            name        = "Spatial Foundation",
            day_start   = 1,
            day_end     = 7,
            T           = 4,
            res         = 64,
            lr          = 2e-4,
            n_samples_per_session = 200,
            n_epochs_per_session  = 3,
            training_focus = 'spatial_quality',
            datasets    = [
                'synthetic',        # Always available — procedural frames
                'laion_aesthetics', # Visual style: album cover / branding aesthetics
                'gtzan',            # Audio-only: genre conditioning
                'fma',              # Audio-only: rich music features
            ],
            quality_targets = {
                'mse_loss':              0.15,
                'perceptual_score':      0.40,
                'temporal_consistency':  0.60,
            },
            notes = (
                "Focus: UNet learns scene structure, color palettes, composition. "
                "Use T=4 for fast iteration. Run ~200 steps/session, many sessions/day. "
                "Key metric: perceptual loss (Sobel edge quality). "
                "Primary data: synthetic procedural frames + LAION aesthetics. "
                "Expected daily steps: ~3000-5000."
            ),
        ),

        # ── Phase 2: Motion Coherence (Days 8-14) ────────────────────────────
        CurriculumPhase(
            phase_id    = 2,
            name        = "Motion Coherence",
            day_start   = 8,
            day_end     = 14,
            T           = 8,
            res         = 64,
            lr          = 1e-4,
            n_samples_per_session = 300,
            n_epochs_per_session  = 4,
            training_focus = 'motion_coherence',
            datasets    = [
                'synthetic',        # Still used as baseline
                'ucf_101',          # Action recognition — diverse motion
                'kinetics_700',     # Large-scale motion variety
                'aist_plus',        # Music-synchronized dance motion
                'hmdb_51',          # Human motion variety
            ],
            quality_targets = {
                'mse_loss':              0.10,
                'perceptual_score':      0.55,
                'temporal_consistency':  0.75,
                'motion_smoothness':     0.65,
            },
            notes = (
                "Focus: Temporal attention learns to produce fluid, coherent motion. "
                "T=8 forces model to reason about 8-frame trajectories. "
                "Temporal consistency loss weight increased to 0.10. "
                "Key data: AIST++ (music-dance pairs) + UCF-101 (action variety). "
                "LR reduced 2x from phase 1 — fine-tuning spatial quality. "
                "Expected improvement: motion blur artifacts decrease."
            ),
        ),

        # ── Phase 3: Music Specificity (Days 15-21) ──────────────────────────
        CurriculumPhase(
            phase_id    = 3,
            name        = "Music Specificity",
            day_start   = 15,
            day_end     = 21,
            T           = 16,
            res         = 96,
            lr          = 5e-5,
            n_samples_per_session = 400,
            n_epochs_per_session  = 5,
            training_focus = 'music_specificity',
            datasets    = [
                'vggsound',         # Audio-visual: music performance clips
                'audioset_music',   # Music-labeled video
                'aist_plus',        # Music-synchronized dance
                'ytmv',             # YouTube music videos
                'fma',              # FMA audio for conditioning richness
                'magnatagatune',    # Mood/genre labels
                'synthetic',        # Procedural fallback
            ],
            quality_targets = {
                'mse_loss':              0.07,
                'perceptual_score':      0.65,
                'temporal_consistency':  0.80,
                'music_visual_alignment': 0.65,
                'genre_accuracy':        0.60,
            },
            notes = (
                "Focus: Model learns genre-specific aesthetics (trap darkness, "
                "EDM neons, gospel warmth, hip-hop street aesthetics). "
                "T=16 at 96×96 — significant memory and compute step up. "
                "Audio features now directly condition via 256-dim vector. "
                "Key insight: BPM and energy curve in conditioning push model "
                "to produce genre-appropriate motion speed and visual intensity. "
                "Primary data: VGGSound music + AIST++ + AudioSet music subset."
            ),
        ),

        # ── Phase 4: Audio-Visual Fusion (Days 22-30) ────────────────────────
        CurriculumPhase(
            phase_id    = 4,
            name        = "Audio-Visual Fusion",
            day_start   = 22,
            day_end     = 30,
            T           = 32,
            res         = 96,
            lr          = 2e-5,
            n_samples_per_session = 500,
            n_epochs_per_session  = 5,
            training_focus = 'audiovisual_fusion',
            datasets    = [
                'vggsound',         # Best audio-visual alignment source
                'audioset_music',   # Rich audio labels
                'aist_plus',        # Beat-synchronized motion
                'ytmv',             # Real music videos
                'openvid_1m',       # Text-video pairs for caption conditioning
                'webvid_2m',        # Diverse video + text
                'audiocaps',        # Audio captioning pairs
                'synthetic',        # Fill gaps
            ],
            quality_targets = {
                'mse_loss':              0.05,
                'perceptual_score':      0.72,
                'temporal_consistency':  0.85,
                'music_visual_alignment': 0.70,
                'audio_beat_sync':       0.60,
                'genre_accuracy':        0.70,
                'text_adherence':        0.65,
            },
            notes = (
                "Focus: Full T=32 temporal reasoning + audio-visual beat synchronization. "
                "Model should produce videos where visual energy tracks beat energy curve. "
                "Caption conditioning now drives scene content (text-to-video alignment). "
                "Distillation from phase 3 model reduces required training steps. "
                "This is the final phase — model should be deployable for production use. "
                "After this phase: quantitative evaluation against Veo gap metrics."
            ),
        ),
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Curriculum Scheduler
# ═══════════════════════════════════════════════════════════════════════════════

class CurriculumScheduler:
    """
    Tracks training progress and determines the current curriculum phase.

    Advancement criteria (whichever comes first):
    1. Day-based: auto-advance when calendar day passes threshold
    2. Loss-based: advance early if all quality_targets are met
    """

    def __init__(self, progress_path: str = _PROGRESS_PATH):
        self.progress_path = progress_path
        self.phases        = build_curriculum()
        self.progress      = self._load_progress()

    def _load_progress(self) -> Dict[str, Any]:
        if os.path.exists(self.progress_path):
            try:
                with open(self.progress_path) as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            'start_timestamp':  time.time(),
            'current_phase_id': 1,
            'sessions_run':     0,
            'total_steps':      0,
            'phase_history':    [],
            'latest_metrics':   {},
        }

    def _save_progress(self):
        os.makedirs(os.path.dirname(self.progress_path), exist_ok=True)
        with open(self.progress_path, 'w') as f:
            json.dump(self.progress, f, indent=2)

    @property
    def current_day(self) -> int:
        """Days elapsed since training start."""
        elapsed = time.time() - self.progress['start_timestamp']
        return max(1, int(elapsed / 86400) + 1)

    @property
    def current_phase(self) -> CurriculumPhase:
        phase_id = self.progress['current_phase_id']
        return self._get_phase_by_id(phase_id)

    def get_phase_for_day(self, day: int) -> CurriculumPhase:
        """Return the appropriate phase for a given training day."""
        for phase in reversed(self.phases):
            if day >= phase.day_start:
                return phase
        return self.phases[0]

    def _get_phase_by_id(self, phase_id: int) -> CurriculumPhase:
        for p in self.phases:
            if p.phase_id == phase_id:
                return p
        return self.phases[-1]

    def next_session(self) -> Tuple[CurriculumPhase, Dict[str, Any]]:
        """
        Determine next training session parameters.
        Returns (phase, train_v4_kwargs).
        """
        # Check if should advance based on calendar day
        day     = self.current_day
        day_phase = self.get_phase_for_day(day)
        current   = self.current_phase

        if day_phase.phase_id > current.phase_id:
            self._advance_to_phase(day_phase.phase_id, reason='calendar')

        phase  = self.current_phase
        kwargs = phase.to_train_v4_kwargs()
        kwargs['session_label'] = f"{phase.session_label}_day{day}_s{self.progress['sessions_run']}"
        return phase, kwargs

    def should_advance(self, metrics: Dict[str, float]) -> bool:
        """Check if quality targets are met to advance early."""
        phase   = self.current_phase
        targets = phase.quality_targets
        if not targets:
            return False
        met = 0
        for metric, target in targets.items():
            if metric in metrics:
                val = metrics[metric]
                if metric.endswith('loss'):
                    met += 1 if val <= target else 0
                else:
                    met += 1 if val >= target else 0
        return met >= len(targets)

    def record_session(self, metrics: Dict[str, float]):
        """Record session results and check for phase advancement."""
        self.progress['sessions_run']   += 1
        self.progress['total_steps']    += metrics.get('n_steps', 0)
        self.progress['latest_metrics']  = metrics

        if self.should_advance(metrics):
            next_id = self.current_phase.phase_id + 1
            if next_id <= len(self.phases):
                self._advance_to_phase(next_id, reason='quality_targets_met')

        self._save_progress()

    def _advance_to_phase(self, phase_id: int, reason: str = ''):
        old_id = self.progress['current_phase_id']
        if phase_id <= old_id:
            return
        self.progress['phase_history'].append({
            'from_phase': old_id,
            'to_phase':   phase_id,
            'day':        self.current_day,
            'reason':     reason,
            'timestamp':  time.time(),
        })
        self.progress['current_phase_id'] = phase_id
        print(f"[CurriculumScheduler] Advancing to Phase {phase_id} "
              f"(reason: {reason}, day {self.current_day})", flush=True)
        self._save_progress()

    def get_status(self) -> Dict[str, Any]:
        phase = self.current_phase
        return {
            'current_day':    self.current_day,
            'current_phase':  phase.phase_id,
            'phase_name':     phase.name,
            'training_focus': phase.training_focus,
            'T':              phase.T,
            'resolution':     phase.res,
            'sessions_run':   self.progress['sessions_run'],
            'total_steps':    self.progress['total_steps'],
            'days_in_phase':  self.current_day - phase.day_start + 1,
            'days_remaining': max(0, phase.day_end - self.current_day),
            'quality_targets': phase.quality_targets,
            'latest_metrics': self.progress.get('latest_metrics', {}),
        }

    def get_full_schedule(self) -> List[Dict[str, Any]]:
        return [
            {
                'phase': p.phase_id,
                'name':  p.name,
                'days':  f"{p.day_start}-{p.day_end}",
                'T':     p.T,
                'res':   p.res,
                'focus': p.training_focus,
                'datasets': p.datasets[:4],
                'targets': p.quality_targets,
                'notes_preview': p.notes[:100] + '...',
            }
            for p in self.phases
        ]


# ═══════════════════════════════════════════════════════════════════════════════
# Quality Evaluator
# ═══════════════════════════════════════════════════════════════════════════════

class QualityEvaluator:
    """
    Measure model quality at phase transitions.
    Uses deterministic test prompts and metrics computed in NumPy.
    """

    # Fixed test prompts for reproducible evaluation across phases
    TEST_PROMPTS = [
        ("concert_stage",    "hip_hop",     "A dark energetic hip-hop concert stage with neon lights"),
        ("studio_session",   "r&b",         "A warm intimate R&B recording studio session"),
        ("trap_aesthetic",   "trap",        "A dark moody trap aesthetic with purple smoke"),
        ("space_concert",    "electronic",  "A futuristic space concert with holographic performer"),
        ("golden_hour",      "pop",         "A golden hour outdoor pop music performance"),
    ]

    @classmethod
    def evaluate(
        cls,
        model,              # UNetV4 instance
        time_enc,
        text_enc,
        scheduler,
        T: int = 4,
        H: int = 64,
        W: int = 64,
        n_diffusion_steps: int = 10,
        seed: int = 42,
    ) -> Dict[str, float]:
        """
        Run evaluation on test prompts and return quality metrics.
        Returns dict with: mse_loss, temporal_consistency, perceptual_score
        """
        from .trainer import _build_cond_v4, _COND_DIM_V4
        from .frame_extractor import FrameExtractor

        rng       = np.random.default_rng(seed)
        extractor = FrameExtractor(T=T, H=H, W=W)
        metrics   = {
            'mse_losses':             [],
            'temporal_consistencies': [],
            'perceptual_scores':      [],
        }
        model.set_training(False)

        for scene, genre, prompt in cls.TEST_PROMPTS:
            try:
                # Ground truth frames
                gt_frames = extractor.sample(scene, seed=seed, source='procedural')

                # Sample a mid-range timestep
                t_idx = 500
                alpha = float(scheduler.alpha_bar[t_idx])
                noise = rng.standard_normal(gt_frames.shape).astype(np.float32)
                x_noisy = math.sqrt(alpha) * gt_frames + math.sqrt(1 - alpha) * noise

                # Build conditioning
                cond = _build_cond_v4(time_enc, text_enc, t_idx, prompt)

                # Forward pass
                pred = model.forward(x_noisy, cond)

                # MSE loss
                mse = float(np.mean((pred - noise) ** 2))
                metrics['mse_losses'].append(mse)

                # Temporal consistency (frame-to-frame smoothness of prediction)
                if T > 1:
                    diffs = np.abs(pred[1:] - pred[:-1])
                    tc = 1.0 - float(np.mean(diffs))
                    tc = max(0.0, min(1.0, tc))
                    metrics['temporal_consistencies'].append(tc)

                # Perceptual score (edge quality proxy using gradient magnitude)
                sobel_pred = cls._sobel(pred.mean(axis=0))
                sobel_gt   = cls._sobel(noise.mean(axis=0))
                perc = 1.0 - float(np.mean(np.abs(sobel_pred - sobel_gt)))
                perc = max(0.0, min(1.0, perc))
                metrics['perceptual_scores'].append(perc)

            except Exception as e:
                print(f"[QualityEvaluator] Eval error for '{prompt[:30]}': {e}")
                continue

        model.set_training(True)

        result = {
            'mse_loss':             float(np.mean(metrics['mse_losses'])) if metrics['mse_losses'] else 1.0,
            'temporal_consistency': float(np.mean(metrics['temporal_consistencies'])) if metrics['temporal_consistencies'] else 0.0,
            'perceptual_score':     float(np.mean(metrics['perceptual_scores'])) if metrics['perceptual_scores'] else 0.0,
            'n_prompts_evaluated':  len(metrics['mse_losses']),
        }
        return result

    @staticmethod
    def _sobel(x: np.ndarray) -> np.ndarray:
        """Approximate Sobel edge detection on (H, W, 3) array."""
        kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
        ky = kx.T
        gray = x.mean(axis=-1) if x.ndim == 3 else x
        H, W = gray.shape[:2]
        # Simple gradient via finite differences
        gx = np.gradient(gray, axis=1)
        gy = np.gradient(gray, axis=0)
        return np.sqrt(gx ** 2 + gy ** 2)


# ═══════════════════════════════════════════════════════════════════════════════
# Curriculum Trainer
# ═══════════════════════════════════════════════════════════════════════════════

class CurriculumTrainer:
    """
    Orchestrates the full 30-day training curriculum.
    Wraps train_v4() with phase-appropriate parameters.
    """

    def __init__(self, progress_path: str = _PROGRESS_PATH):
        self.scheduler = CurriculumScheduler(progress_path)
        self._phase_checkpoints: Dict[int, str] = {}

    def run_session(self, phase: Optional[CurriculumPhase] = None) -> Dict[str, Any]:
        """
        Run one training session for the current (or given) phase.
        Returns session metadata including quality metrics.
        """
        from .trainer import train_v4

        if phase is None:
            phase, kwargs = self.scheduler.next_session()
        else:
            kwargs = phase.to_train_v4_kwargs()

        print(f"\n[CurriculumTrainer] Session: Phase {phase.phase_id} — {phase.name}")
        print(f"  T={phase.T}, res={phase.res}, lr={phase.lr}")
        print(f"  Focus: {phase.training_focus}")
        print(f"  Datasets: {phase.datasets[:3]}...", flush=True)

        session_start = time.time()
        meta = train_v4(**kwargs)
        elapsed = time.time() - session_start

        # Record session
        metrics = {
            'mse_loss':   meta.get('final_loss', 1.0),
            'n_steps':    meta.get('samples_per_epoch', 0) * meta.get('epochs', 0),
            'session_sec': elapsed,
        }
        self.scheduler.record_session(metrics)

        # Save phase checkpoint reference
        from .trainer import WEIGHTS_V4_PATH
        self._phase_checkpoints[phase.phase_id] = WEIGHTS_V4_PATH

        print(f"[CurriculumTrainer] Session done: loss={metrics['mse_loss']:.4f}, "
              f"time={elapsed:.0f}s", flush=True)
        return meta

    def run_day(self, n_sessions: int = 3) -> List[Dict[str, Any]]:
        """
        Run multiple sessions for the current day.
        Typically called by the background trainer on each scheduling cycle.
        """
        results = []
        for i in range(n_sessions):
            try:
                result = self.run_session()
                results.append(result)
            except Exception as e:
                print(f"[CurriculumTrainer] Session {i+1} error: {e}", flush=True)
        return results

    def run_month(
        self,
        sessions_per_day: int = 3,
        sleep_between_sessions_sec: int = 120,
        stop_event=None,
        deadline_str: str = '2026-04-03',
    ):
        """
        Run the continuous training curriculum until the deadline date.
        Intended for background daemon — survives server restarts via saved
        curriculum_progress.json and weights_v4.npz.

        Args:
            sleep_between_sessions_sec: seconds to sleep between sessions (default 2 min)
            stop_event:  threading.Event — set it to gracefully stop the loop
            deadline_str: ISO date string — training stops after this date
        """
        from datetime import datetime, timezone
        deadline = datetime.fromisoformat(deadline_str).replace(tzinfo=timezone.utc)
        now_fn   = lambda: datetime.now(timezone.utc)

        print(f"[CurriculumTrainer] Auto-training started — running until {deadline_str}",
              flush=True)

        consecutive_errors = 0
        MAX_ERRORS = 5

        while True:
            # Stop conditions
            if stop_event is not None and stop_event.is_set():
                print("[CurriculumTrainer] Stop event received — halting.", flush=True)
                break
            if now_fn() >= deadline:
                print("[CurriculumTrainer] Deadline reached — training complete!", flush=True)
                break
            if self.scheduler.current_day > 30:
                print("[CurriculumTrainer] 30-day curriculum complete!", flush=True)
                break

            status = self.scheduler.get_status()
            days_left = (deadline - now_fn()).days
            print(f"\n[CurriculumTrainer] Day {status['current_day']}/30 | "
                  f"Phase {status['current_phase']}: {status['phase_name']} | "
                  f"{days_left}d until April 3", flush=True)

            try:
                self.run_session()
                consecutive_errors = 0
            except Exception as e:
                consecutive_errors += 1
                print(f"[CurriculumTrainer] Session error ({consecutive_errors}/{MAX_ERRORS}): "
                      f"{e}", flush=True)
                if consecutive_errors >= MAX_ERRORS:
                    print("[CurriculumTrainer] Too many consecutive errors — pausing 10 min",
                          flush=True)
                    for _ in range(600):
                        if stop_event and stop_event.is_set():
                            break
                        time.sleep(1)
                    consecutive_errors = 0
                    continue

            # Sleep between sessions
            for _ in range(sleep_between_sessions_sec):
                if stop_event and stop_event.is_set():
                    break
                time.sleep(1)

    def get_status(self) -> Dict[str, Any]:
        return self.scheduler.get_status()

    def get_schedule(self) -> List[Dict[str, Any]]:
        return self.scheduler.get_full_schedule()
