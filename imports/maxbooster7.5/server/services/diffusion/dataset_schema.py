"""
Max Booster Dataset Schema (A)
==============================================================
Unified data contract for all training samples across every
dataset in the Veo-for-Music pipeline.

Hierarchy
---------
MaxBoosterSample  — one contiguous T-frame clip
SampleWriter      — disk I/O for a single sample
ManifestWriter    — dataset-level index / statistics
SampleValidator   — dtype + shape + field completeness checks
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ── Schema version ────────────────────────────────────────────────────────────
SCHEMA_VERSION = "1.0.0"

# ── Expected field shapes (None = variable) ───────────────────────────────────
_FRAME_DTYPE    = np.float32   # values in [-1, 1]
_AUDIO_DTYPES   = {
    'bpm':                float,
    'energy_curve':       np.ndarray,   # (T,)  per-frame energy
    'beat_grid':          np.ndarray,   # (B,)  beat timestamps in seconds
    'spectral_centroid':  np.ndarray,   # (T,)  per-frame centroid (Hz)
    'chroma_mean':        np.ndarray,   # (12,) mean chroma vector
    'onset_strength':     np.ndarray,   # (T,)  per-frame onset strength
}


# ═══════════════════════════════════════════════════════════════════════════════
# Core Sample Dataclass
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class MaxBoosterSample:
    """
    One training unit: T contiguous video frames + aligned audio features
    + rich semantic labels.

    video_frames : (T, H, W, 3) float32 in [-1, 1]
    audio_features: dict with keys defined in _AUDIO_DTYPES
    caption       : free-text description of the clip
    scene_category: one of the 60 scene categories from PromptGeneratorV3
    genre         : music genre tag
    mood          : mood / emotional descriptor
    style_tags    : list of visual style descriptors
    section_labels: list of (start_frame, end_frame, label) triples
    motion_magnitude: mean absolute frame-difference (temporal motion amount)
    color_palette : (5, 3) float32 dominant colors in [0,1] RGB
    dataset_source: which dataset this sample came from
    sample_id     : unique identifier (dataset_source + index)
    split         : 'train' | 'val' | 'test'
    quality_score : 0.0–1.0 curator quality estimate
    fps           : frames-per-second of original video
    duration_sec  : clip duration in seconds
    created_at    : unix timestamp of sample creation
    """

    # ── Core tensors ──────────────────────────────────────────────────────────
    video_frames:      np.ndarray                          # (T, H, W, 3)
    audio_features:    Dict[str, Any]

    # ── Semantic labels ───────────────────────────────────────────────────────
    caption:           str
    scene_category:    str
    genre:             str
    mood:              str
    style_tags:        List[str]                           = field(default_factory=list)
    section_labels:    List[Tuple[int, int, str]]          = field(default_factory=list)

    # ── Derived metrics ───────────────────────────────────────────────────────
    motion_magnitude:  float                               = 0.0
    color_palette:     Optional[np.ndarray]                = None  # (5, 3)

    # ── Provenance ────────────────────────────────────────────────────────────
    dataset_source:    str                                 = "unknown"
    sample_id:         str                                 = ""
    split:             str                                 = "train"
    quality_score:     float                               = 1.0
    fps:               float                               = 24.0
    duration_sec:      float                               = 0.0
    created_at:        float                               = field(default_factory=time.time)

    # ── Computed properties ───────────────────────────────────────────────────
    @property
    def T(self) -> int:
        return self.video_frames.shape[0]

    @property
    def H(self) -> int:
        return self.video_frames.shape[1]

    @property
    def W(self) -> int:
        return self.video_frames.shape[2]

    @property
    def resolution(self) -> Tuple[int, int]:
        return (self.H, self.W)

    def compute_motion_magnitude(self) -> float:
        """Compute mean absolute frame difference as motion proxy."""
        if self.T < 2:
            return 0.0
        diffs = np.abs(self.video_frames[1:] - self.video_frames[:-1])
        return float(np.mean(diffs))

    def compute_color_palette(self, n_colors: int = 5) -> np.ndarray:
        """Extract dominant colors via uniform grid sampling (no sklearn needed)."""
        frames = self.video_frames          # (T, H, W, 3) in [-1, 1]
        rgb    = ((frames + 1.0) * 0.5).clip(0, 1)
        flat   = rgb.reshape(-1, 3)
        # Uniform sample to get n_colors representative colors
        step   = max(1, len(flat) // (n_colors * 100))
        sample = flat[::step]
        # K-means substitute: pick n evenly-spaced quantiles per channel
        palette = np.zeros((n_colors, 3), dtype=np.float32)
        for i in range(n_colors):
            q = (i + 0.5) / n_colors
            palette[i] = np.quantile(sample, q, axis=0)
        return palette


# ═══════════════════════════════════════════════════════════════════════════════
# Audio Feature Builder
# ═══════════════════════════════════════════════════════════════════════════════

def make_audio_features(
    bpm: float = 120.0,
    T: int = 32,
    beat_times: Optional[np.ndarray] = None,
    energy_curve: Optional[np.ndarray] = None,
    spectral_centroid: Optional[np.ndarray] = None,
    chroma_mean: Optional[np.ndarray] = None,
    onset_strength: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Build a complete audio_features dict, filling missing fields with
    reasonable defaults derived from bpm and T.
    """
    duration = T / 24.0                    # assume 24fps
    beats_per_bar = 4
    beat_interval = 60.0 / max(bpm, 1.0)

    if beat_times is None:
        beat_times = np.arange(0.0, duration, beat_interval).astype(np.float32)

    if energy_curve is None:
        # Sinusoidal energy matching beat pattern
        t_axis = np.linspace(0, duration, T)
        beat_freq = bpm / 60.0
        energy_curve = (0.5 + 0.5 * np.sin(2 * math.pi * beat_freq * t_axis)).astype(np.float32)

    if spectral_centroid is None:
        spectral_centroid = np.full(T, 2000.0, dtype=np.float32)

    if chroma_mean is None:
        chroma_mean = np.ones(12, dtype=np.float32) / 12.0

    if onset_strength is None:
        onset_strength = energy_curve.copy()

    return {
        'bpm':               float(bpm),
        'energy_curve':      energy_curve.astype(np.float32),
        'beat_grid':         beat_times.astype(np.float32),
        'spectral_centroid': spectral_centroid.astype(np.float32),
        'chroma_mean':       chroma_mean.astype(np.float32),
        'onset_strength':    onset_strength.astype(np.float32),
    }


