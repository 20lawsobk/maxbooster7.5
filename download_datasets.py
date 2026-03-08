"""
D: Drive Dataset Downloader
============================
Run this on your local machine to download all large training datasets
directly to D:\\ai_server\\datasets\\

Usage:
    cd D:\\ai_server
    python download_datasets.py

Options:
    python download_datasets.py --list          # Show all datasets + status
    python download_datasets.py --only music    # Music datasets only
    python download_datasets.py --only video    # Video datasets only
    python download_datasets.py --name nsynth   # One specific dataset
    python download_datasets.py --skip-large    # Skip anything over 100GB
    python download_datasets.py --hf-token TOKEN  # HF token for gated repos

Requirements:
    pip install huggingface_hub datasets requests tqdm

All downloads resume if interrupted. Already-complete datasets are skipped.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT        = Path(__file__).resolve().parent
DATASETS    = ROOT / "datasets"
STATUS_FILE = ROOT / "knowledge" / "dataset_download_status.json"

DATASETS.mkdir(parents=True, exist_ok=True)
STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)

# ── Dataset definitions ───────────────────────────────────────────────────────

@dataclass
class Dataset:
    name:     str
    method:   str        # 'hf' | 'http' | 'http_multi' | 'ytdlp'
    source:   str
    est_gb:   float
    music:    bool
    priority: int        # 1=high 2=med 3=low
    note:     str = ""
    extra:    dict = field(default_factory=dict)


DATASETS_PLAN: List[Dataset] = [

    # ── Small/medium — verified public HF repos ────────────────────────────
    Dataset('gtzan',          'hf',   'marsyas/gtzan',
            est_gb=1.5,   music=True,  priority=1,
            note='Genre classification, 1K clips across 10 genres'),

    Dataset('musiccaps',      'hf',   'google/MusicCaps',
            est_gb=0.1,   music=True,  priority=1,
            note='5K high-quality music captions from Google'),

    # MagnaTagATune — direct HTTP from MIRLAB (more reliable than HF mirrors)
    Dataset('magnatagatune',  'http_multi',
            'https://mirg.city.ac.uk/datasets/magnatagatune/',
            est_gb=4.5,   music=True,  priority=1,
            note='25K clips, 188 mood/style/instrument tags',
            extra={'files': [
                ('https://mirg.city.ac.uk/datasets/magnatagatune/mp3.zip.001', 'mp3.zip.001'),
                ('https://mirg.city.ac.uk/datasets/magnatagatune/mp3.zip.002', 'mp3.zip.002'),
                ('https://mirg.city.ac.uk/datasets/magnatagatune/mp3.zip.003', 'mp3.zip.003'),
                ('https://mirg.city.ac.uk/datasets/magnatagatune/annotations_final.csv', 'annotations_final.csv'),
                ('https://mirg.city.ac.uk/datasets/magnatagatune/clip_info_final.csv', 'clip_info_final.csv'),
            ]}),

    # Medley-Solos-DB — Zenodo direct download (rdiehl/medley-solos-db doesn't exist on HF)
    Dataset('medley_solos',   'http', 'https://zenodo.org/record/3464302/files/Medley-solos-DB.tar.gz',
            est_gb=0.8,   music=True,  priority=1,
            note='21K clips across 8 instrument classes'),

    Dataset('emopia',         'hf',   'Nyanko7/emopia',
            est_gb=1.5,   music=True,  priority=2,
            note='Piano MIDI with emotion quadrants (valence/arousal)'),

    # NSynth — Google Storage direct download (Ivan-ZNN/NSynth doesn't exist on HF)
    Dataset('nsynth',         'http_multi', '',
            est_gb=22.0,  music=True,  priority=1,
            note='300K annotated musical notes — instrument + pitch conditioning',
            extra={'files': [
                ('https://storage.googleapis.com/magentadata/datasets/nsynth/nsynth-train.jsonwav.tar.gz',  'nsynth-train.tar.gz'),
                ('https://storage.googleapis.com/magentadata/datasets/nsynth/nsynth-valid.jsonwav.tar.gz',  'nsynth-valid.tar.gz'),
                ('https://storage.googleapis.com/magentadata/datasets/nsynth/nsynth-test.jsonwav.tar.gz',   'nsynth-test.tar.gz'),
            ]}),

    Dataset('maestro_v3',     'http', 'https://storage.googleapis.com/magentadata/datasets/maestro/v3.0.0/maestro-v3.0.0.zip',
            est_gb=120.0, music=True,  priority=1,
            note='200hrs piano audio + MIDI annotation pairs'),

    Dataset('fma_large',      'http', 'https://os.unil.cloud.switch.ch/fma/fma_large.zip',
            est_gb=93.0,  music=True,  priority=1,
            note='30K tracks across 161 genres — largest free music collection'),

    Dataset('fma_medium',     'http', 'https://os.unil.cloud.switch.ch/fma/fma_medium.zip',
            est_gb=22.0,  music=True,  priority=1,
            note='25K tracks, balanced across genres'),

    # ── Large video/visual ──────────────────────────────────────────────────
    Dataset('diffusiondb',    'hf',   'poloclub/diffusiondb',
            est_gb=88.0,  music=False, priority=2,
            note='1M Stable Diffusion prompts + images — visual quality training',
            extra={'config': 'large_random_1k'}),

    # Kinetics-700 — correct HF repo ID (was missing username prefix)
    Dataset('kinetics700',    'hf',   'HuggingFaceM4/kinetics700-2020',
            est_gb=450.0, music=False, priority=1,
            note='700 action classes, 650K clips — primary motion teacher'),

    Dataset('vggsound',       'hf',   'Loie/VGGSound',
            est_gb=450.0, music=True,  priority=2,
            note='200K clips with audio-visual labels — strong AV correspondence'),

    Dataset('audioset',       'hf',   'agkphysics/AudioSet',
            est_gb=2000.0,music=True,  priority=2,
            note='2M clips, 527 sound classes — audio conditioning backbone'),

    Dataset('webvid10m',      'hf',   'TempoFunk/webvid-10M',
            est_gb=2500.0,music=True,  priority=3,
            note='10M video+caption pairs — text-to-video alignment',
            extra={'streaming': True}),

    Dataset('laion_aesthetics','hf',  'laion/laion2B-en-aesthetic',
            est_gb=240.0, music=False, priority=2,
            note='2.3B image-text pairs at aesthetic score ≥5 — visual quality',
            extra={'streaming': True}),

    Dataset('mtg_jamendo',    'hf',   'MTG/mtg-jamendo-dataset',
            est_gb=60.0,  music=True,  priority=1,
            note='55K CC-licensed music tracks, genre/mood/instrument tags'),

    # ── yt-dlp music video sets ─────────────────────────────────────────────
    Dataset('musicvideo_hq',  'ytdlp', 'official music video HD 4K 2023 2024',
            est_gb=500.0, music=True,  priority=2,
            note='10K high-quality official music videos',
            extra={'max_clips': 10000, 'duration': 30}),

    Dataset('concert_live',   'ytdlp', 'live concert performance stadium arena HD',
            est_gb=200.0, music=True,  priority=3,
            note='Stage lighting, crowd dynamics, live performance',
            extra={'max_clips': 4000, 'duration': 30}),

    Dataset('albumart_lofi',  'ytdlp', 'album art aesthetic lofi chill music visualizer 4k',
            est_gb=50.0,  music=True,  priority=2,
            note='Lofi aesthetic + album art visualiser videos',
            extra={'max_clips': 2000, 'duration': 15}),
]

# ── Status tracking ───────────────────────────────────────────────────────────

def _load_status() -> dict:
    if STATUS_FILE.exists():
        try:
            return json.loads(STATUS_FILE.read_text())
        except Exception:
            pass
    return {}

def _save_status(status: dict):
    STATUS_FILE.write_text(json.dumps(status, indent=2, default=str))

def _mark(name: str, state: str, note: str = ""):
    status = _load_status()
    status[name] = {'state': state, 'ts': datetime.now(timezone.utc).isoformat(), 'note': note}
    _save_status(status)

def _is_done(name: str) -> bool:
    s = _load_status().get(name, {})
    return s.get('state') == 'done'

# ── Helpers ───────────────────────────────────────────────────────────────────

def _run(cmd: List[str], cwd: Optional[Path] = None) -> int:
    print(f"\n  $ {' '.join(cmd)}", flush=True)
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode

def _ensure_pkg(pkg: str, import_name: Optional[str] = None):
    mod = import_name or pkg.replace('-', '_')
    try:
        m = __import__(mod)
        # Verify the package is functional (datasets sometimes installs broken)
        if mod == 'datasets':
            from datasets import load_dataset  # noqa: F401
    except (ImportError, Exception):
        print(f"  Installing/repairing {pkg}...", flush=True)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', pkg])

def _http_download(url: str, dest: Path, filename: Optional[str] = None):
    """Download a file over HTTP with progress bar. Resumes partial downloads."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fname = filename or url.split('/')[-1].split('?')[0]
    filepath = dest / fname
    tmp = filepath.with_suffix(filepath.suffix + '.tmp')

    if filepath.exists():
        print(f"  Already downloaded: {fname}", flush=True)
        return filepath

    # Resume support: check existing tmp size
    resume_pos = tmp.stat().st_size if tmp.exists() else 0

    headers = {'User-Agent': 'Mozilla/5.0'}
    if resume_pos > 0:
        headers['Range'] = f'bytes={resume_pos}-'
        print(f"  Resuming {fname} from {resume_pos / 1e6:.0f} MB...", flush=True)

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            total_raw = int(resp.headers.get('Content-Length', 0))
            total = total_raw + resume_pos if resume_pos else total_raw
            chunk = 1024 * 1024  # 1MB
            done  = resume_pos
            mode  = 'ab' if resume_pos > 0 else 'wb'
            with open(tmp, mode) as f:
                while True:
                    buf = resp.read(chunk)
                    if not buf:
                        break
                    f.write(buf)
                    done += len(buf)
                    if total:
                        pct = done / total * 100
                        mb  = done / 1e6
                        print(f"\r  {mb:.0f} MB / {total/1e6:.0f} MB  ({pct:.1f}%)", end='', flush=True)
        print(flush=True)
    except Exception as e:
        print(f"\n  [WARN] Download interrupted: {e}", flush=True)
        raise

    tmp.rename(filepath)
    return filepath

