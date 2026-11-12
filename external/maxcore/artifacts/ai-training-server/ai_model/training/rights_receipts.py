"""Authenticated provenance for MaxCore-authored training examples."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re

INTERNAL_LICENSE = "MAXCORE-INTERNAL-1.0"
OWNER_ADMIN_GRANT = "owner-admin-authored-v1"
SIMULATION_GRANT = "maxcore-simulation-v1"
_SOURCE_ID = re.compile(r"[A-Za-z0-9:_./-]{1,180}\Z")


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _receipt_key():
    return os.environ.get("AI_SERVER_KEY", "").encode()


def sign_simulation_segment(segment):
    key = _receipt_key()
    if not key:
        raise ValueError("AI_SERVER_KEY is required to attest simulation data")
    body = _canonical(segment).encode()
    body_hash = hashlib.sha256(body).hexdigest()
    claims = {"schema": 1, "source": "maxcore-simulation",
              "cycle": segment["cycle"], "body_sha256": body_hash}
    signature = hmac.new(key, _canonical(claims).encode(), hashlib.sha256).hexdigest()
    return {**claims, "signature": signature}


def verify_simulation_segment(segment):
    if not isinstance(segment, dict) or not isinstance(segment.get("integrity"), dict):
        return False
    integrity = segment["integrity"]
    body = {key: value for key, value in segment.items() if key != "integrity"}
    try:
        expected = sign_simulation_segment(body)
    except (ValueError, KeyError, TypeError):
        return False
    return (
        set(integrity) == set(expected)
        and all(hmac.compare_digest(str(integrity.get(key, "")), str(value))
                for key, value in expected.items())
    )


def make_training_record(text, *, source_id, provenance_type, grant, key_id, author):
    """Build a record whose origin claim is verifiable by the candidate gate."""
    if not isinstance(text, str) or not text.strip() or not _SOURCE_ID.fullmatch(source_id):
        raise ValueError("Invalid internal training record")
    if grant not in {OWNER_ADMIN_GRANT, SIMULATION_GRANT}:
        raise ValueError("Unsupported internal training grant")
    if grant == OWNER_ADMIN_GRANT and key_id != "env-admin":
        raise ValueError("Owner training requires the configured owner-admin key")
    if grant == SIMULATION_GRANT and key_id != "maxcore-simulator":
        raise ValueError("Simulation training requires the MaxCore simulator")
    key = _receipt_key()
    if not key:
        raise ValueError("AI_SERVER_KEY is required to attest internal training data")

    text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    claims = {
        "schema": 1,
        "grant": grant,
        "key_id": key_id,
        "source_id": source_id,
        "provenance_type": provenance_type,
        "text_sha256": text_hash,
    }
    signature = hmac.new(key, _canonical(claims).encode(), hashlib.sha256).hexdigest()
    return {
        "text": text,
        "license": INTERNAL_LICENSE,
        "private": False,
        "source": source_id,
        "author": author,
        "purpose": "training",
        "provenance_type": provenance_type,
        "internal_provenance": {**claims, "signature": signature},
    }


def verify_training_record(record):
    """Recheck signed internal provenance at admission and candidate review."""
    if not isinstance(record, dict) or record.get("license") != INTERNAL_LICENSE:
        return False
    text = record.get("text")
    provenance = record.get("internal_provenance")
    if (not isinstance(text, str) or not text.strip()
            or not isinstance(provenance, dict)
            or set(provenance) != {
                "schema", "grant", "key_id", "source_id",
                "provenance_type", "text_sha256", "signature",
            }
            or provenance.get("schema") != 1
            or provenance.get("text_sha256") != hashlib.sha256(text.encode()).hexdigest()
            or not _SOURCE_ID.fullmatch(str(provenance.get("source_id", "")))):
        return False
    grant = provenance["grant"]
    provenance_type = provenance["provenance_type"]
    key_id = provenance["key_id"]
    if grant == OWNER_ADMIN_GRANT:
        expected_type, expected_key = "maxcore_owner_admin_output", "env-admin"
    elif grant == SIMULATION_GRANT:
        expected_type, expected_key = "maxcore_simulated_choice", "maxcore-simulator"
    else:
        return False
    if provenance_type != expected_type or key_id != expected_key:
        return False
    key = _receipt_key()
    if not key:
        return False
    claims = {name: provenance[name] for name in (
        "schema", "grant", "key_id", "source_id", "provenance_type", "text_sha256",
    )}
    expected = hmac.new(key, _canonical(claims).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(str(provenance.get("signature", "")), expected):
        return False
    return (
        record.get("private") is False
        and record.get("purpose") == "training"
        and isinstance(record.get("author"), str)
        and bool(record["author"].strip())
        and record.get("source") == provenance["source_id"]
    )
