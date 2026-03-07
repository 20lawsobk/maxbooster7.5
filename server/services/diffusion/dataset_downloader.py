"""
Pocket Dimension Dataset Downloader
Downloads all training datasets into /home/runner/workspace/data/training_datasets/
Uses HuggingFace streaming, direct HTTP, and yt-dlp based on source type.
"""

import os
import sys
import json
import time
import shutil
import hashlib
import zipfile
import tarfile
import threading
import subprocess
import urllib.request
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional

BASE_DIR   = Path("/home/runner/workspace/data/training_datasets")
STATUS_FILE = BASE_DIR / ".download_status.json"
LOG_FILE    = BASE_DIR / ".download_log.txt"
DISK_RESERVE_GB = 20          # keep 20GB free as buffer
MAX_DISK_GB     = 249         # workspace capacity

# ─────────────────────────────────────────────────────────────────────────────
# Download plan — ordered by priority + feasibility
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DownloadTask:
    name:        str
    method:      str           # 'huggingface' | 'http' | 'ytdlp'
    source:      str           # HF id, URL, or search terms
    est_gb:      float
    music:       bool = True
    priority:    int  = 2      # 1=high 2=med 3=low
    extra:       dict = field(default_factory=dict)


DOWNLOAD_PLAN: List[DownloadTask] = [

    # ── Tier 1: Small, fully automatable, high music value ───────────────────
    DownloadTask('gtzan',       'huggingface', 'marsyas/gtzan',
                 est_gb=1.5, music=True, priority=1,
                 extra={'hf_method': 'snapshot', 'ignore_patterns': ['*.bin', '*.pt']}),

    DownloadTask('fma_metadata','http',
                 'https://os.unil.cloud.switch.ch/fma/fma_metadata.zip',
                 est_gb=0.35, music=True, priority=1),

    DownloadTask('fma_small',   'http',
                 'https://os.unil.cloud.switch.ch/fma/fma_small.zip',
                 est_gb=8.0, music=True, priority=1),

    DownloadTask('ucf101',      'huggingface', 'sayakpaul/ucf101-subset',
                 est_gb=6.5, music=False, priority=1,
                 extra={'hf_method': 'snapshot', 'ignore_patterns': ['*.bin', '*.pt']}),

    DownloadTask('maestro',     'huggingface', 'roszcz/maestro-v1-sustain',
                 est_gb=8.0, music=True, priority=1),

    # ── Tier 2: Medium — direct HTTP ─────────────────────────────────────────
    DownloadTask('fma_medium',  'http',
                 'https://os.unil.cloud.switch.ch/fma/fma_medium.zip',
                 est_gb=22.0, music=True, priority=2),

    DownloadTask('hmdb51',      'http',
                 'https://serre-lab.clps.brown.edu/wp-content/uploads/2013/10/hmdb51_org.rar',
                 est_gb=2.0, music=False, priority=2),

    # ── Tier 3: HuggingFace streaming — variable size ────────────────────────
    DownloadTask('audiocaps',   'huggingface', 'd0rj/audiocaps',
                 est_gb=2.0, music=True, priority=2),

    DownloadTask('musiccaps',   'huggingface', 'google/MusicCaps',
                 est_gb=0.1, music=True, priority=1,
                 extra={'max_rows': 5000}),

    DownloadTask('vggsound_meta', 'huggingface', 'Loie/VGGSound',
                 est_gb=0.5, music=True, priority=2,
                 extra={'hf_method': 'snapshot', 'ignore_patterns': ['*.bin', '*.pt', '*.mp4']}),

    # ── Tier 4: yt-dlp — music subsets only ──────────────────────────────────
    DownloadTask('musicav_ytdlp', 'ytdlp',
                 'musical instrument performance concert live',
                 est_gb=5.0, music=True, priority=2,
                 extra={'max_clips': 200, 'duration': 10}),

    DownloadTask('concert_ytdlp', 'ytdlp',
                 'live concert performance stage 4k',
                 est_gb=5.0, music=True, priority=3,
                 extra={'max_clips': 150, 'duration': 15}),

    DownloadTask('beatdance_ytdlp', 'ytdlp',
                 'dance choreography music synchronized beat',
                 est_gb=5.0, music=True, priority=3,
                 extra={'max_clips': 150, 'duration': 10}),

    DownloadTask('genrevis_ytdlp', 'ytdlp',
                 'music video hip hop trap aesthetics visualizer',
                 est_gb=5.0, music=True, priority=2,
                 extra={'max_clips': 200, 'duration': 10}),

    # ── Tier 5: FMA large (if space allows) ──────────────────────────────────
    DownloadTask('fma_large',   'http',
                 'https://os.unil.cloud.switch.ch/fma/fma_large.zip',
                 est_gb=93.0, music=True, priority=3),
]


