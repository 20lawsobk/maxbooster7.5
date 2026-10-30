"""Focused regression tests for runtime SAST remediations."""
import importlib.util
import os
from pathlib import Path
import sys
import unittest

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from trusted_http import TrustedHTTPError


class PrefixCacheFormatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from ai_model.gpu import hyper_creative_transformer as cache_module
        cls.cache = cache_module

    def tearDown(self):
        with self.cache._PREFIX_KV_LOCK:
            self.cache._PREFIX_KV_CACHE.clear()

    def test_tensor_payload_round_trip_including_bfloat16(self):
        h = torch.arange(6, dtype=torch.bfloat16).reshape(2, 3)
        key = self.cache._prefix_key(torch.tensor([[1, 2, 3]]))
        self.cache._prefix_put(key, h, [(h + 1, h + 2)], 3)

        payload = self.cache._prefix_get(key)

        self.assertTrue(torch.equal(payload["h"], h))
        self.assertTrue(torch.equal(payload["kv"][0][0], h + 1))
        self.assertEqual(payload["prefix_len"], 3)

    def test_legacy_payload_is_rejected_without_deleting_state(self):
        key = "legacy"
        legacy = b"not-a-versioned-cache-record"
        with self.cache._PREFIX_KV_LOCK:
            self.cache._PREFIX_KV_CACHE[key] = legacy

        with self.assertRaisesRegex(ValueError, "Unsafe legacy"):
            self.cache._prefix_get(key)

        self.assertIs(self.cache._PREFIX_KV_CACHE[key], legacy)

    def test_exact_prompt_key_covers_suffix_shape_dtype_and_model_state(self):
        prompt = torch.arange(300, dtype=torch.int64).reshape(1, 300)
        changed_suffix = prompt.clone()
        changed_suffix[0, 299] += 1

        key = self.cache._prefix_key(prompt, "state-a")
        self.assertNotEqual(key, self.cache._prefix_key(changed_suffix, "state-a"))
        self.assertNotEqual(key, self.cache._prefix_key(prompt.reshape(2, 150), "state-a"))
        self.assertNotEqual(key, self.cache._prefix_key(prompt.int(), "state-a"))
        self.assertNotEqual(key, self.cache._prefix_key(prompt, "state-b"))

    def test_over_256_token_cached_result_matches_uncached_result(self):
        module = self.cache

        class FakeLayer(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.calls = 0

            def forward_with_kv(self, h, _cos, _sin, _mask, _padding):
                self.calls += 1
                return h + h.cumsum(dim=1) / 1000, h.unsqueeze(1), (h + 1).unsqueeze(1)

        class PrefillHarness(torch.nn.Module):
            prefill = module.HyperCreativeTransformerLM.prefill
            _prefix_cache_model_state = (
                module.HyperCreativeTransformerLM._prefix_cache_model_state)

            def __init__(self):
                super().__init__()
                self.token_emb = torch.nn.Embedding(512, 2)
                self.emb_dropout = torch.nn.Identity()
                self.layers = torch.nn.ModuleList([FakeLayer()])
                self.ln_final = torch.nn.LayerNorm(2)
                self.register_buffer("causal_mask", torch.zeros(300, 300))
                self.register_buffer("rope_cos", torch.zeros(300, 1))
                self.register_buffer("rope_sin", torch.zeros(300, 1))
                self.eval()

            def _head(self, hidden):
                return hidden @ self.token_emb.weight.T

        prompt = torch.arange(300, dtype=torch.int64).reshape(1, 300)
        model = PrefillHarness()
        logits_uncached, kv_uncached = model.prefill(prompt)
        self.assertEqual(model.layers[0].calls, 1)
        logits_cached, kv_cached = model.prefill(prompt)

        self.assertEqual(model.layers[0].calls, 1)
        self.assertTrue(torch.equal(logits_cached, logits_uncached))
        self.assertTrue(torch.equal(kv_cached[0][0], kv_uncached[0][0]))
        changed_suffix = prompt.clone()
        changed_suffix[0, -1] += 1
        model.prefill(changed_suffix)
        self.assertEqual(model.layers[0].calls, 2)
        with torch.no_grad():
            model.token_emb.weight.add_(1)
        model.prefill(prompt)
        self.assertEqual(model.layers[0].calls, 3)


class ProcessErrorBoundaryTests(unittest.TestCase):
    def test_custom_exception_graph_is_reduced_to_builtin_text(self):
        from ai_model.maxcore.runtime.process_pool import _safe_exc

        class UnsafeError(Exception):
            def __str__(self):
                raise RuntimeError("do not invoke object behavior across IPC")

        safe = _safe_exc(UnsafeError(object()))
        self.assertIs(type(safe), RuntimeError)
        self.assertIn("UnsafeError: <exception message unavailable>", safe.args[0])
        self.assertEqual(safe.__dict__.keys(), {"__notes__"})


class LoadBaseValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / "ai_model/maxcore/tests/endpoint_load_test.py"
        spec = importlib.util.spec_from_file_location("endpoint_load_test_validation", path)
        cls.previous_key = os.environ.get("ADMIN_KEY")
        os.environ["ADMIN_KEY"] = "test-only"
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    @classmethod
    def tearDownClass(cls):
        if cls.previous_key is None:
            os.environ.pop("ADMIN_KEY", None)
        else:
            os.environ["ADMIN_KEY"] = cls.previous_key

    def test_accepts_only_http_origins(self):
        base, origin = self.module.validated_load_base("https://127.0.0.1:8443/")
        self.assertEqual(base, "https://127.0.0.1:8443")
        self.assertEqual(origin.scheme, "https")
        self.assertEqual(origin.host, "127.0.0.1")
        self.assertEqual(origin.port, 8443)
        self.assertTrue(origin.local_only)
        for unsafe in (
            "file:///etc/passwd",
            "ftp://127.0.0.1",
            "https://user:secret@127.0.0.1",
            "https://example.test",
            "https://127.0.0.1/api",
            "https://127.0.0.1?target=file:///etc/passwd",
        ):
            with self.subTest(unsafe=unsafe), self.assertRaises(
                    (ValueError, TrustedHTTPError)):
                self.module.validated_load_base(unsafe)


if __name__ == "__main__":
    unittest.main()