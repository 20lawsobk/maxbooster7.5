"""
MaxCore Dataset Bridge — Diffusion Training Data Pipeline

Connects the UNetV4 LITE training pipeline to the MaxCore server's 8TB corpus
(music industry, social media, advertising performance) to source:

  1. Rich scene prompts — genre/mood/BPM-tagged descriptions from real music data
  2. Style metadata — colour-grade, energy, drop-timing labels from real content
  3. Batch streaming — returns batches compatible with train_v4()'s data loader API

Falls back to the local SCENE_PROMPTS in trainer.py whenever MaxCore is offline.

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

_here    = os.path.dirname(os.path.abspath(__file__))
_parent  = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

MC_URL   = os.environ.get('AI_SERVER_URL', '').rstrip('/')
MC_KEY   = os.environ.get('AI_SERVER_KEY', '')
TIMEOUT  = 10

_CACHE_TTL   = 6 * 3600
_cache: dict = {}
_cache_lock  = threading.Lock()


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
            if resp.status == 200:
                ct = resp.headers.get('Content-Type', '')
                if 'json' in ct:
                    return json.loads(resp.read().decode())
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


# ── Local fallback prompts enriched with MaxCore-style vocabulary ─────────────
# These are used when the remote server is unavailable.  They cover all 20+
# scene categories in the trainer and include genre/BPM/energy metadata.
_FALLBACK_PROMPTS = {
    'music_video': [
        'hip hop artist concert stage dark neon purple crowd energetic BPM=120',
        'trap music video city night rain dark glow neon moody BPM=140',
        'r&b neo soul studio session warm amber intimate smooth BPM=90',
        'pop concert stadium stage elaborate dancers crowd colorful BPM=128',
        'electronic edm festival stage laser strobe dark crowd BPM=135',
        'drill music dark stage uk crowd intense gritty BPM=145',
        'afrobeats festival stage colorful dancers vibrant crowd BPM=112',
        'jazz club stage dim amber spotlight quartet intimate BPM=95',
        'rock arena concert dark guitars crowd moshing intense BPM=165',
        'latin concert stage horns crowd festive warm energy BPM=100',
        'gospel church concert choir uplifted spiritual warm BPM=75',
        'kpop concert stage hyper-produced dancers colorful BPM=132',
        'lo-fi study session desk chill warm amber dim peaceful BPM=85',
        'country concert outdoor stage sunset crowd warm BPM=95',
        'reggae beach concert palm sunset crowd wave energy BPM=80',
    ],
    'music_industry': [
        'recording studio professional large console engineer vocal booth dark',
        'mastering suite audiophile monitors precision mixing desk workflow',
        'vinyl pressing plant industrial machines warm nostalgic music heritage',
        'label signing ceremony conference room executives handshake moment',
        'streaming dashboard analytics rising chart success digital launch',
        'music video set director camera crew lighting production professional',
        'backstage dressing room artist mirror preparation pre-show tension',
        'tour bus lifestyle road trip highway window artist private moment',
        'award ceremony stage acceptance speech artist emotional crowd',
        'radio broadcast station host artist interview microphone studio warm',
        'merchandise table fan interaction signings authentic connection',
        'producer beatmaker home studio lo-fi aesthetic creative flow state',
        'sync licensing film score composer orchestra cinematic grand',
        'live session acoustic performance intimate raw authentic emotional',
        'marketing campaign social media content creation authentic artist',
    ],
    'social_media': [
        'tiktok dance challenge vibrant colorful trending youth energy',
        'instagram aesthetic grid luxury lifestyle artist brand promotion',
        'youtube music video premiere event live chat excited fans',
        'twitter announcement new release music text art minimal dark',
        'behind-the-scenes authentic raw moment artist creative process',
        'spotify editorial playlist cover art abstract minimal aesthetic',
        'apple music spatial audio immersive visual abstract premium',
        'concert announcement poster dramatic lighting tour dates text',
        'album art reveal moment social media dramatic reveal lighting',
        'fan interaction reply gratitude artist authentic connection',
        'countdown release clock anticipation dramatic teaser minimal',
        'studio session snippet video warm creative authentic raw moment',
        'merch drop product reveal stylish flat lay dark premium aesthetic',
        'milestone celebration streaming numbers achievement moment authentic',
        'collaboration announcement two artists portrait dramatic contrast',
    ],
    'advertising': [
        'music streaming platform brand ad motion graphics minimal premium',
        'artist endorsement lifestyle brand luxury product placement natural',
        'concert ticket sale urgency countdown dramatic dark premium',
        'music festival sponsorship brand activation colorful crowd energy',
        'headphones audio product ad artist portrait dramatic minimal',
        'music production software ad creator lifestyle authentic studio',
        'vinyl record merch ad warm nostalgic lifestyle aesthetic flat lay',
        'tour merchandise campaign lifestyle editorial dark premium',
        'distribution platform ad global map music spreading energy abstract',
        'sync licensing brand ad product lifestyle music moment authentic',
        'mobile music app ad interface demo smooth premium minimal dark',
        'label deal announcement press shot dramatic portrait professional',
        'award nomination announcement dramatic dark text premium minimal',
        'collaboration project ad two artists bold contrast dramatic',
        'new era music ad generation z aesthetic bold color minimal',
    ],
}

# ── Genre → BPM/energy metadata map used in training conditioning ─────────────
GENRE_METADATA = {
    'hip_hop':    {'bpm_range': (85, 115),  'energy': 0.72, 'drop_probability': 0.40},
    'trap':       {'bpm_range': (130, 150), 'energy': 0.85, 'drop_probability': 0.65},
    'r&b':        {'bpm_range': (75, 100),  'energy': 0.55, 'drop_probability': 0.20},
    'pop':        {'bpm_range': (120, 135), 'energy': 0.78, 'drop_probability': 0.45},
    'electronic': {'bpm_range': (126, 145), 'energy': 0.88, 'drop_probability': 0.75},
    'rock':       {'bpm_range': (140, 175), 'energy': 0.82, 'drop_probability': 0.35},
    'jazz':       {'bpm_range': (80, 110),  'energy': 0.48, 'drop_probability': 0.10},
    'gospel':     {'bpm_range': (70, 95),   'energy': 0.60, 'drop_probability': 0.20},
    'afrobeats':  {'bpm_range': (105, 120), 'energy': 0.80, 'drop_probability': 0.30},
    'latin':      {'bpm_range': (95, 115),  'energy': 0.75, 'drop_probability': 0.25},
    'drill':      {'bpm_range': (135, 150), 'energy': 0.80, 'drop_probability': 0.55},
    'reggae':     {'bpm_range': (75, 95),   'energy': 0.60, 'drop_probability': 0.15},
    'country':    {'bpm_range': (90, 110),  'energy': 0.65, 'drop_probability': 0.20},
    'kpop':       {'bpm_range': (120, 145), 'energy': 0.85, 'drop_probability': 0.60},
    'lo_fi':      {'bpm_range': (75, 95),   'energy': 0.35, 'drop_probability': 0.05},
    'metal':      {'bpm_range': (160, 200), 'energy': 0.95, 'drop_probability': 0.50},
}


class DatasetBridge:
    """
    Bridges the UNetV4 LITE training pipeline to MaxCore's 8TB dataset corpus.

    Primary functions:
      - `get_training_prompts(n, domain)` — fetch n prompts from MaxCore or fallback
      - `get_genre_metadata(genre)` — get BPM/energy/drop metadata for conditioning
      - `expand_scene_prompts(scene_dict)` — add MaxCore prompts to existing dict
      - `sample_conditioned_batch(scene_dict, n, rng)` — sample scene + FiLM cond
      - `status()` — dict describing connection and dataset availability
    """

    # Retry intervals: short when unreachable (MaxCore is permanent, outage = temporary)
    _ONLINE_TTL  = 300   # re-check every 5 min when healthy
    _OFFLINE_TTL = 60    # re-check every 60 s when unreachable (reconnect fast)

    def __init__(self):
        self._online: Optional[bool] = None
        self._datasets: Optional[list] = None
        self._last_check = 0
        self._check_ttl  = self._OFFLINE_TTL   # start aggressive; relaxes once online

        self._check_connection()

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
                log.warning('[MCBridge] MaxCore unreachable — using local fallback; will retry in 60s')
        return bool(self._online)

    def _fetch_dataset_catalog(self):
        cached = _cached('dataset_catalog')
        if cached:
            self._datasets = cached
            return
        data = _mc_get('/api/datasets')
        if data and isinstance(data, dict):
            self._datasets = data.get('datasets') or data.get('items') or []
            _store('dataset_catalog', self._datasets)
            log.info(f'[MCBridge] Dataset catalog: {len(self._datasets)} datasets available')
        elif isinstance(data, list):
            self._datasets = data
            _store('dataset_catalog', self._datasets)

    def _fetch_remote_prompts(self, domain: str, n: int) -> list:
        """
        Uses MaxCore's content generation API to produce domain-specific
        training prompts grounded in the 8TB music industry corpus.
        """
        cached = _cached(f'prompts_{domain}_{n}')
        if cached:
            return cached

        body = {
            'type':      'training_prompts',
            'domain':    domain,
            'count':     n,
            'format':    'music_video_scene',
            'tags':      ['genre', 'bpm', 'energy', 'visual_style', 'mood'],
            'diversity': True,
        }
        resp = _mc_post('/api/content/generate', body)
        prompts = []
        if resp:
            raw = (
                resp.get('prompts') or
                resp.get('content') or
                resp.get('items') or
                resp.get('results') or
                []
            )
            if isinstance(raw, list):
                prompts = [str(p) for p in raw if p]
            elif isinstance(raw, str):
                prompts = [raw]

        if prompts:
            _store(f'prompts_{domain}_{n}', prompts)
            log.info(f'[MCBridge] Fetched {len(prompts)} prompts from MaxCore (domain={domain})')
        return prompts

    def get_training_prompts(self, n: int = 100,
                             domain: str = 'music_video') -> list:
        """
        Return n training prompts for the given domain.
        Primary source: MaxCore server.
        Fallback: local _FALLBACK_PROMPTS (deterministically expanded to n items).
        """
        if self._check_connection():
            remote = self._fetch_remote_prompts(domain, n)
            if remote:
                return remote[:n] if len(remote) >= n else self._pad_prompts(remote, n)

        local = _FALLBACK_PROMPTS.get(domain) or _FALLBACK_PROMPTS.get('music_video') or []
        return self._pad_prompts(local, n)

    @staticmethod
    def _pad_prompts(prompts: list, n: int) -> list:
        """Cycle and shuffle prompts to reach exactly n items."""
        if not prompts:
            return [f'music video scene {i}' for i in range(n)]
        rng    = np.random.default_rng(42)
        result = []
        while len(result) < n:
            block = list(prompts)
            rng.shuffle(block)
            result.extend(block)
        return result[:n]

    def get_genre_metadata(self, genre: str) -> dict:
        """
        Returns BPM/energy/drop_probability metadata for FiLM conditioning.
        Checks MaxCore cache first, falls back to local GENRE_METADATA.
        """
        key = genre.lower().replace('-', '_').replace(' ', '_')
        cached = _cached(f'genre_meta_{key}')
        if cached:
            return cached

        if self._check_connection():
            resp = _mc_post('/api/analyze/sentiment', {
                'type':    'genre_metadata',
                'genre':   genre,
                'fields':  ['bpm_range', 'energy', 'drop_probability', 'visual_style'],
            })
            if resp and isinstance(resp, dict) and 'bpm_range' in resp:
                meta = {
                    'bpm_range':         tuple(resp['bpm_range']),
                    'energy':            float(resp.get('energy', 0.7)),
                    'drop_probability':  float(resp.get('drop_probability', 0.3)),
                }
                _store(f'genre_meta_{key}', meta)
                return meta

        return GENRE_METADATA.get(key, {'bpm_range': (100, 130), 'energy': 0.70, 'drop_probability': 0.30})

    def expand_scene_prompts(self, scene_dict: dict, n_extra_per_scene: int = 50) -> dict:
        """
        Expand a trainer SCENE_PROMPTS dict with MaxCore-sourced prompts.
        Re-checks connectivity each call so a reconnected MaxCore is used immediately.
        Returns a new dict with extra prompts added per scene.
        """
        self._check_connection()   # refresh — MaxCore may have come back online

        expanded = {k: list(v) for k, v in scene_dict.items()}

        total_extra = len(scene_dict) * n_extra_per_scene
        all_prompts = self.get_training_prompts(n=total_extra, domain='music_video')
        all_prompts += self.get_training_prompts(n=total_extra // 2, domain='music_industry')

        per_scene_pool = self._pad_prompts(all_prompts, total_extra)
        idx = 0
        for scene in expanded:
            chunk = per_scene_pool[idx: idx + n_extra_per_scene]
            expanded[scene].extend(chunk)
            idx += n_extra_per_scene

        added = sum(n_extra_per_scene for _ in expanded)
        source = 'MaxCore 8TB corpus' if self._online else 'local fallback'
        log.info(f'[MCBridge] Expanded SCENE_PROMPTS: +{added} prompts across {len(expanded)} scenes '
                 f'(source: {source})')
        return expanded

    def sample_conditioned_batch(
        self,
        scene_dict: dict,
        n: int,
        rng: Optional[np.random.Generator] = None,
    ) -> list[dict]:
        """
        Sample n training items, each with:
          - 'prompt': str
          - 'scene':  str
          - 'bpm':    float
          - 'energy': float
          - 'beat_index': int  (0-3)
          - 'is_drop': bool

        These map directly to the FiLM conditioning expected by UNetV4 LITE.
        """
        if rng is None:
            rng = np.random.default_rng()

        scenes = list(scene_dict.keys())
        genres = list(GENRE_METADATA.keys())
        items  = []

        for _ in range(n):
            scene  = scenes[rng.integers(len(scenes))]
            prompts = scene_dict.get(scene, ['music video scene'])
            prompt  = prompts[rng.integers(len(prompts))]

            genre   = genres[rng.integers(len(genres))]
            meta    = GENRE_METADATA[genre]
            bpm_lo, bpm_hi = meta['bpm_range']
            bpm     = float(rng.integers(bpm_lo, bpm_hi + 1))
            energy  = float(np.clip(meta['energy'] + rng.normal(0, 0.08), 0.0, 1.0))
            is_drop = bool(rng.random() < meta['drop_probability'])
            beat_index = int(rng.integers(0, 4))

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
            'online':          bool(self._online),
            'mc_url':          MC_URL or '(not configured)',
            'mc_key_present':  bool(MC_KEY),
            'datasets':        self._datasets or [],
            'dataset_count':   len(self._datasets) if self._datasets else 0,
            'local_domains':   list(_FALLBACK_PROMPTS.keys()),
            'genre_count':     len(GENRE_METADATA),
            'cache_entries':   len(_cache),
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
