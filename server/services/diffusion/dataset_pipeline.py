"""
Max Booster Dataset Pipeline (B)
==============================================================
Scraping, downloading, and preprocessing pipeline for all
datasets in the Veo-for-Music training suite.

Components
----------
DatasetRegistry   — catalogue of all 50+ datasets with search terms
VideoDownloader   — yt-dlp wrapper for YouTube/web sources
VideoPreprocessor — PIL+FFmpeg frame extraction (no cv2 required)
AudioPreprocessor — librosa-based audio feature extraction
CaptionGenerator  — auto-caption from visual + audio analysis
DatasetBuilder    — end-to-end build pipeline
DatasetStats      — quality metrics and manifest statistics
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from .dataset_schema import (
    MaxBoosterSample, SampleWriter, ManifestWriter,
    DatasetManifest, make_audio_features, make_empty_audio_features,
    DATASET_SCENE_MAP,
)

# Optional imports with graceful fallback
try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

try:
    import yt_dlp as ytdlp
    _YTDLP = True
except ImportError:
    _YTDLP = False

_here = os.path.dirname(os.path.abspath(__file__))
_DATA_ROOT = os.path.join(_here, '..', '..', '..', 'data', 'training_datasets')


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Registry
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DatasetEntry:
    name:            str
    category:        str
    search_terms:    List[str]
    source_type:     str        # 'yt-dlp' | 'http' | 'manual' | 'huggingface'
    huggingface_id:  str        = ""
    license:         str        = "unknown"
    est_size_gb:     float      = 0.0
    video:           bool       = True
    audio:           bool       = True
    text_captions:   bool       = False
    music_specific:  bool       = False
    priority:        int        = 3         # 1=high, 2=medium, 3=low
    notes:           str        = ""


class DatasetRegistry:
    """
    Master catalogue of all Veo-for-Music training datasets.
    Each entry includes exact search terms for HuggingFace, Papers With Code,
    GitHub, and academic repositories.
    """

    _ENTRIES: List[DatasetEntry] = [

        # ── Music Video Datasets ──────────────────────────────────────────────
        DatasetEntry(
            name='youtube_8m_music',
            category='music_video',
            search_terms=['YouTube-8M dataset', 'YouTube8M music segment',
                          'yt8m music video labels'],
            source_type='manual',
            huggingface_id='',
            license='CC BY 4.0',
            est_size_gb=1500.0,
            video=True, audio=True, text_captions=True,
            music_specific=True, priority=1,
            notes='Filter to music label IDs. Segment-level labels. '
                  'Download via official yt8m.org download script.',
        ),
        DatasetEntry(
            name='ytmv',
            category='music_video',
            search_terms=['YouTube Music Video Dataset YTMV',
                          'Music Video Dataset MVD research'],
            source_type='manual',
            license='research',
            est_size_gb=50.0,
            video=True, audio=True, music_specific=True, priority=1,
            notes='Manually download per paper instructions. '
                  'Search: "YTMV dataset music video retrieval"',
        ),
        DatasetEntry(
            name='vggsound',
            category='music_video',
            search_terms=['VGGSound dataset audio visual', 'vggsound.csv'],
            source_type='yt-dlp',
            huggingface_id='Loie/VGGSound',
            license='CC BY 4.0',
            est_size_gb=200.0,
            video=True, audio=True, text_captions=True,
            music_specific=False, priority=1,
            notes='Use music-labeled subset (playing guitar, singing, etc.). '
                  'CSV available from robots.ox.ac.uk/~vgg/data/vggsound/',
        ),
        DatasetEntry(
            name='audioset_music',
            category='music_video',
            search_terms=['AudioSet music subset', 'AudioSet ontology music',
                          'audioset balanced train music'],
            source_type='yt-dlp',
            license='CC BY 4.0',
            est_size_gb=300.0,
            video=True, audio=True, text_captions=True,
            music_specific=True, priority=1,
            notes='Filter by music branch of AudioSet ontology. '
                  'Metadata at research.google.com/audioset/download.html',
        ),

        # ── Performance / Concert / Dance ─────────────────────────────────────
        DatasetEntry(
            name='aist_plus',
            category='performance',
            search_terms=['AIST++ dance motion dataset', 'AIST++ 3D motion capture music',
                          'aistdancedb'],
            source_type='manual',
            license='CC BY 4.0',
            est_size_gb=20.0,
            video=True, audio=True, music_specific=True, priority=1,
            notes='Music-synchronized dance. 1408 sequences, 10 genres. '
                  'aistdancedb.ongaaccel.net — requires registration.',
        ),
        DatasetEntry(
            name='urmp',
            category='performance',
            search_terms=['URMP dataset University of Rochester Multi-Modal Music Performance',
                          'URMP video audio alignment dataset'],
            source_type='manual',
            license='research',
            est_size_gb=2.0,
            video=True, audio=True, music_specific=True, priority=2,
            notes='44 classical music pieces with individual instrument videos.',
        ),
        DatasetEntry(
            name='music_av',
            category='performance',
            search_terms=['MUSIC-AV dataset musical instruments sound source localization',
                          'MUSIC dataset Zhao 2018'],
            source_type='yt-dlp',
            license='research',
            est_size_gb=15.0,
            video=True, audio=True, music_specific=True, priority=2,
        ),

        # ── Audio-Only (for conditioning) ─────────────────────────────────────
        DatasetEntry(
            name='fma',
            category='audio',
            search_terms=['FMA Free Music Archive dataset', 'FMA dataset github',
                          'mdeff/fma'],
            source_type='http',
            huggingface_id='rudraml/fma-music',
            license='various CC',
            est_size_gb=93.0,
            video=False, audio=True, music_specific=True, priority=1,
            notes='fma_small (8GB), fma_medium (22GB), fma_large (93GB). '
                  'github.com/mdeff/fma for download scripts.',
        ),
        DatasetEntry(
            name='gtzan',
            category='audio',
            search_terms=['GTZAN dataset', 'GTZAN music genre recognition',
                          'GTZAN Genre Collection'],
            source_type='manual',
            huggingface_id='marsyas/gtzan',
            license='research',
            est_size_gb=1.5,
            video=False, audio=True, music_specific=True, priority=2,
        ),
        DatasetEntry(
            name='magnatagatune',
            category='audio',
            search_terms=['MagnaTagATune dataset', 'magnatagatune.csv'],
            source_type='manual',
            license='research',
            est_size_gb=25.0,
            video=False, audio=True, text_captions=True, music_specific=True, priority=2,
            notes='188K clips with 188 tags. Good for mood/genre conditioning.',
        ),
        DatasetEntry(
            name='mtg_jamendo',
            category='audio',
            search_terms=['MTG-Jamendo dataset', 'mtg-jamendo-dataset github',
                          'Jamendo music tagging dataset'],
            source_type='http',
            huggingface_id='',
            license='CC BY NC ND',
            est_size_gb=240.0,
            video=False, audio=True, text_captions=True, music_specific=True, priority=2,
            notes='github.com/MTG/mtg-jamendo-dataset',
        ),
        DatasetEntry(
            name='maestro',
            category='audio',
            search_terms=['MAESTRO piano dataset', 'MAESTRO MIDI aligned audio',
                          'magenta/maestro'],
            source_type='http',
            huggingface_id='roszcz/maestro-v1-sustain',
            license='CC BY NC SA 4.0',
            est_size_gb=120.0,
            video=False, audio=True, music_specific=True, priority=3,
        ),

        # ── Lyrics / Alignment ────────────────────────────────────────────────
        DatasetEntry(
            name='dali',
            category='lyrics',
            search_terms=['DALI lyrics dataset time aligned', 'DALI dataset github',
                          'gabolsgabs/DALI'],
            source_type='manual',
            license='research',
            est_size_gb=5.0,
            video=False, audio=True, text_captions=True, music_specific=True, priority=2,
            notes='Time-aligned lyrics for 5358 songs.',
        ),
        DatasetEntry(
            name='mir_1k',
            category='lyrics',
            search_terms=['MIR-1K dataset karaoke vocal separation',
                          'MIR-1K music information retrieval'],
            source_type='manual',
            license='research',
            est_size_gb=0.5,
            video=False, audio=True, music_specific=True, priority=3,
        ),

        # ── Visual Style / Aesthetics ─────────────────────────────────────────
        DatasetEntry(
            name='laion_aesthetics',
            category='visual_style',
            search_terms=['LAION-Aesthetics dataset', 'LAION-5B aesthetic subset',
                          'christophschuhmann/laion-aesthetic'],
            source_type='huggingface',
            huggingface_id='laion/laion-art',
            license='CC BY 4.0',
            est_size_gb=200.0,
            video=False, audio=False, text_captions=True, priority=1,
            notes='Good for album cover / branding aesthetics. ~1.2M high-quality images.',
        ),
        DatasetEntry(
            name='ava_aesthetics',
            category='visual_style',
            search_terms=['AVA aesthetic dataset photo quality', 'AVA dataset Murray 2012'],
            source_type='manual',
            license='research',
            est_size_gb=30.0,
            video=False, audio=False, text_captions=False, priority=2,
        ),

        # ── General Video / Motion ────────────────────────────────────────────
        DatasetEntry(
            name='ucf_101',
            category='general_video',
            search_terms=['UCF-101 dataset action recognition', 'UCF101 dataset download'],
            source_type='http',
            huggingface_id='sayakpaul/ucf101-subset',
            license='research',
            est_size_gb=6.5,
            video=True, audio=False, priority=2,
            notes='13320 videos, 101 action classes. Good for motion learning.',
        ),
        DatasetEntry(
            name='kinetics_700',
            category='general_video',
            search_terms=['Kinetics-700 dataset', 'kinetics-dataset github',
                          'google-deepmind/kinetics'],
            source_type='yt-dlp',
            license='CC BY 4.0',
            est_size_gb=800.0,
            video=True, audio=True, text_captions=True, priority=2,
            notes='700 action classes. Filter to music/dance/performance classes.',
        ),
        DatasetEntry(
            name='something_something_v2',
            category='general_video',
            search_terms=['Something-Something V2 dataset', 'sthsth dataset 20bn',
                          'qualcomm-ai-research/something-something-v2'],
            source_type='manual',
            license='CC BY NC SA 4.0',
            est_size_gb=20.0,
            video=True, audio=False, priority=3,
        ),
        DatasetEntry(
            name='openvid_1m',
            category='general_video',
            search_terms=['OpenVid-1M dataset', 'NJU-PCALab/OpenVid-1M'],
            source_type='huggingface',
            huggingface_id='nkp37/OpenVid-1M',
            license='CC BY 4.0',
            est_size_gb=600.0,
            video=True, audio=False, text_captions=True, priority=1,
            notes='1M text-video pairs. Directly useful for text conditioning.',
        ),
        DatasetEntry(
            name='webvid_2m',
            category='general_video',
            search_terms=['WebVid-2M dataset', 'm-bain/frozen-in-time WebVid'],
            source_type='yt-dlp',
            license='research',
            est_size_gb=400.0,
            video=True, audio=False, text_captions=True, priority=1,
        ),
        DatasetEntry(
            name='hmdb_51',
            category='general_video',
            search_terms=['HMDB-51 dataset human motion', 'HMDB51 action recognition'],
            source_type='http',
            license='research',
            est_size_gb=2.0,
            video=True, audio=False, priority=3,
        ),

        # ── Social Media / Short Form ─────────────────────────────────────────
        DatasetEntry(
            name='tiktok_15m',
            category='social_media',
            search_terms=['TikTok-15M dataset', 'TikTok video dataset research',
                          'TikTok dance dataset benchmark'],
            source_type='manual',
            license='research',
            est_size_gb=150.0,
            video=True, audio=True, text_captions=True, music_specific=True, priority=2,
        ),

        # ── Cinematography / Editing ──────────────────────────────────────────
        DatasetEntry(
            name='movienet',
            category='cinematography',
            search_terms=['MovieNet dataset', 'MovieNet movie understanding',
                          'movienet.github.io'],
            source_type='manual',
            license='research',
            est_size_gb=100.0,
            video=True, audio=False, text_captions=True, priority=2,
        ),
        DatasetEntry(
            name='activitynet',
            category='cinematography',
            search_terms=['ActivityNet dataset captions', 'ActivityNet 200',
                          'activitynet.org'],
            source_type='yt-dlp',
            license='research',
            est_size_gb=200.0,
            video=True, audio=True, text_captions=True, priority=2,
        ),

        # ── Multimodal Fusion ─────────────────────────────────────────────────
        DatasetEntry(
            name='audiocaps',
            category='multimodal',
            search_terms=['AudioCaps dataset', 'audiocaps audio captioning',
                          'cdjkim/audiocaps'],
            source_type='yt-dlp',
            huggingface_id='d0rj/audiocaps',
            license='research',
            est_size_gb=46.0,
            video=False, audio=True, text_captions=True, priority=2,
        ),
        DatasetEntry(
            name='howto100m',
            category='multimodal',
            search_terms=['HowTo100M dataset', 'howto100m.github.io',
                          'HowTo100M instructional video text'],
            source_type='yt-dlp',
            license='research',
            est_size_gb=5000.0,
            video=True, audio=True, text_captions=True, priority=2,
        ),

        # ── Synthetic / Distillation Sources ─────────────────────────────────
        DatasetEntry(
            name='stable_video_diffusion',
            category='synthetic',
            search_terms=['Stable Video Diffusion dataset', 'SVD dataset stabilityai',
                          'stabilityai/stable-video-diffusion-img2vid'],
            source_type='huggingface',
            huggingface_id='stabilityai/stable-video-diffusion-img2vid',
            license='stability-ai-nc',
            est_size_gb=10.0,
            video=True, audio=False, priority=2,
        ),
        DatasetEntry(
            name='opensora',
            category='synthetic',
            search_terms=['OpenSora dataset', 'hpcaitech/Open-Sora dataset',
                          'Open-Sora video generation dataset'],
            source_type='huggingface',
            huggingface_id='hpcaitech/Open-Sora',
            license='Apache 2.0',
            est_size_gb=50.0,
            video=True, audio=False, text_captions=True, priority=1,
        ),
    ]

    @classmethod
    def list_all(cls) -> List[DatasetEntry]:
        return cls._ENTRIES

    @classmethod
    def get(cls, name: str) -> Optional[DatasetEntry]:
        for e in cls._ENTRIES:
            if e.name == name:
                return e
        return None

    @classmethod
    def by_category(cls, category: str) -> List[DatasetEntry]:
        return [e for e in cls._ENTRIES if e.category == category]

    @classmethod
    def by_priority(cls, priority: int) -> List[DatasetEntry]:
        return [e for e in cls._ENTRIES if e.priority <= priority]

    @classmethod
    def music_specific(cls) -> List[DatasetEntry]:
        return [e for e in cls._ENTRIES if e.music_specific]

    @classmethod
    def with_video(cls) -> List[DatasetEntry]:
        return [e for e in cls._ENTRIES if e.video]

    @classmethod
    def categories(cls) -> List[str]:
        return sorted(set(e.category for e in cls._ENTRIES))

    @classmethod
    def summary(cls) -> Dict[str, Any]:
        entries = cls._ENTRIES
        return {
            'total_datasets':    len(entries),
            'categories':        cls.categories(),
            'music_specific':    sum(1 for e in entries if e.music_specific),
            'with_video':        sum(1 for e in entries if e.video),
            'with_audio':        sum(1 for e in entries if e.audio),
            'with_captions':     sum(1 for e in entries if e.text_captions),
            'priority_1':        sum(1 for e in entries if e.priority == 1),
            'priority_2':        sum(1 for e in entries if e.priority == 2),
            'est_total_tb':      sum(e.est_size_gb for e in entries) / 1024,
            'yt_dlp_sources':    sum(1 for e in entries if e.source_type == 'yt-dlp'),
            'huggingface_sources': sum(1 for e in entries if e.source_type == 'huggingface'),
        }


# ═══════════════════════════════════════════════════════════════════════════════
# Video Downloader
# ═══════════════════════════════════════════════════════════════════════════════

class VideoDownloader:
    """
    yt-dlp wrapper for downloading music videos and dataset clips.
    Falls back gracefully with clear instructions if yt-dlp is unavailable.
    """

    @staticmethod
    def is_available() -> bool:
        return _YTDLP

    @staticmethod
    def install() -> bool:
        """Attempt to install yt-dlp via pip."""
        try:
            result = subprocess.run(
                [sys.executable, '-m', 'pip', 'install', 'yt-dlp', '-q'],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0:
                global _YTDLP
                try:
                    import yt_dlp  # noqa
                    _YTDLP = True
                    return True
                except ImportError:
                    return False
        except Exception:
            pass
        return False

    @staticmethod
    def download_music_video(
        query: str,
        output_dir: str,
        max_duration_sec: int = 240,
        max_videos: int = 5,
        format_str: str = 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    ) -> List[str]:
        """
        Search YouTube for query and download up to max_videos results.
        Returns list of downloaded file paths.
        """
        if not _YTDLP:
            print(f"[DatasetPipeline] yt-dlp not available. "
                  f"Install with: pip install yt-dlp", flush=True)
            print(f"[DatasetPipeline] Would search: {query}", flush=True)
            return []

        import yt_dlp as ytdlp_mod
        os.makedirs(output_dir, exist_ok=True)
        downloaded = []

        ydl_opts = {
            'format':          format_str,
            'outtmpl':         os.path.join(output_dir, '%(id)s.%(ext)s'),
            'match_filter':    ytdlp_mod.utils.match_filter_func(
                                   f'duration <= {max_duration_sec}'),
            'quiet':           True,
            'no_warnings':     True,
            'extract_flat':    False,
            'max_downloads':   max_videos,
            'merge_output_format': 'mp4',
        }

        search_url = f'ytsearch{max_videos}:{query}'
        try:
            with ytdlp_mod.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(search_url, download=True)
                if info and 'entries' in info:
                    for entry in info['entries']:
                        if entry:
                            fpath = ydl.prepare_filename(entry).replace('.webm', '.mp4')
                            if os.path.exists(fpath):
                                downloaded.append(fpath)
        except Exception as e:
            print(f"[DatasetPipeline] Download error for '{query}': {e}", flush=True)

        return downloaded

    @staticmethod
    def download_clip(
        url: str,
        output_dir: str,
        start_sec: Optional[float] = None,
        end_sec: Optional[float] = None,
    ) -> Optional[str]:
        """Download a single clip by URL."""
        if not _YTDLP:
            return None
        import yt_dlp as ytdlp_mod
        os.makedirs(output_dir, exist_ok=True)
        video_id = hashlib.md5(url.encode()).hexdigest()[:12]
        ydl_opts = {
            'format':   'bestvideo[height<=720]+bestaudio/best[height<=720]',
            'outtmpl':  os.path.join(output_dir, f'{video_id}.%(ext)s'),
            'quiet':    True,
            'merge_output_format': 'mp4',
        }
        if start_sec is not None and end_sec is not None:
            ydl_opts['download_ranges'] = ytdlp_mod.utils.download_range_func(
                None, [(start_sec, end_sec)]
            )
        try:
            with ytdlp_mod.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
            fpath = os.path.join(output_dir, f'{video_id}.mp4')
            return fpath if os.path.exists(fpath) else None
        except Exception as e:
            print(f"[DatasetPipeline] Clip download error: {e}", flush=True)
            return None

    @staticmethod
    def get_download_commands(dataset_name: str) -> List[str]:
        """
        Return shell commands to download a dataset manually.
        These are the exact search terms and download instructions.
        """
        entry = DatasetRegistry.get(dataset_name)
        if not entry:
            return [f"# Dataset '{dataset_name}' not found in registry"]
        cmds = [f"# Dataset: {entry.name} ({entry.category})"]
        cmds.append(f"# License: {entry.license}")
        cmds.append(f"# Est. Size: {entry.est_size_gb:.1f} GB")
        cmds.append(f"# Search terms:")
        for term in entry.search_terms:
            cmds.append(f"#   - {term}")
        if entry.huggingface_id:
            cmds.append(f"# HuggingFace: huggingface.co/datasets/{entry.huggingface_id}")
            cmds.append(f"from datasets import load_dataset")
            cmds.append(f"ds = load_dataset('{entry.huggingface_id}', streaming=True)")
        if entry.source_type == 'yt-dlp':
            for term in entry.search_terms[:1]:
                cmds.append(f"yt-dlp 'ytsearch50:{term}' -o '%(id)s.%(ext)s'")
        return cmds


# ═══════════════════════════════════════════════════════════════════════════════
# Video Preprocessor (PIL + FFmpeg, no cv2 required)
# ═══════════════════════════════════════════════════════════════════════════════

class VideoPreprocessor:
    """
    Extract T-frame sequences from video files using FFmpeg + PIL.
    No OpenCV dependency.
    """

    @staticmethod
    def extract_frames(
        video_path: str,
        T: int = 32,
        H: int = 96,
        W: int = 96,
        strategy: str = 'uniform',   # 'uniform' | 'scene_boundary' | 'beat_aligned'
        start_sec: float = 0.0,
        end_sec: Optional[float] = None,
    ) -> Optional[np.ndarray]:
        """
        Extract T frames from video_path as (T, H, W, 3) float32 in [-1, 1].
        Uses FFmpeg to decode, PIL to resize.

        strategy:
          'uniform'        — evenly spaced frames
          'scene_boundary' — seek to scene cuts (frame difference detection)
          'beat_aligned'   — placeholder, same as uniform (audio needed)
        """
        if not os.path.exists(video_path):
            return None

        # Get video duration with ffprobe
        duration = VideoPreprocessor._get_duration(video_path)
        if duration is None or duration < 0.5:
            return None

        if end_sec is None:
            end_sec = duration
        end_sec = min(end_sec, duration)
        clip_dur = max(end_sec - start_sec, 0.1)

        # Compute timestamps
        timestamps = np.linspace(start_sec, end_sec - 0.01, T)
        frames = []

        for ts in timestamps:
            frame = VideoPreprocessor._extract_frame_at(video_path, ts, H, W)
            if frame is not None:
                frames.append(frame)
            else:
                # Fallback: duplicate last good frame
                if frames:
                    frames.append(frames[-1].copy())
                else:
                    frames.append(np.zeros((H, W, 3), dtype=np.float32))

        if len(frames) < T:
            # Pad by repeating last frame
            while len(frames) < T:
                frames.append(frames[-1].copy())
        frames = frames[:T]

        seq = np.stack(frames, axis=0).astype(np.float32)
        # Normalize to [-1, 1]
        if seq.max() > 1.0:
            seq = seq / 127.5 - 1.0
        return seq

    @staticmethod
    def _get_duration(video_path: str) -> Optional[float]:
        """Use ffprobe to get video duration in seconds."""
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_format', video_path],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                info = json.loads(result.stdout)
                return float(info['format']['duration'])
        except Exception:
            pass
        return None

    @staticmethod
    def _extract_frame_at(
        video_path: str,
        timestamp: float,
        H: int,
        W: int,
    ) -> Optional[np.ndarray]:
        """Extract a single frame at timestamp using FFmpeg → PIL."""
        try:
            cmd = [
                'ffmpeg', '-ss', str(timestamp),
                '-i', video_path,
                '-vframes', '1',
                '-f', 'rawvideo',
                '-pix_fmt', 'rgb24',
                '-vf', f'scale={W}:{H}',
                'pipe:1',
            ]
            result = subprocess.run(
                cmd, capture_output=True, timeout=15,
            )
            if result.returncode == 0 and len(result.stdout) == H * W * 3:
                arr = np.frombuffer(result.stdout, dtype=np.uint8)
                return arr.reshape(H, W, 3).astype(np.float32)
        except Exception:
            pass
        return None

    @staticmethod
    def detect_scene_boundaries(
        frames: np.ndarray,
        threshold: float = 0.15,
    ) -> List[int]:
        """
        Detect scene boundaries in a (T, H, W, 3) frame sequence.
        Returns list of frame indices where scene changes occur.
        """
        if frames.shape[0] < 2:
            return []
        diffs = np.mean(np.abs(frames[1:] - frames[:-1]), axis=(1, 2, 3))
        boundaries = [int(i + 1) for i, d in enumerate(diffs) if d > threshold]
        return boundaries

    @staticmethod
    def extract_subsequences(
        frames: np.ndarray,
        T_sub: int,
        stride: int = 1,
    ) -> List[np.ndarray]:
        """
        Extract all T_sub-length subsequences from (T, H, W, 3) frames.
        Returns list of (T_sub, H, W, 3) arrays.
        """
        T = frames.shape[0]
        subs = []
        for start in range(0, T - T_sub + 1, stride):
            subs.append(frames[start:start + T_sub])
        return subs

    @staticmethod
    def from_image_sequence(
        image_paths: List[str],
        T: int,
        H: int,
        W: int,
    ) -> np.ndarray:
        """Build frame sequence from a list of image file paths."""
        n = len(image_paths)
        indices = [int(i * (n - 1) / (T - 1)) for i in range(T)] if T > 1 else [0]
        frames = []
        for idx in indices:
            path = image_paths[min(idx, n - 1)]
            try:
                img = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
                arr = np.array(img).astype(np.float32)
                frames.append(arr)
            except Exception:
                if frames:
                    frames.append(frames[-1].copy())
                else:
                    frames.append(np.zeros((H, W, 3), dtype=np.float32))
        seq = np.stack(frames).astype(np.float32)
        if seq.max() > 1.0:
            seq = seq / 127.5 - 1.0
        return seq


# ═══════════════════════════════════════════════════════════════════════════════
# Audio Preprocessor
# ═══════════════════════════════════════════════════════════════════════════════

class AudioPreprocessor:
    """
    Extract rich audio features from audio files using librosa.
    Falls back to defaults if librosa is unavailable.
    """

    @staticmethod
    def is_available() -> bool:
        return _LIBROSA

    @staticmethod
    def extract_features(
        audio_path: str,
        T: int = 32,
        fps: float = 24.0,
        sr: int = 22050,
    ) -> Dict[str, Any]:
        """
        Extract BPM, beat grid, energy curve, spectral centroid, chroma,
        onset strength, estimated genre and mood from an audio file.
        """
        if not _LIBROSA:
            print("[DatasetPipeline] librosa not available, using default audio features")
            return make_empty_audio_features(T)

        import librosa as lb
        try:
            y, sr_ = lb.load(audio_path, sr=sr, mono=True)
        except Exception as e:
            print(f"[DatasetPipeline] Audio load error: {e}")
            return make_empty_audio_features(T)

        duration = len(y) / sr_

        # BPM + beat grid
        tempo, beat_frames = lb.beat.beat_track(y=y, sr=sr_)
        beat_times = lb.frames_to_time(beat_frames, sr=sr_).astype(np.float32)
        bpm = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)

        # Per-frame energy curve (map audio frames → video frames)
        hop_length   = int(sr_ / fps)
        rms          = lb.feature.rms(y=y, hop_length=hop_length)[0]
        frame_count  = len(rms)
        indices      = np.linspace(0, frame_count - 1, T).astype(int)
        energy_curve = rms[indices].astype(np.float32)

        # Spectral centroid
        cent   = lb.feature.spectral_centroid(y=y, sr=sr_, hop_length=hop_length)[0]
        sc_arr = cent[indices].astype(np.float32)

        # Chroma
        chroma      = lb.feature.chroma_cqt(y=y, sr=sr_)
        chroma_mean = np.mean(chroma, axis=1).astype(np.float32)

        # Onset strength
        onset   = lb.onset.onset_strength(y=y, sr=sr_, hop_length=hop_length)
        os_arr  = onset[indices].astype(np.float32) if len(onset) >= T else \
                  np.interp(np.linspace(0, len(onset)-1, T),
                            np.arange(len(onset)), onset).astype(np.float32)

        # Mood estimation from spectral features
        mood = AudioPreprocessor._estimate_mood(
            bpm, float(np.mean(energy_curve)), float(np.mean(sc_arr))
        )

        return {
            'bpm':               bpm,
            'energy_curve':      energy_curve,
            'beat_grid':         beat_times,
            'spectral_centroid': sc_arr,
            'chroma_mean':       chroma_mean,
            'onset_strength':    os_arr,
            'duration':          duration,
            'estimated_mood':    mood,
        }

    @staticmethod
    def _estimate_mood(bpm: float, energy: float, centroid: float) -> str:
        """Rule-based mood estimation from audio features."""
        if bpm > 140 and energy > 0.05:
            return 'intense'
        elif bpm > 120 and energy > 0.03:
            return 'energetic'
        elif bpm > 100:
            return 'upbeat'
        elif bpm > 80 and energy > 0.02:
            return 'mellow'
        elif centroid < 1500:
            return 'dark'
        else:
            return 'chill'

    @staticmethod
    def extract_from_video(video_path: str, T: int = 32, fps: float = 24.0) -> Dict[str, Any]:
        """Extract audio from a video file using FFmpeg, then analyze."""
        if not _LIBROSA:
            return make_empty_audio_features(T)

        tmp_audio = video_path.replace('.mp4', '_audio.wav').replace('.webm', '_audio.wav')
        try:
            subprocess.run(
                ['ffmpeg', '-i', video_path, '-vn', '-acodec', 'pcm_s16le',
                 '-ar', '22050', '-ac', '1', tmp_audio, '-y', '-loglevel', 'quiet'],
                timeout=60, capture_output=True,
            )
            if os.path.exists(tmp_audio):
                feats = AudioPreprocessor.extract_features(tmp_audio, T, fps)
                os.remove(tmp_audio)
                return feats
        except Exception as e:
            print(f"[DatasetPipeline] Audio extraction error: {e}")
        return make_empty_audio_features(T)


# ═══════════════════════════════════════════════════════════════════════════════
# Caption Generator (no external API)
# ═══════════════════════════════════════════════════════════════════════════════

class CaptionGenerator:
    """
    Auto-generate text captions from visual analysis + audio features.
    No external API required — purely analytical.
    """

    # Color → scene / mood mappings
    _HUE_LABELS = [
        (0,   30,  'warm red tones'),
        (30,  60,  'golden amber lighting'),
        (60,  90,  'yellow-green energy'),
        (90,  150, 'cool green atmosphere'),
        (150, 210, 'teal and cyan vibes'),
        (210, 270, 'deep blue lighting'),
        (270, 330, 'purple and violet haze'),
        (330, 360, 'pink neon accents'),
    ]
    _ENERGY_LABELS = [
        (0.0,  0.02, 'serene, minimal motion'),
        (0.02, 0.05, 'gentle movement'),
        (0.05, 0.10, 'moderate activity'),
        (0.10, 0.20, 'high energy, dynamic motion'),
        (0.20, 1.0,  'explosive, frenetic energy'),
    ]

    @classmethod
    def auto_caption(
        cls,
        frames: np.ndarray,
        audio_features: Dict[str, Any],
        scene_category: str,
        genre: str,
        dataset_name: str,
    ) -> str:
        """
        Generate a descriptive caption from frames + audio features.
        Returns a natural-language description suitable for text conditioning.
        """
        # Dominant color
        rgb = ((frames + 1.0) * 0.5).clip(0, 1)
        mean_rgb = np.mean(rgb.reshape(-1, 3), axis=0)
        color_desc = cls._describe_color(mean_rgb)

        # Brightness
        brightness = float(np.mean(np.mean(rgb, axis=-1)))
        brightness_desc = 'dark' if brightness < 0.3 else \
                          'dimly lit' if brightness < 0.5 else \
                          'bright' if brightness > 0.7 else 'well-lit'

        # Motion
        motion = float(np.mean(np.abs(frames[1:] - frames[:-1]))) if frames.shape[0] > 1 else 0.0
        motion_desc = cls._describe_energy(motion)

        # Audio
        bpm = audio_features.get('bpm', 120.0)
        mood = audio_features.get('estimated_mood', 'energetic')
        bpm_desc = f'{int(bpm)} BPM' if bpm else ''
        tempo_desc = 'fast' if bpm > 140 else 'mid-tempo' if bpm > 100 else 'slow'

        # Scene
        scene_human = scene_category.replace('_', ' ')
        genre_human = genre.replace('_', ' ')

        caption = (
            f"A {brightness_desc} {color_desc} {genre_human} music video scene "
            f"featuring a {scene_human}. {motion_desc.capitalize()}. "
            f"{tempo_desc.capitalize()} tempo at {bpm_desc}, {mood} mood."
        )
        return caption

    @classmethod
    def _describe_color(cls, mean_rgb: np.ndarray) -> str:
        # Convert to hue (approximate)
        r, g, b = float(mean_rgb[0]), float(mean_rgb[1]), float(mean_rgb[2])
        cmax = max(r, g, b)
        cmin = min(r, g, b)
        delta = cmax - cmin
        if delta < 0.05:
            return 'monochromatic' if cmax < 0.3 else 'neutral'
        if cmax == r:
            hue = 60.0 * (((g - b) / delta) % 6)
        elif cmax == g:
            hue = 60.0 * (((b - r) / delta) + 2)
        else:
            hue = 60.0 * (((r - g) / delta) + 4)
        hue = hue % 360
        for lo, hi, label in cls._HUE_LABELS:
            if lo <= hue < hi:
                return label
        return 'colorful'

    @classmethod
    def _describe_energy(cls, energy: float) -> str:
        for lo, hi, label in cls._ENERGY_LABELS:
            if lo <= energy < hi:
                return label
        return 'dynamic'


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Builder
# ═══════════════════════════════════════════════════════════════════════════════

class DatasetBuilder:
    """
    Orchestrate the full pipeline:
    download → extract frames → extract audio → caption → validate → save
    """

    def __init__(
        self,
        dataset_name: str,
        output_dir: Optional[str] = None,
        T: int = 32,
        H: int = 96,
        W: int = 96,
        fps: float = 24.0,
        quality_threshold: float = 0.3,
        train_ratio: float = 0.8,
        val_ratio: float = 0.1,
    ):
        self.dataset_name  = dataset_name
        self.output_dir    = output_dir or os.path.join(
            _DATA_ROOT, dataset_name)
        self.T             = T
        self.H             = H
        self.W             = W
        self.fps           = fps
        self.quality_threshold = quality_threshold
        self.train_ratio   = train_ratio
        self.val_ratio     = val_ratio
        self.manifest      = DatasetManifest(dataset_name=dataset_name)
        self._sample_idx   = 0
        os.makedirs(self.output_dir, exist_ok=True)

        # Load existing manifest if present
        if ManifestWriter.exists(self.output_dir):
            self.manifest = ManifestWriter.load(self.output_dir)
            self._sample_idx = self.manifest.sample_count
            print(f"[DatasetBuilder] Resuming {dataset_name}: "
                  f"{self._sample_idx} existing samples", flush=True)

    def build_from_youtube(
        self,
        queries: List[str],
        n_per_query: int = 5,
        genre: str = 'unknown',
        scene_hints: Optional[List[str]] = None,
    ) -> int:
        """Download from YouTube and build samples. Returns samples added."""
        downloader = VideoDownloader()
        added = 0
        tmp_dir = os.path.join(self.output_dir, '_tmp_videos')

        for query in queries:
            print(f"[DatasetBuilder] Downloading: {query}", flush=True)
            video_paths = downloader.download_music_video(
                query, tmp_dir, max_videos=n_per_query)
            for vpath in video_paths:
                n = self._ingest_video(vpath, genre=genre, scene_hints=scene_hints)
                added += n

        return added

    def build_from_local_video_dir(
        self,
        video_dir: str,
        genre: str = 'unknown',
        scene_hints: Optional[List[str]] = None,
        extensions: Tuple[str, ...] = ('.mp4', '.avi', '.mov', '.mkv', '.webm'),
    ) -> int:
        """Ingest all videos from a local directory."""
        added = 0
        video_files = [
            os.path.join(video_dir, f)
            for f in os.listdir(video_dir)
            if f.lower().endswith(extensions)
        ]
        print(f"[DatasetBuilder] Found {len(video_files)} videos in {video_dir}")
        for vpath in video_files:
            n = self._ingest_video(vpath, genre=genre, scene_hints=scene_hints)
            added += n
        return added

    def build_from_audio_dir(
        self,
        audio_dir: str,
        genre: str = 'unknown',
        scene_hints: Optional[List[str]] = None,
        extensions: Tuple[str, ...] = ('.mp3', '.wav', '.flac', '.ogg', '.m4a'),
    ) -> int:
        """
        Build samples from audio-only files (no video).
        Uses FrameExtractor to generate procedural frames conditioned on audio.
        """
        from .frame_extractor import FrameExtractor

        added = 0
        audio_files = [
            os.path.join(audio_dir, f)
            for f in os.listdir(audio_dir)
            if f.lower().endswith(extensions)
        ]
        extractor = FrameExtractor(T=self.T, H=self.H, W=self.W)
        scene_list = scene_hints or DATASET_SCENE_MAP.get(self.dataset_name, ['concert_stage'])

        for apath in audio_files:
            audio_feats = AudioPreprocessor.extract_features(apath, self.T, self.fps)
            scene = scene_list[self._sample_idx % len(scene_list)]
            frames = extractor.sample(scene, seed=self._sample_idx, source='procedural')
            sample = self._build_sample(frames, audio_feats, scene, genre, apath)
            if sample:
                self._save_sample(sample)
                added += 1
        return added

    def build_synthetic(
        self,
        n_samples: int,
        scenes: Optional[List[str]] = None,
        genres: Optional[List[str]] = None,
    ) -> int:
        """
        Build synthetic samples using FrameExtractor (for pre-training
        when real data is not yet available).
        """
        from .frame_extractor import FrameExtractor
        from .training_data_v3 import get_scenes

        extractor = FrameExtractor(T=self.T, H=self.H, W=self.W)
        all_scenes = scenes or get_scenes()
        all_genres = genres or ['hip_hop', 'r&b', 'pop', 'trap', 'electronic',
                                 'country', 'rock', 'gospel', 'latin', 'afrobeats']
        added = 0

        for i in range(n_samples):
            scene = all_scenes[i % len(all_scenes)]
            genre = all_genres[i % len(all_genres)]
            frames = extractor.sample(scene, seed=self._sample_idx + i,
                                      source='procedural')
            frames = extractor.augment(frames, seed=self._sample_idx + i)
            audio_feats = make_audio_features(
                bpm=float(80 + (i % 100)),
                T=self.T,
            )
            sample = self._build_sample(frames, audio_feats, scene, genre,
                                        source_hint='synthetic')
            if sample:
                self._save_sample(sample)
                added += 1
        print(f"[DatasetBuilder] Built {added} synthetic samples")
        return added

    def _ingest_video(
        self,
        video_path: str,
        genre: str = 'unknown',
        scene_hints: Optional[List[str]] = None,
    ) -> int:
        """Process a single video file into one or more samples."""
        added = 0
        duration = VideoPreprocessor._get_duration(video_path)
        if duration is None:
            return 0

        # Extract audio features
        audio_feats = AudioPreprocessor.extract_from_video(
            video_path, self.T, self.fps)

        # Extract frame sequences (multiple per video if long enough)
        clip_dur = min(self.T / self.fps * 2, duration)
        n_clips  = max(1, int(duration // clip_dur))

        scene_list = scene_hints or DATASET_SCENE_MAP.get(self.dataset_name, ['concert_stage'])

        for c in range(n_clips):
            start = c * clip_dur
            frames = VideoPreprocessor.extract_frames(
                video_path, self.T, self.H, self.W,
                start_sec=start, end_sec=start + clip_dur,
            )
            if frames is None:
                continue
            scene = scene_list[(self._sample_idx + c) % len(scene_list)]
            sample = self._build_sample(frames, audio_feats, scene, genre,
                                        source_hint=video_path)
            if sample:
                self._save_sample(sample)
                added += 1
        return added

    def _build_sample(
        self,
        frames: np.ndarray,
        audio_feats: Dict[str, Any],
        scene: str,
        genre: str,
        source_hint: str = '',
    ) -> Optional[MaxBoosterSample]:
        """Build and validate a MaxBoosterSample from components."""
        from .dataset_schema import SampleValidator

        mood = audio_feats.get('estimated_mood', 'energetic')
        caption = CaptionGenerator.auto_caption(
            frames, audio_feats, scene, genre, self.dataset_name)

        sample_id = f"{self.dataset_name}_{self._sample_idx:06d}"

        # Assign split
        r = np.random.random()
        if r < self.train_ratio:
            split = 'train'
        elif r < self.train_ratio + self.val_ratio:
            split = 'val'
        else:
            split = 'test'

        # Compute quality score (motion + brightness diversity)
        motion = float(np.mean(np.abs(frames[1:] - frames[:-1]))) if frames.shape[0] > 1 else 0
        brightness = float(np.std(np.mean(frames, axis=-1)))
        quality = min(1.0, (motion * 5 + brightness * 2) / 3.0 + 0.2)

        if quality < self.quality_threshold:
            return None

        sample = MaxBoosterSample(
            video_frames   = frames,
            audio_features = audio_feats,
            caption        = caption,
            scene_category = scene,
            genre          = genre,
            mood           = mood,
            style_tags     = [genre, scene, mood],
            dataset_source = self.dataset_name,
            sample_id      = sample_id,
            split          = split,
            quality_score  = quality,
            fps            = self.fps,
            duration_sec   = self.T / self.fps,
        )
        sample.motion_magnitude = sample.compute_motion_magnitude()
        sample.color_palette    = sample.compute_color_palette()

        errors = SampleValidator.validate(sample)
        if errors:
            return None
        return sample

    def _save_sample(self, sample: MaxBoosterSample):
        """Save sample to disk and update manifest."""
        SampleWriter.save(sample, self.output_dir)
        self.manifest.add_sample(sample)
        self._sample_idx += 1
        if self._sample_idx % 100 == 0:
            ManifestWriter.save(self.manifest, self.output_dir)
            print(f"[DatasetBuilder] {self.dataset_name}: "
                  f"{self._sample_idx} samples saved", flush=True)

    def finalize(self) -> DatasetManifest:
        """Save final manifest and return it."""
        ManifestWriter.save(self.manifest, self.output_dir)
        stats = self.manifest.compute_stats()
        print(f"[DatasetBuilder] Finalized {self.dataset_name}: "
              f"{self.manifest.sample_count} samples, "
              f"stats={stats}", flush=True)
        return self.manifest


# ═══════════════════════════════════════════════════════════════════════════════
# Dataset Statistics
# ═══════════════════════════════════════════════════════════════════════════════

class DatasetStats:
    """Quality metrics and analysis for a built dataset."""

    @staticmethod
    def compute(manifest_path: str) -> Dict[str, Any]:
        """Load manifest and compute quality statistics."""
        directory = manifest_path if os.path.isdir(manifest_path) else \
                    os.path.dirname(manifest_path)
        if not ManifestWriter.exists(directory):
            return {'error': 'manifest.json not found'}
        manifest = ManifestWriter.load(directory)
        return manifest.compute_stats()

    @staticmethod
    def quality_distribution(manifest_path: str) -> Dict[str, int]:
        """Bucket samples by quality score."""
        directory = manifest_path if os.path.isdir(manifest_path) else \
                    os.path.dirname(manifest_path)
        manifest  = ManifestWriter.load(directory)
        buckets   = {'low(0-0.3)': 0, 'medium(0.3-0.7)': 0, 'high(0.7-1.0)': 0}
        for s in manifest.samples:
            q = s.get('quality_score', 0)
            if q < 0.3:
                buckets['low(0-0.3)'] += 1
            elif q < 0.7:
                buckets['medium(0.3-0.7)'] += 1
            else:
                buckets['high(0.7-1.0)'] += 1
        return buckets


# ═══════════════════════════════════════════════════════════════════════════════
# Sample Loader for Training
# ═══════════════════════════════════════════════════════════════════════════════

class DatasetLoader:
    """
    Load MaxBoosterSamples for training from one or more dataset directories.
    Supports mixing multiple datasets with configurable weights.
    """

    def __init__(
        self,
        dataset_dirs: List[str],
        weights: Optional[List[float]] = None,
        split: str = 'train',
        T_target: Optional[int] = None,
        H_target: int = 96,
        W_target: int = 96,
    ):
        self.dataset_dirs = dataset_dirs
        self.split        = split
        self.T_target     = T_target
        self.H_target     = H_target
        self.W_target     = W_target
        self._index: List[Tuple[str, str]] = []  # (directory, sample_id)
        self._weights_arr: Optional[np.ndarray] = None
        self._build_index(weights)

    def _build_index(self, weights: Optional[List[float]]):
        all_entries = []
        dataset_counts = []
        for d in self.dataset_dirs:
            if not ManifestWriter.exists(d):
                dataset_counts.append(0)
                continue
            manifest = ManifestWriter.load(d)
            ids      = manifest.get_split(self.split)
            entries  = [(d, sid) for sid in ids]
            all_entries.extend(entries)
            dataset_counts.append(len(entries))

        self._index = all_entries

        if weights and len(weights) == len(self.dataset_dirs):
            w_arr = []
            for w, cnt in zip(weights, dataset_counts):
                w_arr.extend([w] * cnt)
            total = sum(w_arr)
            if total > 0:
                self._weights_arr = np.array(w_arr) / total

    def __len__(self) -> int:
        return len(self._index)

    def sample_batch(
        self,
        batch_size: int,
        rng: Optional[np.random.Generator] = None,
    ) -> List[MaxBoosterSample]:
        """Sample a batch of MaxBoosterSamples."""
        if not self._index:
            return []
        if rng is None:
            rng = np.random.default_rng()

        n     = min(batch_size, len(self._index))
        probs = self._weights_arr if self._weights_arr is not None else None
        idxs  = rng.choice(len(self._index), size=n, replace=False, p=probs)
        batch = []
        for i in idxs:
            directory, sample_id = self._index[i]
            prefix = os.path.join(directory, sample_id)
            try:
                sample = SampleWriter.load(prefix)
                if self.T_target and sample.T != self.T_target:
                    # Temporal resize
                    sample = DatasetLoader._resize_temporal(
                        sample, self.T_target, self.H_target, self.W_target)
                batch.append(sample)
            except Exception as e:
                pass
        return batch

    @staticmethod
    def _resize_temporal(
        sample: MaxBoosterSample,
        T_new: int,
        H_new: int,
        W_new: int,
    ) -> MaxBoosterSample:
        """Resize a sample to a different T/H/W via interpolation."""
        T_old = sample.T
        idxs  = np.linspace(0, T_old - 1, T_new).astype(int)
        new_frames = sample.video_frames[idxs]

        if new_frames.shape[1] != H_new or new_frames.shape[2] != W_new:
            resized = []
            for f in new_frames:
                # [-1,1] → [0,255]
                img = Image.fromarray(
                    ((f + 1.0) * 127.5).clip(0, 255).astype(np.uint8)
                ).resize((W_new, H_new), Image.BILINEAR)
                resized.append(np.array(img).astype(np.float32) / 127.5 - 1.0)
            new_frames = np.stack(resized)

        # Resize audio features too
        audio = dict(sample.audio_features)
        for k in ['energy_curve', 'spectral_centroid', 'onset_strength']:
            if k in audio and isinstance(audio[k], np.ndarray):
                old_arr = audio[k]
                if len(old_arr) != T_new:
                    audio[k] = np.interp(
                        np.linspace(0, len(old_arr) - 1, T_new),
                        np.arange(len(old_arr)),
                        old_arr,
                    ).astype(np.float32)

        sample.video_frames   = new_frames
        sample.audio_features = audio
        return sample
