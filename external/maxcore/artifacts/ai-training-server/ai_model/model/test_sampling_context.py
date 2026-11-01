"""Focused request-local replay tests; tiny deterministic logits, no checkpoints."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
import torch
from torch import nn

from ai_model.generation.plan import active_plan
from ai_model.model.creative_model import CreativeModel, _gen_cache, _gen_cache_key
from ai_model.model.sampling_context import sampling_context
from ai_model.model.tokenizer import SimpleTokenizer


class Softmax:
    def softmax(self, x, axis=-1):
        e = np.exp(x - x.max(axis=axis, keepdims=True))
        return e / e.sum(axis=axis, keepdims=True)


class SamplingTests(unittest.TestCase):
    def setUp(self):
        tok = SimpleTokenizer()
        tok.encode("music beat song")

        class Model(nn.Module):
            max_len = 128

            def __init__(self):
                super().__init__()
                self.token_emb = nn.Embedding(tok.vocab_size, 2)

            def prefill(self, x, key_padding_mask=None):
                logits = torch.full((*x.shape, tok.vocab_size), -100.0)
                for word in ("music", "beat", "song"):
                    logits[..., tok.token_to_id(word)] = 1
                return logits, []

            def decode_one(self, x, cache, key_padding_mask=None):
                return self.prefill(x)[0], cache

        self.creative = CreativeModel(Model(), tok)
        self.creative._safety_bad_ids_cache = []
        self.patch = patch("ai_model.model.creative_model._get_hyper_core",
                           return_value=Softmax())
        self.patch.start()
        self.addCleanup(self.patch.stop)
        _gen_cache.clear()

    def generate(self, seed):
        return self.creative.generate("music", max_new_tokens=32, min_length=32,
                                      repetition_penalty=1, seed=seed)

    def test_replay_without_cache_and_independent_concurrent_rngs(self):
        expected = {seed: self.generate(seed) for seed in (3, 9, 27)}
        self.assertGreater(len(set(expected.values())), 1)
        _gen_cache.clear()
        np_before = np.random.get_state()
        torch_before = torch.random.get_rng_state().clone()
        seeds = [3, 9, 27]
        with ThreadPoolExecutor(max_workers=3) as pool:
            outputs = list(pool.map(self.generate, seeds))
        self.assertEqual(outputs, [expected[seed] for seed in seeds])
        np_after = np.random.get_state()
        self.assertEqual(np_before[0], np_after[0])
        np.testing.assert_array_equal(np_before[1], np_after[1])
        self.assertEqual(np_before[2:], np_after[2:])
        self.assertTrue(torch.equal(torch_before, torch.random.get_rng_state()))

    def test_active_plan_attribute_and_effective_dictionary_seed(self):
        for plan in (
            SimpleNamespace(seed=9, snapshot_hash="snapshot", to_dict=lambda: {}),
            SimpleNamespace(to_dict=lambda: {"seed": 9, "snapshot_hash": "snapshot"}),
        ):
            token = active_plan.set(plan)
            try:
                self.assertEqual(sampling_context(), (9, "snapshot"))
                self.assertEqual(sampling_context(27, "explicit"), (27, "explicit"))
                actual = self.creative.generate("music", max_new_tokens=32,
                                               min_length=32, repetition_penalty=1)
                _gen_cache.clear()
                self.assertEqual(actual, self.generate(9))
            finally:
                active_plan.reset(token)

    def test_coalesced_rows_do_not_share_random_stream(self):
        rows = [dict(prompt="music", seed=s, max_new_tokens=32, min_length=32,
                     repetition_penalty=1) for s in (3, 9)]
        expected = [self.generate(s) for s in (3, 9)]
        self.assertEqual(self.creative.generate_batch_rows(rows), expected)
        self.assertEqual(self.creative.generate_batch_rows(rows[::-1]), expected[::-1])
        for chunk_size in (1, 2):
            self.assertEqual(self.creative.generate_batch(
                ["music", "music"], max_new_tokens=32, min_length=32,
                repetition_penalty=1, seed=3, chunk_size=chunk_size),
                [self.generate(3), self.generate(4)])

    def test_cache_identity_and_gpu_errors(self):
        args = ("music", 32, .85, .92, 50, 1)
        base = dict(seed=3, snapshot_hash="a", checkpoint_identity="checkpoint")
        key = _gen_cache_key(*args, **base)
        for name, value in (("seed", 4), ("snapshot_hash", "b"),
                            ("checkpoint_identity", "different"), ("min_length", 2)):
            self.assertNotEqual(key, _gen_cache_key(*args, **(base | {name: value})))
        self.generate(3)
        with torch.no_grad():
            self.creative.model.token_emb.weight.add_(1)
        with patch.object(self.creative.model, "prefill", side_effect=RuntimeError("GPU failed")):
            with self.assertRaisesRegex(RuntimeError, "GPU failed"):
                self.generate(3)

    def test_invalid_seed_rejected(self):
        for seed in (-1, True, 1.5, 2**64):
            with self.assertRaises(ValueError):
                sampling_context(seed)

    def test_prefix_keys_bind_plan_and_checkpoint(self):
        from ai_model.gpu.hyper_creative_transformer import _prefix_key
        ids = torch.tensor([[1, 2]])
        keys = []
        for seed, snapshot, checkpoint in ((3, "a", "c"), (4, "a", "c"),
                                            (3, "b", "c"), (3, "a", "d")):
            token = active_plan.set(SimpleNamespace(
                seed=seed, snapshot_hash=snapshot, to_dict=lambda: {}))
            try:
                keys.append(_prefix_key(ids, checkpoint))
            finally:
                active_plan.reset(token)
        self.assertEqual(len(set(keys)), 4)

    def test_candidate_native_sampling_replays_concurrently(self):
        from ai_model.gpu.candidate_training import CandidateTrainingBackend
        backend = CandidateTrainingBackend(1729)

        def sample(seed):
            rng = backend.dispatch("rng", seed)
            return [backend.dispatch("sample", np.zeros(259, dtype=np.float32),
                                     [], 0, rng, 1.0, 1.0, 0, 1.0, 0)
                    for _ in range(32)]

        seeds = [7, 19, 7]
        expected = [sample(seed) for seed in seeds]
        with ThreadPoolExecutor(max_workers=3) as pool:
            self.assertEqual(list(pool.map(sample, seeds)), expected)
        self.assertEqual(expected[0], expected[2])
        self.assertNotEqual(expected[0], expected[1])


if __name__ == "__main__":
    unittest.main()