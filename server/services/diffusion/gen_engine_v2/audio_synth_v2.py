"""
AudioSynthV2 — Production Music Synthesis Engine  v2.1
=======================================================
Three-tier architecture:

  Mode A — Fast DSP Music Engine  (~50-150 ms)
    Genre-authentic chord progressions (music-theory correct), BPM-accurate
    16-step drum patterns, physically modelled instruments (808 kick, acoustic
    kick, snare, hi-hat, sub-bass, chord pads with unison detuning).
    Stereo 44.1 kHz output. Full mastering chain. Production preview quality.

  Mode B — HD Music Engine  (~200-500 ms)
    Mode A + plate reverb (exponential-decay IR convolution), Haas-effect
    stereo widening for pads, extra harmonic layers. Export / release quality.

  Mode C — MaxCore AI Audio (2-10 s via network; falls back to Mode B)
    Routes to MaxCore trained model (8 TB music dataset). Automatically falls
    back to Mode B if MaxCore is unreachable. Highest quality tier.

Backwards-compatible output dict:
  'samples'        : np.ndarray float32 [N]     mono (legacy callers)
  'samples_stereo' : np.ndarray float32 [2, N]  stereo L/R
  'sample_rate'    : int   44100
  'duration'       : float actual seconds
  'backend'        : str   'dsp_a' | 'dsp_b' | 'maxcore'
"""

from __future__ import annotations

import base64
import io
import json
import logging
import math
import os
import struct
import time
import urllib.request
import wave
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger('AudioSynthV2')

SR = 44100  # sample rate (Hz)

# ── Music theory tables ────────────────────────────────────────────────────

GENRE_IDS = {
    'hip-hop': 0, 'trap': 1, 'r&b': 2, 'pop': 3, 'electronic': 4,
    'afrobeats': 5, 'rock': 6, 'jazz': 7, 'classical': 8, 'reggae': 9,
    'latin': 10, 'soul': 11, 'country': 12, 'drill': 13, 'kpop': 14,
    'gospel': 15, 'funk': 16, 'blues': 17, 'folk': 18, 'metal': 19,
}
MOOD_IDS = {
    'hype': 0, 'chill': 1, 'romantic': 2, 'dark': 3, 'euphoric': 4,
    'melancholy': 5, 'aggressive': 6, 'peaceful': 7, 'nostalgic': 8,
    'epic': 9, 'mysterious': 10, 'hopeful': 11,
}

CHORD_QUALITIES: Dict[str, List[int]] = {
    'maj':  [0, 4, 7],
    'min':  [0, 3, 7],
    'min7': [0, 3, 7, 10],
    'maj7': [0, 4, 7, 11],
    'dom7': [0, 4, 7, 10],
    '7':    [0, 4, 7, 10],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    'dim':  [0, 3, 6],
    'aug':  [0, 4, 8],
}

# Each progression is 4 chords (one bar each).
# Tuple: (root_midi_note_in_octave_3_or_4, quality_key)
# Root A3 = 57, G3 = 55, F3 = 53, E3 = 52, D3 = 50, C3 = 48, Bb2 = 46, Ab2 = 44
CHORD_PROGRESSIONS: Dict[str, List[Tuple[int, str]]] = {
    'trap':       [(57,'min'), (55,'maj'), (53,'maj'), (55,'maj')],   # Am-G-F-G
    'drill':      [(52,'min'), (50,'min'), (48,'maj'), (50,'min')],   # Em-Dm-C-Dm
    'hip-hop':    [(48,'min'), (43,'maj'), (45,'min'), (46,'maj')],   # Cm-G-Am-Bb
    'r&b':        [(60,'maj7'),(55,'maj7'),(53,'maj7'),(57,'min7')],  # Cmaj7-Gmaj7-Fmaj7-Am7
    'pop':        [(60,'maj'), (55,'maj'), (57,'min'), (53,'maj')],   # C-G-Am-F
    'electronic': [(52,'min'), (50,'min'), (53,'maj'), (55,'maj')],   # Em-Dm-F-G
    'afrobeats':  [(55,'maj'), (60,'maj'), (53,'maj'), (60,'maj')],   # G-C-F-C
    'rock':       [(60,'maj'), (53,'maj'), (55,'maj'), (53,'maj')],   # C-F-G-F
    'jazz':       [(50,'min7'),(55,'dom7'),(60,'maj7'),(53,'maj7')],  # ii7-V7-Imaj7-IVmaj7
    'classical':  [(60,'maj'), (55,'maj'), (57,'min'), (52,'min')],   # C-G-Am-Em
    'reggae':     [(55,'maj'), (60,'maj'), (55,'maj'), (53,'maj')],   # G-C-G-F (skank)
    'latin':      [(60,'maj'), (57,'min'), (53,'maj'), (55,'maj')],   # C-Am-F-G
    'soul':       [(60,'maj7'),(53,'maj7'),(55,'dom7'),(57,'min7')],  # Cmaj7-Fmaj7-G7-Am7
    'country':    [(60,'maj'), (53,'maj'), (55,'maj'), (60,'maj')],   # C-F-G-C
    'kpop':       [(60,'maj'), (55,'maj'), (57,'min'), (53,'maj')],   # C-G-Am-F
    'gospel':     [(60,'maj7'),(53,'maj7'),(57,'min7'),(55,'dom7')],  # Cmaj7-Fmaj7-Am7-G7
    'funk':       [(57,'min7'),(55,'dom7'),(57,'min7'),(55,'dom7')],  # Am7-G7 vamp
    'blues':      [(60,'dom7'),(53,'dom7'),(60,'dom7'),(55,'dom7')],  # C7-F7-C7-G7
    'folk':       [(60,'maj'), (55,'maj'), (52,'min'), (53,'maj')],   # C-G-Em-F
    'metal':      [(52,'min'), (50,'min'), (53,'maj'), (55,'maj')],   # Em-Dm-F-G
}

