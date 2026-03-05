#!/usr/bin/env python3
"""
Audio Feature Analyzer for Max Booster
Extracts BPM, energy, valence, dominant frequency bands, and metadata
from an audio file using FFmpeg + NumPy — no external ML libraries needed.

Usage: python3 audioAnalyzer.py '<filepath>'
Output: JSON to stdout
"""

import sys
import json
import os
import subprocess
import struct
import math
import numpy as np
from typing import Optional

FFPROBE = os.environ.get('FFPROBE_PATH', 'ffprobe')
FFMPEG  = os.environ.get('FFMPEG_PATH',  'ffmpeg')

# Resolve Nix store paths if needed
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

SAMPLE_RATE = 4000     # 4 kHz — enough for BPM/energy, keeps data small
ANALYZE_SEC = 45       # Max seconds to decode for analysis

GENRE_HINTS = {
    # tag values → genre normalisation
    'hip hop': 'hip-hop', 'hip-hop': 'hip-hop', 'rap': 'hip-hop',
    'trap': 'trap', 'drill': 'trap',
    'r&b': 'r&b', 'rnb': 'r&b', 'soul': 'r&b', 'neo-soul': 'r&b',
    'pop': 'pop',
    'electronic': 'electronic', 'edm': 'electronic', 'house': 'electronic',
    'techno': 'electronic', 'dubstep': 'electronic',
    'afrobeats': 'afrobeats', 'afropop': 'afrobeats', 'latin': 'afrobeats',
    'country': 'country', 'folk': 'country', 'indie': 'country',
    'rock': 'rock', 'metal': 'rock', 'punk': 'rock', 'alternative': 'rock',
}


# ── FFprobe metadata ───────────────────────────────────────────────────────────

def get_metadata(filepath: str) -> dict:
    try:
        cmd = [
            FFPROBE, '-v', 'quiet',
            '-print_format', 'json',
            '-show_format', '-show_streams',
            filepath,
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=10)
        data = json.loads(out)
    except Exception as e:
        return {'error': str(e)}

    fmt    = data.get('format', {})
    tags   = {k.lower(): v for k, v in fmt.get('tags', {}).items()}
    stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'audio'), {})

    # BPM from tags
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
        'genre_tag':genre or genre_raw,
        'bpm_tag':  bpm_tag,
        'duration': float(fmt.get('duration', 0)),
        'bitrate':  int(fmt.get('bit_rate', 0)) // 1000,
        'sample_rate': int(stream.get('sample_rate', 0)),
        'channels':    int(stream.get('channels', 0)),
        'codec':       stream.get('codec_name', ''),
    }


try:
    import re
except ImportError:
    import re


# ── Raw PCM decode ─────────────────────────────────────────────────────────────

def decode_pcm(filepath: str, sr: int = SAMPLE_RATE, max_sec: float = ANALYZE_SEC) -> Optional[np.ndarray]:
    """Decode audio to float32 mono PCM using FFmpeg."""
    try:
        cmd = [
            FFMPEG, '-v', 'quiet', '-i', filepath,
            '-f', 'f32le',
            '-ac', '1',
            '-ar', str(sr),
            '-t', str(max_sec),
            '-',
        ]
        raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        if len(raw) < 4:
            return None
        samples = np.frombuffer(raw, dtype=np.float32)
        # Normalize to [-1, 1]
        peak = np.abs(samples).max()
        if peak > 0:
            samples = samples / peak
        return samples
    except Exception:
        return None


# ── Signal analysis ────────────────────────────────────────────────────────────

def compute_rms_envelope(pcm: np.ndarray, sr: int, frame_ms: int = 50) -> np.ndarray:
    """Compute RMS energy in non-overlapping frames."""
    frame_len  = max(1, int(sr * frame_ms / 1000))
    n_frames   = len(pcm) // frame_len
    if n_frames == 0:
        return np.array([float(np.sqrt(np.mean(pcm ** 2)))])
    frames = pcm[:n_frames * frame_len].reshape(n_frames, frame_len)
    return np.sqrt(np.mean(frames ** 2, axis=1))


def estimate_bpm(rms: np.ndarray, frame_ms: int = 50) -> float:
    """Estimate BPM from the RMS energy envelope via onset detection."""
    if len(rms) < 4:
        return 120.0

    # Smooth envelope
    kernel = np.ones(3) / 3.0
    smoothed = np.convolve(rms, kernel, mode='same')

    threshold = float(np.mean(smoothed) + 0.4 * np.std(smoothed))
    threshold = max(threshold, float(np.mean(smoothed)))

    # Find local maxima above threshold
    peaks = []
    for i in range(1, len(smoothed) - 1):
        if (smoothed[i] > threshold and
                smoothed[i] >= smoothed[i - 1] and
                smoothed[i] >= smoothed[i + 1]):
            peaks.append(i)

    # Enforce minimum gap of 300ms between beats
    min_gap = max(1, int(300 / frame_ms))
    filtered = [peaks[0]] if peaks else []
    for p in peaks[1:]:
        if p - filtered[-1] >= min_gap:
            filtered.append(p)

    if len(filtered) < 2:
        return 120.0

    intervals_sec = np.diff(filtered) * frame_ms / 1000.0
    median_interval = float(np.median(intervals_sec))
    if median_interval < 0.01:
        return 120.0

    bpm = 60.0 / median_interval
    # Normalize to [60, 200] BPM
    while bpm > 200:
        bpm /= 2
    while bpm < 60:
        bpm *= 2
    return round(float(bpm), 1)