# ─────────────────────────────────────────────────────────────────────────────
# Status tracking
# ─────────────────────────────────────────────────────────────────────────────

class DownloadStatus:
    def __init__(self):
        BASE_DIR.mkdir(parents=True, exist_ok=True)
        self.data: Dict = self._load()

    def _load(self) -> Dict:
        if STATUS_FILE.exists():
            try:
                return json.loads(STATUS_FILE.read_text())
            except Exception:
                pass
        return {'tasks': {}, 'started_at': datetime.utcnow().isoformat(), 'total_bytes': 0}

    def save(self):
        STATUS_FILE.write_text(json.dumps(self.data, indent=2, default=str))

    def mark_started(self, name: str):
        self.data['tasks'][name] = {'status': 'downloading', 'started': datetime.utcnow().isoformat()}
        self.save()

    def mark_done(self, name: str, bytes_stored: int, path: str):
        self.data['tasks'][name] = {
            'status': 'complete',
            'bytes': bytes_stored,
            'path': str(path),
            'finished': datetime.utcnow().isoformat(),
        }
        self.data['total_bytes'] = self.data.get('total_bytes', 0) + bytes_stored
        self.save()

    def mark_failed(self, name: str, reason: str):
        self.data['tasks'][name] = {'status': 'failed', 'reason': reason}
        self.save()

    def mark_skipped(self, name: str, reason: str):
        self.data['tasks'][name] = {'status': 'skipped', 'reason': reason}
        self.save()

    def is_done(self, name: str) -> bool:
        return self.data['tasks'].get(name, {}).get('status') == 'complete'

    def is_failed(self, name: str) -> bool:
        return self.data['tasks'].get(name, {}).get('status') == 'failed'


# ─────────────────────────────────────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.utcnow().strftime('%H:%M:%S')
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def free_gb() -> float:
    st = shutil.disk_usage(BASE_DIR)
    return st.free / (1024 ** 3)


def used_gb() -> float:
    st = shutil.disk_usage(BASE_DIR)
    return st.used / (1024 ** 3)


def dir_size_bytes(path: Path) -> int:
    total = 0
    if path.is_file():
        return path.stat().st_size
    for p in path.rglob('*'):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def can_fit(est_gb: float) -> bool:
    return free_gb() > est_gb + DISK_RESERVE_GB


# ─────────────────────────────────────────────────────────────────────────────
# Downloaders
# ─────────────────────────────────────────────────────────────────────────────

