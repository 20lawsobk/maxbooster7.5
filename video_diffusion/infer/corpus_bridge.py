"""
MaxCore Corpus Bridge — Port-8000 Relay Scene Enrichment

Connects the DiT-24 relay server to MaxCore's growing 9TB dataset corpus.
At startup it seeds scene-specific prompts from the corpus.  Every 6 hours
the background thread refreshes the pool so the relay always has the latest
corpus-sourced context when enriching prompts sent to MaxCore.

Scene-specific prompts extracted from the corpus are injected into every
/api/generate-video payload, giving MaxCore richer visual context to draw
on when generating frames — fully backed by the 9TB+ training corpus.
"""

import os
import json
import time
import random
import logging
import threading
import tempfile
from typing import Optional, Dict, List

log = logging.getLogger("corpus_bridge")

_MC_URL = os.environ.get("AI_SERVER_URL", "https://secure-ai-forge.replit.app").rstrip("/")
_MC_KEY = os.environ.get("AI_SERVER_KEY", "")

REFRESH_INTERVAL = 6 * 3600        # full refresh every 6 hours as corpus grows
CONNECT_TIMEOUT  = 6
GET_TIMEOUT      = 10
POST_TIMEOUT     = 25
MAX_RETRIES      = 3
BACKOFF_MAX      = 8.0

_DISK_CACHE = os.path.join(tempfile.gettempdir(), "relay_corpus_cache.json")

# ── Scene → music topic mappings for corpus queries ───────────────────────────
# Each scene_name maps to one or more rich music-video topics that will be
# sent to MaxCore /api/content/generate to pull corpus-sourced descriptions.
_SCENE_TOPICS: Dict[str, List[tuple]] = {
    "neon_tunnel":     [("cyberpunk neon tunnel music video fast motion electric glow", "tiktok")],
    "concert_stage":   [("hip-hop concert stage performance dark neon crowd", "instagram"),
                        ("pop concert stadium stage dancers crowd colorful", "youtube")],
    "city_nights":     [("trap music video city night rain moody gritty", "tiktok"),
                        ("r&b neo soul city skyline warm amber intimate", "instagram")],
    "studio_session":  [("artist recording studio professional vocal booth dark", "instagram")],
    "golden_hour":     [("country outdoor concert sunset crowd warm stage", "youtube"),
                        ("reggae beach concert palm sunset crowd wave energy", "instagram")],
    "neon_cityscape":  [("neon cityscape cyberpunk skyline rain streets purple glow", "tiktok")],
    "plasma_fractal":  [("electronic edm festival stage laser strobe crowd", "tiktok"),
                        ("psychedelic fractal music video vivid color burst", "instagram")],
    "galaxy_spiral":   [("deep space galaxy spiral cosmic music video ambient", "youtube")],
    "warp_speed":      [("warp speed hyperspace music video motion blur stars", "tiktok")],
    "liquid_metal":    [("chrome liquid metal flowing reflective surface music video", "instagram")],
    "fire_embers":     [("fire embers glowing sparks warm orange red music video", "tiktok")],
    "crystal_facets":  [("crystal facets gemstone prismatic light refraction music video", "instagram")],
    "aurora_curtains": [("aurora borealis northern lights ethereal green purple music video", "youtube")],
    "trap_aesthetic":  [("drill music uk stage crowd intense dark gritty", "instagram"),
                        ("dark trap aesthetic moody low-lit smoke bass", "tiktok")],
    "gospel_choir":    [("gospel church choir uplifted spiritual warm golden light", "instagram")],
    "default":         [("music video cinematic high quality dynamic artist performance", "tiktok")],
}


def _jitter(ceiling: float) -> float:
    return random.uniform(0, ceiling)


def _backoff(attempt: int) -> float:
    return _jitter(min(BACKOFF_MAX, 1.5 * (2 ** attempt)))


def _mc_post(path: str, body: dict) -> Optional[dict]:
    if not _MC_KEY:
        return None
    import urllib.request, urllib.error
    url  = f"{_MC_URL}/api{path}" if not path.startswith("/api/") else f"{_MC_URL}{path}"
    data = json.dumps(body).encode()
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url, data=data,
                headers={
                    "Content-Type":  "application/json",
                    "X-API-Key":     _MC_KEY,
                    "Authorization": f"Bearer {_MC_KEY}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=CONNECT_TIMEOUT + POST_TIMEOUT) as resp:
                ct  = resp.headers.get("Content-Type", "")
                raw = resp.read().decode()
                if "json" in ct:
                    return json.loads(raw)
        except urllib.error.HTTPError as e:
            if e.code in (404, 405, 422):
                return None
            log.debug(f"[CorpusBridge] POST {path} attempt {attempt+1} HTTP {e.code}")
        except Exception as e:
            log.debug(f"[CorpusBridge] POST {path} attempt {attempt+1}: {e}")
        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff(attempt))
    return None


