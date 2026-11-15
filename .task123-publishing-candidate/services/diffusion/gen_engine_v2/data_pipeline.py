"""
Data Pipeline — video2dataset-Style Ingestion with PyAV + HDF5 + Dask
======================================================================
Implements the recommended tooling stack:

  PyAV          — frame-accurate, low-overhead video decoding (no subprocess)
  HDF5 / h5py   — compressed NumPy frame storage; 10-50× faster than raw .mp4
                  reads for repeated epoch access; optimal for model training
  Dask          — parallel multicore preprocessing across the 8TB dataset
                  without loading it all into RAM; lazy evaluation graphs

Pipeline stages:
  1. Ingest    — scan input directory for .mp4/.avi/.mov/.webm
  2. Decode    — PyAV: seek → demux → decode video frames + audio samples
  3. Preprocess— resize to target resolution, normalise to float16 [-1,+1]
                 extract mel spectrogram from audio channel
  4. Store     — write to HDF5 shards (one file per scene category)
  5. Dataset   — Dask-backed lazy dataset for training epoch iteration

HDF5 Schema per shard:
  /frames      [N, T, H, W, 3]   float16  — video frame sequences
  /audio_mel   [N, T, 128, mel_t] float16  — per-clip mel spectrograms
  /tokens      [N, max_seq]       int32    — text prompt token ids
  /meta        [N]                JSON     — per-clip metadata
  /priority    [N]                float32  — sampling priority scores

Usage:
  from diffusion.gen_engine_v2.data_pipeline import DataPipeline, HDF5Dataset

  # One-time ingestion (run on a machine with 8TB mounted)
  pipe = DataPipeline(input_dir='/mnt/dataset', out_dir='data/hdf5',
                      resolution=128, n_frames=8, n_workers=16)
  pipe.ingest()

  # Training data loader
  ds = HDF5Dataset('data/hdf5', batch_size=4, priority_replay=True)
  for batch in ds:
      frames  = batch['frames']    # [4, T, H, W, 3] float32
      mel     = batch['audio_mel'] # [4, T, 128, L] float32
      tokens  = batch['tokens']    # [4, max_seq] int32
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

import h5py
import numpy as np

# ── Optional heavy deps — degrade gracefully ───────────────────────────────
try:
    import av as _av
    _AV_OK = True
except ImportError:
    _AV_OK = False
    _av    = None

try:
    import dask
    import dask.array as da
    from dask.distributed import Client as _DaskClient
    _DASK_OK = True
except ImportError:
    _DASK_OK = False

try:
    import audioflux as _af
    _AF_OK = True
except ImportError:
    _AF_OK = False
    _af   = None

# ── Constants ──────────────────────────────────────────────────────────────

_VIDEO_EXTS   = {'.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.ts'}
_SHARD_SIZE   = 2_000      # clips per HDF5 shard
_MEL_BINS     = 128        # mel filterbank bins
_AUDIO_SR     = 16_000     # sample rate (resample target)
_MAX_SEQ      = 32         # text token length
_CLIP_SECONDS = 3.0        # seconds per training clip

SCENE_CATEGORIES = [
    'concert_stage', 'recording_studio', 'street_urban', 'outdoor_festival',
    'nightclub_bar', 'music_video', 'backstage_tour', 'rooftop_aerial',
    'yacht_beach', 'warehouse_industrial', 'arena_stadium', 'artist_home',
    'radio_station', 'vinyl_store', 'awards_ceremony', 'generic',
]


# ── Frame-level helpers ────────────────────────────────────────────────────

def _resize_frame(frame_rgb: np.ndarray, size: int) -> np.ndarray:
    """Bilinear resize to (size, size) using pure NumPy (no cv2 required)."""
    H, W, C = frame_rgb.shape
    if H == size and W == size:
        return frame_rgb
    # Build coordinate grids
    y = np.linspace(0, H - 1, size)
    x = np.linspace(0, W - 1, size)
    yi = np.floor(y).astype(int).clip(0, H - 2)
    xi = np.floor(x).astype(int).clip(0, W - 2)
    fy = (y - yi)[:, None, None]
    fx = (x - xi)[None, :, None]
    out = (frame_rgb[yi[:, None],     xi[None, :]] * (1 - fy) * (1 - fx) +
           frame_rgb[yi[:, None] + 1, xi[None, :]] * fy       * (1 - fx) +
           frame_rgb[yi[:, None],     xi[None, :] + 1] * (1 - fy) * fx +
           frame_rgb[yi[:, None] + 1, xi[None, :] + 1] * fy       * fx)
    return out.astype(frame_rgb.dtype)


def _norm_frames(frames: np.ndarray) -> np.ndarray:
    """uint8 [0,255] → float16 [-1, +1]."""
    return ((frames.astype(np.float32) / 127.5) - 1.0).astype(np.float16)


# ── Audio helpers ──────────────────────────────────────────────────────────

def _compute_mel_numpy(samples: np.ndarray,
                       sr: int   = _AUDIO_SR,
                       n_mel: int = _MEL_BINS,
                       n_fft: int = 512,
                       hop:   int = 160) -> np.ndarray:
    """
    Mel spectrogram via pure NumPy FFT + triangular filterbank.
    Falls back to audioflux when available for better quality.
    Returns: [n_mel, time_steps] float32
    """
    if _AF_OK and len(samples) > 0:
        try:
            bft = _af.BFT(num=n_mel, radix2_exp=int(math.log2(n_fft)),
                          samplate=sr, slide_length=hop,
                          window_type=_af.type.WindowType.HANN,
                          scale_type=_af.type.ScaleType.MEL)
            spec = bft.bft(samples.astype(np.float32))
            mel  = np.abs(spec).astype(np.float32)
            return 10 * np.log10(mel + 1e-9)   # log scale
        except Exception:
            pass   # fall through to NumPy

    # NumPy fallback
    if len(samples) == 0:
        return np.zeros((n_mel, 1), dtype=np.float32)

    # STFT
    pad  = n_fft // 2
    sig  = np.pad(samples, pad)
    n_frames = max(1, (len(sig) - n_fft) // hop + 1)
    # Vectorised: build frame matrix
    idx  = np.arange(n_fft)[None, :] + np.arange(n_frames)[:, None] * hop
    idx  = idx.clip(0, len(sig) - 1)
    frames = sig[idx]   # [n_frames, n_fft]
    win  = np.hanning(n_fft).astype(np.float32)
    spec = np.abs(np.fft.rfft(frames * win, n=n_fft))   # [n_frames, n_fft//2+1]

    # Mel filterbank (triangular)
    freq    = np.fft.rfftfreq(n_fft, 1.0 / sr)
    hz_min, hz_max = 20.0, float(sr // 2)

    def _hz_to_mel(h):
        return 2595 * np.log10(1 + h / 700)

    def _mel_to_hz(m):
        return 700 * (10 ** (m / 2595) - 1)

    mel_pts = np.linspace(_hz_to_mel(hz_min), _hz_to_mel(hz_max), n_mel + 2)
    hz_pts  = _mel_to_hz(mel_pts)
    filt    = np.zeros((n_mel, len(freq)), dtype=np.float32)
    for m in range(n_mel):
        lo, mid, hi = hz_pts[m], hz_pts[m + 1], hz_pts[m + 2]
        up   = (freq - lo)   / (mid - lo + 1e-8)
        down = (hi - freq)   / (hi - mid + 1e-8)
        filt[m] = np.maximum(0, np.minimum(up, down))

    mel_spec = filt @ spec.T   # [n_mel, n_frames]
    return (10 * np.log10(mel_spec + 1e-9)).astype(np.float32)


# ── PyAV video reader ──────────────────────────────────────────────────────

class VideoReader:
    """
    Frame-by-frame video reader using PyAV (libavcodec / libavformat).

    Advantages over OpenCV / FFmpeg subprocess:
      - No shell process spawning; direct C-level decode
      - Precise keyframe seeking via container.seek()
      - Simultaneous audio demux in the same loop
      - Thread-safe with av.open(threaded=True)
    """

    def __init__(self, path: str, resolution: int = 128, n_frames: int = 8):
        if not _AV_OK:
            raise RuntimeError("PyAV not installed — run: pip install av")
        self.path       = path
        self.resolution = resolution
        self.n_frames   = n_frames

    def decode_clip(self,
                    start_sec: float = 0.0,
                    duration:  float = _CLIP_SECONDS
                    ) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Decode a clip starting at start_sec for duration seconds.

        Returns:
          frames   : [n_frames, H, W, 3]  uint8
          audio    : [n_samples]           float32 mono, normalised [-1,+1]
          actual_fps: float
        """
        H = W = self.resolution
        frames_rgb = []
        audio_pcm  = []

        try:
            container = _av.open(self.path, 'r', options={'threads': '2'})
        except Exception as e:
            return (np.zeros((self.n_frames, H, W, 3), np.uint8),
                    np.zeros(1, np.float32), 25.0)

        # Video stream
        v_stream = next((s for s in container.streams if s.type == 'video'), None)
        a_stream = next((s for s in container.streams if s.type == 'audio'), None)

        fps = 25.0
        if v_stream:
            try:
                fps = float(v_stream.average_rate or v_stream.guessed_rate or 25)
            except Exception:
                fps = 25.0
            # Seek to start
            seek_ts = int(start_sec / v_stream.time_base)
            try:
                container.seek(seek_ts, stream=v_stream)
            except Exception:
                pass

        # Build frame timestamps we want (evenly spaced in the clip)
        sample_offsets = [i * duration / self.n_frames for i in range(self.n_frames)]
        wanted_pts     = {int((start_sec + o) / float(v_stream.time_base
                               if v_stream else 1.0 / 25.0)): i
                          for i, o in enumerate(sample_offsets)}
        collected = [None] * self.n_frames

        # Decode
        streams_to_decode = []
        if v_stream: streams_to_decode.append(v_stream)
        if a_stream: streams_to_decode.append(a_stream)

        end_ts = start_sec + duration
        for packet in container.demux(*streams_to_decode):
            if packet.stream.type == 'video' and v_stream:
                t = float(packet.pts or 0) * float(v_stream.time_base)
                if t > end_ts + 0.5:
                    break
                for frame in packet.decode():
                    t_f = float(frame.pts or 0) * float(v_stream.time_base)
                    img = frame.to_ndarray(format='rgb24')
                    img = _resize_frame(img, H)
                    # Find the closest wanted slot
                    slot = min(self.n_frames - 1,
                               max(0, int((t_f - start_sec) / duration * self.n_frames)))
                    if collected[slot] is None:
                        collected[slot] = img
                    if all(f is not None for f in collected):
                        break
            elif packet.stream.type == 'audio' and a_stream:
                for frame in packet.decode():
                    pcm = frame.to_ndarray()
                    if pcm.ndim > 1:
                        pcm = pcm.mean(0)   # mix to mono
                    audio_pcm.append(pcm.astype(np.float32))

        container.close()

        # Fill any gaps with neighbours
        for i in range(self.n_frames):
            if collected[i] is None:
                # Find nearest
                for d in range(1, self.n_frames):
                    if i - d >= 0 and collected[i - d] is not None:
                        collected[i] = collected[i - d]; break
                    if i + d < self.n_frames and collected[i + d] is not None:
                        collected[i] = collected[i + d]; break
                if collected[i] is None:
                    collected[i] = np.zeros((H, W, 3), np.uint8)

        frames = np.stack(collected, axis=0)   # [T, H, W, 3]

        if audio_pcm:
            audio = np.concatenate(audio_pcm)
            peak  = np.abs(audio).max()
            if peak > 1e-6:
                audio /= peak
        else:
            audio = np.zeros(1, np.float32)

        return frames, audio, fps