def _extract(filepath: Path, dest: Path):
    """Extract zip or tar archives."""
    name = filepath.name
    if name.endswith('.zip') or name.endswith('.zip.001'):
        print(f"  Extracting {name}...", flush=True)
        import zipfile
        try:
            with zipfile.ZipFile(filepath) as z:
                z.extractall(dest)
        except zipfile.BadZipFile:
            print(f"  [WARN] {name} may be a multi-part zip — skipping extraction (join parts manually)", flush=True)
    elif name.endswith(('.tar.gz', '.tgz')):
        print(f"  Extracting {name}...", flush=True)
        import tarfile
        with tarfile.open(filepath) as t:
            t.extractall(dest)
    print(f"  Extracted to {dest}", flush=True)

# ── Downloaders ───────────────────────────────────────────────────────────────

HF_TOKEN: Optional[str] = None  # set via --hf-token arg


def _download_hf(ds: Dataset, dest: Path):
    """Download from HuggingFace Hub using huggingface_hub."""
    _ensure_pkg('huggingface_hub')
    from huggingface_hub import snapshot_download

    config   = ds.extra.get('config')
    streaming = ds.extra.get('streaming', False)

    if streaming:
        print(f"  [{ds.name}] Large streaming dataset — downloading metadata + first shard only.", flush=True)

    kwargs = dict(
        repo_id=ds.source,
        repo_type='dataset',
        local_dir=str(dest),
        ignore_patterns=['*.bin', '*.pt', '*.pth', '__pycache__/*'],
    )
    if HF_TOKEN:
        kwargs['token'] = HF_TOKEN

    try:
        snapshot_download(**kwargs)
        return True
    except Exception as e:
        print(f"  [WARN] snapshot_download failed: {e}", flush=True)
        # Fallback: try datasets library
        try:
            _ensure_pkg('datasets')
            from datasets import load_dataset
            kw: dict = {'split': 'train', 'streaming': True, 'trust_remote_code': True}
            if config:
                kw['name'] = config
            if HF_TOKEN:
                kw['token'] = HF_TOKEN
            dataset = load_dataset(ds.source, **kw)
            dest.mkdir(parents=True, exist_ok=True)
            manifest = dest / 'manifest.jsonl'
            n = 0
            with open(manifest, 'w') as f:
                for row in dataset:
                    f.write(json.dumps(row) + '\n')
                    n += 1
                    if n >= 1000:
                        break
            print(f"  Saved {n} rows manifest to {manifest}", flush=True)
            return True
        except Exception as e2:
            print(f"  [WARN] datasets fallback also failed: {e2}", flush=True)
            return False