def _mc_get(path: str) -> Optional[dict]:
    if not _MC_KEY:
        return None
    import urllib.request, urllib.error
    url = f"{_MC_URL}/api{path}" if not path.startswith("/api/") else f"{_MC_URL}{path}"
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={"X-API-Key": _MC_KEY, "Authorization": f"Bearer {_MC_KEY}"},
            )
            with urllib.request.urlopen(req, timeout=CONNECT_TIMEOUT + GET_TIMEOUT) as resp:
                ct = resp.headers.get("Content-Type", "")
                if "json" in ct:
                    return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (404, 405):
                return None
            log.debug(f"[CorpusBridge] GET {path} attempt {attempt+1} HTTP {e.code}")
        except Exception as e:
            log.debug(f"[CorpusBridge] GET {path} attempt {attempt+1}: {e}")
        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff(attempt))
    return None


def _build_corpus_prompt(topic: str, result: dict) -> str:
    """Assemble a rich visual prompt from a MaxCore content-generate response."""
    parts = [topic]
    hook  = (result.get("hook") or "").strip()
    if hook and len(hook) < 120:
        parts.append(hook)
    body  = (result.get("body") or "").strip()
    if body and len(body) < 200:
        parts.append(body)
    tags  = " ".join(h.lstrip("#") for h in result.get("hashtags", [])[:6] if h.startswith("#"))
    if tags:
        parts.append(tags)
    return " | ".join(parts)