# ── HDF5 Shard writer ──────────────────────────────────────────────────────

class HDF5ShardWriter:
    """
    Writes preprocessed clips to an HDF5 shard.

    Layout:
      /frames      [N, T, H, W, 3]   float16
      /audio_mel   [N, n_mel, t_mel] float16
      /tokens      [N, max_seq]       int32
      /priority    [N]                float32
      /meta        bytes JSON per row
    """

    def __init__(self, path: str, resolution: int = 128,
                 n_frames: int = 8, n_mel: int = _MEL_BINS,
                 max_seq: int = _MAX_SEQ):
        self.path       = path
        self.resolution = resolution
        self.n_frames   = n_frames
        self.n_mel      = n_mel
        self.max_seq    = max_seq
        self._buf_frames  : List[np.ndarray] = []
        self._buf_mel     : List[np.ndarray] = []
        self._buf_tokens  : List[np.ndarray] = []
        self._buf_priority: List[float]       = []
        self._buf_meta    : List[str]         = []

    def add(self, frames: np.ndarray, audio_mel: np.ndarray,
            tokens: np.ndarray, meta: dict, priority: float = 1.0) -> None:
        """
        frames    : [T, H, W, 3] uint8
        audio_mel : [n_mel, t_mel] float32
        tokens    : [max_seq] int32
        """
        H = W = self.resolution
        T = self.n_frames
        n_mel = self.n_mel

        # Ensure consistent shapes
        f_norm = _norm_frames(frames[:T])   # [T, H, W, 3] float16
        self._buf_frames.append(f_norm)

        # Pad / trim mel
        ml = audio_mel.shape[-1] if audio_mel.ndim > 1 else 1
        target_t = max(1, int(ml))
        # Fixed width for stacking — use 512 time steps max
        MEL_T = 512
        mel_p = np.zeros((n_mel, MEL_T), dtype=np.float16)
        if audio_mel.ndim == 2 and audio_mel.shape[0] == n_mel:
            t_len = min(audio_mel.shape[1], MEL_T)
            mel_p[:, :t_len] = audio_mel[:, :t_len].astype(np.float16)
        self._buf_mel.append(mel_p)

        self._buf_tokens.append(tokens.astype(np.int32)[:self.max_seq])
        self._buf_priority.append(float(priority))
        self._buf_meta.append(json.dumps(meta, default=str))

    def flush(self) -> int:
        """Write buffered clips to disk. Returns number written."""
        N = len(self._buf_frames)
        if N == 0:
            return 0

        T, H, W = self.n_frames, self.resolution, self.resolution
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        mode = 'a' if os.path.exists(self.path) else 'w'
        with h5py.File(self.path, mode) as f:
            def _ext(name, data, dtype=None):
                arr = np.stack(data)
                if dtype:
                    arr = arr.astype(dtype)
                if name in f:
                    old  = f[name]
                    old_N = old.shape[0]
                    f[name].resize(old_N + N, axis=0)
                    f[name][old_N:] = arr
                else:
                    max_sh = list(arr.shape)
                    max_sh[0] = None
                    f.create_dataset(name, data=arr,
                                     compression='gzip', compression_opts=4,
                                     chunks=(min(N, 16),) + arr.shape[1:],
                                     maxshape=tuple(max_sh))

            _ext('frames',    self._buf_frames,   dtype=np.float16)
            _ext('audio_mel', self._buf_mel,       dtype=np.float16)
            _ext('tokens',    self._buf_tokens,    dtype=np.int32)
            _ext('priority',  self._buf_priority,  dtype=np.float32)

            # Meta: store as variable-length string dataset
            dt = h5py.string_dtype()
            meta_arr = np.array(self._buf_meta, dtype=object)
            if 'meta' in f:
                old_N = f['meta'].shape[0]
                f['meta'].resize(old_N + N, axis=0)
                f['meta'][old_N:] = meta_arr
            else:
                f.create_dataset('meta', data=meta_arr, dtype=dt,
                                 maxshape=(None,))

        self._buf_frames.clear();  self._buf_mel.clear()
        self._buf_tokens.clear();  self._buf_priority.clear()
        self._buf_meta.clear()
        return N