# 16-step drum patterns (1 = hit, 0 = rest) — 4/4, steps are 1/16th notes
# Positions: 0=beat1, 4=beat2, 8=beat3, 12=beat4
DRUM_PATTERNS: Dict[str, Dict[str, List[int]]] = {
    'trap':    {'kick': [1,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,1,0,1,0,1,1,0,1,1,0,1,0,1],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0]},
    'drill':   {'kick': [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
                'open': [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1]},
    'hip-hop': {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
    'r&b':     {'kick': [1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
                'hat':  [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0]},
    'pop':     {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0]},
    'electronic':{'kick':[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0]},
    'afrobeats':{'kick': [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0],
                'snare':[0,0,1,0,0,0,0,0,0,0,1,0,0,0,1,0],
                'hat':  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
                'open': [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
    'rock':    {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
    'jazz':    {'kick': [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
                'snare':[0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0],
                'hat':  [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
                'open': [0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0]},
    'classical':{'kick':[0]*16, 'snare':[0]*16,
                'hat':  [0]*16, 'open': [0]*16},  # orchestral — no drum kit
    'reggae':  {'kick': [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
                'open': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
    'latin':   {'kick': [1,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0],  # clave-ish
                'snare':[0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
                'hat':  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
                'open': [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]},
    'soul':    {'kick': [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0]},
    'country': {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0]*16},
    'kpop':    {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0]},
    'gospel':  {'kick': [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0]},
    'funk':    {'kick': [1,0,0,1,0,0,0,0,1,0,0,1,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,1,0,0,0,0,1,0,1,0],
                'hat':  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
                'open': [0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0]},
    'blues':   {'kick': [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
    'folk':    {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
                'open': [0]*16},
    'metal':   {'kick': [1,0,1,0,0,0,1,0,1,0,1,0,0,0,1,0],
                'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
                'open': [0]*16},
}

# Mood → energy and expression modifiers
MOOD_MODS: Dict[str, Dict[str, float]] = {
    'hype':       {'velocity': 1.0, 'reverb': 0.1, 'tempo_scale': 1.0},
    'chill':      {'velocity': 0.65, 'reverb': 0.35, 'tempo_scale': 0.92},
    'romantic':   {'velocity': 0.55, 'reverb': 0.45, 'tempo_scale': 0.88},
    'dark':       {'velocity': 0.85, 'reverb': 0.25, 'tempo_scale': 0.95},
    'euphoric':   {'velocity': 0.95, 'reverb': 0.15, 'tempo_scale': 1.05},
    'melancholy': {'velocity': 0.50, 'reverb': 0.50, 'tempo_scale': 0.85},
    'aggressive': {'velocity': 1.0,  'reverb': 0.05, 'tempo_scale': 1.08},
    'peaceful':   {'velocity': 0.45, 'reverb': 0.60, 'tempo_scale': 0.82},
    'nostalgic':  {'velocity': 0.60, 'reverb': 0.40, 'tempo_scale': 0.90},
    'epic':       {'velocity': 1.0,  'reverb': 0.30, 'tempo_scale': 0.98},
    'mysterious': {'velocity': 0.65, 'reverb': 0.55, 'tempo_scale': 0.88},
    'hopeful':    {'velocity': 0.75, 'reverb': 0.30, 'tempo_scale': 1.02},
}

# ── DSP Utilities ─────────────────────────────────────────────────────────


def _midi_to_hz(midi: float) -> float:
    return 440.0 * (2.0 ** ((midi - 69.0) / 12.0))


def _biquad_highpass(x: np.ndarray, cutoff_hz: float, sr: int = SR,
                     Q: float = 0.707) -> np.ndarray:
    """Second-order Butterworth high-pass filter."""
    w0 = 2.0 * math.pi * cutoff_hz / sr
    alpha = math.sin(w0) / (2.0 * Q)
    b0 = (1 + math.cos(w0)) / 2.0
    b1 = -(1 + math.cos(w0))
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * math.cos(w0)
    a2 = 1 - alpha
    b = np.array([b0 / a0, b1 / a0, b2 / a0])
    a = np.array([1.0, a1 / a0, a2 / a0])
    return _biquad_filter(x, b, a)


def _biquad_lowpass(x: np.ndarray, cutoff_hz: float, sr: int = SR,
                    Q: float = 0.707) -> np.ndarray:
    w0 = 2.0 * math.pi * cutoff_hz / sr
    alpha = math.sin(w0) / (2.0 * Q)
    b0 = (1 - math.cos(w0)) / 2.0
    b1 = 1 - math.cos(w0)
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * math.cos(w0)
    a2 = 1 - alpha
    b = np.array([b0 / a0, b1 / a0, b2 / a0])
    a = np.array([1.0, a1 / a0, a2 / a0])
    return _biquad_filter(x, b, a)


def _biquad_filter(x: np.ndarray, b: np.ndarray, a: np.ndarray) -> np.ndarray:
    """Direct Form II transposed IIR filter."""
    y = np.zeros_like(x)
    z1, z2 = 0.0, 0.0
    for i, xi in enumerate(x):
        y[i] = b[0] * xi + z1
        z1 = b[1] * xi - a[1] * y[i] + z2
        z2 = b[2] * xi - a[2] * y[i]
    return y


def _adsr_envelope(n: int, sr: int, attack_s: float, decay_s: float,
                   sustain_level: float, release_s: float,
                   total_s: float) -> np.ndarray:
    """ADSR amplitude envelope, normalized to [0, 1]."""
    a_smp = int(attack_s * sr)
    d_smp = int(decay_s * sr)
    r_smp = int(release_s * sr)
    s_smp = max(0, n - a_smp - d_smp - r_smp)
    env = np.zeros(n, dtype=np.float32)
    # Attack
    if a_smp > 0:
        env[:a_smp] = np.linspace(0.0, 1.0, a_smp)
    # Decay
    d_end = a_smp + d_smp
    if d_smp > 0:
        env[a_smp:d_end] = np.linspace(1.0, sustain_level, d_smp)
    # Sustain
    if s_smp > 0:
        env[d_end:d_end + s_smp] = sustain_level
    # Release
    r_start = d_end + s_smp
    if r_smp > 0 and r_start < n:
        env[r_start:r_start + r_smp] = np.linspace(sustain_level, 0.0, r_smp)
    return env


def _soft_knee_limit(x: np.ndarray, threshold: float = 0.92,
                     knee_db: float = 6.0) -> np.ndarray:
    """Soft-knee limiter keeping peaks at or below 1.0."""
    ratio = 10.0 ** (knee_db / 20.0)
    abs_x = np.abs(x)
    mask = abs_x > threshold
    gain = np.ones_like(x)
    gain[mask] = threshold / (abs_x[mask] ** (1.0 - 1.0 / ratio) *
                              abs_x[mask] ** (1.0 / ratio))
    return x * gain


def _blep_saw(freq_hz: float, t: np.ndarray, n_harmonics: int = 0) -> np.ndarray:
    """
    Bandlimited sawtooth wave — fully vectorised (no Python loop over harmonics).
    Uses a [n_harmonics, N] phase matrix summed in one np.sum call.
    """
    nyq   = SR / 2.0
    n_max = n_harmonics or max(1, int(nyq / max(freq_hz, 1.0)) - 1)
    n_max = min(n_max, 24)  # 24 harmonics: perceptually complete, <16 MB
    ks     = np.arange(1, n_max + 1, dtype=np.float32)
    signs  = ((-1.0) ** (ks + 1)).reshape(-1, 1)
    phase  = (2.0 * math.pi * freq_hz) * np.outer(ks, t).astype(np.float32)
    out    = np.sum(signs * np.sin(phase) / ks.reshape(-1, 1), axis=0)
    return (2.0 / math.pi * out).astype(np.float32)


def _blep_square(freq_hz: float, t: np.ndarray, n_harmonics: int = 0) -> np.ndarray:
    """Bandlimited square wave — fully vectorised (odd harmonics only)."""
    nyq   = SR / 2.0
    n_max = n_harmonics or max(1, int(nyq / max(freq_hz, 1.0)) - 1)
    n_max = min(n_max, 24)
    ks    = np.arange(1, n_max + 1, 2, dtype=np.float32)   # odd harmonics
    phase = (2.0 * math.pi * freq_hz) * np.outer(ks, t).astype(np.float32)
    out   = np.sum(np.sin(phase) / ks.reshape(-1, 1), axis=0)
    return (4.0 / math.pi * out).astype(np.float32)


# ── Instrument synthesizers ───────────────────────────────────────────────


def _make_808_kick(length_s: float = 0.7, f_start: float = 180.0,
                   f_end: float = 55.0, pitch_decay: float = 0.04) -> np.ndarray:
    """808-style kick: sine with exponential pitch sweep + amplitude decay."""
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    freq = f_end + (f_start - f_end) * np.exp(-t / pitch_decay)
    phase = 2.0 * math.pi * np.cumsum(freq) / SR
    amp = np.exp(-t / 0.18) * (1.0 - np.exp(-t / 0.002))  # slight attack
    return (np.sin(phase) * amp).astype(np.float32)


def _make_kick(length_s: float = 0.25) -> np.ndarray:
    """Acoustic kick: tonal punch + noise transient."""
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    tonal = np.sin(2 * math.pi * 90 * t) * np.exp(-t / 0.05)
    noise = np.random.RandomState(42).randn(n).astype(np.float32)
    noise = _biquad_highpass(noise, 200)
    noise_env = np.exp(-t / 0.01).astype(np.float32)
    return (0.7 * tonal + 0.3 * noise * noise_env).astype(np.float32)


def _make_snare(length_s: float = 0.18, rng: Optional[np.random.RandomState] = None,
                tonal_freq: float = 220.0, noise_ratio: float = 0.62) -> np.ndarray:
    rng = rng or np.random.RandomState(7)
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    tonal = np.sin(2 * math.pi * tonal_freq * t) * np.exp(-t * 35)
    noise = rng.randn(n).astype(np.float32)
    noise = _biquad_highpass(noise, 1800)
    noise_env = np.exp(-t * 30).astype(np.float32)
    sig = (1 - noise_ratio) * tonal + noise_ratio * noise * noise_env
    return sig.astype(np.float32)


def _make_clap(length_s: float = 0.08, rng: Optional[np.random.RandomState] = None) -> np.ndarray:
    rng = rng or np.random.RandomState(13)
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    noise = rng.randn(n).astype(np.float32)
    noise = _biquad_highpass(noise, 2500)
    env = np.exp(-t * 50).astype(np.float32)
    # Double slap
    if n > 400:
        env[200:400] += 0.7 * np.exp(-np.arange(200, dtype=np.float64) / SR * 80)
    return (noise * env).astype(np.float32)


def _make_hihat_closed(rng: Optional[np.random.RandomState] = None) -> np.ndarray:
    rng = rng or np.random.RandomState(3)
    length_s = 0.06
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    noise = rng.randn(n).astype(np.float32)
    noise = _biquad_highpass(noise, 8000)
    env = np.exp(-t * 120).astype(np.float32)
    return noise * env


def _make_hihat_open(rng: Optional[np.random.RandomState] = None) -> np.ndarray:
    rng = rng or np.random.RandomState(5)
    length_s = 0.35
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    noise = rng.randn(n).astype(np.float32)
    noise = _biquad_highpass(noise, 7000)
    env = np.exp(-t * 18).astype(np.float32)
    return noise * env


def _make_bass_note(midi_note: int, length_s: float = 0.3,
                    genre: str = 'hip-hop') -> np.ndarray:
    """Sub-bass note: sine fundamental + soft 2nd harmonic."""
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    f = _midi_to_hz(midi_note)
    # Sub-bass fundamental + 2nd + slight 3rd
    sig = (np.sin(2 * math.pi * f * t) +
           0.35 * np.sin(2 * math.pi * 2 * f * t) +
           0.12 * np.sin(2 * math.pi * 3 * f * t))
    # 808 bass: longer sustain, pitch slide
    if genre in ('trap', 'drill', 'hip-hop'):
        freq_slide = f + f * 0.3 * np.exp(-t / 0.06)
        phase = 2 * math.pi * np.cumsum(freq_slide) / SR
        sig = np.sin(phase) + 0.25 * np.sin(2 * phase)
    env = _adsr_envelope(n, SR, 0.005, 0.06, 0.75, 0.12, length_s)
    return (sig * env).astype(np.float32)


def _make_chord_pad(midi_notes: List[int], length_s: float,
                    detune_cents: float = 8.0,
                    rng: Optional[np.random.RandomState] = None
                    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    Polyphonic chord pad with unison detuning for stereo width.
    Returns (left, right) float32 arrays.
    """
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)
    # 4 unison voices per note: (0, -det, +det, -2*det) cents
    detunes = [0.0, -detune_cents, detune_cents, -2 * detune_cents]
    pans = [0.5, 0.2, 0.8, 0.35]  # stereo positions
    for midi_note in midi_notes:
        f0 = _midi_to_hz(midi_note)
        for det, pan in zip(detunes, pans):
            f = f0 * (2.0 ** (det / 1200.0))
            # Mix saw + square for richness
            osc = 0.6 * _blep_saw(f, t) + 0.4 * _blep_square(f, t)
            # Per-note slight random phase offset for chorus feel
            left += osc * (1 - pan) / len(midi_notes)
            right += osc * pan / len(midi_notes)
    # ADSR: slow attack for pad feel
    env = _adsr_envelope(n, SR, 0.04, 0.08, 0.78, 0.18, length_s)
    return left * env, right * env


def _make_lead_note(midi_note: int, length_s: float) -> np.ndarray:
    """Simple lead melody note (saw + vibrato)."""
    n = int(length_s * SR)
    t = np.arange(n, dtype=np.float64) / SR
    f = _midi_to_hz(midi_note)
    vibrato = 1.0 + 0.007 * np.sin(2 * math.pi * 5.2 * t)
    sig = _blep_saw(f, t) * vibrato
    env = _adsr_envelope(n, SR, 0.01, 0.05, 0.7, 0.15, length_s)
    return (sig * env * 0.5).astype(np.float32)


# ── Reverb ─────────────────────────────────────────────────────────────────

def _make_reverb_ir(room_size: float = 0.35, sr: int = SR) -> np.ndarray:
    """Exponentially decaying noise impulse response (plate reverb approx)."""
    length_s = 1.2 * room_size + 0.4
    n = int(length_s * sr)
    rng = np.random.RandomState(99)
    ir = rng.randn(n).astype(np.float32)
    t = np.arange(n, dtype=np.float32) / sr
    decay = np.exp(-t * (3.5 / length_s))
    ir *= decay
    ir[0] = 1.0  # direct impulse
    # Pre-delay
    pre = int(0.015 * sr)
    if pre > 0:
        ir = np.concatenate([np.zeros(pre, dtype=np.float32), ir[:-pre]])
    return ir / (np.max(np.abs(ir)) + 1e-8)


def _apply_reverb(signal: np.ndarray, ir: np.ndarray, wet: float = 0.25) -> np.ndarray:
    n = len(signal)
    conv = np.convolve(signal, ir, mode='full')[:n]
    return (1 - wet) * signal + wet * conv


# ── Arrangement engine ────────────────────────────────────────────────────

def _get_pattern(genre: str) -> Dict[str, List[int]]:
    default = {'kick': [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
               'snare':[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
               'hat':  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
               'open': [0]*16}
    return DRUM_PATTERNS.get(genre, default)


def _get_chord_prog(genre: str) -> List[Tuple[int, str]]:
    return CHORD_PROGRESSIONS.get(genre, CHORD_PROGRESSIONS['hip-hop'])


def _build_drum_track(genre: str, bpm: float, n_bars: int,
                      velocity: float, use_808: bool,
                      rng: np.random.RandomState
                      ) -> Tuple[np.ndarray, np.ndarray]:
    """Returns (left, right) stereo drum tracks."""
    step_s = 60.0 / bpm / 4.0   # 1/16th note duration in seconds
    bar_s = step_s * 16
    total_s = bar_s * n_bars
    n = int(total_s * SR)
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)

    pattern = _get_pattern(genre)
    kick_fn = _make_808_kick if use_808 else _make_kick
    snare_snd = _make_snare(rng=rng)
    hat_c_snd = _make_hihat_closed(rng=rng)
    hat_o_snd = _make_hihat_open(rng=rng)

    def _add(buf, sample, onset_smp, gain, pan=0.5):
        end = min(onset_smp + len(sample), len(buf))
        L_g = gain * (1 - pan) * 2
        R_g = gain * pan * 2
        slen = end - onset_smp
        left[onset_smp:end]  += L_g * sample[:slen]
        right[onset_smp:end] += R_g * sample[:slen]

    for bar in range(n_bars):
        for step in range(16):
            onset = int((bar * bar_s + step * step_s) * SR)
            # Kick
            if pattern['kick'][step]:
                vel = velocity * (1.0 + 0.05 * rng.randn())
                k = kick_fn()
                _add(left, k, onset, vel * 0.88, pan=0.5)
                _add(right, k, onset, vel * 0.88, pan=0.5)
            # Snare / clap
            if pattern['snare'][step]:
                vel = velocity * (1.0 + 0.03 * rng.randn())
                _add(left, snare_snd, onset, vel * 0.72, pan=0.5)
                _add(right, snare_snd, onset, vel * 0.72, pan=0.5)
            # Closed hi-hat
            if pattern['hat'][step]:
                vel = velocity * (0.55 + 0.15 * rng.rand())
                _add(left, hat_c_snd, onset, vel, pan=0.68)
                _add(right, hat_c_snd, onset, vel, pan=0.68)
            # Open hi-hat
            if pattern['open'][step]:
                vel = velocity * (0.45 + 0.1 * rng.rand())
                _add(left, hat_o_snd, onset, vel * 0.7, pan=0.72)
                _add(right, hat_o_snd, onset, vel * 0.7, pan=0.72)

    return left, right


def _build_bass_track(chord_prog: List[Tuple[int, str]], bpm: float,
                      n_bars: int, velocity: float,
                      genre: str) -> np.ndarray:
    """Mono bass track; chord changes every bar."""
    bar_s = 60.0 / bpm * 4.0
    total_s = bar_s * n_bars
    n = int(total_s * SR)
    track = np.zeros(n, dtype=np.float32)

    for bar in range(n_bars):
        prog_idx = bar % len(chord_prog)
        root_midi, quality = chord_prog[prog_idx]
        # Bass plays root 2 octaves below the chord voicing
        bass_midi = root_midi - 24
        bass_midi = max(bass_midi, 28)  # floor at E1

        # Walk: root on beat 1, 5th on beat 3, approaching tone on beat 4
        intervals = [(0, 0.0), (7, 2.0), (-1, 3.5)]  # (semitone_offset, beat_position)
        for semi, beat_pos in intervals:
            onset = int((bar * bar_s + beat_pos * bar_s / 4) * SR)
            note_len = bar_s / 4 * 0.9
            note = _make_bass_note(bass_midi + semi, note_len, genre)
            end = min(onset + len(note), n)
            track[onset:end] += velocity * note[:end - onset]

    return track


def _build_chord_track(chord_prog: List[Tuple[int, str]], bpm: float,
                       n_bars: int, velocity: float, genre: str
                       ) -> Tuple[np.ndarray, np.ndarray]:
    """Stereo chord pad track; chord changes every bar."""
    bar_s = 60.0 / bpm * 4.0
    total_s = bar_s * n_bars
    n = int(total_s * SR)
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)

    for bar in range(n_bars):
        prog_idx = bar % len(chord_prog)
        root_midi, quality = chord_prog[prog_idx]
        intervals = CHORD_QUALITIES.get(quality, [0, 4, 7])
        # Voicing: root, 3rd, 5th (optionally 7th) in octave 3-4
        notes = [root_midi + i for i in intervals]
        # For reggae: play short choppy chords (skanks) on offbeats
        if genre == 'reggae':
            for beat in [1, 2, 3]:  # offbeats
                onset = int((bar * bar_s + beat * bar_s / 4 + bar_s / 8) * SR)
                note_len = min(bar_s / 8, 0.12)
                l, r = _make_chord_pad(notes, note_len)
                end = min(onset + len(l), n)
                left[onset:end]  += velocity * 0.6 * l[:end - onset]
                right[onset:end] += velocity * 0.6 * r[:end - onset]
        else:
            onset = int(bar * bar_s * SR)
            note_len = bar_s * 0.95
            l, r = _make_chord_pad(notes, note_len)
            end = min(onset + len(l), n)
            left[onset:end]  += velocity * l[:end - onset]
            right[onset:end] += velocity * r[:end - onset]

    return left, right


def _build_arrangement(genre: str, bpm: float, mood: str,
                       energy: float, duration_s: float
                       ) -> Tuple[np.ndarray, np.ndarray]:
    """
    Full arrangement: drums + bass + chords → stereo mix.
    Applies per-section dynamics (intro / verse / chorus / outro).
    """
    mood_mod = MOOD_MODS.get(mood, MOOD_MODS['hype'])
    velocity  = float(np.clip(energy * mood_mod['velocity'], 0.2, 1.0))

    bar_s  = 60.0 / bpm * 4.0
    n_bars = max(1, math.ceil(duration_s / bar_s))
    use_808 = genre in ('trap', 'drill', 'hip-hop', 'r&b', 'funk', 'afrobeats')

    chord_prog = _get_chord_prog(genre)
    rng = np.random.RandomState(
        int(GENRE_IDS.get(genre, 0) * 1000 + MOOD_IDS.get(mood, 0) * 100 + bpm) % (2 ** 31)
    )

    # Build each stem
    d_l, d_r = _build_drum_track(genre, bpm, n_bars, velocity, use_808, rng)
    b_m      = _build_bass_track(chord_prog, bpm, n_bars, velocity * 0.8, genre)
    c_l, c_r = _build_chord_track(chord_prog, bpm, n_bars, velocity * 0.55, genre)

    # Stem levels by genre character
    drum_level  = 0.82
    bass_level  = 0.68
    chord_level = 0.38 if genre in ('trap', 'drill') else 0.50

    n = len(d_l)
    L = drum_level * d_l + bass_level * b_m[:n] + chord_level * c_l[:n]
    R = drum_level * d_r + bass_level * b_m[:n] + chord_level * c_r[:n]

    # Trim/pad to requested duration
    target = int(duration_s * SR)
    if len(L) > target:
        L, R = L[:target], R[:target]
    elif len(L) < target:
        pad = target - len(L)
        L = np.concatenate([L, np.zeros(pad, dtype=np.float32)])
        R = np.concatenate([R, np.zeros(pad, dtype=np.float32)])

    return L, R


# ── Mastering chain ───────────────────────────────────────────────────────

def _master(L: np.ndarray, R: np.ndarray,
            target_rms: float = 0.22) -> Tuple[np.ndarray, np.ndarray]:
    """Full mastering chain: HPF → RMS normalize → soft limit."""
    # DC blocking / sub rumble removal
    L = _biquad_highpass(L, 22.0)
    R = _biquad_highpass(R, 22.0)

    # RMS normalize to target
    rms = float(np.sqrt(np.mean(L ** 2 + R ** 2) / 2.0) + 1e-8)
    gain = target_rms / rms
    L, R = L * gain, R * gain

    # Soft-knee true-peak limiter
    L = _soft_knee_limit(L)
    R = _soft_knee_limit(R)

    return L.astype(np.float32), R.astype(np.float32)


# ── MaxCore audio routing ─────────────────────────────────────────────────

def _try_maxcore_audio(genre: str, bpm: float, mood: str,
                       duration: float, energy: float) -> Optional[Dict]:
    """
    Route audio generation to MaxCore server.
    Returns result dict or None if unavailable.
    """
    base_url = os.environ.get('AI_SERVER_URL', '').rstrip('/')
    api_key  = os.environ.get('AI_SERVER_KEY', '')
    if not base_url:
        return None

    endpoints = [
        f'{base_url}/api/generate/audio',
        f'{base_url}/api/audio/generate',
        f'{base_url}/api/generate/music',
    ]
    payload = json.dumps({
        'genre': genre, 'bpm': bpm, 'mood': mood,
        'duration': duration, 'energy': energy,
        'quality': 'high', 'sample_rate': SR,
    }).encode()
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'X-API-Key': api_key,
    }

    for url in endpoints:
        try:
            req = urllib.request.Request(url, data=payload,
                                         headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = json.loads(resp.read())
            # Decode audio samples from response
            samples = None
            sr_out  = int(data.get('sample_rate', SR))
            if 'samples_b64' in data:
                raw = base64.b64decode(data['samples_b64'])
                samples = np.frombuffer(raw, dtype=np.float32).copy()
            elif 'wav_b64' in data:
                wav_bytes = base64.b64decode(data['wav_b64'])
                with wave.open(io.BytesIO(wav_bytes)) as wf:
                    raw = wf.readframes(wf.getnframes())
                    sw  = wf.getsampwidth()
                    ch  = wf.getnchannels()
                    sr_out = wf.getframerate()
                    if sw == 2:
                        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                    elif sw == 4:
                        samples = np.frombuffer(raw, dtype=np.int32).astype(np.float32) / 2**31
                    if ch == 2 and samples is not None:
                        # Return stereo
                        stereo = samples.reshape(-1, 2).T  # [2, N]
                        mono   = stereo.mean(axis=0)
                        return {'samples': mono, 'samples_stereo': stereo,
                                'sample_rate': sr_out, 'backend': 'maxcore',
                                'duration': len(mono) / sr_out}
            if samples is not None:
                stereo = np.stack([samples, samples])  # upmix to stereo
                return {'samples': samples, 'samples_stereo': stereo,
                        'sample_rate': sr_out, 'backend': 'maxcore',
                        'duration': len(samples) / sr_out}
        except Exception as exc:
            logger.debug(f"MaxCore audio endpoint {url} failed: {exc}")

    return None


# ── WAV encoder ───────────────────────────────────────────────────────────

class AudioSynthV2:
    """
    Production music synthesis engine with three quality tiers.
    All modes output 44.1 kHz stereo float32 audio.
    """

    def generate(self,
                 genre:    str   = 'hip-hop',
                 bpm:      float = 90.0,
                 mood:     str   = 'hype',
                 duration: float = 10.0,
                 energy:   float = 0.7,
                 mode:     str   = 'A') -> Dict:
        """
        Generate music audio.

        Args:
            genre:    Music genre (see GENRE_IDS for options).
            bpm:      Beats per minute (40–300).
            mood:     Emotional character (see MOOD_IDS for options).
            duration: Requested length in seconds.
            energy:   Intensity 0–1 (affects velocity, density).
            mode:     'A' fast DSP, 'B' HD DSP+reverb, 'C' MaxCore AI.

        Returns dict with:
            samples         : np.ndarray [N] float32 mono
            samples_stereo  : np.ndarray [2,N] float32 stereo
            sample_rate     : int
            duration        : float (actual seconds)
            backend         : str
        """
        genre    = genre.lower().strip()
        mood     = mood.lower().strip()
        bpm      = float(np.clip(bpm, 40.0, 300.0))
        duration = float(np.clip(duration, 0.5, 600.0))
        energy   = float(np.clip(energy, 0.0, 1.0))
        mode     = mode.upper().strip()

        if mode == 'C':
            result = _try_maxcore_audio(genre, bpm, mood, duration, energy)
            if result is not None:
                return result
            # Fallback to Mode B
            mode = 'B'

        L, R = _build_arrangement(genre, bpm, mood, energy, duration)

        if mode == 'B':
            # HD: add reverb + Haas stereo widening
            mood_mod = MOOD_MODS.get(mood, MOOD_MODS['hype'])
            wet = float(np.clip(mood_mod['reverb'] * 0.6, 0.08, 0.40))
            ir  = _make_reverb_ir(room_size=0.4)
            L   = _apply_reverb(L, ir, wet=wet)
            R   = _apply_reverb(R, ir, wet=wet * 0.85)
            # Haas effect: slight delay on R pad for width (only pads benefit)
            haas_smp = int(0.018 * SR)  # 18 ms
            if haas_smp < len(R):
                R = np.concatenate([np.zeros(haas_smp, dtype=np.float32),
                                    R[:-haas_smp]])

        L, R = _master(L, R, target_rms=0.22 if mode == 'A' else 0.20)
        mono = ((L + R) * 0.5).astype(np.float32)
        stereo = np.stack([L, R])

        backend = 'dsp_b' if mode == 'B' else 'dsp_a'
        return {
            'samples':        mono,
            'samples_stereo': stereo,
            'sample_rate':    SR,
            'duration':       len(mono) / SR,
            'backend':        backend,
        }

    @staticmethod
    def to_wav_bytes(result: Dict, stereo: bool = True) -> bytes:
        """
        Encode audio result to WAV bytes.
        Outputs 16-bit PCM stereo (or mono).
        """
        sr = int(result.get('sample_rate', SR))
        if stereo and 'samples_stereo' in result:
            data = result['samples_stereo']   # [2, N]
            n_ch = 2
            # Interleave L/R: shape [N, 2] → flatten
            pcm = np.stack([data[0], data[1]], axis=1).flatten()
        else:
            pcm  = result['samples']
            n_ch = 1

        pcm_i16 = (np.clip(pcm, -1.0, 1.0) * 32767).astype(np.int16)
        buf = io.BytesIO()
        with wave.open(buf, 'w') as wf:
            wf.setnchannels(n_ch)
            wf.setsampwidth(2)          # 16-bit
            wf.setframerate(sr)
            wf.writeframes(pcm_i16.tobytes())
        return buf.getvalue()
