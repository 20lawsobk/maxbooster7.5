"""Model-backed release copy on a bounded, deterministic rollout calendar.

Scheduling is deterministic. Every caption section comes from the admitted
script backend; a failed slot aborts the build instead of substituting copy.
"""
from dataclasses import replace
from datetime import date, timedelta
from functools import wraps
import math
import re
import time
from typing import Any, Callable, Dict, List, Optional

# These are creative tasks and dates, never customer-visible generated copy.
_BLUEPRINT = (
    ("announce", "announcement", "post", -35, "awareness", "introduce the release"),
    ("announce", "teaser", "reel", -33, "awareness", "invite curiosity about the release"),
    ("announce", "story", "post", -28, "connection", "invite a conversation about the music"),
    ("tease", "audio_teaser", "reel", -21, "anticipation", "invite a first listen when audio is available"),
    ("tease", "lyric_tease", "reel", -17, "anticipation", "invite listeners to discover the track without inventing lyrics"),
    ("tease", "bts", "reel", -14, "connection", "invite questions about the creative process"),
    ("presave", "presave_push", "post", -12, "conversion", "invite listeners to follow release updates without claiming a pre-save link"),
    ("presave", "countdown", "story", -7, "anticipation", "build anticipation for the planned release"),
    ("presave", "countdown", "reel", -3, "conversion", "invite listeners to watch for the release"),
    ("release", "out_now", "post", 0, "conversion", "announce the release on its scheduled release day"),
    ("release", "out_now", "reel", 0, "conversion", "invite a listen on the scheduled release day"),
    ("release", "thank_you", "post", 2, "connection", "express appreciation without inventing listener counts"),
    ("sustain", "reaction", "reel", 5, "engagement", "ask listeners to share their own reactions"),
    ("sustain", "acoustic", "reel", 10, "engagement", "invite a discussion of the music without claiming an alternate recording exists"),
    ("sustain", "milestone", "post", 18, "engagement", "invite discovery without asserting awards, rankings, stream totals or milestones"),
)
_PLATFORMS = frozenset({"instagram", "tiktok", "youtube", "facebook", "twitter", "x", "threads", "linkedin", "google_business"})
_UNSUPPORTED_CLAIMS = re.compile(
    r"\b(?:just hit (?:a |the |another )?milestone|your reactions (?:are|have)|"
    r"stripped back|link in (?:my |our |the )?bio|\d[\d,.]*\s+(?:streams|listeners|views)|"
    r"(?:award[- ]winning|chart[- ]topping|sold[- ]out))\b", re.I)


def _delivered_url(value):
    from urllib.parse import urlsplit, unquote
    if not isinstance(value, str) or not value.strip():
        return False
    parsed = urlsplit(value)
    if parsed.scheme in {"https", "http"}:
        return bool(parsed.hostname and not parsed.username and not parsed.password)
    return not parsed.scheme and not parsed.netloc and parsed.path.startswith("/uploads/") and ".." not in unquote(parsed.path).split("/")


def _bounded_campaign(function):
    @wraps(function)
    def bounded(*args, **kwargs):
        from ai_model.model.inference_budget import inference_deadline, check_inference_budget
        inherited = inference_deadline.get()
        deadline = time.monotonic() + 120
        token = inference_deadline.set(min(deadline, inherited) if inherited is not None else deadline)
        try:
            check_inference_budget()
            return function(*args, **kwargs)
        finally:
            inference_deadline.reset(token)
    return bounded


