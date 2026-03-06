#!/usr/bin/env python3
"""
Audio Feature Analyzer for Max Booster — Professional Edition
Extracts BPM, key, energy, valence, genre, structure, LUFS, and more
from an audio file using FFmpeg + NumPy — no external ML libraries.

New in this version:
  - Multi-resolution BPM via autocorrelation + onset consensus
  - HPCP-based key detection (Krumhansl-Schmuckler profiles)
  - Structural analysis via RMS self-similarity matrix
  - LUFS estimation from integrated RMS
  - Multi-label genre classification with probability scores
  - Tonal complexity score

Usage: python3 audioAnalyzer.py '<filepath>'
Output: JSON to stdout
"""

import sys
import json
import os
import re
import subprocess
import math
import numpy as np
from typing import Optional

FFPROBE = os.environ.get('FFPROBE_PATH', 'ffprobe')
FFMPEG  = os.environ.get('FFMPEG_PATH',  'ffmpeg')

for candidate in [
    '/nix/store/d76y1p3a2y6cvf1giqppv8pm99m60npq-replit-runtime-path/bin/ffprobe',
    '/usr/bin/ffprobe', '/usr/local/bin/ffprobe',
]:
    if os.path.exists(candidate):
        FFPROBE = candidate
        break

for candidate in [
    '/nix/store/d76y1p3a2y6cvf1giqppv8pm99m60npq-replit-runtime-path/bin/ffmpeg',
    '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg',
]:
    if os.path.exists(candidate):
        FFMPEG = candidate
        break

SAMPLE_RATE = 8000     # 8 kHz for richer spectral analysis (was 4 kHz)
ANALYZE_SEC = 60       # Analyze up to 60 seconds

GENRE_HINTS = {
    'hip hop': 'hip-hop', 'hip-hop': 'hip-hop', 'rap': 'hip-hop',
    'trap': 'trap', 'drill': 'drill',
    'r&b': 'r&b', 'rnb': 'r&b', 'soul': 'r&b', 'neo-soul': 'neosoul',
    'pop': 'pop',
    'electronic': 'electronic', 'edm': 'electronic', 'house': 'house',
    'techno': 'techno', 'dubstep': 'electronic',
    'afrobeats': 'afrobeats', 'afropop': 'afrobeats', 'amapiano': 'amapiano',
    'latin': 'latin', 'reggaeton': 'reggaeton',
    'country': 'country', 'folk': 'country', 'indie': 'indie',
    'rock': 'rock', 'metal': 'rock', 'punk': 'rock', 'alternative': 'rock',
    'jazz': 'jazz', 'classical': 'classical', 'ambient': 'ambient',
    'lofi': 'lofi', 'lo-fi': 'lofi', 'lo fi': 'lofi',
    'dnb': 'dnb', 'drum and bass': 'dnb', 'drum & bass': 'dnb',
    'phonk': 'phonk', 'synthwave': 'synthwave', 'vaporwave': 'vaporwave',
    'neosoul': 'neosoul', 'funk': 'funk',
}

# ── FFprobe metadata ───────────────────────────────────────────────────────────

def get_metadata(filepath: str) -> dict:
    try:
        cmd = [FFPROBE, '-v', 'quiet', '-print_format', 'json',
               '-show_format', '-show_streams', filepath]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=10)
        data = json.loads(out)
    except Exception as e:
        return {'error': str(e)}

    fmt    = data.get('format', {})
    tags   = {k.lower(): v for k, v in fmt.get('tags', {}).items()}
    stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'audio'), {})

    bpm_tag = None
    for key in ('bpm', 'tbpm', 'initial key', 'initial_key'):
        val = tags.get(key, '')
        try:
            bpm_tag = float(re.sub(r'[^\d.]', '', val)) if val else None
            break
        except (ValueError, TypeError):
            pass

    genre_raw = tags.get('genre', '').strip().lower()
    genre     = GENRE_HINTS.get(genre_raw, None)

    return {
        'title':    tags.get('title',  ''),
        'artist':   tags.get('artist', tags.get('albumartist', '')),
        'album':    tags.get('album',  ''),
        'genre_tag': genre or genre_raw,
        'bpm_tag':  bpm_tag,
        'duration': float(fmt.get('duration', 0)),
        'bitrate':  int(fmt.get('bit_rate', 0)) // 1000,
        'sample_rate': int(stream.get('sample_rate', 0)),
        'channels':    int(stream.get('channels', 0)),
        'codec':       stream.get('codec_name', ''),
    }