def make_empty_audio_features(T: int = 32) -> Dict[str, Any]:
    return make_audio_features(bpm=120.0, T=T)


# ═══════════════════════════════════════════════════════════════════════════════
# Sample Validator
# ═══════════════════════════════════════════════════════════════════════════════

class SampleValidator:
    """Validate a MaxBoosterSample for type correctness and completeness."""

    REQUIRED_AUDIO_KEYS = ['bpm', 'energy_curve', 'beat_grid', 'chroma_mean']
    VALID_SPLITS        = {'train', 'val', 'test'}

    @classmethod
    def validate(cls, sample: MaxBoosterSample, strict: bool = False) -> List[str]:
        """
        Returns list of validation errors. Empty list = valid.
        strict=True checks dtype precision, range, and shape consistency.
        """
        errors = []

        # video_frames
        if not isinstance(sample.video_frames, np.ndarray):
            errors.append("video_frames must be numpy.ndarray")
        elif sample.video_frames.ndim != 4:
            errors.append(f"video_frames must be 4D (T,H,W,3), got {sample.video_frames.ndim}D")
        elif sample.video_frames.shape[3] != 3:
            errors.append(f"video_frames must have 3 channels, got {sample.video_frames.shape[3]}")
        elif strict:
            if sample.video_frames.dtype != np.float32:
                errors.append(f"video_frames dtype should be float32, got {sample.video_frames.dtype}")
            vmin, vmax = float(sample.video_frames.min()), float(sample.video_frames.max())
            if vmin < -1.5 or vmax > 1.5:
                errors.append(f"video_frames out of expected [-1,1] range: [{vmin:.2f},{vmax:.2f}]")

        # audio_features
        if not isinstance(sample.audio_features, dict):
            errors.append("audio_features must be dict")
        else:
            for key in cls.REQUIRED_AUDIO_KEYS:
                if key not in sample.audio_features:
                    errors.append(f"audio_features missing required key: '{key}'")

        # caption
        if not sample.caption or not isinstance(sample.caption, str):
            errors.append("caption must be a non-empty string")

        # scene_category
        if not sample.scene_category:
            errors.append("scene_category must not be empty")

        # split
        if sample.split not in cls.VALID_SPLITS:
            errors.append(f"split must be one of {cls.VALID_SPLITS}, got '{sample.split}'")

        # quality_score
        if not (0.0 <= sample.quality_score <= 1.0):
            errors.append(f"quality_score out of [0,1]: {sample.quality_score}")

        return errors

    @classmethod
    def is_valid(cls, sample: MaxBoosterSample, strict: bool = False) -> bool:
        return len(cls.validate(sample, strict=strict)) == 0


