#!/usr/bin/env python3
"""Read-only checkpoint quality measurement; never imports server or training."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import random
import sys
import time
import traceback
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = ROOT / "external/maxcore/artifacts/ai-training-server"
FIXTURE = ROOT / "evaluations/maxcore-quality/cases.json"


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def normalized(text):
    return " ".join(text.lower().split())


def contamination_check(cases):
    import re
    paths = set()
    for folder in ("training", "data", "knowledge", "ai_model/weights"):
        paths.update(p for p in (MODEL_ROOT / folder).rglob("*")
                     if p.is_file() and p.suffix in (".json", ".jsonl", ".txt", ".csv"))
    needles = {}
    for case in cases:
        natural = re.sub(r"<[^>]+>", "", case["prompt"])
        words = normalized(natural).split()
        needles[case["id"]] = [normalized(case["prompt"])] + [
            " ".join(words[i:i + 12]) for i in range(len(words) - 11)]
    checked, matches = [], []
    for path in sorted(paths):
        # Sliding text chunks avoid loading large training corpora into memory.
        with path.open(encoding="utf-8", errors="replace") as stream:
            tail = ""
            while chunk := stream.read(1024 * 1024):
                text = normalized(tail + chunk)
                for case_id, spans in needles.items():
                    if any(span in text for span in spans):
                        matches.append({"case_id": case_id, "file": str(path.relative_to(ROOT))})
                tail = (tail + chunk)[-8192:]
        checked.append({"path": str(path.relative_to(ROOT)), "sha256": digest(path)})
    return {"method": "normalized full prompt or contiguous 12-word natural-language span",
            "limitations": "Accessible text only; historical missing corpora and semantic overlap unknown.",
            "files": checked, "matches": matches}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("serving", "full-prefix-diagnostic"), default="serving")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
        os.environ[name] = "1"
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(MODEL_ROOT))
    manifest_path = MODEL_ROOT / "ai_model/weights/model.release.json"
    manifest = json.loads(manifest_path.read_text())
    checkpoint_path = ROOT / manifest["path"]
    fixture = json.loads(FIXTURE.read_text())
    before = {"checkpoint": digest(checkpoint_path), "release": digest(manifest_path)}
    report = {"started_at": datetime.now(timezone.utc).isoformat(),
              "fixture_sha256": digest(FIXTURE), "manifest": manifest,
              "before": before, "generation": fixture["generation"], "seeds": fixture["seeds"],
              "samples": [], "status": "running", "mode": args.mode}
    failure = None
    try:
        if before["checkpoint"] != manifest["sha256"] or checkpoint_path.stat().st_size != manifest["bytes"]:
            raise ValueError("Checkpoint differs from accepted release identity")
        report["contamination"] = contamination_check(fixture["cases"])
        if report["contamination"]["matches"]:
            raise ValueError("Held-out overlap detected")
        import numpy as np
        import torch
        from ai_model.media_contract import load_complete_checkpoint
        from ai_model.model.tokenizer import BPETokenizer
        from ai_model.model import creative_model as generation_module
        from ai_model.gpu.hyper_core import HyperGPU, PrecisionMode
        from ai_model.gpu.hyper_creative_transformer import HyperCreativeTransformerLM
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        torch.use_deterministic_algorithms(True)
        report["environment"] = {"python": sys.version, "platform": platform.platform(),
                                 "torch": torch.__version__, "numpy": np.__version__,
                                 "threads": 1, "gpu_lanes": 1, "tensor_cores": 1,
                                 "precision": "MIXED", "device": "cpu"}
        report["source_sha256"] = {str(p.relative_to(ROOT)): digest(p)
                                   for p in sorted((MODEL_ROOT / "ai_model").rglob("*.py"))}
        report["runner_sha256"] = digest(Path(__file__))
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True, mmap=True)
        cfg = checkpoint["config"]
        report["config"] = cfg
        tokenizer = BPETokenizer()
        tokenizer.vocab = checkpoint["vocab"]
        tokenizer.inv_vocab = checkpoint["inv_vocab"]
        tokenizer.merges = [tuple(p) for p in checkpoint.get("merges", [])]
        tokenizer._merge_ranks = {p: i for i, p in enumerate(tokenizer.merges)}
        tokenizer.freeze()
        gpu = HyperGPU(lanes=1, tensor_cores=1, precision=PrecisionMode.MIXED)
        model = HyperCreativeTransformerLM(
            vocab_size=max(len(tokenizer.vocab), 1000), dim=cfg["dim"],
            n_layers=cfg["layers"], n_heads=cfg["heads"], max_len=cfg["max_len"], gpu=gpu)
        load_complete_checkpoint(model, checkpoint["model_state_dict"])
        # Explicit diagnostic, NOT a serving fallback. It invokes the unchanged
        # model.forward at every step, retaining the serving sampler/tokenizer.
        class FullPrefixDiagnostic(torch.nn.Module):
            def __init__(self, base):
                super().__init__()
                self.base = base
                self.max_len = base.max_len

            def prefill(self, tokens):
                return self.base(tokens), tokens

            def decode_one(self, token, previous):
                tokens = torch.cat((previous, token), dim=1)
                return self.base(tokens)[:, -1:, :], tokens

        inference_model = model if args.mode == "serving" else FullPrefixDiagnostic(model)
        serving = generation_module.CreativeModel(inference_model, tokenizer, device="cpu")
        generation_module._hyper_core = gpu.core
        trace = []
        original_sample = serving._sample_next_np

        def observed_sample(*a, **kw):
            token = original_sample(*a, **kw)
            trace.append(int(token))
            return token

        serving._sample_next_np = observed_sample

        def run(case, seed):
            generation_module._gen_cache.clear()
            trace.clear()
            random.seed(seed)
            np.random.seed(seed)
            torch.manual_seed(seed)
            started = time.monotonic()
            ids = tokenizer.encode(case["prompt"]).ids
            if len(ids) + fixture["generation"]["max_new_tokens"] > cfg["max_len"]:
                raise ValueError(f"Case exceeds context: {case['id']}")
            row = {"id": case["id"], "seed": seed, "prompt": case["prompt"],
                   "category": case["category"], "criteria": case["criteria"],
                   "input_token_count": len(ids),
                   "input_unk_count": ids.count(tokenizer.token_to_id("<UNK>"))}
            try:
                row["output"] = serving.generate(case["prompt"], **fixture["generation"])
                row["token_ids"] = list(trace)
                row["raw_decoded_tokens"] = tokenizer.decode(trace)
                row["hit_token_limit"] = len(trace) == fixture["generation"]["max_new_tokens"]
                row["distinct_token_fraction"] = len(set(trace)) / len(trace) if trace else 0
                row["status"] = "ok"
            except Exception as exc:
                row.update(status="error", error=f"{type(exc).__name__}: {exc}",
                           traceback=traceback.format_exc(), token_ids=list(trace))
            row["elapsed_seconds"] = time.monotonic() - started
            return row

        with (args.output / "responses.jsonl").open("x") as stream:
            for case in fixture["cases"]:
                for seed in fixture["seeds"]:
                    row = run(case, seed)
                    report["samples"].append(row)
                    stream.write(json.dumps(row, ensure_ascii=False) + "\n")
                    stream.flush()
                    print(f"{case['id']} seed={seed}: {row['status']} ({row['elapsed_seconds']:.2f}s)", flush=True)
            replay = run(fixture["cases"][0], fixture["seeds"][0])
            first = report["samples"][0]
            report["replay"] = {"sample": replay, "exact_match": (
                first["status"] == replay["status"] == "ok"
                and first["token_ids"] == replay["token_ids"] and first["output"] == replay["output"])}
        if any(s["status"] != "ok" for s in report["samples"]) or not report["replay"]["exact_match"]:
            raise RuntimeError("Inference errors or deterministic replay mismatch; inspect results")
        report["status"] = "measurement-complete-quality-not-yet-scored"
    except Exception as exc:
        failure = exc
        report.update(status="error", error=f"{type(exc).__name__}: {exc}")
    finally:
        report["after"] = {"checkpoint": digest(checkpoint_path), "release": digest(manifest_path)}
        report["checkpoint_preserved"] = report["before"] == report["after"]
        if not report["checkpoint_preserved"]:
            report["status"] = "error-checkpoint-changed"
            failure = RuntimeError("Checkpoint/release changed during evaluation")
        report["finished_at"] = datetime.now(timezone.utc).isoformat()
        (args.output / "results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    if failure:
        raise failure


if __name__ == "__main__":
    main()