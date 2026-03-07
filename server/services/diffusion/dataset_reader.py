"""
DatasetReader — bridges downloaded datasets into the training pipeline.

Provides:
  GulpReader       — reads HMDB51 / UCF101 gulp_rgb frame sequences (no gulpio needed)
  MusicCapsReader  — samples music captions from manifest.jsonl
  FMAMetaReader    — reads FMA genres / BPM / key metadata
  DatasetReader    — unified interface: sample_frames(), sample_prompt(), get_stats()
"""

from __future__ import annotations

import io
import json
import os
import random
import struct
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE       = Path(__file__).parent
_WORKSPACE  = _HERE.parent.parent.parent
_DATASETS   = _WORKSPACE / 'data' / 'training_datasets'


# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

def _resize_frame(img_array: np.ndarray, H: int, W: int) -> np.ndarray:
    """Nearest-neighbour resize using numpy (no cv2 required)."""
    src_h, src_w = img_array.shape[:2]
    if src_h == H and src_w == W:
        return img_array
    row_idx = (np.arange(H) * src_h / H).astype(int)
    col_idx = (np.arange(W) * src_w / W).astype(int)
    return img_array[np.ix_(row_idx, col_idx)]


def _jpeg_to_array(data: bytes) -> Optional[np.ndarray]:
    """Decode JPEG bytes → (H, W, 3) uint8 array without cv2."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data)).convert('RGB')
        return np.array(img, dtype=np.uint8)
    except Exception:
        return None


def _to_model_space(frame: np.ndarray) -> np.ndarray:
    """uint8 [0,255] → float32 [-1, 1]"""
    return (frame.astype(np.float32) / 127.5) - 1.0


# ─────────────────────────────────────────────────────────────────────────────
# GulpReader — reads HMDB51 / UCF101 gulp_rgb without gulpio
# ─────────────────────────────────────────────────────────────────────────────

class GulpReader:
    """
    Reads frame sequences from the GulpIO binary format.

    Format:
      data_N.gulp  — concatenated JPEG bytes for all clips in the shard
      meta_N.gmeta — JSON dict: clip_id -> {frame_info: [[offset, pad, size], ...]}

    The dataset is lazily loaded: only meta is scanned at init time.
    """

    def __init__(self, gulp_dir: Path):
        self.gulp_dir  = gulp_dir
        self._index: Dict[str, Tuple[Path, List[List[int]]]] = {}
        self._loaded   = False

    def _load_index(self):
        if self._loaded:
            return
        self._loaded = True

        for meta_file in sorted(self.gulp_dir.glob('meta_*.gmeta')):
            shard_num  = meta_file.stem.split('_')[1]
            gulp_file  = self.gulp_dir / f'data_{shard_num}.gulp'
            if not gulp_file.exists():
                continue
            try:
                meta = json.loads(meta_file.read_text())
            except Exception:
                continue
            for clip_id, info in meta.items():
                frame_info = info.get('frame_info', [])
                if frame_info:
                    self._index[clip_id] = (gulp_file, frame_info)

    def clip_ids(self) -> List[str]:
        self._load_index()
        return list(self._index.keys())

    def read_clip(self, clip_id: str, T: int, H: int, W: int,
                  seed: int = 0) -> Optional[np.ndarray]:
        """Read T evenly-spaced frames from a clip. Returns (T, H, W, 3) float32 [-1,1]."""
        self._load_index()
        if clip_id not in self._index:
            return None

        gulp_file, frame_info = self._index[clip_id]
        total_frames = len(frame_info)
        if total_frames == 0:
            return None

        # Pick T evenly-spaced frame indices
        if total_frames <= T:
            indices = list(range(total_frames))
            # Repeat last frame to reach T
            while len(indices) < T:
                indices.append(indices[-1])
        else:
            indices = [int(i * total_frames / T) for i in range(T)]

        frames = []
        try:
            with open(gulp_file, 'rb') as fh:
                for fi in indices:
                    offset, _, size = frame_info[fi][0], frame_info[fi][1], frame_info[fi][2]
                    fh.seek(offset)
                    jpeg_data = fh.read(size)
                    arr = _jpeg_to_array(jpeg_data)
                    if arr is None:
                        arr = np.zeros((H, W, 3), dtype=np.uint8)
                    arr = _resize_frame(arr, H, W)
                    frames.append(_to_model_space(arr))
        except Exception:
            return None

        return np.stack(frames, axis=0)  # (T, H, W, 3)

    def sample_random_clip(self, T: int, H: int, W: int,
                           seed: int = 0) -> Optional[np.ndarray]:
        """Sample a random clip from the dataset."""
        self._load_index()
        if not self._index:
            return None
        rng = random.Random(seed)
        clip_id = rng.choice(list(self._index.keys()))
        return self.read_clip(clip_id, T, H, W, seed)

    def action_class(self, clip_id: str) -> str:
        """Extract action class from clip_id (format: class/clip_name)."""
        return clip_id.split('/')[0] if '/' in clip_id else clip_id

    @property
    def n_clips(self) -> int:
        self._load_index()
        return len(self._index)


# ─────────────────────────────────────────────────────────────────────────────
# MusicCapsReader — real music+video text descriptions
# ─────────────────────────────────────────────────────────────────────────────

class MusicCapsReader:
    """Reads 5000 MusicCaps captions from manifest.jsonl."""

    def __init__(self, dataset_dir: Path):
        self._manifest = dataset_dir / 'manifest.jsonl'
        self._captions: List[str] = []
        self._loaded   = False

    def _load(self):
        if self._loaded:
            return
        self._loaded = True
        if not self._manifest.exists():
            return
        try:
            with open(self._manifest) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    rec = json.loads(line)
                    cap = rec.get('caption', '')
                    if cap and len(cap) > 10:
                        self._captions.append(cap)
        except Exception:
            pass

    def sample_caption(self, seed: int = 0) -> str:
        self._load()
        if not self._captions:
            return ''
        return random.Random(seed).choice(self._captions)

    def sample_batch(self, n: int, seed: int = 0) -> List[str]:
        self._load()
        if not self._captions:
            return []
        rng = random.Random(seed)
        return [rng.choice(self._captions) for _ in range(n)]

    @property
    def n_captions(self) -> int:
        self._load()
        return len(self._captions)


# ─────────────────────────────────────────────────────────────────────────────
# FMAMetaReader — genre / BPM / key metadata for prompt enrichment
# ─────────────────────────────────────────────────────────────────────────────

class FMAMetaReader:
    """
    Reads FMA metadata from fma_metadata.zip → tracks.csv.
    Provides genre/title/artist strings for prompt enrichment.
    """

    def __init__(self, dataset_dir: Path):
        self._dir     = dataset_dir
        self._records: List[Dict] = []
        self._loaded  = False

    def _load(self):
        if self._loaded:
            return
        self._loaded = True

        zip_path = self._dir / 'fma_metadata.zip'
        if not zip_path.exists():
            return

        try:
            with zipfile.ZipFile(zip_path) as zf:
                # genres.csv has: genre_id, title, top_level
                with zf.open('fma_metadata/genres.csv') as f:
                    import csv, io as _io
                    reader = csv.DictReader(_io.TextIOWrapper(f, 'utf-8'))
                    self._genres = {row['genre_id']: row.get('title', '') for row in reader}

                # tracks.csv (rows 0 and 1 are multi-level header in FMA — skip them)
                with zf.open('fma_metadata/raw_tracks.csv') as f:
                    content = _io.TextIOWrapper(f, 'utf-8').read()
                    lines = content.split('\n')
                    if len(lines) > 2:
                        header = lines[0].split(',')
                        for line in lines[1:5001]:
                            if not line.strip():
                                continue
                            parts = line.split(',')
                            if len(parts) >= len(header):
                                rec = dict(zip(header, parts))
                                title  = rec.get('track_title', '').strip().strip('"')
                                genre  = rec.get('track_genre_top', '').strip().strip('"')
                                artist = rec.get('artist_name', '').strip().strip('"')
                                if title or genre:
                                    self._records.append({
                                        'title': title,
                                        'genre': genre.lower(),
                                        'artist': artist,
                                    })
        except Exception:
            pass

    def sample_prompt_fragment(self, seed: int = 0) -> str:
        """Return a short genre/mood fragment for prompt enrichment."""
        self._load()
        if not self._records:
            return ''
        rec = random.Random(seed).choice(self._records)
        genre  = rec.get('genre', '')
        artist = rec.get('artist', '')
        parts  = [p for p in [genre, artist] if p]
        return ' '.join(parts[:2])

    @property
    def n_tracks(self) -> int:
        self._load()
        return len(self._records)


# ─────────────────────────────────────────────────────────────────────────────
# AudioCapsReader — audio event descriptions
# ─────────────────────────────────────────────────────────────────────────────

class AudioCapsReader:
    """Reads AudioCaps captions from manifest.jsonl."""

    def __init__(self, dataset_dir: Path):
        self._manifest = dataset_dir / 'manifest.jsonl'
        self._captions: List[str] = []
        self._loaded   = False

    def _load(self):
        if self._loaded:
            return
        self._loaded = True
        if not self._manifest.exists():
            return
        try:
            with open(self._manifest) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    rec = json.loads(line)
                    cap = rec.get('caption', '')
                    if cap:
                        self._captions.append(cap)
        except Exception:
            pass

    def sample_caption(self, seed: int = 0) -> str:
        self._load()
        if not self._captions:
            return ''
        return random.Random(seed).choice(self._captions)

    @property
    def n_captions(self) -> int:
        self._load()
        return len(self._captions)


# ─────────────────────────────────────────────────────────────────────────────
# DatasetReader — unified interface
# ─────────────────────────────────────────────────────────────────────────────

class DatasetReader:
    """
    Unified interface to all downloaded datasets.

    Usage:
        reader = DatasetReader()
        frames = reader.sample_frames(T=8, H=64, W=64, seed=42)
        # frames: (T, H, W, 3) float32 in [-1, 1], or None if no datasets ready

        prompt = reader.sample_prompt(seed=42)
        # prompt: str — real MusicCaps caption optionally enriched with FMA metadata

        stats  = reader.get_stats()
        # {'hmdb51_clips': N, 'ucf101_clips': N, 'musiccaps_captions': N, ...}
    """

    def __init__(self, datasets_dir: Optional[Path] = None):
        base = Path(datasets_dir) if datasets_dir else _DATASETS

        self._hmdb51  = GulpReader(base / 'hmdb51'  / 'gulp_rgb') \
                        if (base / 'hmdb51' / 'gulp_rgb').exists() else None
        self._ucf101  = GulpReader(base / 'ucf101'  / 'gulp_rgb') \
                        if (base / 'ucf101' / 'gulp_rgb').exists() else None
        self._musiccaps = MusicCapsReader(base / 'musiccaps') \
                          if (base / 'musiccaps').exists() else None
        self._audiocaps = AudioCapsReader(base / 'audiocaps') \
                          if (base / 'audiocaps').exists() else None
        self._fma       = FMAMetaReader(base / 'fma_metadata') \
                          if (base / 'fma_metadata').exists() else None

        self._video_readers: List[GulpReader] = [
            r for r in [self._hmdb51, self._ucf101] if r is not None
        ]

    # ── Frame sampling ─────────────────────────────────────────────────────

    def sample_frames(self, T: int, H: int, W: int,
                      seed: int = 0) -> Optional[np.ndarray]:
        """
        Sample a T-frame sequence from a random real video dataset.
        Returns (T, H, W, 3) float32 in [-1, 1] or None if unavailable.
        """
        if not self._video_readers:
            return None

        rng = random.Random(seed)
        reader = rng.choice(self._video_readers)
        result = reader.sample_random_clip(T, H, W, seed)
        if result is None and len(self._video_readers) > 1:
            # Fallback to other reader
            other = [r for r in self._video_readers if r is not reader]
            result = other[0].sample_random_clip(T, H, W, seed + 1)
        return result

    def has_video_data(self) -> bool:
        return any(r.n_clips > 0 for r in self._video_readers)

    # ── Prompt sampling ────────────────────────────────────────────────────

    def sample_prompt(self, seed: int = 0) -> str:
        """
        Sample a real music description.
        Prefers MusicCaps captions; enriches with FMA genre metadata.
        Falls back to AudioCaps if MusicCaps empty.
        """
        rng = random.Random(seed)

        caption = ''
        if self._musiccaps and self._musiccaps.n_captions > 0:
            caption = self._musiccaps.sample_caption(seed)
        elif self._audiocaps and self._audiocaps.n_captions > 0:
            caption = self._audiocaps.sample_caption(seed)

        # Optionally enrich with FMA genre fragment (30% of the time)
        if caption and self._fma and rng.random() < 0.30:
            frag = self._fma.sample_prompt_fragment(seed)
            if frag and frag.lower() not in caption.lower():
                caption = f"{frag} {caption}"

        return caption.strip()

    def has_prompt_data(self) -> bool:
        mc = self._musiccaps.n_captions if self._musiccaps else 0
        ac = self._audiocaps.n_captions if self._audiocaps else 0
        return (mc + ac) > 0

    # ── Stats ──────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict:
        stats: Dict = {
            'datasets_dir':        str(_DATASETS),
            'hmdb51_clips':        self._hmdb51.n_clips  if self._hmdb51  else 0,
            'ucf101_clips':        self._ucf101.n_clips  if self._ucf101  else 0,
            'musiccaps_captions':  self._musiccaps.n_captions if self._musiccaps else 0,
            'audiocaps_captions':  self._audiocaps.n_captions if self._audiocaps else 0,
            'fma_tracks':          self._fma.n_tracks    if self._fma     else 0,
            'has_video_data':      self.has_video_data(),
            'has_prompt_data':     self.has_prompt_data(),
        }
        stats['total_video_clips'] = stats['hmdb51_clips'] + stats['ucf101_clips']
        stats['total_text_items']  = stats['musiccaps_captions'] + stats['audiocaps_captions']
        return stats


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton (lazy init)
# ─────────────────────────────────────────────────────────────────────────────

_reader: Optional[DatasetReader] = None

def get_reader() -> DatasetReader:
    global _reader
    if _reader is None:
        _reader = DatasetReader()
    return _reader


if __name__ == '__main__':
    reader = get_reader()
    stats  = reader.get_stats()
    print('[DatasetReader] Stats:')
    for k, v in stats.items():
        print(f'  {k}: {v}')

    if reader.has_video_data():
        print('\n[DatasetReader] Sampling test frame sequence (T=4, 64x64)...')
        seq = reader.sample_frames(T=4, H=64, W=64, seed=0)
        if seq is not None:
            print(f'  Shape: {seq.shape}, dtype: {seq.dtype}, '
                  f'range: [{seq.min():.2f}, {seq.max():.2f}]')

    if reader.has_prompt_data():
        print('\n[DatasetReader] Sample prompts:')
        for i in range(3):
            print(f'  [{i}] {reader.sample_prompt(seed=i)[:80]}')
