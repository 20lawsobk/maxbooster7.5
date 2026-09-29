"""
admin_content_loop.py — Autonomous Admin Content Generation Loop

Runs as a daemon background thread after server startup. Periodically generates
content (scripts, social posts, DAW/beat descriptions) using the admin identity
and feeds it into the flywheel, so MaxBooster's own corpus grows toward the live
industry signal and the external awareness buffer retires naturally.

Retirement flow:
  quality_awareness.self_sufficiency()["buffer_weight"]
    1.0 → external Deezer/BPM awareness fully drives generation
    0.0 → admin corpus is self-sufficient; external seeding stops

The loop:
  1. Reads live industry targets (genre, BPM, mood) from quality_awareness
  2. Builds a full awareness string via platform_awareness_string()
  3. Generates awareness-conditioned content through the agent stack
  4. Injects every result into the FlywheelIngestor (→ pdim, → phrase graduation)
  5. Backs off when the corpus is self-sufficient (buffer_weight == 0)
  6. Never raises — all errors are caught and logged

Digital GPU note: all heavy inference in this loop flows through the existing
agent stack (ScriptAgent, DistributionAgent), which routes through the MaxCore
DigitalGPU backend. This file contains no direct numpy/torch calls.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

_log = logging.getLogger("admin_content_loop")

# ── Tunables (override via env) ──────────────────────────────────────────────
# How many seconds to sleep between generation cycles when the corpus is young.
_CYCLE_SECONDS         = int(os.environ.get("MB_LOOP_CYCLE_S",        "120"))
# Back-off multiplier when self-sufficient (corpus retired).
_BACKOFF_RETIRED_S     = int(os.environ.get("MB_LOOP_BACKOFF_RETIRED", "600"))
# Genres to cycle through per iteration (derived from live Deezer chart data).
_DEFAULT_GENRES = [
    "hip hop", "trap", "phonk", "r&b", "afrobeats", "drill",
    "pop", "electronic", "reggaeton", "latin",
]
# Platforms for social/distribution content.
_PLATFORMS = ["tiktok", "instagram", "youtube", "twitter", "spotify"]
# Minimum time (s) to wait after startup before first generation cycle.
_STARTUP_DELAY_S       = int(os.environ.get("MB_LOOP_STARTUP_DELAY",  "90"))

_started = False
_started_lock = threading.Lock()


def _build_awareness(genre: str, platform: str) -> str:
    """Build awareness from the already validated request-bound snapshot."""
    parts: list[str] = []
    from ai_model.awareness import bound_snapshot
    from ai_model.quality_awareness import platform_awareness_string, music_targets
    bound_snapshot()  # fail this cycle rather than generate without its pinned source
    plat_aw = platform_awareness_string(platform)
    if plat_aw:
        parts.append(plat_aw)
    targets = music_targets(genre)
    if targets.get("bpm"):
        parts.append(
            f"[HIGH] Live chart BPM for {genre}: {targets['bpm']:.0f} "
            f"(range {targets.get('bpm_range', '')})"
        )
    if targets.get("energy"):
        parts.append(f"Energy level: {targets['energy']}")
    return "\n".join(parts)


def _run_with_plan(script_agent: Any, request: Any) -> Any:
    """Run autonomous admin generation under the same pinned-plan contract as APIs."""
    from ai_model.awareness import bound_snapshot
    from ai_model.generation.plan import GenerationPlan, active_plan
    snapshot = bound_snapshot()
    plan = GenerationPlan.from_request(request, "text", checkpoint="admin-flywheel")
    token = active_plan.set(plan)
    try:
        return script_agent.run(request)
    finally:
        active_plan.reset(token)


def _generate_script(
    genre: str, platform: str, awareness: str,
    script_agent: Any,
) -> dict[str, Any] | None:
    """Generate a hook/body/CTA script via ScriptAgent. Never raises."""
    try:
        from ai_model.agents.script_agent import ScriptRequest
        request = ScriptRequest(
            idea=f"{genre} music release",
            platform=platform,
            goal="growth",
            tone="energetic",
            awareness=awareness,
        )
        sr = _run_with_plan(script_agent, request)
        if sr and sr.hook:
            return {
                "hook":     sr.hook,
                "body":     sr.body,
                "cta":      sr.cta,
                "platform": platform,
                "genre":    genre,
                "source":   getattr(sr, "source", "model"),
            }
    except Exception as exc:
        _log.debug("[loop] script gen error: %s", exc)
    return None


def _generate_social(
    genre: str, platform: str, awareness: str,
    script_agent: Any,
) -> dict[str, Any] | None:
    """Generate a social caption variant. Reuses ScriptAgent. Never raises."""
    try:
        from ai_model.agents.script_agent import ScriptRequest
        request = ScriptRequest(
            idea=f"{genre} drop",
            platform=platform,
            goal="engagement",
            tone="authentic",
            awareness=awareness,
        )
        sr = _run_with_plan(script_agent, request)
        if sr and sr.hook:
            return {
                "caption":  sr.hook,
                "platform": platform,
                "genre":    genre,
            }
    except Exception as exc:
        _log.debug("[loop] social gen error: %s", exc)
    return None


def _generate_daw(
    genre: str, platform: str, awareness: str,
    script_agent: Any,
) -> dict[str, Any] | None:
    """Generate a beat/DAW description (hook + lyric stub). Never raises."""
    try:
        from ai_model.agents.script_agent import ScriptRequest
        request = ScriptRequest(
            idea=f"{genre} beat",
            platform="general",
            goal="creative production",
            tone="raw",
            awareness=awareness,
        )
        sr = _run_with_plan(script_agent, request)
        if sr and sr.hook:
            return {
                "hook":   sr.hook,
                "lyrics": sr.body,
                "genre":  genre,
            }
    except Exception as exc:
        _log.debug("[loop] daw gen error: %s", exc)
    return None


def _run_cycle(get_script_agent_fn, counters: list[int]) -> str:
    """Generate one pinned admin cycle and feed all successful outputs to PDIM."""
    from ai_model.awareness import bind, get_engine
    from ai_model.quality_awareness import self_sufficiency, music_targets

    snapshot = get_engine().require_snapshot()
    with bind(snapshot):
        suff = self_sufficiency()
        if suff["retired"]:
            _log.info(
                "[loop] own corpus reached retirement threshold (%d/%d); "
                "external awareness retired",
                suff["own_corpus"], suff["retire_threshold"],
            )
            return "retired"

        live_targets = music_targets()
        live_genres = live_targets.get("trending_genres") or _DEFAULT_GENRES
        genre = live_genres[counters[0] % len(live_genres)]
        platform = _PLATFORMS[counters[1] % len(_PLATFORMS)]
        counters[0] += 1
        counters[1] += 1

        awareness = _build_awareness(genre, platform)
        if not awareness:
            raise RuntimeError("Validated live awareness produced no admin conditioning")

        script_agent = get_script_agent_fn()
        if script_agent is None:
            return "retry"
        from workers.admin_flywheel import get_flywheel
        flywheel = get_flywheel()
        if flywheel is None:
            return "retry"

        admin_meta = {
            "genre": genre,
            "platform": platform,
            "buffer_weight": suff["buffer_weight"],
            "own_corpus": suff["own_corpus"],
            "snapshot_id": snapshot.id,
            "loop_cycle": "autonomous",
        }

        script = _generate_script(genre, platform, awareness, script_agent)
        if script:
            flywheel.ingest("scripts", script, admin_meta, key_id="admin")
            _log.info("[loop] ingested admin script: genre=%r platform=%r", genre, platform)

        social = _generate_social(genre, platform, awareness, script_agent)
        if social:
            flywheel.ingest("social", social, admin_meta, key_id="admin")

        daw = _generate_daw(genre, platform, awareness, script_agent)
        if daw:
            flywheel.ingest("daw", daw, admin_meta, key_id="admin")
        return "generated"


def _run_loop(get_script_agent_fn, get_distribution_agent_fn) -> None:
    """Run admin generation while external awareness is still needed."""
    _log.info("[loop] waiting %ds for model warmup...", _STARTUP_DELAY_S)
    time.sleep(_STARTUP_DELAY_S)
    counters = [0, 0]
    _log.info("[loop] starting autonomous admin content generation")
    while True:
        try:
            outcome = _run_cycle(get_script_agent_fn, counters)
        except Exception as exc:
            _log.warning("[loop] cycle failed; will retry: %s", exc)
            outcome = "retry"
        time.sleep(
            _BACKOFF_RETIRED_S if outcome == "retired"
            else 30 if outcome == "retry"
            else _CYCLE_SECONDS
        )


def start(get_script_agent_fn, get_distribution_agent_fn=None) -> None:
    """
    Start the autonomous content generation loop in a daemon thread.
    Idempotent — safe to call multiple times (only the first call does anything).

    Args:
        get_script_agent_fn:       callable returning the ScriptAgent singleton (or None)
        get_distribution_agent_fn: callable returning the DistributionAgent singleton (or None)
    """
    global _started
    with _started_lock:
        if _started:
            return
        _started = True

    t = threading.Thread(
        target=_run_loop,
        args=(get_script_agent_fn, get_distribution_agent_fn or (lambda: None)),
        daemon=True,
        name="admin-content-loop",
    )
    t.start()
    _log.info("[loop] started (cycle=%ds, startup_delay=%ds)", _CYCLE_SECONDS, _STARTUP_DELAY_S)