# ── DataPipeline ───────────────────────────────────────────────────────────

class DataPipeline:
    """
    video2dataset-style ingest pipeline for music industry video content.

    1. Scans input_dir recursively for video files
    2. Decodes clips with PyAV (one clip per n_clips_per_video)
    3. Extracts mel spectrogram with AudioFlux (or NumPy fallback)
    4. Tokenizes auto-generated prompts from filename / metadata
    5. Stores to HDF5 shards with Dask parallelism

    Args:
      input_dir  : Root of raw 8TB video dataset
      out_dir    : Where to write HDF5 shards
      resolution : Target H=W in pixels (128 for LITE, 256 for FULL)
      n_frames   : Frames per training clip
      n_workers  : Dask thread/process count (set to num CPU cores)
      clips_per_video : How many random clips to sample per video file
    """

    def __init__(self, input_dir: str, out_dir: str,
                 resolution: int = 128, n_frames: int = 8,
                 n_workers: int = 4, clips_per_video: int = 5):
        self.input_dir      = input_dir
        self.out_dir        = out_dir
        self.resolution     = resolution
        self.n_frames       = n_frames
        self.n_workers      = n_workers
        self.clips_per_video = clips_per_video
        os.makedirs(out_dir, exist_ok=True)

    def _classify_scene(self, path: str) -> str:
        p = path.lower()
        if any(k in p for k in ('concert', 'show', 'live', 'gig', 'festival')):
            return 'concert_stage'
        if any(k in p for k in ('studio', 'record', 'session', 'mixing')):
            return 'recording_studio'
        if any(k in p for k in ('street', 'city', 'urban', 'downtown')):
            return 'street_urban'
        if any(k in p for k in ('club', 'bar', 'rave', 'night')):
            return 'nightclub_bar'
        if any(k in p for k in ('video', 'mv', 'clip', 'official')):
            return 'music_video'
        if any(k in p for k in ('backstage', 'tour', 'behind')):
            return 'backstage_tour'
        if any(k in p for k in ('roof', 'aerial', 'drone')):
            return 'rooftop_aerial'
        if any(k in p for k in ('beach', 'yacht', 'boat', 'ocean')):
            return 'yacht_beach'
        if any(k in p for k in ('warehouse', 'factory', 'industrial')):
            return 'warehouse_industrial'
        if any(k in p for k in ('arena', 'stadium', 'coliseum')):
            return 'arena_stadium'
        return 'generic'

    def _auto_prompt(self, path: str, scene: str) -> str:
        """Generate a descriptive prompt from filename + scene category."""
        stem = Path(path).stem.replace('_', ' ').replace('-', ' ')
        scene_desc = scene.replace('_', ' ')
        return f"{stem} {scene_desc} music performance cinematic"

    def _prompt_to_tokens(self, prompt: str) -> np.ndarray:
        from .text_encoder_v3 import tokenize_v3
        return tokenize_v3(prompt, max_len=_MAX_SEQ)

    def _scan_videos(self) -> List[str]:
        paths = []
        for root, _, files in os.walk(self.input_dir):
            for f in files:
                if Path(f).suffix.lower() in _VIDEO_EXTS:
                    paths.append(os.path.join(root, f))
        return sorted(paths)

    def _process_single(self, video_path: str) -> int:
        """Decode + preprocess one video file. Returns clips written."""
        scene   = self._classify_scene(video_path)
        prompt  = self._auto_prompt(video_path, scene)
        tokens  = self._prompt_to_tokens(prompt)

        shard_path = os.path.join(self.out_dir, f'{scene}.h5')
        writer  = HDF5ShardWriter(shard_path, self.resolution, self.n_frames)
        reader  = VideoReader(video_path, self.resolution, self.n_frames)

        try:
            container = _av.open(video_path, 'r') if _AV_OK else None
            duration  = 0.0
            if container:
                dur_raw = container.duration
                duration = float(dur_raw) / 1_000_000 if dur_raw else 30.0
                container.close()
        except Exception:
            duration = 30.0

        written = 0
        for ci in range(self.clips_per_video):
            start = max(0.0, min(ci * _CLIP_SECONDS,
                                 duration - _CLIP_SECONDS - 0.1))
            frames, audio, fps = reader.decode_clip(start, _CLIP_SECONDS)
            mel = _compute_mel_numpy(audio)
            meta = {
                'path': video_path, 'scene': scene, 'clip': ci,
                'start_sec': start, 'fps': fps, 'prompt': prompt,
            }
            priority = 1.0 + 0.1 * np.random.rand()
            writer.add(frames, mel, tokens, meta, priority)

        written += writer.flush()
        return written

    def ingest(self, max_files: Optional[int] = None) -> Dict[str, int]:
        """
        Run the full ingestion pipeline.
        Uses Dask for parallel execution when n_workers > 1.

        Returns: {scene_category: clip_count}
        """
        videos = self._scan_videos()
        if max_files:
            videos = videos[:max_files]
        print(f"[DataPipeline] Found {len(videos)} video files. "
              f"Processing with {self.n_workers} workers...")

        stats: Dict[str, int] = {}

        if _DASK_OK and self.n_workers > 1:
            delayed_tasks = [
                dask.delayed(self._process_single)(p) for p in videos
            ]
            results = dask.compute(*delayed_tasks,
                                   num_workers=self.n_workers,
                                   scheduler='threads')
            total = sum(results)
        else:
            total = 0
            for i, p in enumerate(videos):
                n = self._process_single(p)
                total += n
                if i % 100 == 0:
                    print(f"  [{i}/{len(videos)}] {total} clips written")

        print(f"[DataPipeline] Done: {total} total clips written to {self.out_dir}")
        return {'total': total}