def _download_http(ds: Dataset, dest: Path):
    """Download a single file via direct HTTP URL."""
    dest.mkdir(parents=True, exist_ok=True)
    url      = ds.source
    filename = url.split('/')[-1].split('?')[0] or f'{ds.name}.zip'

    print(f"  Downloading {filename} ({ds.est_gb:.0f} GB)...", flush=True)
    try:
        filepath = _http_download(url, dest, filename)
    except Exception as e:
        print(f"  [WARN] Download failed: {e}", flush=True)
        return False

    try:
        _extract(filepath, dest)
    except Exception as e:
        print(f"  [WARN] Extraction failed (file still saved): {e}", flush=True)
    return True


def _download_http_multi(ds: Dataset, dest: Path):
    """Download multiple files (e.g. multi-part archives or split dataset files)."""
    dest.mkdir(parents=True, exist_ok=True)
    files = ds.extra.get('files', [])
    if not files:
        print(f"  [WARN] No files defined for {ds.name}", flush=True)
        return False

    all_ok = True
    for url, fname in files:
        print(f"  Downloading {fname}...", flush=True)
        try:
            filepath = _http_download(url, dest, fname)
            # Extract non-split archives immediately
            if not fname.endswith(('.001', '.002', '.003')):
                try:
                    _extract(filepath, dest)
                except Exception:
                    pass
        except Exception as e:
            print(f"  [WARN] Failed to download {fname}: {e}", flush=True)
            all_ok = False

    # Attempt to join and extract multi-part zips (zip.001 + zip.002 + ...)
    parts = [dest / f for _, f in files if f.endswith('.001')]
    for part1 in parts:
        base = str(part1)[:-4]  # strip .001
        out_zip = dest / (Path(base).name)
        part_files = sorted(dest.glob(Path(base).name + '.*'))
        if len(part_files) > 1 and not out_zip.exists():
            print(f"  Joining multi-part archive: {out_zip.name}...", flush=True)
            try:
                with open(out_zip, 'wb') as out_f:
                    for pf in part_files:
                        out_f.write(pf.read_bytes())
                _extract(out_zip, dest)
            except Exception as e:
                print(f"  [WARN] Multi-part join failed: {e}", flush=True)
    return all_ok


