"""
MaxCore Dataset Bridge — Diffusion Training Data Pipeline

Connects the UNetV4 LITE training pipeline to the MaxCore server's 8TB corpus.
MaxCore is the sole source of training prompts and scene metadata.

The dataset grows automatically on the MaxCore side. To stay current this bridge:
  - Fetches prompts at startup (synchronous seed of 5 topics)
  - Refreshes the full prompt pool every REFRESH_INTERVAL seconds in background
  - Persists the prompt cache to disk so restarts do not need a full cold-fetch
  - All HTTP calls retry up to MAX_RETRIES times with exponential back-off + jitter

If MaxCore is unreachable, prompt methods return [] and expansions are skipped —
there is NO local fallback prompt library.

Usage:
    from diffusion.maxcore_dataset_bridge import DatasetBridge
    bridge = DatasetBridge()
    prompts = bridge.get_training_prompts(n=200, domain='music_video')
    bridge.expand_scene_prompts(trainer_scene_prompts_dict)
"""

import os
import sys
import json
import math
import time
import random
import logging
import hashlib
import threading
import tempfile
from typing import Optional

import numpy as np

log = logging.getLogger('maxcore_dataset_bridge')

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

MC_URL  = os.environ.get('AI_SERVER_URL', '').rstrip('/')
MC_KEY  = os.environ.get('AI_SERVER_KEY', '')

# ── Timeout policy ────────────────────────────────────────────────────────────
# GET requests (health, model state) can be short.
# POST requests hit the LLM (~6s warm, up to 15s cold) — allow more read time.
CONNECT_TIMEOUT = 6      # seconds to establish connection
GET_READ_TIMEOUT = 8     # seconds for GET responses
POST_READ_TIMEOUT = 20   # seconds for POST /generate responses (LLM path)

# ── Retry policy ─────────────────────────────────────────────────────────────
MAX_RETRIES   = 3        # attempts per call (1 original + 2 retries)
BACKOFF_BASE  = 1.5      # seconds base delay before first retry
BACKOFF_MAX   = 8.0      # cap on back-off ceiling

# ── Cache policy ─────────────────────────────────────────────────────────────
# Refresh the prompt pool every 10 minutes — aligned with the 10-minute
# continuous training session cycle.  Each new session gets a freshly
# sampled, randomly ordered set of music-industry prompts from MaxCore so
# the 10-year simulated experience each session accumulates is always diverse.
REFRESH_INTERVAL = 10 * 60    # seconds between full background re-fetches (10 min)
_CACHE_TTL       = REFRESH_INTERVAL
_mem_cache: dict = {}
_cache_lock      = threading.Lock()

# Disk cache: survives process restarts so next start is instant.
_DISK_CACHE_PATH = os.path.join(tempfile.gettempdir(), 'maxcore_prompt_cache.json')


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _jitter(base: float) -> float:
    """Full jitter: sleep uniformly in [0, base] to avoid thundering herd."""
    return random.uniform(0, base)


def _backoff_delay(attempt: int) -> float:
    """Exponential back-off with full jitter, capped at BACKOFF_MAX."""
    ceiling = min(BACKOFF_MAX, BACKOFF_BASE * (2 ** attempt))
    return _jitter(ceiling)


def _mc_get(path: str) -> Optional[dict]:
    """GET request to MaxCore API with retries. Returns None on all failures."""
    if not MC_URL or not MC_KEY:
        return None
    url = f"{MC_URL}{path if path.startswith('/api/') else f'/api{path}'}"
    import urllib.request
    import urllib.error

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={'X-API-Key': MC_KEY, 'Authorization': f'Bearer {MC_KEY}'},
            )
            with urllib.request.urlopen(
                req,
                timeout=(CONNECT_TIMEOUT + GET_READ_TIMEOUT),
            ) as resp:
                if resp.status == 200:
                    ct = resp.headers.get('Content-Type', '')
                    if 'json' in ct:
                        return json.loads(resp.read().decode())
                    return None  # non-JSON — don't retry
        except urllib.error.HTTPError as e:
            if e.code in (404, 405):
                log.debug(f'[MCBridge] GET {path} → {e.code} (not retrying)')
                return None
            log.debug(f'[MCBridge] GET {path} attempt {attempt+1} HTTP {e.code}')
        except Exception as e:
            log.debug(f'[MCBridge] GET {path} attempt {attempt+1} failed: {e}')

        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff_delay(attempt))

    return None


