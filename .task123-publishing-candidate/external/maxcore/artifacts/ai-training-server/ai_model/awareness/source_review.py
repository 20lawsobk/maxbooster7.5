"""Durable administrator review state for awareness adapters and records.

Review approval is an audit annotation only. It never changes source access,
retrieval, provenance, reuse rights, or eligibility for model training.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import time

from .engine import LEGACY_SOURCE_REVIEW_KEY, SOURCE_REVIEW_KEY

REVIEW_KEY = LEGACY_SOURCE_REVIEW_KEY
REVIEW_HASH_KEY = SOURCE_REVIEW_KEY
REVIEW_NOTE = "Admin approved"
MAX_ADAPTERS = 500
MAX_RECORDS = 500
_ITEM_ID = re.compile(r"(?:adapter:[A-Za-z0-9_-]{1,80}|record:[a-f0-9]{64})\Z")
_APPROVER_ID = re.compile(r"[A-Za-z0-9._:@-]{1,128}\Z")


class SourceReviewError(RuntimeError):
    """A review operation could not be validated or durably acknowledged."""


def _entry(item_id, value):
    if value is None:
        return {
            "needs_to_be_reviewed": True,
            "note": None,
            "approver_id": None,
            "reviewed_at": None,
        }
    if (
        not isinstance(value, dict)
        or set(value) != {"item_id", "note", "approver_id", "reviewed_at"}
        or value.get("item_id") != item_id
        or value.get("note") != REVIEW_NOTE
        or not isinstance(value.get("approver_id"), str)
        or not _APPROVER_ID.fullmatch(value["approver_id"])
        or type(value.get("reviewed_at")) not in (int, float)
        or not math.isfinite(value["reviewed_at"])
        or value["reviewed_at"] <= 0
    ):
        raise SourceReviewError("source_review_record_invalid")
    return {
        "needs_to_be_reviewed": False,
        "note": value["note"],
        "approver_id": value["approver_id"],
        "reviewed_at": value["reviewed_at"],
    }


def _legacy_document(engine):
    try:
        document = engine.store.get(REVIEW_KEY)
    except Exception as exc:
        raise SourceReviewError("source_review_storage_unavailable") from exc
    if document is None:
        return {"schema": 1, "items": {}}
    if isinstance(document, str):
        try:
            document = json.loads(document)
        except (TypeError, ValueError) as exc:
            raise SourceReviewError("source_review_ledger_invalid") from exc
    if (
        not isinstance(document, dict)
        or set(document) != {"schema", "items"}
        or type(document.get("schema")) is not int
        or document["schema"] != 1
        or not isinstance(document.get("items"), dict)
        or len(document["items"]) > MAX_ADAPTERS + MAX_RECORDS
    ):
        raise SourceReviewError("source_review_ledger_invalid")
    for item_id, value in document["items"].items():
        if not isinstance(item_id, str) or not _ITEM_ID.fullmatch(item_id):
            raise SourceReviewError("source_review_ledger_invalid")
        _entry(item_id, value)
    return document


def _review_states(engine, item_ids):
    try:
        store = engine.store
        migration_check = getattr(store, "source_review_migration_complete", None)
        migrate = getattr(store, "migrate_source_reviews", None)
        read_states = getattr(store, "source_review_states", None)
        if not callable(migration_check) or not callable(migrate) or not callable(read_states):
            raise SourceReviewError("source_review_storage_not_writable")
        if not migration_check():
            legacy = _legacy_document(engine)
            migrate(legacy["items"])
        states = read_states(item_ids)
    except SourceReviewError:
        raise
    except Exception as exc:
        raise SourceReviewError("source_review_storage_unavailable") from exc
    if not isinstance(states, dict):
        raise SourceReviewError("source_review_ledger_invalid")
    for item_id, value in states.items():
        if item_id not in item_ids:
            raise SourceReviewError("source_review_ledger_invalid")
        _entry(item_id, value)
    return states


def _items(engine):
    adapters = sorted(engine.sources)
    if len(adapters) > MAX_ADAPTERS:
        raise SourceReviewError("source_review_adapter_limit_exceeded")
    try:
        records = engine.discovery_observations(limit=MAX_RECORDS)
    except Exception as exc:
        raise SourceReviewError("source_review_records_unavailable") from exc
    adapter_candidates = []
    for source in adapters:
        item_id = f"adapter:{source}"
        if not _ITEM_ID.fullmatch(item_id):
            raise SourceReviewError("source_review_adapter_id_invalid")
        adapter_candidates.append({
            "id": item_id,
            "source_id": source,
            "kind": "adapter",
        })

    record_candidates = []
    for row in records:
        source = row.get("source")
        citation = row.get("citation")
        observed_at = row.get("observed_at")
        discovery = row.get("discovery")
        if (
            not isinstance(source, str)
            or not isinstance(citation, str)
            or type(observed_at) not in (int, float)
            or not math.isfinite(observed_at)
            or not isinstance(discovery, dict)
        ):
            raise SourceReviewError("source_review_record_invalid")
        record_digest = hashlib.sha256(
            json.dumps(
                [source, citation, row.get("text")],
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()
        item_id = f"record:{record_digest}"
        record_candidates.append({
            "id": item_id,
            "kind": "record",
            "source_id": source,
            "platform": discovery.get("platform_scope"),
            "citation": citation,
            "observed_at": observed_at,
            "retrieval_method": discovery.get("retrieval_method"),
            "source_type": discovery.get("source_type"),
            "reuse_rights": discovery.get("reuse_rights"),
            "training_eligible": discovery.get("training_eligible") is True,
        })
    candidates = adapter_candidates + record_candidates
    states = _review_states(engine, [item["id"] for item in candidates])
    reviewed = [
        {
            **item,
            **_entry(item["id"], states.get(item["id"])),
        }
        for item in candidates
    ]
    adapter_items = reviewed[:len(adapter_candidates)]
    record_items = reviewed[len(adapter_candidates):]
    return adapter_items, record_items


def inventory(engine):
    """Return bounded redacted review lists for the authenticated admin UI."""
    adapters, records = _items(engine)
    return {
        "schema": 1,
        "storage_authority": "canonical_pdim_hash_readback",
        "adapter_count": len(adapters),
        "record_count": len(records),
        "pending_count": sum(item["needs_to_be_reviewed"] for item in adapters + records),
        "adapters": adapters,
        "records": records,
    }


def approve_current_inventory(engine, approver_id, *, now=None):
    """Approve only the current inventory, persist atomically, then read it back."""
    actor = str(approver_id or "")
    if not _APPROVER_ID.fullmatch(actor):
        raise SourceReviewError("source_review_approver_invalid")
    adapters, records = _items(engine)
    current = adapters + records
    if not current:
        raise SourceReviewError("source_review_inventory_empty")
    reviewed_at = time.time() if now is None else now
    if type(reviewed_at) not in (int, float) or not math.isfinite(reviewed_at) or reviewed_at <= 0:
        raise SourceReviewError("source_review_timestamp_invalid")
    entries = {
        item["id"]: {
            "item_id": item["id"],
            "note": REVIEW_NOTE,
            "approver_id": actor,
            "reviewed_at": reviewed_at,
        }
        for item in current
        if item["needs_to_be_reviewed"]
    }
    approved_count = 0
    if entries:
        writer = getattr(engine.store, "approve_source_reviews", None)
        if not callable(writer):
            raise SourceReviewError("source_review_storage_not_writable")
        try:
            approved_count = writer(entries)
        except Exception as exc:
            raise SourceReviewError("source_review_write_unavailable") from exc
        if (
            type(approved_count) is not int
            or approved_count < 0
            or approved_count > len(entries)
        ):
            raise SourceReviewError("source_review_write_unavailable")

    result = inventory(engine)
    all_items = result["adapters"] + result["records"]
    if any(item["needs_to_be_reviewed"] for item in all_items):
        raise SourceReviewError("source_review_readback_mismatch")
    for item in all_items:
        if item["note"] != REVIEW_NOTE or not item["approver_id"] or not item["reviewed_at"]:
            raise SourceReviewError("source_review_readback_mismatch")
    return {
        "approved_count": approved_count,
        "already_approved_count": len(current) - approved_count,
        "inventory": result,
    }


def create_router(verify_admin, engine_factory):
    """Create an authenticated approval route for the current inventory."""
    from fastapi import APIRouter, Depends, HTTPException

    router = APIRouter()

    @router.post("/api/awareness/unified/admin/source-review")
    async def approve_sources(admin=Depends(verify_admin)):
        engine = engine_factory()
        try:
            result = approve_current_inventory(
                engine, admin.get("id") if isinstance(admin, dict) else None,
            )
        except SourceReviewError as exc:
            message = str(exc)
            status = 503 if message.endswith(("unavailable", "not_writable")) else 409
            raise HTTPException(status_code=status, detail=message) from exc
        return result

    return router