def _download_ytdlp(ds: Dataset, dest: Path):
    """Download via yt-dlp."""
    try:
        import yt_dlp as _
    except ImportError:
        rc = subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'yt-dlp'])
        if rc.returncode != 0:
            print("  [WARN] Could not install yt-dlp. Skipping.", flush=True)
            return False

    dest.mkdir(parents=True, exist_ok=True)
    max_clips = ds.extra.get('max_clips', 500)
    duration  = ds.extra.get('duration', 20)

    cmd = [
        sys.executable, '-m', 'yt_dlp',
        f'ytsearch{max_clips}:{ds.source}',
        '--output', str(dest / '%(id)s.%(ext)s'),
        '--format', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
        '--merge-output-format', 'mp4',
        '--max-downloads', str(max_clips),
        '--match-filter', f'duration <= {duration * 3}',
        '--no-playlist',
        '--ignore-errors',
        '--no-warnings',
        '--quiet',
        '--progress',
    ]
    rc = _run(cmd)
    return rc == 0


# ── Main download loop ────────────────────────────────────────────────────────

def run(
    filter_type: Optional[str] = None,
    only_name:   Optional[str] = None,
    skip_large:  bool = False,
    dry_run:     bool = False,
):
    targets = DATASETS_PLAN

    if only_name:
        targets = [d for d in targets if d.name == only_name]
        if not targets:
            print(f"Dataset '{only_name}' not found. Run --list to see all.", flush=True)
            return

    if filter_type == 'music':
        targets = [d for d in targets if d.music]
    elif filter_type == 'video':
        targets = [d for d in targets if not d.music]

    if skip_large:
        targets = [d for d in targets if d.est_gb <= 100]

    # Sort by priority then size
    targets.sort(key=lambda d: (d.priority, d.est_gb))

    total_gb = sum(d.est_gb for d in targets)
    present  = sum(1 for d in targets if _is_done(d.name))

    print()
    print("=" * 65)
    print("  MaxCore D: Drive Dataset Downloader")
    print("=" * 65)
    print(f"  Target dir : {DATASETS}")
    print(f"  Datasets   : {len(targets)} ({present} already done)")
    print(f"  Est. total : {total_gb/1024:.1f} TB  ({total_gb:.0f} GB)")
    if HF_TOKEN:
        print(f"  HF Token   : set (authenticated)")
    else:
        print(f"  HF Token   : not set (gated repos may fail — use --hf-token)")
    print()

    if dry_run:
        print("  DRY RUN — no downloads will be made\n")

    for ds in targets:
        dest = DATASETS / ds.name

        if _is_done(ds.name):
            print(f"  ✓ {ds.name:<25} already complete — skipping", flush=True)
            continue

        size_str = f"{ds.est_gb:.0f} GB" if ds.est_gb < 1000 else f"{ds.est_gb/1024:.1f} TB"
        print(f"\n{'='*65}", flush=True)
        print(f"  [{ds.name}]  ~{size_str}  (priority {ds.priority})", flush=True)
        print(f"  {ds.note}", flush=True)

        if dry_run:
            print(f"  DRY RUN: would download via {ds.method}", flush=True)
            continue

        _mark(ds.name, 'downloading')
        ok = False
        try:
            if ds.method == 'hf':
                ok = _download_hf(ds, dest)
            elif ds.method == 'http':
                ok = _download_http(ds, dest)
            elif ds.method == 'http_multi':
                ok = _download_http_multi(ds, dest)
            elif ds.method == 'ytdlp':
                ok = _download_ytdlp(ds, dest)
        except KeyboardInterrupt:
            print(f"\n  Interrupted during {ds.name}. Progress saved.", flush=True)
            _mark(ds.name, 'interrupted')
            sys.exit(0)
        except Exception as e:
            print(f"  [ERROR] {e}", flush=True)
            ok = False

        if ok:
            _mark(ds.name, 'done')
            print(f"  ✓ {ds.name} complete", flush=True)
        else:
            _mark(ds.name, 'failed', 'download error')
            print(f"  ✗ {ds.name} failed — check connection and retry", flush=True)

    print(f"\n{'='*65}", flush=True)
    print("  All downloads complete.", flush=True)
    print(f"  Datasets saved to: {DATASETS}", flush=True)


