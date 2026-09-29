"""Offline-only corpus controls. Hashes are of normalized text, not filenames."""
import hashlib
import json
import math
import re
import unicodedata

LICENSES = {"CC0-1.0", "CC-BY-4.0", "MIT", "Apache-2.0"}
LIVE_AWARENESS_TYPES = {
    "maxcore_live_awareness",
    "maxcore_live_awareness_observation",
}
SECRET = re.compile(
    r"-----BEGIN .*PRIVATE KEY-----|(?:api[_ -]?key|password|secret|token)\s*[:=]"
    r"|(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9]{12,}"
    r"|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    r"|[A-Za-z0-9+/=_-]{48,}", re.I,
)


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def digest(text):
    return hashlib.sha256(normalize(text).encode()).hexdigest()


def _valid_live_awareness_record(record):
    if (not isinstance(record, dict)
            or record.get("provenance_type") not in LIVE_AWARENESS_TYPES
            or not isinstance(record.get("live_provenance"), dict)
            or record.get("license") != "NOASSERTION"
            or record.get("private") != "unknown"
            or record.get("author") != "unattributed live observation"
            or not isinstance(record.get("text"), str)):
        return False
    provenance = record["live_provenance"]
    if record["provenance_type"] == "maxcore_live_awareness":
        return True
    observed_at = provenance.get("observed_at")
    return (
        re.fullmatch(r"[0-9a-f]{64}", str(provenance.get("observation_set_id", ""))) is not None
        and re.fullmatch(r"[0-9a-f]{64}", str(provenance.get("record_id", ""))) is not None
        and re.fullmatch(r"[0-9a-f]{64}", str(provenance.get("text_sha256", ""))) is not None
        and provenance.get("domain") in {"music", "social", "advertising", "culture"}
        and isinstance(provenance.get("source"), str)
        and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", provenance["source"]) is not None
        and type(observed_at) in (int, float)
        and math.isfinite(observed_at)
        and provenance["text_sha256"] == hashlib.sha256(record["text"].encode()).hexdigest()
        and provenance["record_id"] == hashlib.sha256(
            json.dumps([provenance["source"], record.get("source"), record["text"]],
                       separators=(",", ":"), ensure_ascii=True).encode()
        ).hexdigest()
    )


def build_manifest(records, holdouts, *, smoke_only, allow_live_without_holdout=False):
    if not isinstance(holdouts, list) or any(not isinstance(t, str) for t in holdouts):
        raise ValueError("Explicit holdout text list required")
    full_live_corpus = (
        allow_live_without_holdout and bool(records)
        and all(_valid_live_awareness_record(record) for record in records)
        and len({record["provenance_type"] for record in records}) == 1
    )
    if (full_live_corpus
            and records[0]["provenance_type"] == "maxcore_live_awareness_observation"
            and len({record["live_provenance"]["observation_set_id"]
                     for record in records}) != 1):
        full_live_corpus = False
    if not smoke_only and not holdouts and not full_live_corpus:
        raise ValueError("Non-smoke corpus requires independent holdouts unless it is the full live-awareness corpus")
    seen, accepted, rejected = set(), [], []
    normalized_holdouts = [normalize(t) for t in holdouts if normalize(t)]
    for record in records:
        text = record.get("text", "")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Empty or invalid corpus text")
        live_observation = _valid_live_awareness_record(record)
        licensed_record = (
            record.get("license") in LICENSES
            and record.get("private") is False
            and bool(record.get("author"))
        )
        if (not (live_observation or licensed_record)
                or not record.get("source")):
            raise ValueError("Record requires licensed-corpus metadata or explicit live-awareness provenance")
        if smoke_only and record.get("purpose") != "smoke-only":
            raise ValueError("Smoke may use only explicitly smoke-only records")
        key, normalized = digest(text), normalize(text)
        reason = ("secret-or-personal-data" if SECRET.search(text) else
                  "holdout-overlap" if any(h in normalized or normalized in h
                                           for h in normalized_holdouts) else
                  "duplicate" if key in seen else None)
        if reason:
            rejected.append({"sha256": key, "reason": reason})
            continue
        seen.add(key)
        accepted.append({**record, "sha256": key,
                         "raw_sha256": hashlib.sha256(text.encode()).hexdigest()})
    if not accepted:
        raise ValueError("No eligible corpus records")
    manifest = {"schema": 1, "smoke_only": smoke_only,
                "normalization": "NFKC-casefold-whitespace-v1",
                "secret_filter": "conservative-pattern-v1-not-comprehensive",
                "holdout_sha256": sorted(digest(t) for t in holdouts),
                "records": accepted, "rejected": rejected}
    manifest["sha256"] = hashlib.sha256(
        json.dumps(manifest, sort_keys=True, ensure_ascii=True).encode()
    ).hexdigest()
    return manifest


def smoke_records():
    # Newly authored solely for exercising numerical training. No user data,
    # benchmark questions, product requests, or acceptance prompts.
    return [
        {"text": text, "license": "CC0-1.0", "private": False,
         "source": "local:authored-candidate-smoke-v1", "author": "MaxCore smoke fixture",
         "purpose": "smoke-only"}
        for text in ("The copper kite drifts over a quiet dune.",
                     "A tiny lantern rests beside the blue bowl.",
                     "Seven paper boats float beneath the arch.")
    ]