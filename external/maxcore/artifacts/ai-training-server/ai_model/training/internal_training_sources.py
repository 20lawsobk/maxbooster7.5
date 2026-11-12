"""Bounded internal owner/simulation corpus for MaxCore's existing learner."""
from __future__ import annotations

import base64
import io
import gzip
import hashlib
import json
import math
import random
import threading
import time

from .rights_receipts import (
    OWNER_ADMIN_GRANT,
    SIMULATION_GRANT,
    make_training_record,
    verify_training_record,
)

STATE_KEY = "mb:maxcore:simulation:v1:state"
CYCLE_PREFIX = "mb:maxcore:simulation:v1:cycle:"
OWNER_DATASETS = ("scripts", "social", "video", "daw", "distribution")
SIMULATED_DAYS_PER_TRACK = 3650
MAX_TRAINING_RECORDS = 512
MAX_OWNER_RECORDS = 128
_cycle_lock = threading.Lock()


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _read_json(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _state_default():
    return {
        "schema": 1,
        "cycle": 0,
        "last_cycle_at": 0,
        "rolling": {
            "followers": 1000,
            "cash": 2500,
            "catalog": 4,
            "engagement": 0.035,
            "fatigue": 0.1,
            "action_trials": {},
            "action_rewards": {},
        },
    }


def _stable_unit(seed):
    return int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _choice(state, event, rng, *, rolling):
    actions = ("release", "collaborate", "promote", "preserve_budget")
    if not rolling:
        # The fixed track is a reproducible baseline policy and never learns.
        if state["cash"] < 300:
            return "preserve_budget"
        if state["catalog"] < 8 and event in {"release_window", "audience_growth"}:
            return "release"
        if state["engagement"] < 0.025:
            return "collaborate"
        return "promote"

    trials = state["action_trials"]
    rewards = state["action_rewards"]
    total = sum(trials.values())
    scores = {}
    for action in actions:
        count = trials.get(action, 0)
        mean = rewards.get(action, 0.0) / count if count else 0.0
        explore = math.sqrt(math.log(total + 2) / (count + 1))
        scores[action] = mean + 0.25 * explore + rng.random() * 1e-6
    return max(actions, key=lambda action: (scores[action], action))


def _simulate_day(state, *, day, cycle, track, rolling, seed):
    rng = random.Random(seed)
    event_types = ("release_window", "audience_growth", "platform_shift", "cash_pressure")
    event = event_types[int(_stable_unit(f"{seed}:event") * len(event_types))]
    action = _choice(state, event, rng, rolling=rolling)

    baseline = {
        ("release_window", "release"): 0.72,
        ("audience_growth", "collaborate"): 0.68,
        ("platform_shift", "promote"): 0.52,
        ("cash_pressure", "preserve_budget"): 0.70,
    }
    expected = baseline.get((event, action), 0.38)
    outcome = min(1.0, max(0.0, expected + (rng.random() - 0.5) * 0.2
                           - state["fatigue"] * 0.08))
    if action == "release":
        state["catalog"] = min(10000, state["catalog"] + 1)
        state["cash"] = max(0.0, state["cash"] - 120 + outcome * 250)
    elif action == "collaborate":
        state["followers"] = min(100_000_000, state["followers"] + int(5 + outcome * 80))
        state["engagement"] = min(1.0, state["engagement"] * 0.98 + outcome * 0.001)
    elif action == "promote":
        state["cash"] = max(0.0, state["cash"] - 45)
        state["followers"] = min(100_000_000, state["followers"] + int(outcome * 55))
        state["fatigue"] = min(1.0, state["fatigue"] * 0.995 + 0.001)
    else:
        state["cash"] = min(1_000_000_000.0, state["cash"] + 18)
        state["fatigue"] = max(0.0, state["fatigue"] * 0.98)

    if rolling:
        state["action_trials"][action] = state["action_trials"].get(action, 0) + 1
        state["action_rewards"][action] = (
            state["action_rewards"].get(action, 0.0) + outcome
        )
    text = (
        f"Synthetic music-business decision. Track {track}; year {(day - 1) // 365 + 1}; "
        f"day {(day - 1) % 365 + 1}; event {event}; followers {state['followers']}; "
        f"catalog {state['catalog']}; cash {state['cash']:.0f}; engagement "
        f"{state['engagement']:.4f}; fatigue {state['fatigue']:.3f}. "
        f"Decision {action}; simulated outcome score {outcome:.3f}."
    )
    source_id = (
        f"simulation:{track}:cycle:{cycle}:day:{day}"
        if rolling else f"simulation:baseline:day:{day}"
    )
    return make_training_record(
        text, source_id=source_id,
        provenance_type="maxcore_simulated_choice",
        grant=SIMULATION_GRANT, key_id="maxcore-simulator",
        author="MaxCore synthetic simulator",
    )


def _make_holdouts(cycle):
    cases = []
    for index in range(16):
        seed = f"maxcore-heldout-v1:{cycle}:{index}"
        rng = random.Random(seed)
        event = ("unexpected platform policy change", "catalog rights dispute",
                 "audience fatigue spike", "distribution delay")[index % 4]
        constraints = int(100 + rng.random() * 900)
        prompt = (
            f"Independent synthetic evaluation case {cycle}-{index}: "
            f"music business event={event}; cash constraint={constraints}; "
            "choose one action and explain its expected tradeoff."
        )
        expected = (
            "Compare expected audience value, rights risk, and cash preservation; "
            "choose the lowest-risk action that addresses the stated event."
        )
        cases.append({"id": f"sim-holdout-{cycle}-{index}", "prompt": prompt,
                      "expected": expected})
    return {"schema": 1, "frozen": True, "cases": cases,
            "source": "separate-synthetic-holdout-v1", "cycle": cycle}


def _make_cycle(state):
    cycle = state["cycle"] + 1
    rolling_state = json.loads(_canonical(state["rolling"]))
    baseline_state = _state_default()["rolling"]
    rolling, baseline = [], []
    for day in range(1, SIMULATED_DAYS_PER_TRACK + 1):
        baseline.append(_simulate_day(
            baseline_state, day=day, cycle=cycle, track="baseline",
            rolling=False, seed=f"maxcore-baseline-v1:{day}",
        ))
        rolling.append(_simulate_day(
            rolling_state, day=day, cycle=cycle, track="rolling",
            rolling=True, seed=f"maxcore-rolling-v1:{cycle}:{day}",
        ))
    holdouts = _make_holdouts(cycle)
    segment = {
        "schema": 1,
        "simulation_version": "daily-music-decisions-v1",
        "cycle": cycle,
        "horizon_days": SIMULATED_DAYS_PER_TRACK,
        "tracks": {"baseline": baseline, "rolling": rolling},
        "holdout": holdouts,
    }
    return segment, {
        "schema": 1, "cycle": cycle,
        "rolling": rolling_state,
        "last_cycle_at": int(time.time()),
    }


def _segment_key(cycle):
    return f"{CYCLE_PREFIX}{cycle:08d}"


def _encode_segment(segment):
    return base64.b64encode(
        gzip.compress(_canonical(segment).encode(), mtime=0)
    ).decode("ascii")


def _decode_segment(value):
    if not isinstance(value, str) or len(value) > 20_000_000:
        return None
    try:
        compressed = base64.b64decode(value, validate=True)
        with gzip.GzipFile(fileobj=io.BytesIO(compressed), mode="rb") as stream:
            raw = stream.read(40_000_001)
        if len(raw) > 40_000_000:
            return None
        return json.loads(raw)
    except (ValueError, OSError, EOFError, json.JSONDecodeError):
        return None


def _owner_records(storage):
    records, seen = [], set()
    for content_type in OWNER_DATASETS:
        try:
            samples = storage.lrange(f"mb:dataset:flywheel:{content_type}", 0, 199)
        except Exception:
            continue
        for sample in samples or []:
            if isinstance(sample, str):
                sample = _read_json(sample)
            if not isinstance(sample, dict) or sample.get("key_id") != "env-admin":
                continue
            if sample.get("training_rights_excluded") is True:
                continue
            for record in sample.get("training_records", [])[:12]:
                if not verify_training_record(record):
                    continue
                digest = hashlib.sha256(record["text"].encode()).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                records.append(record)
                if len(records) >= MAX_OWNER_RECORDS:
                    return records
    return records


def collect_internal_training_bundle(storage=None, *, now=None):
    """Generate at most one complete 10-year dual-track cycle per minute.

    The learner calls this from its existing single-owner tick. A cycle is
    published as one compressed immutable segment before its state pointer.
    """
    if storage is None:
        from storage_client import get_storage
        storage = get_storage()
    now = time.time() if now is None else float(now)
    if not math.isfinite(now):
        raise ValueError("Invalid simulation clock")
    if storage is None or not storage.is_available:
        raise RuntimeError("Canonical PDIM storage is required for simulation learning")

    with _cycle_lock:
        state = _read_json(storage.get(STATE_KEY)) or _state_default()
        if (state.get("schema") != 1 or type(state.get("cycle")) is not int
                or state["cycle"] < 0 or not isinstance(state.get("rolling"), dict)
                or not isinstance(state["rolling"].get("action_trials"), dict)
                or not isinstance(state["rolling"].get("action_rewards"), dict)):
            raise ValueError("Invalid persisted simulation state")

        if now - float(state.get("last_cycle_at", 0)) >= 60:
            segment, updated_state = _make_cycle(state)
            encoded = _encode_segment(segment)
            key = _segment_key(segment["cycle"])
            existing = storage.get(key)
            if existing is not None and existing != encoded:
                raise ValueError("Simulation segment collision")
            if existing is None:
                if storage.set(key, encoded) is not True:
                    raise RuntimeError("Simulation segment was not durably acknowledged")
            if storage.get(key) != encoded:
                raise RuntimeError("Simulation segment readback mismatch")
            updated_state["last_cycle_at"] = now
            updated_state["last_segment_sha256"] = hashlib.sha256(encoded.encode()).hexdigest()
            if storage.set(STATE_KEY, updated_state) is not True:
                raise RuntimeError("Simulation state was not durably acknowledged")
            state = updated_state

        encoded = storage.get(_segment_key(state["cycle"])) if state["cycle"] else None
        segment = _decode_segment(encoded) if encoded else None
        if not isinstance(segment, dict) or segment.get("cycle") != state["cycle"]:
            raise RuntimeError("Verified simulation segment is unavailable")

        selected = []
        for track in ("baseline", "rolling"):
            rows = segment["tracks"][track]
            stride = max(1, len(rows) // 192)
            selected.extend(rows[::stride][:192])
        selected.extend(_owner_records(storage))
        unique, hashes = [], set()
        for record in selected:
            if not verify_training_record(record):
                continue
            fingerprint = hashlib.sha256(record["text"].encode()).hexdigest()
            if fingerprint not in hashes:
                hashes.add(fingerprint)
                unique.append(record)
        if len(unique) > MAX_TRAINING_RECORDS:
            unique = unique[:MAX_TRAINING_RECORDS]
        if not unique:
            raise RuntimeError("No verified internal training records are available")
        holdout = segment["holdout"]
        identity = {
            "schema": 1,
            "cycle": state["cycle"],
            "records": sorted(r["internal_provenance"]["text_sha256"] for r in unique),
            "holdout_ids": [case["id"] for case in holdout["cases"]],
        }
        return {
            "schema": 1,
            "source_type": "maxcore_internal_owner_and_simulation",
            "id": hashlib.sha256(_canonical(identity).encode()).hexdigest(),
            "collected_at": now,
            "sources": sorted({r["internal_provenance"]["grant"] for r in unique}),
            "domains": ["music"],
            "records": unique,
            "holdout": holdout,
            "source_status": {
                "simulation_cycle": state["cycle"],
                "simulation_horizon_days_per_track": SIMULATED_DAYS_PER_TRACK,
                "baseline_records_generated": SIMULATED_DAYS_PER_TRACK,
                "rolling_records_generated": SIMULATED_DAYS_PER_TRACK,
                "owner_admin_records_eligible": sum(
                    r["internal_provenance"]["grant"] == OWNER_ADMIN_GRANT
                    for r in unique
                ),
                "training_records_selected": len(unique),
                "last_cycle_at": state["last_cycle_at"],
                "segment_sha256": state.get("last_segment_sha256"),
                "synthetic_data_is_public_observation": False,
            },
        }