# ── HDF5 Training Dataset ─────────────────────────────────────────────────

class HDF5Dataset:
    """
    Lazy HDF5-backed training dataset with priority-weighted sampling.

    Supports:
      - Multiple HDF5 shards (one per scene category)
      - Priority replay: high-loss clips sampled more often (like AdvancedMemory)
      - Shuffle within epoch
      - Dask-backed batch prefetch for overlapping I/O with training

    Usage:
      ds = HDF5Dataset('data/hdf5', batch_size=4)
      for batch in ds.epoch():
          frames  = batch['frames']    # [B, T, H, W, 3] float32
          mel     = batch['audio_mel'] # [B, n_mel, t_mel] float32
          tokens  = batch['tokens']    # [B, seq] int32
    """

    def __init__(self, hdf5_dir: str, batch_size: int = 4,
                 priority_replay: bool = True, shuffle: bool = True):
        self.hdf5_dir       = hdf5_dir
        self.batch_size     = batch_size
        self.priority_replay = priority_replay
        self.shuffle        = shuffle
        self._index         = self._build_index()

    def _build_index(self) -> List[Tuple[str, int]]:
        """Returns list of (shard_path, clip_idx) for all clips."""
        idx = []
        for fn in sorted(os.listdir(self.hdf5_dir)):
            if not fn.endswith('.h5'):
                continue
            fp = os.path.join(self.hdf5_dir, fn)
            try:
                with h5py.File(fp, 'r') as f:
                    n = f['frames'].shape[0]
                idx.extend((fp, i) for i in range(n))
            except Exception:
                pass
        return idx

    def __len__(self) -> int:
        return len(self._index) // self.batch_size

    def _load_clip(self, shard_path: str, idx: int) -> Dict[str, np.ndarray]:
        with h5py.File(shard_path, 'r') as f:
            return {
                'frames':    f['frames'][idx].astype(np.float32),
                'audio_mel': f['audio_mel'][idx].astype(np.float32),
                'tokens':    f['tokens'][idx],
                'priority':  float(f['priority'][idx]),
            }

    def _sample_indices(self) -> List[Tuple[str, int]]:
        if self.priority_replay:
            # Load priority scores for weighting
            prios = []
            for fp, ci in self._index:
                try:
                    with h5py.File(fp, 'r') as f:
                        prios.append(float(f['priority'][ci]))
                except Exception:
                    prios.append(1.0)
            prios_arr = np.array(prios, dtype=np.float32)
            prios_arr = prios_arr / prios_arr.sum()
            chosen = np.random.choice(len(self._index),
                                      size=len(self._index),
                                      replace=True,
                                      p=prios_arr)
            return [self._index[i] for i in chosen]
        order = list(range(len(self._index)))
        if self.shuffle:
            np.random.shuffle(order)
        return [self._index[i] for i in order]

    def epoch(self) -> Iterator[Dict[str, np.ndarray]]:
        """Yield batches for one full epoch."""
        order = self._sample_indices()
        B     = self.batch_size
        for start in range(0, len(order) - B + 1, B):
            batch_idx = order[start:start + B]
            clips = [self._load_clip(fp, ci) for fp, ci in batch_idx]
            yield {
                'frames':    np.stack([c['frames']    for c in clips]),
                'audio_mel': np.stack([c['audio_mel'] for c in clips]),
                'tokens':    np.stack([c['tokens']    for c in clips]),
                'priority':  np.array([c['priority']  for c in clips]),
            }
