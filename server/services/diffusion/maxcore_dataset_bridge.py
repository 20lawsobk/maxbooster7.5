"""
MaxCore Dataset Bridge — Diffusion Training Data Pipeline

Connects the UNetV4 LITE training pipeline to the MaxCore server's 8TB corpus.
MaxCore is the sole source of training prompts and scene metadata.

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
import time
import logging
import hashlib
import threading
from typing import Optional

import numpy as np

log = logging.getLogger('maxcore_dataset_bridge')

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

MC_URL  = os.environ.get('AI_SERVER_URL', '').rstrip('/')
MC_KEY  = os.environ.get('AI_SERVER_KEY', '')
TIMEOUT = 12

_CACHE_TTL  = 6 * 3600
_cache: dict = {}
_cache_lock = threading.Lock()


def _mc_get(path: str) -> Optional[dict]:
    """GET request to MaxCore API, returns None on any failure."""
    if not MC_URL or not MC_KEY:
        return None
    url = f"{MC_URL}{path if path.startswith('/api/') else f'/api{path}'}"
    try:
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={'X-API-Key': MC_KEY, 'Authorization': f'Bearer {MC_KEY}'},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if resp.status == 200:
                ct = resp.headers.get('Content-Type', '')
                if 'json' in ct:
                    return json.loads(resp.read().decode())
    except Exception as e:
        log.debug(f'[MCBridge] GET {path} failed: {e}')
    return None


def _mc_post(path: str, body: dict) -> Optional[dict]:
    """POST request to MaxCore API, returns None on any failure."""
    if not MC_URL or not MC_KEY:
        return None
    url = f"{MC_URL}{path if path.startswith('/api/') else f'/api{path}'}"
    try:
        import urllib.request
        data = json.dumps(body).encode()
        req  = urllib.request.Request(
            url, data=data,
            headers={
                'Content-Type':  'application/json',
                'X-API-Key':     MC_KEY,
                'Authorization': f'Bearer {MC_KEY}',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            ct = resp.headers.get('Content-Type', '')
            raw = resp.read().decode()
            if 'json' in ct:
                return json.loads(raw)
    except Exception as e:
        log.debug(f'[MCBridge] POST {path} failed: {e}')
    return None


def _cache_key(tag: str) -> str:
    return hashlib.md5(tag.encode()).hexdigest()


def _cached(tag: str):
    k = _cache_key(tag)
    with _cache_lock:
        entry = _cache.get(k)
        if entry and time.time() - entry['ts'] < _CACHE_TTL:
            return entry['val']
    return None


def _store(tag: str, val):
    k = _cache_key(tag)
    with _cache_lock:
        _cache[k] = {'val': val, 'ts': time.time()}


# ── Music scene topics sent to MaxCore /api/content/generate ─────────────────
# These are used to generate real MaxCore-sourced training prompts.
# Organised by genre × platform to maximise vocabulary diversity.
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
# This is conditioning metadata, not content prompts. Always available.
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


class DatasetBridge:
    """
    Bridges the UNetV4 LITE training pipeline to MaxCore's 8TB dataset corpus.

    MaxCore is the sole prompt source. No local fallback prompt library exists.

    Primary methods:
      - get_training_prompts(n, domain) — fetch n prompts from MaxCore; [] if offline
      - get_genre_metadata(genre)       — BPM/energy/drop metadata (always available)
      - expand_scene_prompts(scene_dict) — add MaxCore prompts to trainer scene dict
      - sample_conditioned_batch(scene_dict, n, rng) — FiLM-conditioned batch
      - status()                        — connection and dataset state dict
    """

    _ONLINE_TTL  = 300
    _OFFLINE_TTL = 60

    def __init__(self):
        self._online: Optional[bool] = None
        self._datasets: Optional[list] = None
        self._last_check = 0
        self._check_ttl  = self._OFFLINE_TTL

        self._check_connection()
        if self._online:
            # Synchronous seed fetch of first 5 topics so prompts are ready
            # before trainer.py calls expand_scene_prompts() at import time.
            self._sync_seed_fetch()
            # Background thread fetches the remaining topics.
            self._start_background_content_fetch()

    # ── Connectivity ──────────────────────────────────────────────────────────

    def _check_connection(self) -> bool:
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
                log.warning('[MCBridge] MaxCore unreachable — prompts unavailable; will retry in 60s')
        return bool(self._online)

    def _fetch_dataset_catalog(self):
        cached = _cached('dataset_catalog')
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
            _store('dataset_catalog', catalog)
            domains_ready = [c['domain'] for c in catalog]
            log.info(f'[MCBridge] MaxCore models available: {domains_ready}')

    # ── Content fetch from POST /api/content/generate ────────────────────────

    def _sync_seed_fetch(self):
        """
        Synchronous seed fetch of the first 5 topics.
        Blocks __init__ briefly (~30s max) so that prompts are available
        before trainer.py calls expand_scene_prompts() at import time.
        Skips topics already cached from a prior run.
        """
        if _cached('maxcore_generated_prompts'):
            return  # already warm from a previous bridge instance
        prompts = []
        for topic, platform in _MUSIC_TOPICS[:5]:
            result = _mc_post('/api/content/generate', {'topic': topic, 'platform': platform})
            if result and result.get('success'):
                parts = [topic]
                hook = (result.get('hook') or '').strip()
                if hook and len(hook) < 80:
                    parts.append(hook)
                kw = ' '.join(h.lstrip('#') for h in result.get('hashtags', []) if h.startswith('#'))
                if kw:
                    parts.append(kw)
                prompts.append(' | '.join(parts))
        if prompts:
            _store('maxcore_generated_prompts', prompts)
            log.info(f'[MCBridge] Seed fetch complete — {len(prompts)} MaxCore prompts ready at startup')
        else:
            log.warning('[MCBridge] Seed fetch returned no prompts — MaxCore generation unavailable at startup')

    def _start_background_content_fetch(self):
        """
        Fire-and-forget thread: calls POST /api/content/generate for each
        music topic and caches the resulting prompts.  The main startup path
        is unblocked; expand_scene_prompts() uses the cache once it's warm.
        """
        t = threading.Thread(target=self._bg_fetch_worker, daemon=True)
        t.start()

    def _bg_fetch_worker(self):
        """Background worker: fetch remaining MaxCore-generated prompts (topics 6-20)."""
        existing = _cached('maxcore_generated_prompts') or []
        all_prompts = list(existing)
        fetched = 0
        for topic, platform in _MUSIC_TOPICS[5:]:
            result = _mc_post('/api/content/generate', {
                'topic':    topic,
                'platform': platform,
            })
            if result and result.get('success'):
                # Assemble a rich training prompt from MaxCore's generated content
                parts = []
                hook = (result.get('hook') or '').strip()
                body = (result.get('body') or '').strip()
                hashtags = result.get('hashtags', [])
                # Use topic as the primary visual descriptor (MaxCore-confirmed)
                parts.append(topic)
                # Append hook as a semantic tag if it adds signal beyond the topic
                if hook and len(hook) < 80:
                    parts.append(hook)
                # Append de-hashed tags as keyword tokens
                kw = ' '.join(h.lstrip('#') for h in hashtags if h.startswith('#'))
                if kw:
                    parts.append(kw)
                prompt = ' | '.join(parts)
                all_prompts.append(prompt)
                fetched += 1
            time.sleep(0.1)  # polite inter-request gap

        if all_prompts:
            _store('maxcore_generated_prompts', all_prompts)
            log.info(
                f'[MCBridge] MaxCore content fetch complete — '
                f'{fetched}/{len(_MUSIC_TOPICS)} topics → {len(all_prompts)} prompts cached'
            )
        else:
            log.warning('[MCBridge] MaxCore content fetch returned no prompts')

    # ── Prompt retrieval ──────────────────────────────────────────────────────

    def _fetch_remote_prompts(self, n: int) -> list:
        """
        Returns MaxCore-generated prompts from the background cache.
        If cache is not yet warm (background thread still running), tries a
        synchronous fetch of the first few topics.
        Returns [] when MaxCore is unreachable.
        """
        cached = _cached('maxcore_generated_prompts')
        if cached:
            return cached

        # Cache cold — do a synchronous mini-fetch (first 5 topics only)
        prompts = []
        for topic, platform in _MUSIC_TOPICS[:5]:
            result = _mc_post('/api/content/generate', {'topic': topic, 'platform': platform})
            if result and result.get('success'):
                parts = [topic]
                hook = (result.get('hook') or '').strip()
                if hook and len(hook) < 80:
                    parts.append(hook)
                kw = ' '.join(h.lstrip('#') for h in result.get('hashtags', []) if h.startswith('#'))
                if kw:
                    parts.append(kw)
                prompts.append(' | '.join(parts))

        if prompts:
            _store('maxcore_generated_prompts', prompts)
            log.info(f'[MCBridge] Synchronous mini-fetch: {len(prompts)} prompts')
        return prompts

    def _cycle_to_n(self, prompts: list, n: int) -> list:
        """Cycle a list of prompts to reach exactly n items (deterministic, no local data)."""
        if not prompts:
            return []
        rng    = np.random.default_rng(len(prompts) * 100 + n)
        result = []
        while len(result) < n:
            block = list(prompts)
            rng.shuffle(block)
            result.extend(block)
        return result[:n]

    def get_training_prompts(self, n: int = 100,
                             domain: str = 'music_video') -> list:
        """
        Return up to n MaxCore-generated training prompts.
        Returns [] when MaxCore is unreachable — no local fallback.
        """
        if not self._check_connection():
            log.warning(f'[MCBridge] get_training_prompts({n}) skipped — MaxCore offline')
            return []

        raw = self._fetch_remote_prompts(n)
        if not raw:
            log.warning(f'[MCBridge] get_training_prompts({n}) — no prompts available yet')
            return []

        return self._cycle_to_n(raw, n)

    def get_genre_metadata(self, genre: str) -> dict:
        """
        Returns BPM/energy/drop_probability metadata for FiLM conditioning.
        This is always available — it is conditioning metadata, not content.
        """
        key = genre.lower().replace('-', '_').replace(' ', '_')
        return GENRE_METADATA.get(key, {'bpm_range': (100, 130), 'energy': 0.70, 'drop_probability': 0.30})

    # kept as alias so any callers using the old name still work
    get_scene_metadata = get_genre_metadata

    def expand_scene_prompts(self, scene_dict: dict, n_extra_per_scene: int = 50) -> dict:
        """
        Expand a trainer SCENE_PROMPTS dict with MaxCore-sourced prompts.
        If MaxCore is unreachable, returns the original dict unchanged (nothing added).
        """
        self._check_connection()

        if not self._online:
            log.warning('[MCBridge] expand_scene_prompts skipped — MaxCore offline')
            return scene_dict

        total_extra = len(scene_dict) * n_extra_per_scene
        mc_prompts  = self.get_training_prompts(n=total_extra)

        if not mc_prompts:
            log.warning('[MCBridge] expand_scene_prompts — no MaxCore prompts available yet')
            return scene_dict

        expanded = {k: list(v) for k, v in scene_dict.items()}
        pool     = self._cycle_to_n(mc_prompts, total_extra)
        idx      = 0
        for scene in expanded:
            chunk = pool[idx: idx + n_extra_per_scene]
            expanded[scene].extend(chunk)
            idx += n_extra_per_scene

        added  = sum(n_extra_per_scene for _ in expanded)
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
        """
        Sample n training items with FiLM conditioning fields:
          prompt, scene, genre, bpm, energy, beat_index, is_drop
        """
        if rng is None:
            rng = np.random.default_rng()

        scenes = list(scene_dict.keys())
        genres = list(GENRE_METADATA.keys())
        items  = []

        for _ in range(n):
            scene   = scenes[rng.integers(len(scenes))]
            prompts = scene_dict.get(scene, ['music video scene'])
            prompt  = prompts[rng.integers(len(prompts))]

            genre        = genres[rng.integers(len(genres))]
            meta         = GENRE_METADATA[genre]
            bpm_lo, bpm_hi = meta['bpm_range']
            bpm          = float(rng.integers(bpm_lo, bpm_hi + 1))
            energy       = float(np.clip(meta['energy'] + rng.normal(0, 0.08), 0.0, 1.0))
            is_drop      = bool(rng.random() < meta['drop_probability'])
            beat_index   = int(rng.integers(0, 4))

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
        return {
            'online':        bool(self._online),
            'mc_url':        MC_URL or '(not configured)',
            'mc_key_present': bool(MC_KEY),
            'datasets':      self._datasets or [],
            'dataset_count': len(self._datasets) if self._datasets else 0,
            'genre_count':   len(GENRE_METADATA),
            'cache_entries': len(_cache),
        }


# ── Module-level singleton ────────────────────────────────────────────────────
_bridge: Optional[DatasetBridge] = None


def get_bridge() -> DatasetBridge:
    global _bridge
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