def _mc_post(path: str, body: dict) -> Optional[dict]:
    """POST request to MaxCore API with retries. Returns None on all failures."""
    if not MC_URL or not MC_KEY:
        return None
    url = f"{MC_URL}{path if path.startswith('/api/') else f'/api{path}'}"
    import urllib.request
    import urllib.error

    data = json.dumps(body).encode()

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url, data=data,
                headers={
                    'Content-Type':  'application/json',
                    'X-API-Key':     MC_KEY,
                    'Authorization': f'Bearer {MC_KEY}',
                },
                method='POST',
            )
            with urllib.request.urlopen(
                req,
                timeout=(CONNECT_TIMEOUT + POST_READ_TIMEOUT),
            ) as resp:
                ct  = resp.headers.get('Content-Type', '')
                raw = resp.read().decode()
                if 'json' in ct:
                    return json.loads(raw)
                return None  # non-JSON — don't retry
        except urllib.error.HTTPError as e:
            if e.code in (404, 405, 422):
                log.debug(f'[MCBridge] POST {path} → {e.code} (not retrying)')
                return None
            log.debug(f'[MCBridge] POST {path} attempt {attempt+1} HTTP {e.code}')
        except Exception as e:
            log.debug(f'[MCBridge] POST {path} attempt {attempt+1} failed: {e}')

        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff_delay(attempt))

    return None


# ── In-memory + disk cache ────────────────────────────────────────────────────

def _cache_key(tag: str) -> str:
    return hashlib.md5(tag.encode()).hexdigest()


def _mem_get(tag: str) -> Optional[object]:
    k = _cache_key(tag)
    with _cache_lock:
        entry = _mem_cache.get(k)
        if entry and time.time() - entry['ts'] < _CACHE_TTL:
            return entry['val']
    return None


def _mem_set(tag: str, val: object) -> None:
    k = _cache_key(tag)
    with _cache_lock:
        _mem_cache[k] = {'val': val, 'ts': time.time()}


def _disk_load() -> None:
    """Load persisted cache from disk into memory on startup."""
    try:
        if not os.path.exists(_DISK_CACHE_PATH):
            return
        with open(_DISK_CACHE_PATH, 'r') as f:
            saved = json.load(f)
        now = time.time()
        loaded = 0
        for k, entry in saved.items():
            if now - entry.get('ts', 0) < _CACHE_TTL:
                with _cache_lock:
                    _mem_cache[k] = entry
                loaded += 1
        if loaded:
            log.info(f'[MCBridge] Disk cache loaded — {loaded} entry/entries still valid')
    except Exception as e:
        log.debug(f'[MCBridge] Disk cache load failed (harmless): {e}')


def _disk_save() -> None:
    """Persist current memory cache to disk."""
    try:
        with _cache_lock:
            snapshot = dict(_mem_cache)
        with open(_DISK_CACHE_PATH, 'w') as f:
            json.dump(snapshot, f)
    except Exception as e:
        log.debug(f'[MCBridge] Disk cache save failed (harmless): {e}')