# ═══════════════════════════════════════════════════════════════════════════════
# Sample I/O
# ═══════════════════════════════════════════════════════════════════════════════

class SampleWriter:
    """
    Save and load individual MaxBoosterSamples.

    Format
    ------
    <sample_id>.npz   — all numpy arrays (video_frames + audio array fields)
    <sample_id>.json  — all scalar / string fields + metadata
    """

    @staticmethod
    def save(sample: MaxBoosterSample, directory: str) -> str:
        """
        Write sample to directory. Returns path prefix (without extension).
        """
        os.makedirs(directory, exist_ok=True)
        prefix = os.path.join(directory, sample.sample_id)

        # ── Numpy arrays (.npz) ───────────────────────────────────────────────
        arrays: Dict[str, np.ndarray] = {
            'video_frames': sample.video_frames.astype(np.float32),
        }
        if sample.color_palette is not None:
            arrays['color_palette'] = sample.color_palette.astype(np.float32)
        for k, v in sample.audio_features.items():
            if isinstance(v, np.ndarray):
                arrays[f'audio_{k}'] = v.astype(np.float32)
        np.savez_compressed(prefix + '.npz', **arrays)

        # ── Scalar metadata (.json) ───────────────────────────────────────────
        meta = {
            'schema_version': SCHEMA_VERSION,
            'sample_id':      sample.sample_id,
            'caption':        sample.caption,
            'scene_category': sample.scene_category,
            'genre':          sample.genre,
            'mood':           sample.mood,
            'style_tags':     sample.style_tags,
            'section_labels': sample.section_labels,
            'motion_magnitude': sample.motion_magnitude,
            'dataset_source': sample.dataset_source,
            'split':          sample.split,
            'quality_score':  sample.quality_score,
            'fps':            sample.fps,
            'duration_sec':   sample.duration_sec,
            'created_at':     sample.created_at,
            'T':              sample.T,
            'H':              sample.H,
            'W':              sample.W,
            'audio_bpm':      sample.audio_features.get('bpm', 120.0),
        }
        with open(prefix + '.json', 'w') as f:
            json.dump(meta, f, indent=2)

        return prefix

    @staticmethod
    def load(prefix: str) -> MaxBoosterSample:
        """
        Load sample from <prefix>.npz + <prefix>.json.
        prefix may include or exclude file extension.
        """
        prefix = prefix.rstrip('.npz').rstrip('.json')
        if not os.path.exists(prefix + '.npz') or not os.path.exists(prefix + '.json'):
            raise FileNotFoundError(f"Sample files not found at prefix: {prefix}")

        arrays = dict(np.load(prefix + '.npz', allow_pickle=False))
        with open(prefix + '.json') as f:
            meta = json.load(f)

        # Reconstruct audio_features
        audio_features = {'bpm': float(meta.get('audio_bpm', 120.0))}
        for k, v in arrays.items():
            if k.startswith('audio_'):
                audio_features[k[6:]] = v  # strip 'audio_' prefix

        color_palette = arrays.get('color_palette')

        return MaxBoosterSample(
            video_frames      = arrays['video_frames'],
            audio_features    = audio_features,
            caption           = meta['caption'],
            scene_category    = meta['scene_category'],
            genre             = meta['genre'],
            mood              = meta['mood'],
            style_tags        = meta.get('style_tags', []),
            section_labels    = [(s[0], s[1], s[2]) for s in meta.get('section_labels', [])],
            motion_magnitude  = meta.get('motion_magnitude', 0.0),
            color_palette     = color_palette,
            dataset_source    = meta.get('dataset_source', 'unknown'),
            sample_id         = meta['sample_id'],
            split             = meta.get('split', 'train'),
            quality_score     = meta.get('quality_score', 1.0),
            fps               = meta.get('fps', 24.0),
            duration_sec      = meta.get('duration_sec', 0.0),
            created_at        = meta.get('created_at', 0.0),
        )

    @staticmethod
    def exists(prefix: str) -> bool:
        prefix = prefix.rstrip('.npz').rstrip('.json')
        return os.path.exists(prefix + '.npz') and os.path.exists(prefix + '.json')


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Manifest
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DatasetManifest:
    """
    Dataset-level metadata and statistics.

    samples: list of {sample_id, split, scene_category, quality_score, T, H, W}
    """
    dataset_name:  str
    version:       str                = "1.0"
    sample_count:  int                = 0
    split_ratios:  Dict[str, float]   = field(default_factory=lambda: {'train': 0.8, 'val': 0.1, 'test': 0.1})
    feature_schema: str               = SCHEMA_VERSION
    created_at:    float              = field(default_factory=time.time)
    updated_at:    float              = field(default_factory=time.time)
    stats:         Dict[str, Any]     = field(default_factory=dict)
    samples:       List[Dict]         = field(default_factory=list)

    def add_sample(self, sample: MaxBoosterSample):
        self.samples.append({
            'sample_id':     sample.sample_id,
            'split':         sample.split,
            'scene_category': sample.scene_category,
            'genre':         sample.genre,
            'quality_score': sample.quality_score,
            'T': sample.T, 'H': sample.H, 'W': sample.W,
            'motion_magnitude': sample.motion_magnitude,
            'bpm': sample.audio_features.get('bpm', 120.0),
        })
        self.sample_count = len(self.samples)
        self.updated_at   = time.time()

    def compute_stats(self) -> Dict[str, Any]:
        if not self.samples:
            return {}
        qualities = [s['quality_score'] for s in self.samples]
        bpms      = [s['bpm'] for s in self.samples]
        scenes    = {}
        for s in self.samples:
            scenes[s['scene_category']] = scenes.get(s['scene_category'], 0) + 1
        splits = {}
        for s in self.samples:
            splits[s['split']] = splits.get(s['split'], 0) + 1
        self.stats = {
            'mean_quality':    float(np.mean(qualities)),
            'mean_bpm':        float(np.mean(bpms)),
            'scene_counts':    scenes,
            'split_counts':    splits,
            'total_samples':   self.sample_count,
        }
        return self.stats

    def get_split(self, split: str = 'train') -> List[str]:
        """Return list of sample_ids for the given split."""
        return [s['sample_id'] for s in self.samples if s['split'] == split]


