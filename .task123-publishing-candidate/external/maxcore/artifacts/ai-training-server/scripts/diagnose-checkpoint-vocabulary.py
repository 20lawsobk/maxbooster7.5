#!/usr/bin/env python3
"""Offline, read-only coverage of original-suite prompts against saved token IDs."""
import hashlib
import json
import re
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ai_model.agents.script_agent import ScriptRequest, _script_prompt
from ai_model.model.tokenizer import BPETokenizer


def main():
    path = ROOT / "ai_model" / "weights" / "model.pt"
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    tokenizer = BPETokenizer()
    tokenizer.vocab = checkpoint["vocab"]
    tokenizer.inv_vocab = checkpoint["inv_vocab"]
    tokenizer.merges = [tuple(pair) for pair in checkpoint.get("merges", [])]
    tokenizer._merge_ranks = {pair: index for index, pair in enumerate(tokenizer.merges)}
    tokenizer.freeze()
    unk = tokenizer.token_to_id("<UNK>")

    def coverage(prompt):
        ids = tokenizer.encode(prompt).ids
        unknown = [word for word in prompt.split()
                   if unk in tokenizer.encode(word).ids]
        # Never enumerate the complete corpus vocabulary (it may contain
        # accidental private training data). Only report known suite inputs.
        unknown = [re.sub(r"mbs_[a-f0-9]{16,}", "[REDACTED]", word) for word in unknown]
        return {"tokens": len(ids), "unknown": ids.count(unk),
                "unknown_fraction": round(ids.count(unk) / max(1, len(ids)), 4),
                "unknown_surface_forms": unknown}

    # Topics/tones from test_w6_90m.py. This probes literal caller fields,
    # not live brief normalization or external platform-awareness contents.
    requests = [
        ScriptRequest("midnight piano ballad", "instagram", "engagement", "emotional",
                      genre="indie soul", target_audience="adult listeners 25-35"),
        ScriptRequest("midnight piano ballad", "tiktok", "engagement", "emotional"),
        ScriptRequest("hype street rap drop", "tiktok", "engagement", "bold", genre="hip-hop"),
        ScriptRequest("lo-fi hip-hop release", "tiktok", "engagement", "chill"),
        ScriptRequest("new EP announcement", "instagram", "engagement", "excited"),
        ScriptRequest("Gold Rush", "instagram", "growth", "edgy"),
    ]
    reports = []
    for req in requests:
        audience = f" Target audience: {req.target_audience}." if req.target_audience else ""
        control = f"<PLATFORM_{req.platform.upper()}> <GOAL_{req.goal.upper()}> <TONE_{req.tone.upper()}>"
        before = (f"{control} Idea: {req.idea}. Format: {req.output_format}. "
                  f"Length: {req.caption_length}. CTA: {req.cta_strength}.{audience} <STAGE_HOOK>")
        current = _script_prompt(req)
        # Diagnostic only: lowercase/punctuation removal was NOT the saved
        # training codec, and must not be applied to titles/requirements.
        normalized = " ".join(
            word if word.startswith("<") else word.strip(".,:;!?").lower()
            for word in current.split())
        reports.append({
            "topic": req.idea, "platform": req.platform, "tone": req.tone,
            "before_serializer": coverage(before),
            "faithful_prompt": coverage(current),
            "unsafe_lowercase_strip_diagnostic_only": coverage(normalized),
            "historical_control_only_omitted_topic": coverage(control + " <STAGE_HOOK>"),
        })
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    print(json.dumps({
        "checkpoint_sha256": digest,
        "vocab_entries": len(tokenizer.vocab),
        "named_ids": [min(tokenizer.vocab.values()), max(tokenizer.vocab.values())],
        "merges": len(tokenizer.merges),
        "legacy_word_codec": tokenizer._legacy_word_vocab(),
        "known_controls": [token for token in tokenizer.vocab
                           if token.startswith(("<PLATFORM_", "<GOAL_", "<TONE_", "<STAGE_"))],
        "scope": "offline literal original-suite request coverage; no inference or training",
        "reports": reports,
    }, indent=2))


if __name__ == "__main__":
    main()