def spectral_bands(pcm: np.ndarray, sr: int) -> dict:
    """
    Compute normalized energy in bass/mid/treble frequency bands.
    Returns energy fractions summing to 1.0.
    """
    N    = min(len(pcm), sr * 8)   # Use up to 8s for FFT
    chunk = pcm[:N]
    fft  = np.abs(np.fft.rfft(chunk, n=N)) ** 2
    freqs = np.fft.rfftfreq(N, d=1.0 / sr)

    total = fft.sum() + 1e-9
    bass   = fft[(freqs >= 20)  & (freqs < 250)].sum()
    mid    = fft[(freqs >= 250) & (freqs < 2000)].sum()
    treble = fft[(freqs >= 2000)].sum()

    return {
        'bass':   round(float(bass   / total), 3),
        'mid':    round(float(mid    / total), 3),
        'treble': round(float(treble / total), 3),
    }


def spectral_flatness(pcm: np.ndarray) -> float:
    """
    Spectral flatness in [0, 1].
    0 = tonal (pitched, melodic), 1 = noise-like (distorted, chaotic).
    """
    N     = min(len(pcm), 16384)
    fft   = np.abs(np.fft.rfft(pcm[:N])) + 1e-9
    geo   = float(np.exp(np.mean(np.log(fft))))
    arith = float(np.mean(fft))
    return round(min(1.0, geo / (arith + 1e-9)), 3)


def map_to_nn_features(meta: dict, pcm_features: dict) -> dict:
    """
    Map raw audio features to the neural network's input space:
    energy, valence, danceability, tempo_norm
    """
    energy_rms   = pcm_features.get('energy_rms', 0.5)
    bpm          = pcm_features.get('bpm', 120.0)
    bass_frac    = pcm_features.get('bands', {}).get('bass', 0.3)
    flatness     = pcm_features.get('spectral_flatness', 0.3)

    # energy: scale RMS (0-1) — typically audio peaks are 0.2–0.8 RMS
    energy = min(1.0, energy_rms * 2.5)

    # valence: inverse of spectral flatness + warmth (bass presence)
    # High bass + low flatness → warm, emotional → higher valence for R&B/soul
    valence = round(1.0 - flatness * 0.6 + bass_frac * 0.3, 3)
    valence = min(1.0, max(0.0, valence))

    # danceability: high bass + mid BPM range (80-140) → high dance
    bpm_dance = 1.0 - abs(bpm - 110) / 80.0
    dance = min(1.0, max(0.0, bpm_dance * 0.5 + bass_frac * 0.5))

    # tempo_norm: BPM / 200
    tempo_norm = round(min(1.0, bpm / 200.0), 3)

    return {
        'energy':     round(energy, 3),
        'valence':    round(valence, 3),
        'dance':      round(dance, 3),
        'tempo_norm': tempo_norm,
    }


# ── Genre inference from audio features ───────────────────────────────────────

def infer_genre(nn_feat: dict, bands: dict, meta: dict) -> str:
    # Use tag if present
    tag_genre = meta.get('genre_tag', '')
    if tag_genre in ('hip-hop', 'r&b', 'pop', 'electronic', 'afrobeats', 'country', 'rock', 'trap'):
        return tag_genre

    e = nn_feat['energy']
    v = nn_feat['valence']
    d = nn_feat['dance']
    t = nn_feat['tempo_norm']
    b = bands.get('bass', 0.3)

    if e > 0.85 and b > 0.4 and t > 0.55:
        return 'electronic'
    if e > 0.80 and b > 0.45 and t < 0.50:
        return 'trap'
    if e > 0.75 and t > 0.40 and d > 0.65:
        return 'hip-hop'
    if v > 0.72 and e < 0.65 and d > 0.55:
        return 'r&b'
    if d > 0.75 and v > 0.70:
        return 'afrobeats'
    if e < 0.55 and v > 0.60:
        return 'country'
    if e > 0.80 and v < 0.50:
        return 'rock'
    return 'pop'


# ── Main ───────────────────────────────────────────────────────────────────────

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

    # Decode PCM for analysis
    pcm = decode_pcm(filepath)
    if pcm is None or len(pcm) < SAMPLE_RATE:
        # Fall back to tag-only info
        bpm = meta.get('bpm_tag') or 120.0
        result.update({
            'bpm': bpm, 'energy': 0.7, 'valence': 0.6,
            'dance': 0.6, 'tempo_norm': round(bpm / 200, 3),
            'genre': meta.get('genre_tag', 'hip-hop'),
            'bands': {'bass': 0.35, 'mid': 0.40, 'treble': 0.25},
            'energy_rms': 0.5, 'spectral_flatness': 0.3,
            'analysis_quality': 'metadata_only',
        })
        return result

    # Full analysis
    rms_env  = compute_rms_envelope(pcm, SAMPLE_RATE)
    energy_rms = float(np.mean(rms_env))

    bpm_detected = estimate_bpm(rms_env)
    bpm = meta.get('bpm_tag') or bpm_detected

    bands    = spectral_bands(pcm, SAMPLE_RATE)
    flat     = spectral_flatness(pcm)

    pcm_features = {
        'energy_rms':       round(energy_rms, 4),
        'bpm':              bpm,
        'bands':            bands,
        'spectral_flatness': flat,
    }

    nn_feat = map_to_nn_features(meta, pcm_features)
    genre   = infer_genre(nn_feat, bands, meta)

    result.update({
        'bpm':              round(bpm, 1),
        'bpm_detected':     round(bpm_detected, 1),
        'bpm_from_tag':     meta.get('bpm_tag'),
        'energy_rms':       round(energy_rms, 4),
        'energy':           nn_feat['energy'],
        'valence':          nn_feat['valence'],
        'dance':            nn_feat['dance'],
        'tempo_norm':       nn_feat['tempo_norm'],
        'spectral_flatness': flat,
        'bands':            bands,
        'genre':            genre,
        'genre_tag':        meta.get('genre_tag', ''),
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