class ManifestWriter:
    """Read/write DatasetManifest to a directory's manifest.json."""

    @staticmethod
    def save(manifest: DatasetManifest, directory: str) -> str:
        os.makedirs(directory, exist_ok=True)
        path = os.path.join(directory, 'manifest.json')
        manifest.compute_stats()
        data = {
            'dataset_name':  manifest.dataset_name,
            'version':       manifest.version,
            'sample_count':  manifest.sample_count,
            'split_ratios':  manifest.split_ratios,
            'feature_schema': manifest.feature_schema,
            'created_at':    manifest.created_at,
            'updated_at':    manifest.updated_at,
            'stats':         manifest.stats,
            'samples':       manifest.samples,
        }
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        return path

    @staticmethod
    def load(directory: str) -> DatasetManifest:
        path = os.path.join(directory, 'manifest.json')
        if not os.path.exists(path):
            raise FileNotFoundError(f"No manifest.json in {directory}")
        with open(path) as f:
            data = json.load(f)
        manifest = DatasetManifest(
            dataset_name  = data['dataset_name'],
            version       = data.get('version', '1.0'),
            sample_count  = data.get('sample_count', 0),
            split_ratios  = data.get('split_ratios', {}),
            feature_schema= data.get('feature_schema', SCHEMA_VERSION),
            created_at    = data.get('created_at', 0.0),
            updated_at    = data.get('updated_at', 0.0),
            stats         = data.get('stats', {}),
            samples       = data.get('samples', []),
        )
        return manifest

    @staticmethod
    def exists(directory: str) -> bool:
        return os.path.exists(os.path.join(directory, 'manifest.json'))


