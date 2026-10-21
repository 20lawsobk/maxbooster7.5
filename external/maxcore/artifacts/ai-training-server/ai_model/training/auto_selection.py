"""Automatically select certified public live models; retain signed review for other corpora."""
import fcntl
import hashlib
import json
import os
import math
from pathlib import Path

from . import candidate_registry as registry

FIELDS = {"run", "evaluation", "protocol", "review", "signature"}


# This cache is an operational observation, never a substitute for registry
# certification. Every caller revalidates artifact/provenance eligibility first.
from collections import OrderedDict

_OPERATIONAL_CACHE = OrderedDict()
_MAX_OPERATIONAL_CACHE = 128
_MAX_NEW_PROBES = 2


def _operational_key(run, checkpoint, *, snapshot=None):
    from ai_model.generation.capability import CAPABILITY_POLICY, capability_budget_seconds, capability_snapshot
    snapshot = capability_snapshot(snapshot)
    run = Path(run)
    marker = run.parent.parent / "live_candidate_admissions" / run.name
    # Hash actual bytes on every lookup. A changed report, certificate, model
    # configuration or checkpoint must never inherit a previous capability pass.
    if registry.sha256(run / "candidate.pt") != checkpoint:
        raise ValueError("Checkpoint changed before capability lookup")
    report = json.loads((run / "report.json").read_text())
    return (str(run), checkpoint, registry.sha256(run / "report.json"),
            registry.sha256(marker / "certified.json"), CAPABILITY_POLICY, capability_budget_seconds(),
            registry.canonical_hash(report.get("model_config")), snapshot.id, snapshot.expires_at)


def _operational_candidate(run, checkpoint):
    from ai_model.generation.capability import verify_text_capability, capability_snapshot
    from ai_model.awareness import AwarenessUnavailable
    from ai_model.model.candidate_serving import create_candidate_adapter
    try:
        snapshot = capability_snapshot()
        key = _operational_key(run, checkpoint, snapshot=snapshot)
        if key in _OPERATIONAL_CACHE:
            _OPERATIONAL_CACHE.move_to_end(key)
            return _OPERATIONAL_CACHE[key]
        try:
            adapter = create_candidate_adapter(run, runtime_only=True,
                require_exclusive_backend=True, require_exclusive_training=True)
            verify_text_capability(adapter, snapshot=snapshot)
            passed = True
        except AwarenessUnavailable:
            # A warming/expired scan is retryable infrastructure, never a
            # durable negative observation about a checkpoint's capability.
            return False
        except (ValueError, RuntimeError, OSError, TypeError, KeyError):
            passed = False
        if _operational_key(run, checkpoint, snapshot=snapshot) != key:
            return False
        _OPERATIONAL_CACHE[key] = passed
        while len(_OPERATIONAL_CACHE) > _MAX_OPERATIONAL_CACHE:
            _OPERATIONAL_CACHE.popitem(last=False)
        return passed
    except (ValueError, RuntimeError, OSError, TypeError, KeyError):
        return False


def _metadata(run):
    """Untrusted scheduling hints only; registry validates before use."""
    try:
        report_path = run / "report.json"
        if run.is_symlink() or report_path.is_symlink() or report_path.stat().st_size > 4 * 1024 * 1024:
            return {}
        report = json.loads(report_path.read_text())
        return report if isinstance(report, dict) else {}
    except (OSError, ValueError):
        return {}


def _matches_policy(report, learning_policy):
    if learning_policy is None:
        return True
    stream = report.get("learning_stream")
    return (isinstance(stream, dict) and stream.get("policy") == learning_policy
            and stream.get("architecture") == "public-content-transformer-v2"
            and report.get("architecture") == "public-content-transformer-v2")


