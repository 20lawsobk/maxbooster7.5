"""Incremental v2 inference must preserve full causal computation, not its tape."""
import time
import unittest
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import torch

from ai_model.gpu.candidate_training import array
from ai_model.model.candidate_model import CandidateTransformer, PublicContentTransformer
from ai_model.model.inference_budget import inference_deadline


def reference_logits(model, ids):
    """Independent Torch reference, used only as test evidence."""
    config = model.model_config
    width, heads = config["width"], config["heads"]
    batch, length = ids.shape
    w = dict(model.named_parameters())
    with torch.no_grad():
        x = w["embedding.weight"][torch.from_numpy(ids)] + w["position.weight"][torch.arange(length)]
        for index in range(config["layers"]):
            prefix = f"blocks.{index}."
            n = torch.nn.functional.layer_norm(x, (width,), w[prefix + "norm1.gamma"], w[prefix + "norm1.beta"])
            q, k, v = [part.reshape(batch, length, heads, width // heads).transpose(1, 2)
                       for part in (n @ w[prefix + "attention.qkv_proj.weight"]).chunk(3, -1)]
            scores = (q @ k.transpose(-1, -2)) / np.sqrt(width // heads)
            scores = scores.masked_fill(torch.ones(length, length, dtype=torch.bool).triu(1), float("-inf"))
            attention = (scores.softmax(-1) @ v).transpose(1, 2).reshape(batch, length, width)
            x = x + attention @ w[prefix + "attention.out_proj.weight"]
            n = torch.nn.functional.layer_norm(x, (width,), w[prefix + "norm2.gamma"], w[prefix + "norm2.beta"])
            x = x + torch.tanh(n @ w[prefix + "hidden.weight"]) @ w[prefix + "contract.weight"]
        return array(x @ w["output.weight"])


class IncrementalCandidateInferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(1)

    def test_every_position_matches_full_causal_and_independent_reference(self):
        ids = np.random.default_rng(81).integers(0, 259, (2, 70), dtype=np.int64)
        for layers, heads, initial in ((1, 1, 1), (2, 4, 7), (3, 8, 63)):
            with self.subTest(layers=layers, heads=heads, initial=initial):
                model = PublicContentTransformer(seed=81, context=128, width=128,
                                                 layers=layers, heads=heads, expansion=2)
                w = {name: array(parameter) for name, parameter in model.named_parameters()}
                expected = reference_logits(model, ids)
                logits, cache = model.backend.dispatch("transformer_prefill", w, ids[:, :initial], model.model_config)
                np.testing.assert_allclose(logits[:, -1], expected[:, initial - 1], atol=3e-5, rtol=3e-4)
                for position in range(initial, ids.shape[1]):
                    actual = model.backend.dispatch("transformer_decode", w, ids[:, position:position + 1], cache, model.model_config)
                    full, _ = model.backend.dispatch("transformer_forward", w, ids[:, :position + 1], model.model_config)
                    np.testing.assert_allclose(actual[:, -1], full[:, -1], atol=3e-5, rtol=3e-4)
                    np.testing.assert_allclose(actual[:, -1], expected[:, position], atol=3e-5, rtol=3e-4)
                self.assertEqual(cache["length"], 70)
                self.assertEqual(set(cache["blocks"][0]), {"k", "v"})

    def test_context_boundary_and_cache_model_ownership(self):
        model = PublicContentTransformer(context=128, width=128, layers=2)
        w = {name: array(parameter) for name, parameter in model.named_parameters()}
        ids = np.arange(128, dtype=np.int64)[None, :]
        _, cache = model.backend.dispatch("transformer_prefill", w, ids[:, :125], model.model_config)
        for position in range(125, 128):
            actual = model.backend.dispatch("transformer_decode", w, ids[:, position:position + 1], cache, model.model_config)
        full, _ = model.backend.dispatch("transformer_forward", w, ids, model.model_config)
        np.testing.assert_allclose(actual[:, -1], full[:, -1], atol=3e-5, rtol=3e-4)
        with self.assertRaisesRegex(ValueError, "context bound"):
            model.backend.dispatch("transformer_decode", w, ids[:, :1], cache, model.model_config)
        other = PublicContentTransformer(context=128, width=128, layers=2)
        with self.assertRaisesRegex(ValueError, "belong"):
            other.backend.dispatch("transformer_decode", w, ids[:, :1], cache, model.model_config)
        with self.assertRaises(ValueError):
            model.backend.dispatch("transformer_prefill", w, ids.astype(np.float32), model.model_config)
        with self.assertRaises(ValueError):
            model.backend.dispatch("transformer_prefill", w, np.zeros((4096, 128), dtype=np.int64), model.model_config)

    def test_interleaved_caches_are_isolated(self):
        model = PublicContentTransformer(context=128, width=128, layers=2, heads=4)
        w = {name: array(parameter) for name, parameter in model.named_parameters()}
        sequences = [np.array([[257, 65, 66, 67]]), np.array([[257, 88, 89, 90]])]
        caches = [model.backend.dispatch("transformer_prefill", w, ids[:, :1], model.model_config)[1]
                  for ids in sequences]
        for position in range(1, 4):
            for ids, cache in zip(sequences, caches):
                actual = model.backend.dispatch("transformer_decode", w, ids[:, position:position + 1], cache, model.model_config)
                full, _ = model.backend.dispatch("transformer_forward", w, ids[:, :position + 1], model.model_config)
                np.testing.assert_allclose(actual[:, -1], full[:, -1], atol=3e-5, rtol=3e-4)
        self.assertFalse(np.shares_memory(caches[0]["blocks"][0]["k"], caches[1]["blocks"][0]["k"]))

    def test_generation_determinism_concurrency_and_legacy_path(self):
        model = PublicContentTransformer(context=128, width=128, layers=2)
        kwargs = dict(max_new_tokens=40, temperature=.8, top_k=32, seed=83, min_length=40)
        expected = model.generate("first prompt", **kwargs)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(model.generate, "first prompt", **kwargs)
            other = pool.submit(model.generate, "different prompt", **kwargs)
            self.assertEqual(first.result(), expected)
            other.result()
        self.assertEqual(model.generate("first prompt", **kwargs), expected)
        self.assertEqual(model.backend.dispatch_counts["transformer_forward"], 0)
        self.assertEqual(model.backend.dispatch_counts["transformer_prefill"], 4)
        self.assertEqual(model.backend.dispatch_counts["transformer_decode"], 4 * 39)
        legacy = CandidateTransformer(context=128)
        legacy.generate("prompt", max_new_tokens=4, min_length=4)
        self.assertEqual(legacy.backend.dispatch_counts["transformer_forward"], 4)
        self.assertEqual(legacy.backend.dispatch_counts["transformer_prefill"], 0)

    def test_seeded_sampling_matches_original_full_prefix_computation(self):
        model = PublicContentTransformer(seed=83, context=128, width=128, layers=2)
        w = {name: array(parameter) for name, parameter in model.named_parameters()}
        for temperature in (0., .8):
            with self.subTest(temperature=temperature):
                ids = [model.tokenizer.bos_id] + model.tokenizer.encode("same complete prompt")
                rng = model.backend.dispatch("rng", 83)
                generated = []
                for position in range(40):
                    logits, _ = model.backend.dispatch("transformer_forward", w, np.array([ids]), model.model_config)
                    token = model.backend.dispatch("sample", logits[0, -1], ids, position,
                                                   rng, temperature, 1., 32, 1., 40)
                    generated.append(token)
                    ids.append(token)
                actual = model.generate("same complete prompt", max_new_tokens=40, min_length=40,
                                        temperature=temperature, top_k=32, seed=83)
                self.assertEqual(actual["token_ids"], generated)

    def test_deadline_rejects_output_without_poisoning_next_request(self):
        model = PublicContentTransformer(context=128, width=128, layers=2)
        token = inference_deadline.set(time.monotonic() - 1)
        try:
            with self.assertRaises(TimeoutError):
                model.generate("prompt", max_new_tokens=4)
        finally:
            inference_deadline.reset(token)
        self.assertEqual(len(model.generate("prompt", max_new_tokens=4, min_length=4)["token_ids"]), 4)


if __name__ == "__main__":
    unittest.main()