# ═══════════════════════════════════════════════════════════════════════════════
# Utilities
# ═══════════════════════════════════════════════════════════════════════════════

def make_synthetic_sample(
    sample_id: str = 'test_001',
    T: int = 4,
    H: int = 96,
    W: int = 96,
    scene: str = 'concert_stage',
    genre: str = 'hip_hop',
    mood: str = 'energetic',
    dataset_source: str = 'synthetic',
) -> MaxBoosterSample:
    """
    Create a synthetic MaxBoosterSample for testing / default frames
    when real data is not yet available.
    """
    rng = np.random.default_rng(hash(sample_id) % (2**32))

    # Procedural video: smooth interpolation between two random frames
    frame_a = rng.uniform(-1, 1, (H, W, 3)).astype(np.float32)
    frame_b = rng.uniform(-1, 1, (H, W, 3)).astype(np.float32)
    alphas  = np.linspace(0, 1, T)
    frames  = np.stack([(1 - a) * frame_a + a * frame_b for a in alphas]).astype(np.float32)

    audio = make_audio_features(bpm=128.0, T=T)

    sample = MaxBoosterSample(
        video_frames   = frames,
        audio_features = audio,
        caption        = f"A {mood} {genre} music video scene at a {scene.replace('_', ' ')}",
        scene_category = scene,
        genre          = genre,
        mood           = mood,
        style_tags     = ['music', genre, mood, scene],
        dataset_source = dataset_source,
        sample_id      = sample_id,
        fps            = 24.0,
        duration_sec   = T / 24.0,
    )
    sample.motion_magnitude = sample.compute_motion_magnitude()
    sample.color_palette    = sample.compute_color_palette()
    return sample


# Dataset categories mapped to scene labels (for auto-captioning)
DATASET_SCENE_MAP: Dict[str, List[str]] = {
    'youtube_music_video': ['concert_stage', 'music_video_set', 'studio_session'],
    'vggsound':            ['concert_stage', 'underground_club', 'festival_grounds'],
    'aist_plus':           ['dance_studio', 'concert_stage', 'street_performance'],
    'ucf_101':             ['concert_stage', 'street_performance', 'festival_grounds'],
    'kinetics':            ['concert_stage', 'city_nights', 'golden_hour'],
    'fma':                 ['studio_session', 'recording_booth'],
    'gtzan':               ['studio_session', 'concert_stage'],
    'laion':               ['album_cover_shoot', 'street_art', 'luxury_aesthetic'],
    'webvid':              ['music_video_set', 'concert_stage', 'city_nights'],
    'audioset_music':      ['concert_stage', 'festival_grounds', 'underground_club'],
    'synthetic':           ['concert_stage', 'studio_session', 'trap_aesthetic'],
}
