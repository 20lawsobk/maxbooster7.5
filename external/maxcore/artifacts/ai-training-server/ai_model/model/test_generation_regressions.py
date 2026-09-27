"""Small, checkpoint-free regressions for the live generation contracts."""
import unittest
from unittest.mock import patch

import numpy as np
import torch
from torch import nn

from ai_model.agents.script_agent import ScriptAgent, ScriptRequest
from ai_model.gpu.hyper_creative_transformer import HyperRoPESelfAttention
from ai_model.model.creative_model import CreativeModel
from ai_model.model.tokenizer import BPETokenizer, SimpleTokenizer
from ai_model.model.transformer import precompute_rope_freqs


class TinyGPU:
    def __init__(self):
        self.calls = 0

    def gemm(self, a, b):
        self.calls += 1
        return a @ b

    def softmax(self, x, axis=-1):
        self.calls += 1
        e = np.exp(x - x.max(axis=axis, keepdims=True))
        return e / e.sum(axis=axis, keepdims=True)


class AttentionShapeTests(unittest.TestCase):
    def test_batched_prefill_and_decode_use_per_head_gpu_gemm(self):
        gpu = TinyGPU()
        attn = HyperRoPESelfAttention(8, 2, gpu, dropout=0).eval()
        attn.qkv = nn.Linear(8, 24, bias=False)
        attn.out = nn.Identity()
        cos, sin = precompute_rope_freqs(4, 8)
        x = torch.randn(2, 3, 8)
        causal = torch.triu(torch.full((3, 3), float("-inf")), diagonal=1)
        mask = torch.tensor([[True, False, False], [False, False, False]])
        out, k, v = attn.forward_with_kv(x, cos, sin, causal, mask)
        self.assertEqual(tuple(out.shape), (2, 3, 8))
        self.assertEqual(tuple(k.shape), (2, 2, 3, 4))
        decoded, nk, nv = attn.decode_one(torch.randn(2, 1, 8), cos, sin, k, v)
        self.assertEqual(tuple(decoded.shape), (2, 1, 8))
        self.assertEqual(tuple(nk.shape), (2, 2, 4, 4))
        self.assertEqual(tuple(nv.shape), (2, 2, 4, 4))
        self.assertGreater(gpu.calls, 0)

    def test_gpu_failure_is_not_masked_with_cpu_attention(self):
        class BrokenGPU(TinyGPU):
            def gemm(self, a, b):
                raise RuntimeError("GPU unavailable")
        attn = HyperRoPESelfAttention(8, 2, BrokenGPU(), dropout=0).eval()
        attn.qkv = nn.Linear(8, 24, bias=False)
        cos, sin = precompute_rope_freqs(4, 8)
        with self.assertRaisesRegex(RuntimeError, "GPU unavailable"):
            attn.forward_with_kv(torch.randn(1, 2, 8), cos, sin)