# ── Music scene topics sent to MaxCore /api/content/generate ─────────────────
# Organised by genre × platform to maximise vocabulary diversity.
# As MaxCore's 8TB dataset grows, richer prompts are returned for the same topics.
_MUSIC_TOPICS = [
    ('hip-hop concert stage performance dark neon crowd',       'instagram'),
    ('trap music video city night rain moody gritty',           'tiktok'),
    ('r&b neo soul studio session warm amber intimate',         'instagram'),
    ('pop concert stadium stage dancers crowd colorful',        'youtube'),
    ('electronic edm festival stage laser strobe crowd',        'tiktok'),
    ('drill music uk stage crowd intense dark gritty',          'instagram'),
    ('afrobeats festival stage dancers vibrant colorful',       'tiktok'),
    ('jazz club dim amber spotlight quartet intimate',           'instagram'),
    ('rock arena concert dark guitars crowd moshing',           'youtube'),
    ('latin concert stage horns crowd festive warm energy',     'instagram'),
    ('gospel church choir uplifted spiritual warm',             'instagram'),
    ('kpop concert hyper-produced dancers colorful stage',      'tiktok'),
    ('lo-fi study session desk chill warm dim peaceful',        'instagram'),
    ('country outdoor concert sunset crowd warm stage',         'youtube'),
    ('reggae beach concert palm sunset crowd wave energy',      'instagram'),
    ('artist recording studio professional vocal booth dark',   'instagram'),
    ('music video set director camera crew lighting',           'tiktok'),
    ('vinyl pressing plant industrial heritage warm nostalgic', 'instagram'),
    ('streaming dashboard analytics rising chart digital',      'tiktok'),
    ('backstage dressing room artist mirror pre-show tension',  'instagram'),
]

# ── Genre → BPM/energy/drop metadata for FiLM conditioning ───────────────────
GENRE_METADATA = {
    'hip_hop':    {'bpm_range': (85,  115), 'energy': 0.72, 'drop_probability': 0.40},
    'trap':       {'bpm_range': (130, 150), 'energy': 0.85, 'drop_probability': 0.65},
    'r&b':        {'bpm_range': (75,  100), 'energy': 0.55, 'drop_probability': 0.20},
    'pop':        {'bpm_range': (120, 135), 'energy': 0.78, 'drop_probability': 0.45},
    'electronic': {'bpm_range': (126, 145), 'energy': 0.88, 'drop_probability': 0.75},
    'rock':       {'bpm_range': (140, 175), 'energy': 0.82, 'drop_probability': 0.35},
    'jazz':       {'bpm_range': (80,  110), 'energy': 0.48, 'drop_probability': 0.10},
    'gospel':     {'bpm_range': (70,   95), 'energy': 0.60, 'drop_probability': 0.20},
    'afrobeats':  {'bpm_range': (105, 120), 'energy': 0.80, 'drop_probability': 0.30},
    'latin':      {'bpm_range': (95,  115), 'energy': 0.75, 'drop_probability': 0.25},
    'drill':      {'bpm_range': (135, 150), 'energy': 0.80, 'drop_probability': 0.55},
    'reggae':     {'bpm_range': (75,   95), 'energy': 0.60, 'drop_probability': 0.15},
    'country':    {'bpm_range': (90,  110), 'energy': 0.65, 'drop_probability': 0.20},
    'kpop':       {'bpm_range': (120, 145), 'energy': 0.85, 'drop_probability': 0.60},
    'lo_fi':      {'bpm_range': (75,   95), 'energy': 0.35, 'drop_probability': 0.05},
    'metal':      {'bpm_range': (160, 200), 'energy': 0.95, 'drop_probability': 0.50},
}


def _build_prompt(topic: str, result: dict) -> str:
    """Assemble a rich training prompt from a MaxCore generate response."""
    parts = [topic]
    hook  = (result.get('hook') or '').strip()
    if hook and len(hook) < 80:
        parts.append(hook)
    kw = ' '.join(h.lstrip('#') for h in result.get('hashtags', []) if h.startswith('#'))
    if kw:
        parts.append(kw)
    return ' | '.join(parts)


