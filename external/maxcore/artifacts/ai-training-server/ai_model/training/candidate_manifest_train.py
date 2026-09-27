"""Offline bounded transformer training from fingerprinted corpus + frozen holdouts.

Corpus: {"schema":1,"records":[{"text":"...", "license":"CC0-1.0",
"private":false,"source":"public source URL or authored provenance",
"author":"rights holder","purpose":"training"}]}.
Supported license identifiers are enforced by candidate_corpus. Metadata is a
declaration, not a legal determination; signed independent rights review is
required for quality selection. Runtime-validation/smoke records stay blocked.
Holdout: {"schema":1,"frozen":true,"decoding":{"method":"greedy"},
"cases":[{"id":"...", "prompt":"...", "max_new_tokens":16}]}.
Supply both independently frozen raw-file hashes. Holdout text is never copied
into the training run; only its fingerprint and exclusion hashes are retained.
"""
import argparse
import hashlib
import json
from pathlib import Path

from ai_model.training.candidate_corpus import build_manifest, digest, smoke_records
from ai_model.training.candidate_lifecycle import train_validated


def read_pinned(path, expected, max_bytes=2_000_000):
    path = Path(path)
    if path.stat().st_size > max_bytes:
        raise ValueError("Input exceeds bounded file size")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Input SHA256 mismatch")
    return json.loads(raw)


def train_from_manifest(corpus, corpus_sha256, holdout, holdout_sha256,
                        run_id, steps=4, seed=1729, lr=0.1, manual_backward=False):
    if not 1 <= steps <= 64 or not 0 < lr <= 0.2:
        raise ValueError("Bounded training requires steps 1..64 and learning rate (0,0.2]")
    data = read_pinned(corpus, corpus_sha256)
    frozen = read_pinned(holdout, holdout_sha256)
    if frozen.get("frozen") is not True or frozen.get("schema") != 1:
        raise ValueError("Independent schema-1 frozen holdout required")
    cases = frozen.get("cases", [])
    if not cases or len(cases) > 64:
        raise ValueError("Frozen holdout requires 1..64 cases")
    holdouts = []
    ids = set()
    for case in cases:
        if not isinstance(case.get("id"), str) or case["id"] in ids:
            raise ValueError("Unique holdout case IDs required")
        ids.add(case["id"])
        if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
            raise ValueError("Holdout prompts required")
        holdouts.append(case["prompt"])
        if case.get("expected"):
            holdouts.append(case["expected"])
    records = data.get("records")
    if data.get("schema") != 1 or not isinstance(records, list) or not records or len(records) > 10000:
        raise ValueError("Corpus schema-1 records required (1..10000)")
    if any(r.get("purpose") not in ("training", "smoke-only", "runtime-validation")
           for r in records):
        raise ValueError("Explicit corpus purpose required")
    known_smoke = {digest(r["text"]) for r in smoke_records()}
    smoke = any(r["purpose"] != "training" or digest(r["text"]) in known_smoke
                for r in records)
    # Runtime fixtures cannot be relabeled as quality-eligible.
    normalized_records = [dict(r, purpose="smoke-only") for r in records] if smoke else records
    manifest = build_manifest(normalized_records, holdouts, smoke_only=smoke)
    if any(r["reason"] != "duplicate" for r in manifest["rejected"]):
        raise ValueError("Corpus contains holdout overlap or secret/PII; training refused")
    result = train_validated(run_id, steps, seed, "transformer", manifest,
                             holdout_sha256=holdout_sha256, input_sha256=corpus_sha256, lr=lr,
                             manual_backward=manual_backward)
    from ai_model.training.candidate_lifecycle import CANDIDATES
    # Preserve exact approved input bytes so the data fingerprint is verifiable.
    raw = Path(corpus).read_bytes()
    if hashlib.sha256(raw).hexdigest() != corpus_sha256:
        (CANDIDATES / run_id / "FAILED").touch(exist_ok=True)
        raise ValueError("Corpus changed during training")
    with (CANDIDATES / run_id / "input.manifest.json").open("xb") as stream:
        stream.write(raw)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("corpus", "corpus-sha256", "holdout", "holdout-sha256", "run-id"):
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=1729)
    parser.add_argument("--lr", type=float, default=0.1)
    parser.add_argument("--manual-backward", action="store_true",
                        help="Fully DigitalGPU-dispatched reverse mode; no torch autograd accumulation")
    print(json.dumps(train_from_manifest(**vars(parser.parse_args())), indent=2))


if __name__ == "__main__":
    main()