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

        # ── SPRINT MODE: 30 days → 3 days (due Friday) ───────────────────────
        # Original schedule: 7 days per phase across 30 days.
        # Compressed: 1 day per phase, early advancement on quality targets,
        # higher LR for faster convergence, relaxed quality gates so the
        # scheduler can advance without waiting for perfection.
        # The 35% replay fraction + doubled replay buffer (memory.py) means
        # each shortened phase still hammers hard examples aggressively.
        # ─────────────────────────────────────────────────────────────────────

        # ── Phase 1: Spatial Foundation (Day 1) ──────────────────────────────
        CurriculumPhase(
            phase_id    = 1,
            name        = "Spatial Foundation",
            day_start   = 1,
            day_end     = 1,
            T           = 4,
            res         = 64,
            lr          = 3e-4,          # SPRINT: 1.5x original LR for faster convergence
            n_samples_per_session = 400,
            n_epochs_per_session  = 5,
            training_focus = 'spatial_quality',
            datasets    = [
                'synthetic',
                'laion_aesthetics',
                'gtzan',
                'fma',
            ],
            quality_targets = {          # SPRINT: relaxed ~15% so phase advances faster
                'mse_loss':              0.18,
                'perceptual_score':      0.34,
                'temporal_consistency':  0.51,
            },
            notes = (
                "SPRINT MODE: 1 day (was 7). Higher LR, relaxed quality gates. "
                "Focus: scene structure, color palettes, composition. T=4 fast iteration. "
                "Replay fraction 35% — hard examples revisited aggressively."
            ),
        ),

        # ── Phase 2: Motion Coherence (Day 2) ────────────────────────────────
        CurriculumPhase(
            phase_id    = 2,
            name        = "Motion Coherence",
            day_start   = 2,
            day_end     = 2,
            T           = 8,
            res         = 64,
            lr          = 1.5e-4,        # SPRINT: 1.5x original LR
            n_samples_per_session = 500,
            n_epochs_per_session  = 6,
            training_focus = 'motion_coherence',
            datasets    = [
                'synthetic',
                'ucf_101',
                'kinetics_700',
                'aist_plus',
                'hmdb_51',
            ],
            quality_targets = {          # SPRINT: relaxed ~15%
                'mse_loss':              0.12,
                'perceptual_score':      0.47,
                'temporal_consistency':  0.64,
                'motion_smoothness':     0.55,
            },
            notes = (
                "SPRINT MODE: 1 day (was 7). Temporal attention, fluid motion. "
                "T=8 forces 8-frame trajectory reasoning. AIST++ music-dance pairs."
            ),
        ),

        # ── Phase 3: Music Specificity (Day 3 morning) ───────────────────────
        CurriculumPhase(
            phase_id    = 3,
            name        = "Music Specificity",
            day_start   = 3,
            day_end     = 3,
            T           = 16,
            res         = 96,
            lr          = 7e-5,          # SPRINT: 1.4x original LR
            n_samples_per_session = 400,
            n_epochs_per_session  = 5,
            training_focus = 'music_specificity',
            datasets    = [
                'vggsound',
                'audioset_music',
                'aist_plus',
                'ytmv',
                'fma',
                'magnatagatune',
                'synthetic',
            ],
            quality_targets = {          # SPRINT: relaxed ~15%
                'mse_loss':              0.08,
                'perceptual_score':      0.55,
                'temporal_consistency':  0.68,
                'music_visual_alignment': 0.55,
                'genre_accuracy':        0.51,
            },
            notes = (
                "SPRINT MODE: 1 day (was 7). Genre aesthetics, BPM conditioning. "
                "T=16 at 96×96 — big compute step. Audio features via 256-dim vector."
            ),
        ),

        # ── Phase 4: Audio-Visual Fusion (Day 3) ─────────────────────────────
        CurriculumPhase(
            phase_id    = 4,
            name        = "Audio-Visual Fusion",
            day_start   = 3,
            day_end     = 3,
            T           = 32,
            res         = 96,
            lr          = 3e-5,          # SPRINT: 1.5x original LR
            n_samples_per_session = 500,
            n_epochs_per_session  = 5,
            training_focus = 'audiovisual_fusion',
            datasets    = [
                'vggsound',
                'audioset_music',
                'aist_plus',
                'ytmv',
                'openvid_1m',
                'webvid_2m',
                'audiocaps',
                'synthetic',
            ],
            quality_targets = {          # SPRINT: relaxed ~15%
                'mse_loss':              0.06,
                'perceptual_score':      0.61,
                'temporal_consistency':  0.72,
                'music_visual_alignment': 0.60,
                'audio_beat_sync':       0.51,
                'genre_accuracy':        0.60,
                'text_adherence':        0.55,
            },
            notes = (
                "SPRINT MODE: Same day as phase 3, triggered by early advancement. "
                "Full T=32 + beat sync. Distillation from phase 3 reduces steps needed. "
                "Production-ready after this phase. Evaluate against Veo gap metrics."
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
        """Atomic write — write to .tmp then rename so a crash never corrupts the file."""
        os.makedirs(os.path.dirname(self.progress_path), exist_ok=True)
        tmp = self.progress_path + '.tmp'
        try:
            with open(tmp, 'w') as f:
                json.dump(self.progress, f, indent=2)
            os.replace(tmp, self.progress_path)

            # Rotate: keep 3 rolling backups (.bak0 newest, .bak2 oldest)
            for i in range(2, -1, -1):
                src = self.progress_path + (f'.bak{i-1}' if i > 0 else '')
                dst = self.progress_path + f'.bak{i}'
                if os.path.exists(src):
                    try:
                        import shutil as _sh
                        _sh.copy2(src, dst)
                    except OSError:
                        pass
        except Exception as e:
            print(f"[CurriculumScheduler] Progress save failed: {e}", flush=True)
            if os.path.exists(tmp):
                os.remove(tmp)

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

    def record_engagement_signal(self, signal: Dict[str, Any]) -> None:
        """
        Called by the /train/feedback endpoint when the autopilots report a
        high-engagement post or an A/B test winner.  The signal is appended to
        the curriculum progress under 'engagement_signals' so the next call to
        run_session() can incorporate it as a bias toward the winning visual style.

        The DiffusionTrainer reads self.scheduler.progress['engagement_signals']
        before each synthetic data generation pass and up-weights scene categories
        that match the winning content_type / platform combination.
        """
        signals = self.scheduler.progress.setdefault('engagement_signals', [])
        signals.append({
            'trigger':         signal.get('trigger', 'unknown'),
            'platform':        signal.get('platform', 'unknown'),
            'content_type':    signal.get('content_type', 'unknown'),
            'hook_type':       signal.get('hook_type', 'unknown'),
            'engagement_rate': float(signal.get('engagement_rate', 0)),
            'curriculum_hint': signal.get('curriculum_hint', ''),
            'variate_count':   int(signal.get('variate_count', 1)),
            'received_at':     signal.get('received_at', 0),
        })

        # Keep only the 500 most-recent signals to avoid unbounded growth
        if len(signals) > 500:
            self.scheduler.progress['engagement_signals'] = signals[-500:]

        self.scheduler._save_progress()
        print(
            f"[CurriculumTrainer] Engagement signal recorded — "
            f"platform={signal.get('platform')} "
            f"engagement={signal.get('engagement_rate', 0):.2f}% "
            f"trigger={signal.get('trigger')}",
            flush=True,
        )