class GenerationContractTests(unittest.TestCase):
    def test_released_word_vocab_is_not_encoded_as_untrained_bpe(self):
        legacy = SimpleTokenizer()
        expected = legacy.encode("music beat the song").ids
        bpe = BPETokenizer()
        bpe.vocab = dict(legacy.vocab)
        bpe.inv_vocab = dict(legacy.inv_vocab)
        # Checkpoint has no merges; this is a lexical (not BPE) vocabulary.
        self.assertEqual(bpe.encode("music beat the song").ids, expected)
        self.assertEqual(bpe.decode(expected), "music beat the song")
        bpe.train(["music beat song", "music beat song"], vocab_size=100)
        self.assertFalse(bpe._legacy_word_vocab())

    def test_script_prompt_bounds_awareness_and_excludes_plan_transport(self):
        from ai_model.agents.script_agent import _script_prompt

        plan = '[CALLER_GENERATION_PLAN_UNVERIFIED] ' + (
            '{"plan_hash":"not-prompt-data","snapshot":{"id":"private-transport"}} ' * 200
        )
        awareness = "\n".join((
            '[CONTROL_INTENT] {"audienceAction":"save this post"}',
            '[CONTROL_DIRECTION] {"openingPhrase":"Quiet nights"}',
            '[CONTROL_CONTEXT] {"audience":"independent listeners"}',
            plan,
        ))
        req = ScriptRequest(
            idea="Moss Compass", platform="instagram", goal="growth",
            tone="chill", awareness=awareness,
        )

        prompt = _script_prompt(req)
        prefix = prompt.split("\n\n", 1)[0]

        self.assertLessEqual(len(prefix), 320)
        self.assertIn("Intent: save this post", prefix)
        self.assertIn("Direction: Quiet nights", prefix)
        self.assertIn("Background: independent listeners", prefix)
        self.assertIn("Moss Compass", prompt)
        self.assertNotIn("CALLER_GENERATION_PLAN", prompt)
        self.assertNotIn("plan_hash", prompt)
        self.assertNotIn("snapshot", prompt)
        self.assertNotIn("CONTROL_", prompt)

    def test_canonical_awareness_context_is_added_once(self):
        from ai_model.generation.awareness import ensure_context_once

        with patch("ai_model.generation.awareness.require_context",
                   return_value="canonical awareness"):
            combined = ensure_context_once(
                "canonical awareness\ncanonical awareness\ncaller facts",
                "instagram", "text",
            )
            self.assertEqual(combined, "canonical awareness\ncaller facts")
            self.assertEqual(
                ensure_context_once(combined, "instagram", "text"), combined,
            )

    def test_incompatible_tokenizer_and_lost_prompt_are_explicit(self):
        tok = SimpleTokenizer()
        class TinyModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.token_emb = nn.Embedding(tok.vocab_size, 2)
        creative = CreativeModel(TinyModel(), tok)
        with self.assertRaisesRegex(ValueError, "loses over 40%"):
            creative._encode_prompt("never-seen-one never-seen-two")
        tok.vocab["oversized"] = creative.model.token_emb.num_embeddings
        with self.assertRaisesRegex(ValueError, "tokenizer IDs"):
            CreativeModel(TinyModel(), tok)

    def test_unnamed_checkpoint_head_rows_cannot_decode_as_unknown(self):
        tok = SimpleTokenizer()
        tok.encode("music")

        class WideHead(nn.Module):
            def __init__(self):
                super().__init__()
                self.token_emb = nn.Embedding(tok.vocab_size + 2, 2)

        class SoftmaxCore:
            def softmax(self, x, axis=-1):
                e = np.exp(x - x.max(axis=axis, keepdims=True))
                return e / e.sum(axis=axis, keepdims=True)

        creative = CreativeModel(WideHead(), tok)
        logits = np.full((1, tok.vocab_size + 2), -100.0, dtype=np.float32)
        logits[0, tok.vocab_size] = 100.0  # invalid row beats every real token
        logits[0, tok.token_to_id("music")] = 10.0
        with patch("ai_model.model.creative_model._get_hyper_core", return_value=SoftmaxCore()):
            chosen = creative._sample_next_np(logits, 1.0, 0.92, 0)
        self.assertEqual(chosen, tok.token_to_id("music"))

    def test_only_generated_tokens_are_returned(self):
        tok = SimpleTokenizer()
        tok.encode("prompt completion")

        class TinyModel(nn.Module):
            max_len = 8

            def __init__(self):
                super().__init__()
                self.token_emb = nn.Embedding(tok.vocab_size, 2)

            def prefill(self, x):
                return torch.zeros(1, x.shape[1], tok.vocab_size), []

            def decode_one(self, x, cache):
                return torch.zeros(1, 1, tok.vocab_size), cache

        creative = CreativeModel(TinyModel(), tok)
        with patch.object(creative, "_sample_next_np", return_value=tok.token_to_id("completion")):
            text = creative.generate("prompt", max_new_tokens=1)
        self.assertEqual(text, "completion")

    def test_script_failure_does_not_claim_awareness_as_model_output(self):
        class BrokenModel:
            def generate(self, *args, **kwargs):
                raise RuntimeError("model unavailable")
        req = ScriptRequest(platform="instagram", goal="growth", tone="chill",
                            idea="Lanterns over the harbor", awareness="mood=calm")
        with self.assertRaisesRegex(RuntimeError, "model unavailable"):
            ScriptAgent(BrokenModel()).run(req)