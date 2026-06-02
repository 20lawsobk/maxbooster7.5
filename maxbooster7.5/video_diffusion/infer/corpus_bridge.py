"""
MaxCore Corpus Bridge — Port-8000 Relay Scene Enrichment

Connects the DiT-24 relay server to MaxCore's growing 9TB+ dataset.

All scene context is sourced LIVE from MaxCore's corpus via its content
generation API — zero hardcoded topic strings.  The relay constructs
a query on the fly from each scene_name and sends it to MaxCore, which
draws on its 9TB+ training corpus to return scene-specific descriptions.

Background thread refreshes all scene pools every 6 hours so the relay
always has the latest, most corpus-representative context available.
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

REFRESH_INTERVAL = 6 * 3600        # refresh every 6 hours as corpus grows
CONNECT_TIMEOUT  = 6
POST_TIMEOUT     = 30
MAX_RETRIES      = 3
BACKOFF_MAX      = 8.0

_DISK_CACHE = os.path.join(tempfile.gettempdir(), "relay_corpus_cache.json")

# ── Available visual scenes (scene names only — topics derived dynamically) ────
# These are the exact style names used by the relay.  All query content is
# derived from the scene name and fetched live from MaxCore's 9TB corpus.
_ALL_SCENES = [
    "neon_tunnel",
    "concert_stage",
    "city_nights",
    "studio_session",
    "golden_hour",
    "neon_cityscape",
    "plasma_fractal",
    "galaxy_spiral",
    "warp_speed",
    "liquid_metal",
    "fire_embers",
    "crystal_facets",
    "aurora_curtains",
    "trap_aesthetic",
    "gospel_choir",
    "default",
]

# Platforms and tones to rotate across when querying the corpus —
# chosen to maximise vocabulary diversity in the corpus responses.
_PLATFORMS = ["tiktok", "instagram", "youtube"]
_TONES     = ["cinematic", "energetic", "moody", "vibrant", "atmospheric", "intense"]


def _scene_to_query(scene_name: str) -> tuple:
    """
    Derive a (topic, platform, tone) tuple from a scene name.
    No hardcoded descriptions — the scene name IS the query seed.
    MaxCore draws on its 9TB corpus to interpret it.
    """
    label    = scene_name.replace("_", " ")
    topic    = f"music video {label} cinematic high quality"
    platform = random.choice(_PLATFORMS)
    tone     = random.choice(_TONES)
    return topic, platform, tone


def _jitter(ceiling: float) -> float:
    return random.uniform(0, ceiling)


def _backoff(attempt: int) -> float:
    return _jitter(min(BACKOFF_MAX, 1.5 * (2 ** attempt)))


def _mc_post(body: dict) -> Optional[dict]:
    """POST to MaxCore /api/generate/content — the live 9TB corpus endpoint."""
    if not _MC_KEY:
        return None
    import urllib.request, urllib.error
    url  = f"{_MC_URL}/api/generate/content"
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
                log.debug(f"[CorpusBridge] corpus POST HTTP {e.code} (not retrying)")
                return None
            log.debug(f"[CorpusBridge] corpus POST attempt {attempt+1} HTTP {e.code}")
        except Exception as e:
            log.debug(f"[CorpusBridge] corpus POST attempt {attempt+1}: {e}")
        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff(attempt))
    return None


def _mc_get(path: str) -> Optional[dict]:
    if not _MC_KEY:
        return None
    import urllib.request, urllib.error
    url = f"{_MC_URL}{path}"
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(
                url,
                headers={"X-API-Key": _MC_KEY, "Authorization": f"Bearer {_MC_KEY}"},
            )
            with urllib.request.urlopen(req, timeout=CONNECT_TIMEOUT + 10) as resp:
                ct = resp.headers.get("Content-Type", "")
                if "json" in ct:
                    return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (404, 405):
                return None
        except Exception:
            pass
        if attempt < MAX_RETRIES - 1:
            time.sleep(_backoff(attempt))
    return None


def _build_corpus_prompt(scene_name: str, result: dict) -> str:
    """
    Assemble a rich visual prompt from a MaxCore corpus response.
    The response hook/body/hashtags all came from the 9TB corpus —
    we just format them into a single enriched prompt string.
    """
    label  = scene_name.replace("_", " ")
    parts  = []
    hook   = (result.get("hook") or "").strip()
    body   = (result.get("body") or "").strip()
    tags   = " ".join(
        h.lstrip("#") for h in result.get("hashtags", [])[:5]
        if h.startswith("#") and len(h) > 2
    )
    if hook and len(hook) < 150:
        parts.append(hook)
    if body and body != label and len(body) < 200:
        parts.append(body)
    if tags:
        parts.append(tags)
    return " | ".join(parts) if parts else label


class CorpusBridge:
    """
    Pulls visual-scene context from MaxCore's growing 9TB corpus and keeps
    a local warm pool so every relay request can be enriched with up-to-date,
    corpus-sourced descriptions.

    All queries are generated dynamically from scene names — no hardcoded
    topic strings.  MaxCore's 9TB dataset interprets each scene and returns
    the most corpus-representative description available.

    Thread-safe — all shared state is protected by an RLock.
    """

    def __init__(self):
        self._lock:           threading.RLock      = threading.RLock()
        self._pool:           Dict[str, List[str]] = {}   # scene → corpus prompts
        self._online:         Optional[bool]       = None
        self._last_check:     float                = 0.0
        self._last_refresh:   float                = 0.0
        self._corpus_size:    int                  = 0
        self._models_ready:   List[str]            = []

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
        self._online = health is not None and health.get("status") in ("ok", "healthy")

        if self._online and not was_online:
            log.info("[CorpusBridge] MaxCore 9TB corpus online — scene enrichment enabled")
            self._fetch_model_list()
        elif not self._online and was_online is not False:
            log.warning("[CorpusBridge] MaxCore corpus unreachable — will retry in 60s")
        return bool(self._online)

    def _fetch_model_list(self) -> None:
        ready = []
        for domain in ["social", "advertising", "content", "engagement"]:
            state = _mc_get(f"/api/models/{domain}/state")
            if state and state.get("weights", {}).get("ready"):
                ready.append(domain)
        with self._lock:
            self._models_ready = ready
        if ready:
            log.info(f"[CorpusBridge] MaxCore corpus models ready: {ready}")

    # ── Corpus fetch ──────────────────────────────────────────────────────────

    def _fetch_scene_from_corpus(self, scene_name: str) -> List[str]:
        """
        Query MaxCore's live 9TB corpus for context on this scene.
        Topic, platform, and tone are derived from the scene name — nothing is hardcoded.
        Fetches 2 variations (different platform/tone rotations) for richer context.
        """
        prompts = []
        for _ in range(2):
            topic, platform, tone = _scene_to_query(scene_name)
            result = _mc_post({"topic": topic, "platform": platform, "tone": tone})
            if result and (result.get("hook") or result.get("body")):
                p = _build_corpus_prompt(scene_name, result)
                if p:
                    prompts.append(p)
                    log.debug(f"[CorpusBridge] {scene_name}: corpus response received")
        return prompts

    def _seed_sync(self) -> None:
        """Synchronous seed — fetch the 4 highest-priority scenes at startup."""
        priority  = ["neon_tunnel", "concert_stage", "city_nights", "studio_session"]
        fetched   = 0
        for scene in priority:
            prompts = self._fetch_scene_from_corpus(scene)
            if prompts:
                with self._lock:
                    self._pool[scene] = prompts
                    self._corpus_size += len(prompts)
                fetched += len(prompts)
        if fetched:
            log.info(
                f"[CorpusBridge] Seed: {fetched} corpus prompts loaded "
                f"(source: MaxCore 9TB, {len(priority)} priority scenes)"
            )
            self._save_disk_cache()
        else:
            log.warning("[CorpusBridge] Seed fetch returned 0 prompts — corpus may be warming up")

    def _full_refresh(self) -> None:
        """
        Full corpus refresh — all scenes, staggered to avoid burst load.
        Re-fetching captures richer descriptions as MaxCore's 9TB+ corpus grows.
        """
        log.info("[CorpusBridge] Full corpus refresh from MaxCore 9TB dataset …")
        total = 0
        for i, scene in enumerate(_ALL_SCENES):
            if i > 0:
                time.sleep(random.uniform(0.8, 2.0))
            prompts = self._fetch_scene_from_corpus(scene)
            if prompts:
                with self._lock:
                    self._pool[scene] = prompts
                total += len(prompts)

        with self._lock:
            self._corpus_size  = total
            self._last_refresh = time.time()

        self._save_disk_cache()
        log.info(
            f"[CorpusBridge] Corpus refresh complete — "
            f"{total} prompts across {len(_ALL_SCENES)} scenes (MaxCore 9TB)"
        )

    def _background_loop(self) -> None:
        time.sleep(10)  # let seed_sync settle
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
                    self._pool        = data.get("pool", {})
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
        Return one corpus-sourced visual prompt for this scene, or None if the
        pool is cold.  Falls back to the 'default' scene pool if needed.
        """
        with self._lock:
            prompts = self._pool.get(scene_name) or self._pool.get("default")
        if not prompts:
            return None
        return random.choice(prompts)

    def enrich_prompt(self, base_prompt: str, scene_name: str) -> str:
        """
        Combine a corpus-sourced scene description with the base prompt.
        If no corpus prompt is available yet, returns base_prompt unchanged.
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
                "corpus_online":            bool(self._online),
                "corpus_size":              self._corpus_size,
                "scenes_loaded":            len(self._pool),
                "models_ready":             list(self._models_ready),
                "last_refresh":             self._last_refresh,
                "refresh_interval_hours":   REFRESH_INTERVAL / 3600,
                "source":                   "MaxCore 9TB corpus",
                "endpoint":                 "/api/generate/content",
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