# ── Raw PCM decode ─────────────────────────────────────────────────────────────

def decode_pcm(filepath: str, sr: int = SAMPLE_RATE, max_sec: float = ANALYZE_SEC) -> Optional[np.ndarray]:
    try:
        cmd = [FFMPEG, '-v', 'quiet', '-i', filepath,
               '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-t', str(max_sec), '-']
        raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        if len(raw) < 4:
            return None
        samples = np.frombuffer(raw, dtype=np.float32)
        peak = np.abs(samples).max()
        if peak > 0:
            samples = samples / peak
        return samples
    except Exception:
        return None


# ── RMS envelope ───────────────────────────────────────────────────────────────

def compute_rms_envelope(pcm: np.ndarray, sr: int, frame_ms: int = 50) -> np.ndarray:
    frame_len = max(1, int(sr * frame_ms / 1000))
    n_frames  = len(pcm) // frame_len
    if n_frames == 0:
        return np.array([float(np.sqrt(np.mean(pcm ** 2)))])
    frames = pcm[:n_frames * frame_len].reshape(n_frames, frame_len)
    return np.sqrt(np.mean(frames ** 2, axis=1))


# ── Multi-resolution BPM detection ─────────────────────────────────────────────

def estimate_bpm_autocorr(pcm: np.ndarray, sr: int) -> tuple[float, float]:
    """
    Multi-resolution BPM detection:
    1. Onset strength from RMS differential
    2. Autocorrelation in tempo range [60, 210] BPM
    Returns (bpm, confidence 0-1).
    """
    hop = sr // 20  # 50ms hops
    n_frames = len(pcm) // hop
    if n_frames < 4:
        return 120.0, 0.0

    # Onset strength: positive first difference of RMS
    rms = np.array([np.sqrt(np.mean(pcm[i*hop:(i+1)*hop]**2)) for i in range(n_frames)])
    onset = np.maximum(0, np.diff(rms))

    # Autocorrelation of onset signal
    max_lag = int(60.0 / 60 * (sr / hop))   # 60 BPM → maximum lag
    min_lag = int(60.0 / 210 * (sr / hop))  # 210 BPM → minimum lag
    max_lag = min(max_lag, len(onset) - 1)
    if min_lag >= max_lag:
        return 120.0, 0.0

    autocorr = np.correlate(onset, onset, mode='full')
    autocorr = autocorr[len(autocorr)//2:]

    search = autocorr[min_lag:max_lag+1]
    if len(search) == 0:
        return 120.0, 0.0

    lag_idx = int(np.argmax(search)) + min_lag
    bpm_raw = 60.0 / (lag_idx * hop / sr)

    # Normalize to [60, 210]
    bpm = bpm_raw
    while bpm > 210:
        bpm /= 2.0
    while bpm < 60:
        bpm *= 2.0

    confidence = float(np.max(search) / (np.mean(np.abs(autocorr)) + 1e-9))
    confidence = min(1.0, max(0.0, confidence / 10.0))

    return round(float(bpm), 1), round(confidence, 3)


def estimate_bpm_simple(rms: np.ndarray, frame_ms: int = 50) -> float:
    """Fallback: peak-picking on RMS envelope."""
    if len(rms) < 4:
        return 120.0
    kernel = np.ones(3) / 3.0
    smoothed = np.convolve(rms, kernel, mode='same')
    threshold = max(float(np.mean(smoothed) + 0.4 * np.std(smoothed)), float(np.mean(smoothed)))
    peaks = [i for i in range(1, len(smoothed) - 1)
             if smoothed[i] > threshold and smoothed[i] >= smoothed[i-1] and smoothed[i] >= smoothed[i+1]]
    min_gap = max(1, int(300 / frame_ms))
    filtered = [peaks[0]] if peaks else []
    for p in peaks[1:]:
        if p - filtered[-1] >= min_gap:
            filtered.append(p)
    if len(filtered) < 2:
        return 120.0
    intervals = np.diff(filtered) * frame_ms / 1000.0
    bpm = 60.0 / float(np.median(intervals))
    while bpm > 200: bpm /= 2
    while bpm < 60:  bpm *= 2
    return round(float(bpm), 1)


# ── Spectral analysis ──────────────────────────────────────────────────────────

def spectral_bands(pcm: np.ndarray, sr: int) -> dict:
    N     = min(len(pcm), sr * 8)
    chunk = pcm[:N]
    fft   = np.abs(np.fft.rfft(chunk, n=N)) ** 2
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)
    total = fft.sum() + 1e-9
    return {
        'sub_bass': round(float(fft[(freqs >= 20)  & (freqs < 80)].sum()  / total), 3),
        'bass':     round(float(fft[(freqs >= 80)  & (freqs < 250)].sum() / total), 3),
        'low_mid':  round(float(fft[(freqs >= 250) & (freqs < 500)].sum() / total), 3),
        'mid':      round(float(fft[(freqs >= 500) & (freqs < 2000)].sum() / total), 3),
        'high_mid': round(float(fft[(freqs >= 2000)& (freqs < 4000)].sum() / total), 3),
        'treble':   round(float(fft[(freqs >= 4000)].sum()               / total), 3),
    }


