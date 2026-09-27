"""One-shot, bounded, real-checkpoint KV inference diagnostic. Not a quality evaluation.

Run from the repository root with the project Python runtime only after other
full-model evaluations have finished:
  PYTHONDONTWRITEBYTECODE=1 python_runtime/bin/python \
    external/maxcore/artifacts/ai-training-server/ai_model/model/post_fix_model_probe.py
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import signal
import sys
import time
import traceback


ROOT = Path(__file__).resolve().parents[6]
SERVER_DIR = Path(__file__).resolve().parents[2]
WEIGHTS = SERVER_DIR / "ai_model" / "weights"
REPORT = ROOT / "reports" / "maxcore-quality" / "POST-FIX-MODEL-PROBE.json"
CHECKPOINT = WEIGHTS / "model.pt"
MANIFEST = WEIGHTS / "model.release.json"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def timeout_handler(_signum, _frame):
    raise TimeoutError("Standalone model probe exceeded 85 seconds")


def main() -> None:
    # Environment setup precedes server import; no HTTP server is started.
    os.environ["AI_DYNAMIC_BATCHING"] = "0"
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    sys.path.insert(0, str(SERVER_DIR))

    before = {"checkpoint": digest(CHECKPOINT), "release": digest(MANIFEST)}
    report = {
        "scope": "single live-backend short-prompt numerical KV probe; not held-out quality",
        "before_sha256": before,
        "manifest": json.loads(MANIFEST.read_text()),
        "generation": {"max_new_tokens": 4, "temperature": 0.8,
                       "top_p": 0.92, "top_k": 50, "seed": 1049},
        "limitations": [
            "One representable short prompt cannot establish publishable output, "
            "held-out quality, long-context stability, or end-to-end client/storage behavior.",
            "GPU operation counters establish execution on HyperGPU attention/core, "
            "not exclusivity of every host-side tensor operation.",
            "The frozen quality and dedicated-type evaluations remain historical evidence.",
        ],
    }
    if REPORT.exists():
        previous = json.loads(REPORT.read_text())
        report["previous_probe"] = {
            "status": previous.get("status"),
            "coverage": previous.get("coverage"),
            "inference": previous.get("inference"),
            "before_sha256": previous.get("before_sha256"),
            "after_sha256": previous.get("after_sha256"),
        }
        if previous.get("previous_probe"):
            report["previous_probe"]["previous_probe"] = previous["previous_probe"]
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(85)
    start = time.monotonic()
    try:
        import numpy as np
        import torch
        import server
        from ai_model.gpu.hyper_creative_transformer import get_gpu_attn_calls

        torch.set_num_threads(1)
        np.random.seed(1049)
        torch.manual_seed(1049)
        server._init_ai_model()
        if not server._model_ready or server._creative_model is None:
            raise RuntimeError(f"Real server model initialization failed: {server._model_init_error}")

        model = server._creative_model
        tok = server._tokenizer
        gpu = model.model.gpu
        vocab = tok.vocab
        ids = list(vocab.values())
        report["checkpoint_tokenizer"] = {
            "vocab_count": len(vocab), "min_id": min(ids), "max_id": max(ids),
            "embedding_rows": model.model.token_emb.num_embeddings,
            "merge_count": len(tok.merges),
            "legacy_word_vocab_detected": tok._legacy_word_vocab(),
            "id_holes": model.model.token_emb.num_embeddings - len(set(ids)),
            "unnamed_head_rows_masked": len(model._unnamed_token_ids),
            "control_tokens": {s: vocab.get(s) for s in
                               ("<PAD>", "<BOS>", "<EOS>", "<UNK>",
                                "<PLATFORM_INSTAGRAM>", "<STAGE_HOOK>")},
        }
        examples = (
            "music", "the", "melody", "harbor", "Paper Lantern Harbor",
            "A mellow piano instrumental by the harbor.",
            "<PLATFORM_INSTAGRAM> <STAGE_HOOK>",
            "<PLATFORM_INSTAGRAM> <GOAL_STREAMS> <TONE_CHILL> "
            "Idea: Paper Lantern Harbor. Format: text. <STAGE_HOOK>",
        )
        report["coverage"] = []
        for text in examples:
            token_ids = tok.encode(text).ids
            unknown = sum(t == tok.token_to_id("<UNK>") for t in token_ids)
            report["coverage"].append({
                "text": text, "tokens": len(token_ids), "unknown": unknown,
                "unknown_fraction": unknown / len(token_ids) if token_ids else None,
                "roundtrip": tok.decode(token_ids),
            })
        report["tokenizer_analysis"] = (
            "The checkpoint stores vocab/inv_vocab/next_id, no merges, and whole-word "
            "lexical IDs. Server instantiates BPETokenizer; the original BPE encoding "
            "split each word into mostly unknown characters. BPETokenizer now detects "
            "the released word-level vocab and uses its original whitespace token ID "
            "scheme. Unknown words remain unknown; new lexical IDs or remapping "
            "without training cannot give embeddings learned meanings. Sampling "
            "excludes unnamed head rows, which otherwise decode as <UNK>."
        )

        # A short meaningful word if encoded fully; otherwise use a known
        # checkpoint control token. No forced bypass of the prompt-loss guard.
        choices = ("music", "the", "<STAGE_HOOK>")
        prompt = next((p for p in choices if tok.token_to_id("<UNK>") not in
                       tok.encode(p).ids), None)
        if prompt is None:
            raise RuntimeError("Checkpoint tokenizer cannot encode any probe prompt")
        attention_before = get_gpu_attn_calls()
        ops_before = gpu.core._total_ops
        gemm_before = gpu._total_compute_ms
        generation_start = time.monotonic()
        output = model.generate(prompt, max_new_tokens=4, min_length=0,
                                temperature=0.8, top_p=0.92, top_k=50)
        report["inference"] = {
            "prompt": prompt,
            "prompt_ids": tok.encode(prompt).ids,
            "output": output,
            "duration_seconds": round(time.monotonic() - generation_start, 3),
            "model_class": type(model.model).__name__,
            "gpu_class": type(gpu).__name__,
            "backend_class": type(server._hyper_backend).__name__,
            "gpu_attention_gemm_calls_delta": get_gpu_attn_calls() - attention_before,
            "gpu_core_ops_delta": gpu.core._total_ops - ops_before,
            "gpu_compute_ms_delta": gpu._total_compute_ms - gemm_before,
        }
        if report["inference"]["gpu_attention_gemm_calls_delta"] < 2:
            raise RuntimeError("KV prefill/decode did not record GPU attention GEMMs")
        if report["inference"]["gpu_core_ops_delta"] < 1:
            raise RuntimeError("No HyperGPU core operations observed")
        report["status"] = "numerical_kv_executed"
    except Exception as exc:
        report["status"] = "error"
        report["error"] = f"{type(exc).__name__}: {exc}"
        report["traceback"] = traceback.format_exc(limit=8)
    finally:
        signal.alarm(0)
        report["total_duration_seconds"] = round(time.monotonic() - start, 3)
        report["after_sha256"] = {"checkpoint": digest(CHECKPOINT),
                                   "release": digest(MANIFEST)}
        report["checkpoint_preserved"] = before == report["after_sha256"]
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    if report["status"] != "numerical_kv_executed" or not report["checkpoint_preserved"]:
        raise RuntimeError(f"Model probe failed: {report.get('error', 'checkpoint changed')}")
    print(f"KV proof and coverage written to {REPORT} in {report['total_duration_seconds']}s")


if __name__ == "__main__":
    main()