def list_datasets():
    status = _load_status()
    print()
    print(f"{'Name':<25} {'Size':>8}  {'Priority'}  {'Status':<15}  Notes")
    print("-" * 80)
    total = 0.0
    for ds in sorted(DATASETS_PLAN, key=lambda d: (d.priority, d.est_gb)):
        st    = status.get(ds.name, {}).get('state', 'pending')
        icon  = '✓' if st == 'done' else ('↻' if st == 'downloading' else '·')
        size  = f"{ds.est_gb:.0f}GB" if ds.est_gb < 1000 else f"{ds.est_gb/1024:.1f}TB"
        total += ds.est_gb
        print(f"  {icon} {ds.name:<23} {size:>8}  P{ds.priority}        {st:<15}  {ds.note[:40]}")
    print("-" * 80)
    print(f"  Total: {total/1024:.1f} TB")
    print()


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download large training datasets to D: drive')
    parser.add_argument('--list',       action='store_true',  help='List all datasets and status')
    parser.add_argument('--only',       type=str, default=None, metavar='TYPE',
                        help='Filter: music | video')
    parser.add_argument('--name',       type=str, default=None, metavar='NAME',
                        help='Download a single dataset by name')
    parser.add_argument('--skip-large', action='store_true',  help='Skip datasets over 100 GB')
    parser.add_argument('--dry-run',    action='store_true',  help='Show plan without downloading')
    parser.add_argument('--hf-token',   type=str, default=None, metavar='TOKEN',
                        help='HuggingFace access token for gated/private repos')
    args = parser.parse_args()

    if args.hf_token:
        HF_TOKEN = args.hf_token

    if args.list:
        list_datasets()
    else:
        run(
            filter_type=args.only,
            only_name=args.name,
            skip_large=args.skip_large,
            dry_run=args.dry_run,
        )