def spectral_flatness(pcm: np.ndarray) -> float:
    N   = min(len(pcm), 16384)
    fft = np.abs(np.fft.rfft(pcm[:N])) + 1e-9
    geo = float(np.exp(np.mean(np.log(fft))))
    ari = float(np.mean(fft))
    return round(min(1.0, geo / (ari + 1e-9)), 3)


def spectral_centroid(pcm: np.ndarray, sr: int) -> float:
    """Average frequency weighted by spectral magnitude."""
    N     = min(len(pcm), sr * 4)
    mag   = np.abs(np.fft.rfft(pcm[:N]))
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)
    denom = mag.sum() + 1e-9
    return round(float(np.sum(freqs * mag) / denom), 1)


# ── HPCP Key Detection ─────────────────────────────────────────────────────────

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Krumhansl-Schmuckler key profiles (major and minor)
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def compute_hpcp(pcm: np.ndarray, sr: int, n_bins: int = 12) -> np.ndarray:
    """
    Harmonic Pitch Class Profile — maps spectral energy to 12 pitch classes.
    Uses a simple approach: FFT → frequency → pitch class mapping.
    """
    N     = min(len(pcm), sr * 4)
    fft   = np.abs(np.fft.rfft(pcm[:N], n=N))
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)

    hpcp = np.zeros(n_bins)
    for i, (f, mag) in enumerate(zip(freqs, fft)):
        if f < 55 or f > 4000:
            continue
        # MIDI note number
        midi = 69 + 12 * math.log2(f / 440.0 + 1e-12)
        pitch_class = int(round(midi)) % 12
        if 0 <= pitch_class < 12:
            hpcp[pitch_class] += mag ** 2

    norm = hpcp.max() + 1e-9
    return hpcp / norm


def detect_key(pcm: np.ndarray, sr: int) -> dict:
    """Detect musical key using HPCP + Krumhansl-Schmuckler correlation."""
    hpcp = compute_hpcp(pcm, sr)

    best_key = 'C'
    best_mode = 'major'
    best_corr = -999.0

    for root in range(12):
        # Rotate profiles to match root
        major_profile = np.roll(KS_MAJOR, root)
        minor_profile = np.roll(KS_MINOR, root)

        corr_maj = float(np.corrcoef(hpcp, major_profile)[0, 1])
        corr_min = float(np.corrcoef(hpcp, minor_profile)[0, 1])

        if corr_maj > best_corr:
            best_corr = corr_maj
            best_key  = NOTE_NAMES[root]
            best_mode = 'major'
        if corr_min > best_corr:
            best_corr = corr_min
            best_key  = NOTE_NAMES[root]
            best_mode = 'minor'

    return {
        'key':        best_key,
        'mode':       best_mode,
        'key_full':   f"{best_key} {best_mode}",
        'confidence': round(max(0.0, min(1.0, (best_corr + 1) / 2)), 3),
        'hpcp':       [round(float(v), 4) for v in hpcp.tolist()],
    }


# ── Structural Analysis ────────────────────────────────────────────────────────