class DatasetBridge:
    """
    Bridges the UNetV4 LITE training pipeline to MaxCore's growing 8TB corpus.

    Resilience guarantees:
      - Every HTTP call retries up to MAX_RETRIES times with back-off + jitter
      - Prompt pool refreshes every REFRESH_INTERVAL seconds (dataset grows)
      - Disk cache survives process restarts — next boot is instant
      - Online/offline detection with per-state TTLs; online rechecks every 5 min,
        offline rechecks every 60 s so recovery is fast
      - Thread-safe: all shared state protected by locks

    Primary methods:
      get_training_prompts(n, domain) — n prompts from MaxCore; [] if offline
      get_genre_metadata(genre)       — BPM/energy/drop metadata (always available)
      expand_scene_prompts(scene_dict) — add MaxCore prompts to trainer scene dict
      sample_conditioned_batch(scene_dict, n, rng) — FiLM-conditioned batch
      status()                        — connectivity and dataset state dict
    """

    _ONLINE_TTL  = 300   # recheck online status every 5 min
    _OFFLINE_TTL = 60    # recheck offline status every 1 min (fast recovery)

    def __init__(self):
        self._online: Optional[bool] = None
        self._datasets: Optional[list] = None
        self._last_check = 0.0
        self._check_ttl  = self._OFFLINE_TTL
        self._conn_lock  = threading.Lock()

        # Load disk cache first — gives us prompts immediately on restart
        _disk_load()

        self._check_connection()
        if self._online:
            # If disk cache already warm, skip synchronous seed fetch
            if not _mem_get('maxcore_generated_prompts'):
                self._sync_seed_fetch()

        # Background thread: full fetch + periodic refresh
        self._start_background_loop()

    # ── Connectivity ──────────────────────────────────────────────────────────

    def _check_connection(self) -> bool:
        """Thread-safe connectivity check with TTL guard."""
        with self._conn_lock:
            now = time.time()
            if now - self._last_check < self._check_ttl:
                return bool(self._online)
            self._last_check = now

        health = _mc_get('/api/health')
        was_online = self._online
        self._online = health is not None

        if self._online:
            self._check_ttl = self._ONLINE_TTL
            if not was_online:
                log.info('[MCBridge] MaxCore server online — dataset access enabled')
            self._fetch_dataset_catalog()
        else:
            self._check_ttl = self._OFFLINE_TTL
            if was_online is not False:
                log.warning('[MCBridge] MaxCore unreachable — will retry in 60s')
        return bool(self._online)

    def _fetch_dataset_catalog(self) -> None:
        cached = _mem_get('dataset_catalog')
        if cached:
            self._datasets = cached
            return
        domains  = ['social', 'advertising', 'content', 'engagement']
        catalog  = []
        for domain in domains:
            state = _mc_get(f'/api/models/{domain}/state')
            if state and isinstance(state, dict) and state.get('weights', {}).get('ready'):
                catalog.append({
                    'domain':        domain,
                    'version':       state.get('version', '1.0.0'),
                    'session_count': state.get('session_count', 0),
                    'trained_at':    state.get('trained_at', ''),
                    'vocab_size':    state.get('weights', {}).get('vocab_size', 0),
                    'embed_dim':     state.get('weights', {}).get('embed_dim', 0),
                })
        if catalog:
            self._datasets = catalog
            _mem_set('dataset_catalog', catalog)
            log.info(f'[MCBridge] MaxCore models available: {[c["domain"] for c in catalog]}')

    # ── Content fetch ─────────────────────────────────────────────────────────

    def _fetch_topic(self, topic: str, platform: str) -> Optional[str]:
        """Fetch a single topic from MaxCore, return assembled prompt or None."""
        result = _mc_post('/api/content/generate', {'topic': topic, 'platform': platform})
        if result and result.get('success'):
            return _build_prompt(topic, result)
        return None

    def _sync_seed_fetch(self) -> None:
        """
        Synchronous fetch of first 5 topics at startup.
        Keeps startup delay bounded: 5 × (CONNECT+POST_READ) = 130s worst-case,
        but retries already baked into _mc_post so real-world is ~30s.
        Stores result in cache immediately so expand_scene_prompts() is ready.
        """
        prompts = []
        for topic, platform in _MUSIC_TOPICS[:5]:
            p = self._fetch_topic(topic, platform)
            if p:
                prompts.append(p)

        if prompts:
            _mem_set('maxcore_generated_prompts', prompts)
            _disk_save()
            log.info(f'[MCBridge] Seed fetch complete — {len(prompts)} MaxCore prompts ready at startup')
        else:
            log.warning('[MCBridge] Seed fetch returned no prompts — MaxCore generation unavailable at startup')

    def _full_fetch(self) -> None:
        """
        Fetch ALL 20 topics from MaxCore, merge with existing cache, persist to disk.
        Called by background loop at startup and every REFRESH_INTERVAL seconds.
        Because the MaxCore 8TB dataset grows automatically, re-fetching captures
        richer prompts returned for the same topics as the corpus expands.
        """
        existing: list = list(_mem_get('maxcore_generated_prompts') or [])
        # Keep existing prompts as a set for dedup, then overwrite with fresh ones
        fresh: list = []
        fetched = 0

        for i, (topic, platform) in enumerate(_MUSIC_TOPICS):
            # Stagger requests to avoid burst load on MaxCore
            if i > 0:
                time.sleep(random.uniform(0.3, 1.2))

            p = self._fetch_topic(topic, platform)
            if p:
                fresh.append(p)
                fetched += 1

        if fresh:
            # Merge: fresh prompts take precedence, old ones fill remaining slots
            merged = fresh + [e for e in existing if e not in set(fresh)]
            _mem_set('maxcore_generated_prompts', merged)
            _disk_save()
            log.info(
                f'[MCBridge] MaxCore content fetch complete — '
                f'{fetched}/{len(_MUSIC_TOPICS)} topics → {len(merged)} prompts cached'
            )
        else:
            log.warning('[MCBridge] MaxCore content fetch returned no prompts')

    def _start_background_loop(self) -> None:
        """
        Daemon thread that:
          1. Immediately runs a full 20-topic fetch (dataset may be richer since startup)
          2. Sleeps REFRESH_INTERVAL seconds
          3. Repeats indefinitely so the growing corpus is always current
        """
        def _loop():
            # Small delay so the synchronous seed fetch can complete first
            time.sleep(5)
            while True:
                try:
                    if self._check_connection():
                        self._full_fetch()
                        # Also refresh dataset catalog to pick up new models
                        self._fetch_dataset_catalog()
                    else:
                        log.debug('[MCBridge] Background loop: MaxCore offline — skipping refresh')
                except Exception as e:
                    log.warning(f'[MCBridge] Background loop error: {e}')
                # Sleep in small increments so thread exits cleanly on shutdown
                deadline = time.time() + REFRESH_INTERVAL
                while time.time() < deadline:
                    time.sleep(min(30, deadline - time.time()))

        t = threading.Thread(target=_loop, daemon=True, name='mcbridge-refresh')
        t.start()

    # ── Prompt retrieval ──────────────────────────────────────────────────────

    def _get_cached_prompts(self) -> list:
        """Return whatever prompts are currently warm (mem → disk → [])."""
        cached = _mem_get('maxcore_generated_prompts')
        if cached:
            return cached
        # Try disk directly (may have been written by a concurrent instance)
        _disk_load()
        cached = _mem_get('maxcore_generated_prompts')
        return cached or []

    def _cycle_to_n(self, prompts: list, n: int) -> list:
        """Cycle + shuffle a prompt list to reach exactly n items deterministically."""
        if not prompts:
            return []
        rng    = np.random.default_rng(len(prompts) * 100 + n)
        result: list = []
        while len(result) < n:
            block = list(prompts)
            rng.shuffle(block)
            result.extend(block)
        return result[:n]

    def get_training_prompts(self, n: int = 100, domain: str = 'music_video') -> list:
        """
        Return up to n MaxCore-generated training prompts.
        Returns [] when MaxCore is unreachable and no disk cache exists.
        """
        raw = self._get_cached_prompts()
        if raw:
            return self._cycle_to_n(raw, n)

        # Cache cold AND offline → check connection, try a live mini-fetch
        if not self._check_connection():
            log.warning(f'[MCBridge] get_training_prompts({n}) — MaxCore offline, no cache')
            return []

        # Connected but cache empty — synchronous mini-fetch
        self._sync_seed_fetch()
        raw = self._get_cached_prompts()
        if raw:
            return self._cycle_to_n(raw, n)

        log.warning(f'[MCBridge] get_training_prompts({n}) — no prompts available')
        return []

    def get_genre_metadata(self, genre: str) -> dict:
        """BPM/energy/drop_probability for FiLM conditioning. Always available."""
        key = genre.lower().replace('-', '_').replace(' ', '_')
        return GENRE_METADATA.get(key, {'bpm_range': (100, 130), 'energy': 0.70, 'drop_probability': 0.30})

    get_scene_metadata = get_genre_metadata

    def expand_scene_prompts(self, scene_dict: dict, n_extra_per_scene: int = 50) -> dict:
        """
        Expand a trainer SCENE_PROMPTS dict with MaxCore-sourced prompts.
        If MaxCore is unreachable and no cache exists, returns original dict unchanged.
        """
        total_extra = len(scene_dict) * n_extra_per_scene
        mc_prompts  = self.get_training_prompts(n=total_extra)

        if not mc_prompts:
            log.warning('[MCBridge] expand_scene_prompts — no MaxCore prompts available')
            return scene_dict

        expanded = {k: list(v) for k, v in scene_dict.items()}
        pool     = self._cycle_to_n(mc_prompts, total_extra)
        idx      = 0
        for scene in expanded:
            expanded[scene].extend(pool[idx: idx + n_extra_per_scene])
            idx += n_extra_per_scene

        added = sum(n_extra_per_scene for _ in expanded)
        log.info(
            f'[MCBridge] Expanded SCENE_PROMPTS: +{added} prompts across '
            f'{len(expanded)} scenes (source: MaxCore 8TB corpus)'
        )
        return expanded

    def sample_conditioned_batch(
        self,
        scene_dict: dict,
        n: int,
        rng: Optional[np.random.Generator] = None,
    ) -> list:
        """Sample n FiLM-conditioned training items."""
        if rng is None:
            rng = np.random.default_rng()

        scenes = list(scene_dict.keys())
        genres = list(GENRE_METADATA.keys())
        items  = []

        for _ in range(n):
            scene   = scenes[rng.integers(len(scenes))]
            prompts = scene_dict.get(scene, ['music video scene'])
            prompt  = prompts[rng.integers(len(prompts))]

            genre          = genres[rng.integers(len(genres))]
            meta           = GENRE_METADATA[genre]
            bpm_lo, bpm_hi = meta['bpm_range']
            bpm            = float(rng.integers(bpm_lo, bpm_hi + 1))
            energy         = float(np.clip(meta['energy'] + rng.normal(0, 0.08), 0.0, 1.0))
            is_drop        = bool(rng.random() < meta['drop_probability'])
            beat_index     = int(rng.integers(0, 4))

            items.append({
                'prompt':     prompt,
                'scene':      scene,
                'genre':      genre,
                'bpm':        bpm,
                'energy':     energy,
                'beat_index': beat_index,
                'is_drop':    is_drop,
            })

        return items

    def status(self) -> dict:
        self._check_connection()
        prompts = self._get_cached_prompts()
        return {
            'online':             bool(self._online),
            'mc_url':             MC_URL or '(not configured)',
            'mc_key_present':     bool(MC_KEY),
            'datasets':           self._datasets or [],
            'dataset_count':      len(self._datasets) if self._datasets else 0,
            'genre_count':        len(GENRE_METADATA),
            'cached_prompts':     len(prompts),
            'cache_entries':      len(_mem_cache),
            'refresh_interval_h': REFRESH_INTERVAL // 3600,
            'disk_cache_path':    _DISK_CACHE_PATH,
        }


# ── Module-level thread-safe singleton ───────────────────────────────────────

_bridge:      Optional[DatasetBridge] = None
_bridge_lock: threading.Lock = threading.Lock()


def get_bridge() -> DatasetBridge:
    global _bridge
    if _bridge is None:
        with _bridge_lock:
            if _bridge is None:
                _bridge = DatasetBridge()
    return _bridge


if __name__ == '__main__':
    import pprint
    logging.basicConfig(level=logging.INFO)
    b = DatasetBridge()
    print('Status:', json.dumps(b.status(), indent=2))
    prompts = b.get_training_prompts(n=20, domain='music_video')
    print(f'\nGot {len(prompts)} prompts:')
    for p in prompts[:5]:
        print(' ', p)
    meta = b.get_genre_metadata('trap')
    print(f'\nTrap genre metadata: {meta}')
    batch = b.sample_conditioned_batch({'concert_stage': ['concert stage dark neon crowd']}, n=3)
    print('\nSample batch:')
    pprint.pprint(batch)