def download_http(task: DownloadTask, dest_dir: Path) -> int:
    dest_dir.mkdir(parents=True, exist_ok=True)
    url = task.source
    fname = url.split('/')[-1].split('?')[0] or 'download'
    dest_file = dest_dir / fname

    if dest_file.exists():
        log(f"  {task.name}: already on disk at {dest_file}")
        return dest_file.stat().st_size

    log(f"  {task.name}: downloading {url}")
    log(f"  {task.name}: est size {task.est_gb:.1f}GB — free {free_gb():.1f}GB")

    try:
        import requests as _requests
        with _requests.get(url, stream=True, timeout=60,
                           headers={'User-Agent': 'Mozilla/5.0'}) as r:
            r.raise_for_status()
            total = int(r.headers.get('content-length', 0))
            downloaded = 0
            last_log = 0
            with open(dest_file, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        gb = downloaded / 1e9
                        if gb - last_log >= 1.0:
                            pct = f"{100*downloaded/total:.0f}%" if total else "?"
                            log(f"  {task.name}: {gb:.1f}GB ({pct})")
                            last_log = gb
    except Exception as e:
        if dest_file.exists():
            dest_file.unlink()
        raise e

    size = dest_file.stat().st_size
    log(f"  {task.name}: downloaded {size / 1e9:.2f}GB — extracting...")
    extract(dest_file, dest_dir)
    return size


def extract(archive: Path, dest: Path):
    try:
        if archive.suffix == '.zip':
            with zipfile.ZipFile(archive) as z:
                z.extractall(dest)
            log(f"  extracted {archive.name}")
        elif archive.suffix in ('.tar', '.gz', '.bz2', '.xz') or archive.name.endswith('.tar.gz'):
            with tarfile.open(archive) as t:
                t.extractall(dest)
            log(f"  extracted {archive.name}")
        elif archive.suffix == '.rar':
            result = subprocess.run(['unrar', 'x', '-y', str(archive), str(dest)],
                                    capture_output=True, timeout=3600)
            if result.returncode != 0:
                log(f"  unrar failed (keeping archive): {result.stderr.decode()[:200]}")
    except Exception as e:
        log(f"  extraction warning: {e}")


def download_huggingface(task: DownloadTask, dest_dir: Path) -> int:
    dest_dir.mkdir(parents=True, exist_ok=True)
    manifest = dest_dir / 'manifest.jsonl'

    if manifest.exists():
        lines = len(manifest.read_text().strip().split('\n'))
        log(f"  {task.name}: already downloaded ({lines} records)")
        return dir_size_bytes(dest_dir)

    log(f"  {task.name}: streaming from HuggingFace ({task.source})")

    try:
        method = task.extra.get('hf_method', 'stream')

        if method == 'snapshot':
            return _hf_snapshot(task, dest_dir)

        from datasets import load_dataset
        import json as _json

        max_rows = task.extra.get('max_rows', None)
        filter_music = task.extra.get('filter_music', False)
        split = task.extra.get('split', 'train')

        try:
            ds = load_dataset(task.source, split=split, streaming=True)
        except Exception as stream_err:
            log(f"  {task.name}: streaming failed ({stream_err}) — falling back to snapshot")
            return _hf_snapshot(task, dest_dir)

        count = 0
        skipped = 0
        written = 0

        music_keywords = {'music', 'singing', 'guitar', 'piano', 'drum', 'bass',
                          'violin', 'saxophone', 'trumpet', 'song', 'rap',
                          'hip hop', 'jazz', 'rock', 'pop', 'classical',
                          'electronic', 'dance', 'beat', 'rhythm', 'melody'}

        with open(manifest, 'w') as f_out:
            for row in ds:
                if max_rows and count >= max_rows:
                    break

                if filter_music:
                    label = str(row.get('label', '') or row.get('caption', '') or
                                row.get('label_string', '') or row.get('category', '')).lower()
                    if not any(k in label for k in music_keywords):
                        skipped += 1
                        continue

                safe = {}
                for k, v in row.items():
                    if isinstance(v, (str, int, float, bool, type(None))):
                        safe[k] = v
                    elif isinstance(v, list) and all(isinstance(x, (str, int, float)) for x in v[:3]):
                        safe[k] = v
                    elif isinstance(v, dict):
                        safe[k] = {ik: iv for ik, iv in v.items()
                                   if isinstance(iv, (str, int, float, bool))}

                f_out.write(_json.dumps(safe) + '\n')
                written += 1
                count += 1

                if written % 1000 == 0:
                    log(f"  {task.name}: {written} records written...")

                if not can_fit(0.1):
                    log(f"  {task.name}: disk getting low, stopping at {written}")
                    break

        log(f"  {task.name}: {written} records (skipped {skipped} non-music)")
        return dir_size_bytes(dest_dir)

    except Exception as e:
        raise RuntimeError(f"HuggingFace download failed: {e}")


def _hf_snapshot(task: DownloadTask, dest_dir: Path) -> int:
    from huggingface_hub import snapshot_download
    log(f"  {task.name}: snapshot_download from {task.source}")
    ignore = task.extra.get('ignore_patterns', ['*.bin', '*.pt', '*.safetensors'])
    local = snapshot_download(
        repo_id=task.source,
        repo_type='dataset',
        local_dir=str(dest_dir),
        ignore_patterns=ignore,
    )
    size = dir_size_bytes(Path(local))
    log(f"  {task.name}: snapshot complete — {size / 1e9:.3f}GB")
    return size


def download_ytdlp(task: DownloadTask, dest_dir: Path) -> int:
    dest_dir.mkdir(parents=True, exist_ok=True)
    clips_dir = dest_dir / 'clips'
    clips_dir.mkdir(exist_ok=True)

    existing = list(clips_dir.glob('*.mp4')) + list(clips_dir.glob('*.webm'))
    max_clips = task.extra.get('max_clips', 100)
    duration  = task.extra.get('duration', 10)

    if len(existing) >= max_clips:
        log(f"  {task.name}: already have {len(existing)} clips")
        return dir_size_bytes(dest_dir)

    need = max_clips - len(existing)
    log(f"  {task.name}: downloading {need} clips (duration≤{duration}s) — query: {task.source[:60]}")

    try:
        import yt_dlp

        max_dur = duration * 3

        def _filter(info, *, incomplete=False):
            dur = info.get('duration')
            if dur and dur > max_dur:
                return f'duration {dur}s > max {max_dur}s'
            return None

        ydl_opts = {
            'format': 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]/best',
            'outtmpl': str(clips_dir / '%(id)s.%(ext)s'),
            'max_downloads': need,
            'match_filter': _filter,
            'quiet': True,
            'no_warnings': True,
            'ignoreerrors': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                ydl.extract_info(f'ytsearch{need}:{task.source}', download=True)
            except yt_dlp.utils.MaxDownloadsReached:
                pass

    except Exception as e:
        log(f"  {task.name}: yt-dlp warning: {e}")

    clips = list(clips_dir.glob('*.mp4')) + list(clips_dir.glob('*.webm'))
    log(f"  {task.name}: {len(clips)} clips on disk")
    return dir_size_bytes(dest_dir)


# ─────────────────────────────────────────────────────────────────────────────
# Main download loop
# ─────────────────────────────────────────────────────────────────────────────

def run_downloads(resume: bool = True):
    status = DownloadStatus()
    BASE_DIR.mkdir(parents=True, exist_ok=True)

    log("=" * 60)
    log("POCKET DIMENSION DATASET DOWNLOADER")
    log(f"Storage: {BASE_DIR}")
    log(f"Free: {free_gb():.1f}GB  Used: {used_gb():.1f}GB")
    log("=" * 60)

    plan = sorted(DOWNLOAD_PLAN, key=lambda t: (t.priority, t.est_gb))
    total_downloaded = 0
    total_tasks = len(plan)
    completed = 0
    skipped = 0
    failed = 0

    for task in plan:
        if resume and status.is_done(task.name):
            log(f"[SKIP] {task.name}: already complete")
            completed += 1
            continue

        if not can_fit(task.est_gb):
            reason = f"insufficient disk (need {task.est_gb:.1f}GB, free {free_gb():.1f}GB)"
            log(f"[SKIP] {task.name}: {reason}")
            status.mark_skipped(task.name, reason)
            skipped += 1
            continue

        dest = BASE_DIR / task.name
        log(f"\n[START] {task.name} ({task.method}, est {task.est_gb:.1f}GB)")
        status.mark_started(task.name)

        try:
            if task.method == 'http':
                bytes_stored = download_http(task, dest)
            elif task.method == 'huggingface':
                bytes_stored = download_huggingface(task, dest)
            elif task.method == 'ytdlp':
                bytes_stored = download_ytdlp(task, dest)
            else:
                raise ValueError(f"Unknown method: {task.method}")

            status.mark_done(task.name, bytes_stored, dest)
            total_downloaded += bytes_stored
            completed += 1
            log(f"[DONE] {task.name}: {bytes_stored / 1e9:.3f}GB stored — free: {free_gb():.1f}GB")

        except Exception as e:
            status.mark_failed(task.name, str(e))
            failed += 1
            log(f"[FAIL] {task.name}: {e}")

    log("\n" + "=" * 60)
    log("DOWNLOAD COMPLETE")
    log(f"  Completed : {completed}/{total_tasks}")
    log(f"  Skipped   : {skipped} (disk)")
    log(f"  Failed    : {failed}")
    log(f"  Downloaded: {total_downloaded / 1e9:.2f}GB")
    log(f"  Free now  : {free_gb():.1f}GB")
    log("=" * 60)

    status.data['finished_at'] = datetime.utcnow().isoformat()
    status.data['summary'] = {
        'completed': completed,
        'skipped': skipped,
        'failed': failed,
        'total_gb': total_downloaded / 1e9,
    }
    status.save()


def print_status():
    if not STATUS_FILE.exists():
        print("No download started yet.")
        return

    data = json.loads(STATUS_FILE.read_text())
    tasks = data.get('tasks', {})

    print(f"\nDownload Status — started {data.get('started_at', '?')}")
    print(f"{'Dataset':<28} {'Status':<12} {'Size':>10}  Info")
    print("-" * 70)
    for name, info in tasks.items():
        st = info.get('status', '?')
        sz = f"{info.get('bytes', 0) / 1e9:.3f}GB" if 'bytes' in info else ''
        extra = info.get('reason', info.get('path', ''))[:40]
        print(f"{name:<28} {st:<12} {sz:>10}  {extra}")

    total = data.get('total_bytes', 0)
    print(f"\nTotal stored: {total / 1e9:.2f}GB")
    if not STATUS_FILE.parent.exists():
        return
    free = shutil.disk_usage(BASE_DIR).free / 1e9
    print(f"Disk free   : {free:.1f}GB")


if __name__ == '__main__':
    if '--status' in sys.argv:
        print_status()
    else:
        resume = '--fresh' not in sys.argv
        run_downloads(resume=resume)