def structural_analysis(pcm: np.ndarray, sr: int, n_sections: int = 6) -> dict:
    """
    Detect song structure (intro/verse/chorus/bridge/outro) via
    RMS self-similarity matrix — recurring energy patterns = chorus.
    """
    hop    = sr // 4  # 250ms frames
    n_frames = len(pcm) // hop
    if n_frames < 8:
        return {'sections': [], 'structure_labels': []}

    # Compute per-frame features: [rms, spectral_centroid_norm]
    features = []
    for i in range(n_frames):
        chunk = pcm[i*hop:(i+1)*hop]
        rms = float(np.sqrt(np.mean(chunk**2)))
        mag = np.abs(np.fft.rfft(chunk)) + 1e-9
        freqs = np.fft.rfftfreq(len(chunk), 1.0/sr)
        sc = float(np.sum(freqs * mag) / mag.sum()) / (sr / 2)
        features.append([rms, sc])

    feat = np.array(features)
    # Normalize
    feat = (feat - feat.mean(axis=0)) / (feat.std(axis=0) + 1e-9)

    # Self-similarity matrix (dot product similarity)
    sim = np.dot(feat, feat.T)

    # Find structurally distinct segments via checkerboard kernel
    # Simple approach: segment at local minima of diagonal sum
    segment_len = max(4, n_frames // n_sections)
    boundaries = [0]
    for i in range(segment_len, n_frames - segment_len, segment_len // 2):
        window_before = sim[max(0, i-segment_len):i, max(0, i-segment_len):i]
        window_after  = sim[i:min(n_frames, i+segment_len), i:min(n_frames, i+segment_len)]
        novelty = float(np.mean(window_before) - np.mean(window_after))
        if abs(novelty) > 0.1 and (len(boundaries) == 0 or i - boundaries[-1] >= segment_len):
            boundaries.append(i)

    boundaries.append(n_frames)

    # Assign section labels based on energy profile
    label_map = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro']
    total_dur  = len(pcm) / sr

    sections = []
    for idx in range(len(boundaries) - 1):
        start_frame = boundaries[idx]
        end_frame   = boundaries[idx + 1]
        start_sec   = round(start_frame * hop / sr, 2)
        end_sec     = round(end_frame   * hop / sr, 2)
        # Energy for this section
        chunk = pcm[start_frame*hop:end_frame*hop]
        energy = round(float(np.sqrt(np.mean(chunk**2))), 4) if len(chunk) > 0 else 0.0

        label = label_map[min(idx, len(label_map) - 1)]
        # Heuristic: high energy near middle = chorus
        mid = (start_sec + end_sec) / 2 / total_dur
        if 0.3 < mid < 0.7 and energy > 0.1:
            label = 'chorus'
        elif idx == 0:
            label = 'intro'
        elif idx == len(boundaries) - 2:
            label = 'outro'

        sections.append({'label': label, 'start': start_sec, 'end': end_sec, 'energy': energy})

    return {
        'sections': sections,
        'structure_labels': [s['label'] for s in sections],
        'estimated_sections': len(sections),
    }


# ── LUFS Estimation ─────────────────────────────────────────────────────────────

def estimate_lufs(pcm: np.ndarray, sr: int) -> float:
    """
    Approximate integrated LUFS from RMS.
    True LUFS requires K-weighting; this is a close approximation.
    LUFS ≈ -0.691 + 10 * log10(mean_square)
    Target: -23 LUFS (broadcast), -14 LUFS (streaming).
    """
    if len(pcm) == 0:
        return -60.0
    mean_sq = float(np.mean(pcm.astype(np.float64) ** 2))
    if mean_sq < 1e-10:
        return -60.0
    lufs = -0.691 + 10 * math.log10(mean_sq)
    return round(float(lufs), 2)


def estimate_dynamic_range(rms_env: np.ndarray) -> float:
    """Estimate crest factor / dynamic range in dB."""
    if len(rms_env) == 0:
        return 0.0
    peak = float(np.max(rms_env))
    avg  = float(np.mean(rms_env))
    if avg < 1e-9:
        return 0.0
    return round(20 * math.log10(peak / avg), 2)


# ── Tonal Complexity ───────────────────────────────────────────────────────────

def tonal_complexity(pcm: np.ndarray, sr: int) -> float:
    """
    Estimate chord change rate as a proxy for harmonic complexity.
    Uses HPCP computed in sliding windows.
    Returns 0 (static/minimal) to 1 (complex/many chord changes).
    """
    window = sr * 1  # 1-second windows
    step   = sr // 2  # 0.5-second hop
    n_windows = (len(pcm) - window) // step
    if n_windows < 2:
        return 0.5

    hpcps = []
    for i in range(n_windows):
        chunk = pcm[i*step:i*step+window]
        hpcps.append(compute_hpcp(chunk, sr))

    # Measure HPCP change between consecutive windows
    changes = [float(np.sum(np.abs(hpcps[i+1] - hpcps[i]))) for i in range(len(hpcps)-1)]
    mean_change = float(np.mean(changes))
    # Normalize: 0 = no change, 1 = maximum change (completely different HPCP)
    score = min(1.0, mean_change / 0.5)
    return round(score, 3)


# ── Genre classification ───────────────────────────────────────────────────────

GENRE_PROFILES = {
    'trap':       {'bpm': (120, 145), 'bass': (0.35, 1.0), 'sub_bass': (0.2, 1.0), 'flatness': (0, 0.4), 'dance': (0.5, 1.0)},
    'hiphop':     {'bpm': (80, 115),  'bass': (0.25, 0.6), 'sub_bass': (0.1, 0.4), 'flatness': (0, 0.4), 'dance': (0.4, 0.9)},
    'drill':      {'bpm': (128, 145), 'bass': (0.3, 0.7),  'sub_bass': (0.2, 0.6), 'flatness': (0, 0.35),'dance': (0.4, 0.85)},
    'rnb':        {'bpm': (70, 110),  'bass': (0.2, 0.5),  'sub_bass': (0.1, 0.4), 'flatness': (0, 0.4), 'dance': (0.3, 0.75)},
    'neosoul':    {'bpm': (65, 95),   'bass': (0.15, 0.45),'sub_bass': (0.05, 0.3),'flatness': (0, 0.35),'dance': (0.2, 0.65)},
    'pop':        {'bpm': (100, 135), 'bass': (0.1, 0.4),  'sub_bass': (0.05, 0.3),'flatness': (0.2, 0.7),'dance': (0.5, 1.0)},
    'house':      {'bpm': (120, 135), 'bass': (0.3, 0.6),  'sub_bass': (0.2, 0.5), 'flatness': (0.2, 0.6),'dance': (0.7, 1.0)},
    'techno':     {'bpm': (130, 155), 'bass': (0.25, 0.55),'sub_bass': (0.15, 0.45),'flatness': (0.3, 0.8),'dance': (0.7, 1.0)},
    'dnb':        {'bpm': (160, 185), 'bass': (0.3, 0.65), 'sub_bass': (0.2, 0.5), 'flatness': (0.2, 0.65),'dance': (0.7, 1.0)},
    'electronic': {'bpm': (120, 155), 'bass': (0.2, 0.6),  'sub_bass': (0.1, 0.5), 'flatness': (0.2, 0.75),'dance': (0.6, 1.0)},
    'afrobeats':  {'bpm': (88, 108),  'bass': (0.2, 0.55), 'sub_bass': (0.1, 0.4), 'flatness': (0.1, 0.5),'dance': (0.65, 1.0)},
    'amapiano':   {'bpm': (106, 120), 'bass': (0.25, 0.6), 'sub_bass': (0.15, 0.45),'flatness': (0.15, 0.55),'dance': (0.6, 1.0)},
    'rock':       {'bpm': (100, 160), 'bass': (0.15, 0.45),'sub_bass': (0.05, 0.3),'flatness': (0.3, 0.8),'dance': (0.3, 0.75)},
    'country':    {'bpm': (90, 130),  'bass': (0.1, 0.35), 'sub_bass': (0.03, 0.2),'flatness': (0.3, 0.7),'dance': (0.3, 0.8)},
    'ambient':    {'bpm': (60, 100),  'bass': (0.05, 0.3), 'sub_bass': (0.02, 0.2),'flatness': (0.05, 0.4),'dance': (0.0, 0.3)},
    'lofi':       {'bpm': (70, 95),   'bass': (0.15, 0.45),'sub_bass': (0.05, 0.3),'flatness': (0.1, 0.5),'dance': (0.2, 0.6)},
    'phonk':      {'bpm': (130, 160), 'bass': (0.3, 0.7),  'sub_bass': (0.2, 0.55),'flatness': (0.1, 0.45),'dance': (0.5, 0.9)},
    'reggaeton':  {'bpm': (88, 110),  'bass': (0.25, 0.6), 'sub_bass': (0.15, 0.45),'flatness': (0.1, 0.5),'dance': (0.65, 1.0)},
}


def classify_genre(bpm: float, bands: dict, nn_feat: dict, meta: dict) -> dict:
    """
    Multi-label genre classification with probability scores.
    Returns top genre + probability dict for all detected genres.
    """
    tag_genre = meta.get('genre_tag', '')
    bass_total = bands.get('bass', 0) + bands.get('sub_bass', 0)
    flatness   = nn_feat.get('flatness', 0.3)
    dance      = nn_feat.get('dance', 0.5)

    scores: dict[str, float] = {}
    for genre, prof in GENRE_PROFILES.items():
        score = 0.0
        # BPM match (Gaussian-ish)
        bpm_lo, bpm_hi = prof['bpm']
        bpm_center = (bpm_lo + bpm_hi) / 2
        bpm_range  = (bpm_hi - bpm_lo) / 2 + 1
        bpm_score  = max(0.0, 1 - abs(bpm - bpm_center) / bpm_range)
        score += bpm_score * 0.35

        # Bass match
        b_lo, b_hi = prof['bass']
        b_score = 1.0 if b_lo <= bass_total <= b_hi else max(0.0, 1 - abs(bass_total - (b_lo+b_hi)/2) / ((b_hi-b_lo)/2+0.01))
        score += b_score * 0.25

        # Flatness match
        f_lo, f_hi = prof['flatness']
        f_score = 1.0 if f_lo <= flatness <= f_hi else max(0.0, 1 - abs(flatness - (f_lo+f_hi)/2) / ((f_hi-f_lo)/2+0.01))
        score += f_score * 0.20

        # Dance match
        d_lo, d_hi = prof['dance']
        d_score = 1.0 if d_lo <= dance <= d_hi else max(0.0, 1 - abs(dance - (d_lo+d_hi)/2) / ((d_hi-d_lo)/2+0.01))
        score += d_score * 0.20

        scores[genre] = round(float(score), 3)

    # Boost tag-matched genre
    if tag_genre in scores:
        scores[tag_genre] = min(1.0, scores[tag_genre] + 0.3)

    sorted_genres = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_genre = sorted_genres[0][0] if sorted_genres else 'pop'

    # Only return genres with probability > 0.3
    genre_probs = {g: s for g, s in sorted_genres if s > 0.3}

    return {'genre': top_genre, 'genre_probs': genre_probs}


# ── Feature mapping ────────────────────────────────────────────────────────────

def map_to_nn_features(meta: dict, pcm_features: dict) -> dict:
    energy_rms = pcm_features.get('energy_rms', 0.5)
    bpm        = pcm_features.get('bpm', 120.0)
    bass_frac  = pcm_features.get('bands', {}).get('bass', 0.3) + pcm_features.get('bands', {}).get('sub_bass', 0.0)
    flatness   = pcm_features.get('spectral_flatness', 0.3)

    energy = min(1.0, energy_rms * 2.5)
    valence = round(1.0 - flatness * 0.6 + bass_frac * 0.3, 3)
    valence = min(1.0, max(0.0, valence))

    bpm_dance = 1.0 - abs(bpm - 110) / 80.0
    dance = min(1.0, max(0.0, bpm_dance * 0.5 + bass_frac * 0.5))

    return {
        'energy':     round(energy, 3),
        'valence':    round(valence, 3),
        'dance':      round(dance, 3),
        'tempo_norm': round(min(1.0, bpm / 200.0), 3),
        'flatness':   round(flatness, 3),
    }


# ── Main analysis ──────────────────────────────────────────────────────────────

def analyze_audio(filepath: str) -> dict:
    if not os.path.exists(filepath):
        return {'error': f'File not found: {filepath}'}

    meta = get_metadata(filepath)
    if 'error' in meta and not meta.get('duration'):
        return {'error': f"FFprobe failed: {meta['error']}"}

    result: dict = {
        'title':    meta.get('title', ''),
        'artist':   meta.get('artist', ''),
        'album':    meta.get('album', ''),
        'duration': meta.get('duration', 0),
        'bitrate':  meta.get('bitrate', 0),
        'codec':    meta.get('codec', ''),
    }

    pcm = decode_pcm(filepath)
    if pcm is None or len(pcm) < SAMPLE_RATE:
        bpm = meta.get('bpm_tag') or 120.0
        result.update({
            'bpm': bpm, 'bpm_confidence': 0.0,
            'key': 'C', 'mode': 'major', 'key_full': 'C major', 'key_confidence': 0.0,
            'energy': 0.7, 'valence': 0.6, 'dance': 0.6,
            'tempo_norm': round(bpm / 200, 3),
            'genre': meta.get('genre_tag', 'hip-hop'), 'genre_probs': {},
            'bands': {'bass': 0.35, 'mid': 0.40, 'treble': 0.25, 'sub_bass': 0.15, 'low_mid': 0.10, 'high_mid': 0.05},
            'energy_rms': 0.5, 'spectral_flatness': 0.3,
            'lufs': -14.0, 'dynamic_range_db': 8.0,
            'structure': {'sections': [], 'structure_labels': [], 'estimated_sections': 0},
            'tonal_complexity': 0.5,
            'analysis_quality': 'metadata_only',
        })
        return result

    # Core analysis
    rms_env    = compute_rms_envelope(pcm, SAMPLE_RATE)
    energy_rms = float(np.mean(rms_env))

    # BPM — multi-resolution
    bpm_autocorr, bpm_confidence = estimate_bpm_autocorr(pcm, SAMPLE_RATE)
    bpm_simple  = estimate_bpm_simple(rms_env)
    bpm_tag     = meta.get('bpm_tag')
    # Weighted consensus
    if bpm_tag:
        bpm = bpm_tag
    elif bpm_confidence > 0.4:
        bpm = bpm_autocorr
    else:
        bpm = (bpm_autocorr + bpm_simple) / 2

    # Spectral
    bands    = spectral_bands(pcm, SAMPLE_RATE)
    flat     = spectral_flatness(pcm)
    centroid = spectral_centroid(pcm, SAMPLE_RATE)

    # Key detection
    key_info = detect_key(pcm, SAMPLE_RATE)

    # LUFS + dynamic range
    lufs  = estimate_lufs(pcm, SAMPLE_RATE)
    dyn_r = estimate_dynamic_range(rms_env)

    # Structural analysis
    structure = structural_analysis(pcm, SAMPLE_RATE)

    # Tonal complexity
    tonal = tonal_complexity(pcm, SAMPLE_RATE)

    pcm_features = {
        'energy_rms':        round(energy_rms, 4),
        'bpm':               bpm,
        'bands':             bands,
        'spectral_flatness': flat,
    }

    nn_feat      = map_to_nn_features(meta, pcm_features)
    genre_result = classify_genre(bpm, bands, nn_feat, meta)

    result.update({
        'bpm':               round(float(bpm), 1),
        'bpm_autocorr':      bpm_autocorr,
        'bpm_simple':        bpm_simple,
        'bpm_confidence':    bpm_confidence,
        'bpm_from_tag':      bpm_tag,

        'key':               key_info['key'],
        'mode':              key_info['mode'],
        'key_full':          key_info['key_full'],
        'key_confidence':    key_info['confidence'],
        'hpcp':              key_info['hpcp'],

        'energy_rms':        round(energy_rms, 4),
        'energy':            nn_feat['energy'],
        'valence':           nn_feat['valence'],
        'dance':             nn_feat['dance'],
        'tempo_norm':        nn_feat['tempo_norm'],
        'spectral_flatness': flat,
        'spectral_centroid': centroid,
        'bands':             bands,

        'lufs':              lufs,
        'dynamic_range_db':  dyn_r,

        'genre':             genre_result['genre'],
        'genre_tag':         meta.get('genre_tag', ''),
        'genre_probs':       genre_result['genre_probs'],

        'structure':         structure,
        'tonal_complexity':  tonal,

        'nn_features': {
            'energy':     nn_feat['energy'],
            'valence':    nn_feat['valence'],
            'dance':      nn_feat['dance'],
            'tempo_norm': nn_feat['tempo_norm'],
        },
        'analysis_quality': 'full',
    })

    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: audioAnalyzer.py <filepath>'}))
        sys.exit(1)
    out = analyze_audio(sys.argv[1])
    print(json.dumps(out))
