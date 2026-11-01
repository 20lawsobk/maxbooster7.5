"""Offline unreleased candidate benchmark; never used as a training data source.

Requires an externally frozen JSON protocol hash. Schema:
{"schema":1,"frozen":true,"cases":[{"id":"...","prompt":"...",
"expected":"...","max_new_tokens":48}]}. expected is optional (no score).
Exact match is merely a recorded metric, never a promotion authorization.
"""
import argparse
import hashlib
import json
from pathlib import Path
import torch

from ai_model.model.candidate_model import CandidateModel
from ai_model.training.candidate_corpus import normalize
from ai_model.training.candidate_lifecycle import sha256, ROOT


def benchmark(checkpoint, protocol_path, expected_sha256, output_path):
    checkpoint, protocol_path, output_path = map(Path, (checkpoint, protocol_path, output_path))
    # Never deposit holdout prompts in corpus/training locations.
    for folder in ("ai_model/training", "training", "data", "knowledge", "ai_model/weights"):
        if output_path.resolve().is_relative_to((ROOT / folder).resolve()):
            raise ValueError("Benchmark outputs must stay outside training/corpus/weight directories")
    raw = protocol_path.read_bytes()
    actual_hash = hashlib.sha256(raw).hexdigest()
    if actual_hash != expected_sha256:
        raise ValueError("Frozen holdout protocol hash mismatch")
    protocol = json.loads(raw)
    legacy_frozen_cases = (protocol.get("version") == 1 and
                           isinstance(protocol.get("generation"), dict) and
                           isinstance(protocol.get("seeds"), list))
    if not legacy_frozen_cases and (protocol.get("schema") != 1 or protocol.get("frozen") is not True):
        raise ValueError("Expected explicitly frozen schema-1 protocol")
    cases = protocol.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 64:
        raise ValueError("Benchmark must have 1..64 holdout cases")
    manifest = json.loads((checkpoint.parent / "corpus.manifest.json").read_text())
    report = json.loads((checkpoint.parent / "report.json").read_text())
    if report.get("checkpoint_sha256") != sha256(checkpoint):
        raise ValueError("Candidate checkpoint hash mismatch")
    if report.get("manifest_sha256") != manifest.get("sha256"):
        raise ValueError("Candidate manifest binding mismatch")
    unsigned = {key: value for key, value in manifest.items() if key != "sha256"}
    if hashlib.sha256(json.dumps(unsigned, sort_keys=True, ensure_ascii=True).encode()).hexdigest() != manifest["sha256"]:
        raise ValueError("Candidate manifest content hash mismatch")
    seen = set()
    for case in cases:
        if not isinstance(case.get("id"), str) or case["id"] in seen:
            raise ValueError("Holdout IDs must be unique strings")
        seen.add(case["id"])
        if not isinstance(case.get("prompt"), str) or not normalize(case["prompt"]):
            raise ValueError("Holdout prompt is required")
        if "expected" in case and not isinstance(case["expected"], str):
            raise ValueError("Expected output must be text")
        if not 1 <= case.get("max_new_tokens", 48) <= 256:
            raise ValueError("Holdout token limit out of bounds")
        for text in (case["prompt"], case.get("expected", "")):
            normalized = normalize(text)
            if normalized and any(normalized in normalize(record["text"]) or
                                  normalize(record["text"]) in normalized
                                  for record in manifest["records"]):
                raise ValueError("Holdout overlaps training corpus; benchmark refused")
    torch.set_num_threads(1)
    model = CandidateModel.load_candidate(checkpoint)
    decoding = protocol.get("decoding", {})
    allowed_sampling = {"temperature", "top_p", "top_k", "repetition_penalty", "min_length", "seed"}
    sampling = {}
    if decoding.get("method") == "sample":
        sampling = {key: value for key, value in decoding.items() if key != "method"}
        if set(sampling) != allowed_sampling:
            raise ValueError("Frozen sample decoding must explicitly specify all sampling controls and seed")
    conformant = (not legacy_frozen_cases and
                  (decoding == {"method": "greedy"} or
                   decoding.get("method") == "sample"))
    if legacy_frozen_cases:
        sampling = {key: value for key, value in protocol["generation"].items()
                    if key in allowed_sampling}
        sampling["seed"] = protocol["seeds"][0]
    records = []
    for case in cases:
        try:
            result = model.generate(case["prompt"], case.get(
                "max_new_tokens", protocol.get("generation", {}).get("max_new_tokens", 48)),
                **sampling)
            records.append({"id": case["id"], "prompt": case["prompt"], "output": result,
                            "sampling": sampling or {"temperature": 0.0, "seed": 1729},
                            "exact_match": result["text"] == case["expected"]
                            if "expected" in case else None})
        except (ValueError, RuntimeError) as exc:
            conformant = False
            records.append({"id": case["id"], "prompt": case["prompt"],
                            "error": type(exc).__name__ + ": " + str(exc)})
    result = {"schema": 1, "unreleased": True, "promotion_eligible": False,
              "protocol_sha256": actual_hash, "checkpoint_sha256": sha256(checkpoint),
              "protocol_conformant": conformant,
              "deviations": [] if conformant else ["Unreleased candidate, not frozen release architecture",
                             "One output per case; legacy protocol multiple-seed requirements not fulfilled",
                             "Raw output diagnostic only; no rubric score or acceptance decision"],
              "records": records, "quality_claim": "none; raw isolated holdout observations"}
    # Exclusive creation; never overwrite a checkpoint/protocol/previous result.
    with output_path.open("x") as stream:
        json.dump(result, stream, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--protocol-sha256", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(benchmark(args.checkpoint, args.protocol,
                               args.protocol_sha256, args.output), indent=2))


if __name__ == "__main__":
    main()