class CorpusBridge:
    """
    Pulls visual-scene prompts from MaxCore's growing 9TB corpus and keeps a
    local pool warm so every relay request can be enriched with corpus context.

    Thread-safe — all shared state is protected by a single RLock.
    """

    def __init__(self):
        self._lock:    threading.RLock        = threading.RLock()
        self._pool:    Dict[str, List[str]]   = {}   # scene → [corpus prompts]
        self._online:  Optional[bool]         = None
        self._last_check:    float            = 0.0
        self._last_refresh:  float            = 0.0
        self._corpus_size:   int              = 0    # reported prompt count
        self._models_ready:  List[str]        = []   # MaxCore model domains ready

        self._load_disk_cache()
        self._check_connection()
        if self._online:
            self._seed_sync()

        t = threading.Thread(target=self._background_loop, daemon=True, name="corpus-refresh")
        t.start()

    # ── Connectivity ──────────────────────────────────────────────────────────

    def _check_connection(self) -> bool:
        now = time.time()
        ttl = 60 if not self._online else 300
        if now - self._last_check < ttl:
            return bool(self._online)
        self._last_check = now

        health = _mc_get("/api/health")
        was_online = self._online
        self._online = health is not None
        if self._online and not was_online:
            log.info("[CorpusBridge] MaxCore 9TB corpus online — scene enrichment enabled")
            self._fetch_model_list()
        elif not self._online and was_online is not False:
            log.warning("[CorpusBridge] MaxCore corpus unreachable — retrying in 60s")
        return bool(self._online)

    def _fetch_model_list(self) -> None:
        domains = ["social", "advertising", "content", "engagement"]
        ready   = []
        for d in domains:
            state = _mc_get(f"/api/models/{d}/state")
            if state and state.get("weights", {}).get("ready"):
                ready.append(d)
        with self._lock:
            self._models_ready = ready
        if ready:
            log.info(f"[CorpusBridge] MaxCore corpus models ready: {ready}")

    # ── Corpus fetch ──────────────────────────────────────────────────────────

    def _fetch_scene(self, scene_name: str) -> List[str]:
        """Fetch corpus-sourced prompts for a single scene.  Returns [] on failure."""
        topics  = _SCENE_TOPICS.get(scene_name, _SCENE_TOPICS["default"])
        prompts = []
        for topic, platform in topics:
            result = _mc_post("/api/content/generate", {"topic": topic, "platform": platform})
            if result and result.get("success"):
                p = _build_corpus_prompt(topic, result)
                prompts.append(p)
        return prompts

    def _seed_sync(self) -> None:
        """Synchronous seed — fetch 3 high-priority scenes at startup."""
        priority = ["neon_tunnel", "concert_stage", "city_nights"]
        fetched  = 0
        for scene in priority:
            prompts = self._fetch_scene(scene)
            if prompts:
                with self._lock:
                    self._pool[scene] = prompts
                    self._corpus_size += len(prompts)
                fetched += len(prompts)
        if fetched:
            log.info(f"[CorpusBridge] Seed: {fetched} corpus prompts loaded for priority scenes")
            self._save_disk_cache()
        else:
            log.warning("[CorpusBridge] Seed fetch returned 0 prompts")

    def _full_refresh(self) -> None:
        """Background full refresh — all scenes, staggered to avoid burst load."""
        log.info("[CorpusBridge] Full corpus refresh starting …")
        total = 0
        for i, scene in enumerate(_SCENE_TOPICS):
            if i > 0:
                time.sleep(random.uniform(0.5, 1.5))
            prompts = self._fetch_scene(scene)
            if prompts:
                with self._lock:
                    self._pool[scene] = prompts
                total += len(prompts)

        with self._lock:
            self._corpus_size = total
            self._last_refresh = time.time()

        self._save_disk_cache()
        log.info(
            f"[CorpusBridge] Corpus refresh complete — "
            f"{total} prompts across {len(_SCENE_TOPICS)} scenes (MaxCore 9TB)"
        )

    def _background_loop(self) -> None:
        time.sleep(8)   # let seed_sync finish first
        while True:
            try:
                if self._check_connection():
                    self._full_refresh()
            except Exception as e:
                log.warning(f"[CorpusBridge] Background refresh error: {e}")
            deadline = time.time() + REFRESH_INTERVAL
            while time.time() < deadline:
                time.sleep(min(30, deadline - time.time()))

    # ── Disk cache ────────────────────────────────────────────────────────────

    def _save_disk_cache(self) -> None:
        try:
            with self._lock:
                snapshot = dict(self._pool)
            with open(_DISK_CACHE, "w") as f:
                json.dump({"pool": snapshot, "ts": time.time()}, f)
        except Exception:
            pass

    def _load_disk_cache(self) -> None:
        try:
            if not os.path.exists(_DISK_CACHE):
                return
            with open(_DISK_CACHE) as f:
                data = json.load(f)
            if time.time() - data.get("ts", 0) < REFRESH_INTERVAL:
                with self._lock:
                    self._pool = data.get("pool", {})
                    self._corpus_size = sum(len(v) for v in self._pool.values())
                if self._corpus_size:
                    log.info(
                        f"[CorpusBridge] Disk cache loaded — "
                        f"{self._corpus_size} prompts across {len(self._pool)} scenes"
                    )
        except Exception:
            pass

    # ── Public API ────────────────────────────────────────────────────────────

    def get_scene_prompt(self, scene_name: str) -> Optional[str]:
        """
        Return one corpus-sourced visual prompt for the given scene, or None
        if the pool is empty.  Falls back to the 'default' scene if the
        requested scene has no corpus prompts cached yet.
        """
        with self._lock:
            prompts = self._pool.get(scene_name) or self._pool.get("default")
        if not prompts:
            return None
        return random.choice(prompts)

    def enrich_prompt(self, base_prompt: str, scene_name: str) -> str:
        """
        Prepend a corpus-sourced scene description to the base prompt.
        If no corpus prompt is available, returns base_prompt unchanged.
        """
        corpus_ctx = self.get_scene_prompt(scene_name)
        if not corpus_ctx:
            return base_prompt
        if base_prompt:
            return f"{corpus_ctx} — {base_prompt}"
        return corpus_ctx

    def status(self) -> dict:
        with self._lock:
            return {
                "corpus_online":   bool(self._online),
                "corpus_size":     self._corpus_size,
                "scenes_loaded":   len(self._pool),
                "models_ready":    list(self._models_ready),
                "last_refresh":    self._last_refresh,
                "refresh_interval_hours": REFRESH_INTERVAL / 3600,
                "source":          "MaxCore 9TB corpus",
            }


# ── Singleton ─────────────────────────────────────────────────────────────────

_bridge: Optional[CorpusBridge] = None
_bridge_lock = threading.Lock()


def get_corpus_bridge() -> CorpusBridge:
    global _bridge
    if _bridge is None:
        with _bridge_lock:
            if _bridge is None:
                _bridge = CorpusBridge()
    return _bridge
