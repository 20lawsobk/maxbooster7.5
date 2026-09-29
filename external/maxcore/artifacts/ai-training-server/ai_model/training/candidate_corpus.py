"""Offline-only corpus controls. Hashes are of normalized text, not filenames."""
import hashlib
import json
import re
import unicodedata

LICENSES = {"CC0-1.0", "CC-BY-4.0", "MIT", "Apache-2.0"}
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


def build_manifest(records, holdouts, *, smoke_only):
    if not isinstance(holdouts, list) or any(not isinstance(t, str) for t in holdouts):
        raise ValueError("Explicit holdout text list required")
    if not smoke_only and not holdouts:
        raise ValueError("Non-smoke corpus requires independent holdouts")
    seen, accepted, rejected = set(), [], []
    normalized_holdouts = [normalize(t) for t in holdouts if normalize(t)]
    for record in records:
        text = record.get("text", "")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Empty or invalid corpus text")
        live_observation = (
            record.get("provenance_type") == "maxcore_live_awareness"
            and isinstance(record.get("live_provenance"), dict)
            and record.get("license") == "NOASSERTION"
            and record.get("private") == "unknown"
            and record.get("author") == "unattributed live observation"
        )
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