@_bounded_campaign
def build_campaign(
    *,
    artist: str,
    title: str,
    genre: Optional[str] = None,
    tone: Optional[str] = None,
    brand_voice: Optional[str] = None,
    target_audience: Optional[str] = None,
    platforms: Optional[List[str]] = None,
    weeks: int = 6,
    mood: Optional[str] = None,
    bpm: Optional[float] = None,
    key: Optional[str] = None,
    release_date: Optional[str] = None,
    hashtag_fn: Optional[Callable[[str, Optional[str], str], List[str]]] = None,
    normalize_platform_fn: Optional[Callable[[str], str]] = None,
    image_fn: Optional[Callable[..., Optional[Dict[str, Any]]]] = None,
    teaser_fn: Optional[Callable[..., Optional[Dict[str, Any]]]] = None,
    seed: int = 0,
    awareness: str = "",
    script_fn: Optional[Callable[..., Any]] = None,
) -> Dict[str, Any]:
    from .awareness import require_context, ensure_context_once
    from .plan import GenerationPlan, active_plan, canonical
    from ai_model.agents.script_agent import ScriptRequest
    from ai_model.model.inference_budget import check_inference_budget
    require_context("general", "campaign")
    if not callable(script_fn):
        raise RuntimeError("Learned campaign generation unavailable: script backend required")
    if not isinstance(artist, str) or not artist.strip() or not isinstance(title, str) or not title.strip():
        raise ValueError("Campaign artist and title must be nonempty strings")
    if isinstance(weeks, bool) or not isinstance(weeks, int) or not 2 <= weeks <= 12:
        raise ValueError("Campaign weeks must be an integer from 2 to 12")
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise ValueError("Campaign seed must be an integer in [0, 2**32)")
    if bpm is not None and (isinstance(bpm, bool) or not isinstance(bpm, (float, int))
                            or not math.isfinite(bpm) or not 0 < bpm <= 1000):
        raise ValueError("Campaign BPM must be a finite positive number at most 1000")
    requested = platforms if platforms is not None else ["instagram", "tiktok"]
    if not isinstance(requested, list) or not requested or not all(isinstance(p, str) for p in requested):
        raise ValueError("Campaign platforms must be a nonempty list of supported names")
    allowed = []
    for platform in requested:
        normalized = normalize_platform_fn(platform) if normalize_platform_fn else platform.strip().lower()
        if normalized not in _PLATFORMS:
            raise ValueError("Unsupported campaign platform")
        if normalized not in allowed:
            allowed.append(normalized)
    released = date.fromisoformat(release_date) if release_date is not None else None
    parent = active_plan.get() or GenerationPlan.from_request({
        "artist": artist, "topic": title, "weeks": weeks, "platforms": allowed,
        "seed": seed, "genre": genre, "tone": tone, "release_date": release_date,
        "brand_voice": brand_voice, "target_audience": target_audience,
        "mood": mood, "bpm": bpm, "key": key, "awareness": awareness,
    }, "campaign")
    phases = {}
    counts = {}
    images_generated = teasers_queued = 0
    for index, (phase, kind, fmt, base_day, goal, task) in enumerate(_BLUEPRINT):
        platform = allowed[index % len(allowed)]
        offset = round(base_day * weeks / 6) if base_day < 0 else base_day
        instruction = (
            f"Campaign task: {task}. Artist: {artist.strip()}. Release: {title.strip()}. "
            f"Genre: {genre or 'unspecified'}. Mood: {mood or 'unspecified'}. "
            f"Requested musical context: BPM {bpm if bpm is not None else 'unspecified'}, key {key or 'unspecified'}. "
            f"Brand voice: {brand_voice or 'unspecified'}. "
            f"Scheduled day relative to release: {offset}. "
            "The copy is a draft for that scheduled date, not a claim that it has been posted. "
            "Do not invent awards, chart positions, listener counts, milestones, reviews, "
            "fan reactions, links, lyrics or alternate recordings. "
            "Invite participation when supporting facts are unavailable."
        )
        request = ScriptRequest(idea=instruction, platform=platform, goal=goal,
            tone=tone or "authentic", awareness=awareness,
            variant_idx=index, genre=genre or "", target_audience=target_audience or "",
            output_format=fmt)
        # A unique immutable slot request prevents cross-slot cache reuse while
        # preserving the parent checkpoint, facts and exact public scan revision.
        slot = replace(parent, modality="text", topic=title,
                       request_json=canonical({**vars(request), "brand_voice": brand_voice,
                                               "campaign_slot": index}),
                       seed=(parent.seed + index) % 2**32)
        token = active_plan.set(slot)
        try:
            check_inference_budget()
            request.awareness = ensure_context_once(awareness, platform, "text")
            generated = script_fn(request)
            check_inference_budget()
            source = getattr(generated, "source", None)
            fields = [getattr(generated, name, None) for name in ("hook", "body", "cta")]
            if source not in {"model", "ai_model", "model_composed"} or not all(
                    isinstance(value, str) and value.strip() for value in fields):
                raise RuntimeError("Campaign script backend returned no validated model copy")
            hook, body, cta = (value.strip() for value in fields)
            caption = "\n\n".join((hook, body, cta))
            if _UNSUPPORTED_CLAIMS.search(caption):
                raise RuntimeError("Campaign copy contains an unsupported promotional claim")
            # Revalidate a captured live scan after the inference call as well.
            require_context(platform, "text")
        finally:
            active_plan.reset(token)
        tags = hashtag_fn(title, genre, platform) if hashtag_fn else []
        if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
            raise ValueError("Campaign hashtag backend returned invalid tags")
        post = {"day_offset": offset, "date": (released + timedelta(days=offset)).isoformat() if released else None,
                "platform": platform, "content_type": kind, "format": fmt, "goal": goal,
                "brief": task, "hook": hook, "body": body, "cta": cta, "caption": caption,
                "hashtags": tags[:8], "char_count": len(caption), "source": source,
                "generation_plan_hash": slot.plan_hash, "asset_errors": []}
        # Optional assets have their own honest status; no missing asset is
        # represented as a rendered image or completed video.
        for name, callback in (("image", image_fn), ("teaser", teaser_fn if fmt in {"reel", "video"} else None)):
            if callback is None:
                continue
            try:
                check_inference_budget()
                args = {"topic": title, "platform": platform, "purpose": goal, "art_direction": None}
                args.update({"headline": hook, "fmt": fmt} if name == "image" else {"hook": hook, "body": body, "cta": cta})
                asset = callback(**args)
                check_inference_budget()
                if not isinstance(asset, dict) or not asset:
                    raise RuntimeError("requested asset was not produced")
                if name == "image" and not _delivered_url(asset.get("url")):
                    raise RuntimeError("requested image has no delivery URL")
                if name == "teaser" and not (_delivered_url(asset.get("url")) or (
                        isinstance(asset.get("job_id"), str) and asset["job_id"].strip())):
                    raise RuntimeError("requested teaser has no asset or queued job")
                if asset.get("asset_status") == "spec_only" or asset.get("status") in {"error", "failed"}:
                    raise RuntimeError("requested asset is not delivered or queued")
                post[name] = asset
                images_generated += int(name == "image")
                teasers_queued += int(name == "teaser")
            except TimeoutError:
                raise
            except Exception as exc:
                post["asset_errors"].append({"kind": name, "status": "unavailable", "error": type(exc).__name__})
        phases.setdefault(phase, {"phase": phase, "label": phase.replace("_", " ").title(), "posts": []})["posts"].append(post)
        counts[platform] = counts.get(platform, 0) + 1
    return {
        "release": {"artist": artist.strip(), "title": title.strip(), "genre": genre,
                    "weeks": weeks, "platforms": allowed, "release_date": released.isoformat() if released else None},
        "art_direction": None, "phases": list(phases.values()),
        "summary": {"total_posts": len(_BLUEPRINT), "by_platform": counts,
                    "by_phase": {phase: len(value["posts"]) for phase, value in phases.items()},
                    "images_generated": images_generated, "teasers_queued": teasers_queued},
        "generation_plan_hash": parent.plan_hash,
        "notes": ["Draft copy and dates require the artist's publishing action; no post, metric or media completion is inferred."],
    }