def _validated_policy(identity, learning_policy):
    if learning_policy is None:
        return True
    raw = (Path(identity["run"]) / "report.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != identity.get("report_sha256"):
        return False
    return _matches_policy(json.loads(raw), learning_policy)


def _metadata_rank(run, report):
    generation = report.get("learning_generation", -1)
    if type(generation) is not int:
        generation = -1
    # Certified observation records supply the eventual authoritative timestamp;
    # generation orders cumulative updates without relying on opaque run IDs.
    try:
        manifest = json.loads((run / "corpus.manifest.json").read_text())
        observed = max(float(row["live_provenance"]["observed_at"])
                       for row in manifest.get("records", []))
        if not math.isfinite(observed):
            observed = -1
    except (OSError, ValueError, KeyError, TypeError):
        observed = -1
    return observed, generation, run.name


def _rank(evidence, fingerprints):
    raw = Path(evidence["review"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != fingerprints["review_sha256"]:
        raise ValueError("Review changed during selection")
    review = json.loads(raw)
    scores = list(review["case_scores"].values())
    # Eligibility already checked every score and the signed evidence bindings.
    return sum(sum(row.values()) for row in scores) / (3 * len(scores))


def _reviewed_selection():
    """Process bounded operator submissions, atomically retaining a valid incumbent.

    Only strictly better signed scores on the SAME frozen protocol replace an
    incumbent. Different protocols require an explicit operator selection.
    """
    if os.environ.get("MAXCORE_AUTO_SELECT", "1") != "1":
        return {"state": "disabled"}
    registry.safe_registry()
    inbox = registry.REGISTRY / "selection_requests"
    if inbox.is_symlink():
        raise ValueError("Selection inbox must not be a symlink")
    inbox.mkdir(mode=0o700, exist_ok=True)
    with (registry.REGISTRY / ".auto-selection.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"state": "another_selector_running"}
        incumbent = None
        pointer = registry.REGISTRY / "selected.json"
        if pointer.exists():
            if pointer.is_symlink():
                raise ValueError("Selected pointer must not be a symlink")
            selected = json.loads(pointer.read_text())
            decision = registry.eligibility(**selected["evidence"])
            if decision["eligible"] and decision["fingerprints"] == selected["fingerprints"]:
                incumbent = (selected["evidence"], decision, _rank(selected["evidence"], decision["fingerprints"]))
        candidates, rejected = [], 0
        requests = sorted(inbox.glob("*.json"))
        for request in requests[:64]:
            try:
                if request.is_symlink() or request.stat().st_size > 16384:
                    raise ValueError("Invalid selection submission")
                submission = json.loads(request.read_text())
                evidence = submission["evidence"]
                if submission.get("schema") != 1 or set(evidence) != FIELDS:
                    raise ValueError("Invalid selection submission schema")
                if not Path(evidence["run"]).name.startswith("live-"):
                    raise ValueError("Automatic serving requires a live candidate")
                decision = registry.eligibility(**evidence)
                if not decision["eligible"]:
                    rejected += 1
                    continue
                rank = _rank(evidence, decision["fingerprints"])
                if incumbent:
                    old, accepted, old_rank = incumbent
                    if (decision["fingerprints"]["protocol_sha256"] != accepted["fingerprints"]["protocol_sha256"]
                            or rank <= old_rank):
                        continue
                candidates.append((rank, decision["fingerprints"]["checkpoint_sha256"], evidence))
            except (OSError, ValueError, KeyError, TypeError, ZeroDivisionError):
                rejected += 1
        if not candidates:
            return {"state": "retained" if incumbent else "waiting_for_candidate",
                    "rejected": rejected, "scan_limited": len(requests) > 64}
        _, checkpoint, evidence = max(candidates, key=lambda item: (item[0], item[1]))
        # select_candidate revalidates after taking its own atomic pointer lock.
        registry.select_candidate(**evidence)
        return {"state": "selected", "checkpoint_sha256": checkpoint, "rejected": rejected}


def _public_selection(learning_policy=None):
    registry.safe_registry()
    with (registry.REGISTRY / ".auto-selection.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"state": "another_selector_running"}
        incumbent = None
        pointer = registry.REGISTRY / "selected.json"
        if pointer.is_symlink():
            raise ValueError("Selected pointer must not be a symlink")
        if pointer.exists():
            selected = json.loads(pointer.read_text())
            if selected.get("eligibility_policy") == registry.PUBLIC_LIVE_POLICY:
                decision = registry.selected_eligibility(selected)
                if decision["eligible"] and decision["fingerprints"] == selected["fingerprints"]:
                    identity = decision["fingerprints"]
                    if (_validated_policy(identity, learning_policy)
                            and _operational_candidate(identity["run"], identity["checkpoint_sha256"])):
                        incumbent = identity
        root = registry.REGISTRY.parent / "candidate_runs"
        rejected, new_probes, scanned = 0, 0, 0
        probe_limited = False
        runs = list(root.glob("live-*"))
        scheduled = [(run, _metadata(run)) for run in runs]
        scheduled = [(run, report) for run, report in scheduled if _matches_policy(report, learning_policy)]
        scheduled.sort(key=lambda item: _metadata_rank(*item), reverse=True)
        for run, report in scheduled[:100]:
            scanned += 1
            hint = _metadata_rank(run, report)
            if (incumbent and hint[0] >= 0 and hint[:2] <=
                    (incumbent["observed_at"], incumbent.get("learning_generation", 0))):
                continue
            if run.is_symlink():
                rejected += 1
                continue
            decision = registry.public_live_eligibility(run)
            if not decision["eligible"]:
                rejected += 1
                continue
            identity = decision["fingerprints"]
            try:
                if not _validated_policy(identity, learning_policy):
                    rejected += 1
                    continue
            except (OSError, ValueError, KeyError, TypeError):
                rejected += 1
                continue
            if incumbent and (identity["observed_at"], identity.get("learning_generation", 0)) <= (incumbent["observed_at"], incumbent.get("learning_generation", 0)):
                continue
            # Registry eligibility/provenance is revalidated before consulting
            # either a cached pass or failure. Probe newest eligible updates
            # immediately; do not deserialize a hundred neural models first.
            checkpoint = identity["checkpoint_sha256"]
            try:
                try:
                    cached = _operational_key(run, checkpoint) in _OPERATIONAL_CACHE
                except (ValueError, OSError, TypeError, KeyError):
                    cached = False
                if not cached:
                    if new_probes >= _MAX_NEW_PROBES:
                        probe_limited = True
                        break
                    new_probes += 1
                if not _operational_candidate(str(run), checkpoint):
                    rejected += 1
                    continue
                registry.select_candidate(run=run, live_awareness=True)
                return {"state": "selected", "policy": registry.PUBLIC_LIVE_POLICY,
                        "checkpoint_sha256": checkpoint, "rejected": rejected,
                        "learning_policy": learning_policy, "validated_selected": True}
            except (ValueError, RuntimeError, OSError, TypeError, KeyError):
                rejected += 1
        if incumbent or runs:
            return {"state": "retained" if incumbent else "waiting_for_candidate",
                    "policy": registry.PUBLIC_LIVE_POLICY, "rejected": rejected,
                    "scan_limited": len(scheduled) > 100, "probe_limited": probe_limited,
                    "new_probes": new_probes, "scanned": scanned,
                    **({"checkpoint_sha256": incumbent["checkpoint_sha256"],
                        "learning_policy": learning_policy, "validated_selected": True} if incumbent else {})}
        return None


def auto_select(*, learning_policy=None):
    if os.environ.get("MAXCORE_AUTO_SELECT", "1") != "1":
        return {"state": "disabled"}
    # Public candidates are discovered from the certified trainer output itself;
    # neither an operator submission nor a human signature is needed.
    result = _public_selection(learning_policy=learning_policy)
    if result is not None:
        return result
    if learning_policy is not None:
        return {"state": "waiting_for_candidate", "policy": registry.PUBLIC_LIVE_POLICY,
                "learning_policy": learning_policy, "rejected": 0}
    return _reviewed_selection()


def submit_reviewed(**evidence):
    """Queue verified evidence for automatic selection; never generate approvals."""
    if set(evidence) != FIELDS or not Path(evidence["run"]).name.startswith("live-"):
        raise ValueError("A complete live-candidate evidence submission is required")
    normalized = {key: str(Path(value).resolve()) for key, value in evidence.items()}
    decision = registry.eligibility(**normalized)
    if not decision["eligible"]:
        raise ValueError("; ".join(decision["reasons"]))
    registry.safe_registry()
    inbox = registry.REGISTRY / "selection_requests"
    if inbox.is_symlink():
        raise ValueError("Selection inbox must not be a symlink")
    inbox.mkdir(mode=0o700, exist_ok=True)
    payload = {"schema": 1, "evidence": normalized}
    destination = inbox / (registry.canonical_hash(payload) + ".json")
    from .live_learning import write_new
    if not destination.exists():
        write_new(destination, json.dumps(payload, sort_keys=True).encode())
    return {"submitted": True, "checkpoint_sha256": decision["fingerprints"]["checkpoint_sha256"]}


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    for name in sorted(FIELDS):
        parser.add_argument("--" + name, required=True)
    print(json.dumps(submit_reviewed(**vars(parser.parse_args())), sort_keys=True))


if __name__ == "__main__":
    main()
