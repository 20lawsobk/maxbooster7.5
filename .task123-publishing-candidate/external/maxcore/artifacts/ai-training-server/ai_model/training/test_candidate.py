import unittest
from unittest.mock import patch
import tempfile
from pathlib import Path
import hashlib
import json

import torch

from ai_model.model.candidate_model import CandidateModel, CandidateTransformer
from ai_model.gpu.candidate_training import CandidateTrainingBackend
from ai_model.model.candidate_tokenizer import CandidateByteTokenizer
from ai_model.training.candidate_corpus import build_manifest, smoke_records
from ai_model.training.candidate_lifecycle import promotion_gate, train_smoke
from ai_model.training.candidate_benchmark import benchmark


class CandidateTests(unittest.TestCase):
    def test_byte_complete(self):
        tokenizer = CandidateByteTokenizer()
        raw = bytes(range(256))
        self.assertEqual(tokenizer.decode_bytes(tokenizer.encode_bytes(raw)), raw)
        text = "Music 🎼 日本語 café \x00"
        self.assertEqual(tokenizer.decode(tokenizer.encode(text)), text)
        with self.assertRaises(ValueError):
            tokenizer.decode_bytes([-1])

    def test_manifest_controls(self):
        records = smoke_records()
        duplicate = dict(records[0], text=records[0]["text"].upper())
        secret = dict(records[0], text="password=not-a-real-secret")
        manifest = build_manifest(records + [duplicate, secret],
                                  [records[1]["text"]], smoke_only=True)
        self.assertEqual(len(manifest["records"]), 2)
        self.assertEqual({r["reason"] for r in manifest["rejected"]},
                         {"holdout-overlap", "duplicate", "secret-or-personal-data"})
        self.assertEqual(manifest, build_manifest(records + [duplicate, secret],
                                                 [records[1]["text"]], smoke_only=True))
        with self.assertRaises(ValueError):
            build_manifest([dict(records[0], private=True)], [], smoke_only=True)
        with self.assertRaises(ValueError):
            build_manifest(records, [], smoke_only=False)

    def test_fail_closed(self):
        self.assertFalse(promotion_gate({})["eligible"])
        self.assertFalse(promotion_gate({"smoke_only": False,
                                        "protected_unchanged": True})["eligible"])
        with self.assertRaises(ValueError):
            train_smoke("../../weights")
        with self.assertRaises(ValueError):
            train_smoke("invalid", steps=65)

    def test_real_autograd_matches_torch(self):
        torch.set_num_threads(1)
        model = CandidateModel()
        layer = model.hidden
        a = torch.randn(3, 64, requires_grad=True)
        expected = a @ layer.weight
        gradients = torch.autograd.grad(expected.square().sum(), (a, layer.weight))
        with patch.object(model.backend.gpu, "gemm", wraps=model.backend.gpu.gemm) as calls:
            actual = layer(a)
            actual_gradients = torch.autograd.grad(actual.square().sum(), (a, layer.weight))
            self.assertEqual(calls.call_count, 3)
        torch.testing.assert_close(actual, expected)
        for actual_gradient, expected_gradient in zip(actual_gradients, gradients):
            torch.testing.assert_close(actual_gradient, expected_gradient)

    def test_embedding_tanh_loss_and_sgd(self):
        backend = CandidateTrainingBackend()
        weight = torch.randn(7, 5, requires_grad=True)
        reference = weight.detach().clone().requires_grad_(True)
        ids = torch.tensor([1, 1, 4, 6])
        targets = torch.tensor([2, 0, 3, 1])
        actual = backend.cross_entropy(backend.tanh(backend.embedding(weight, ids)), targets)
        expected = torch.nn.functional.cross_entropy(torch.tanh(reference[ids]), targets)
        actual.backward()
        expected.backward()
        torch.testing.assert_close(actual, expected)
        torch.testing.assert_close(weight.grad, reference.grad)
        expected_update = reference.detach() - 0.1 * reference.grad
        backend.sgd_step([weight], 0.1)
        torch.testing.assert_close(weight, expected_update)
        for operation in ("embedding", "embedding_backward", "tanh", "tanh_backward",
                          "cross_entropy", "cross_entropy_backward", "sgd"):
            self.assertGreater(backend.dispatch_counts[operation], 0)
        with self.assertRaises(NotImplementedError):
            backend.dispatch("unsupported")

    def test_transformer_causal_and_trainable(self):
        torch.set_num_threads(1)
        torch.manual_seed(91)
        model = CandidateTransformer()
        ids = torch.tensor([[257, 65, 66, 67, 68]])
        changed = ids.clone()
        changed[0, -1] = 90
        torch.testing.assert_close(model.sequence_logits(ids)[:, :-1],
                                   model.sequence_logits(changed)[:, :-1])
        before = model.attention.qkv_proj.weight.detach().clone()
        loss = model.backend.cross_entropy(model.sequence_logits(ids).reshape(-1, 259),
                                           torch.tensor([65, 66, 67, 68, 258]))
        loss.backward()
        self.assertTrue(all(p.grad is not None for p in model.parameters()))
        model.backend.sgd_step(model.parameters(), 0.01)
        self.assertFalse(torch.equal(before, model.attention.qkv_proj.weight))
        after = model.backend.cross_entropy(model.sequence_logits(ids).reshape(-1, 259),
                                            torch.tensor([65, 66, 67, 68, 258]))
        self.assertLess(float(after.detach()), float(loss.detach()))

    def test_no_native_torch_training_kernels(self):
        model = CandidateTransformer()
        ids = torch.tensor([[257, 65, 66, 67]])
        forbidden = AssertionError("Native torch training kernel called")
        with patch("torch.nn.functional.embedding", side_effect=forbidden), \
             patch("torch.nn.functional.linear", side_effect=forbidden), \
             patch("torch.nn.functional.cross_entropy", side_effect=forbidden), \
             patch("torch.nn.functional.layer_norm", side_effect=forbidden), \
             patch("torch.nn.functional.scaled_dot_product_attention", side_effect=forbidden), \
             patch("torch.tanh", side_effect=forbidden), \
             patch("torch.optim.SGD.step", side_effect=forbidden), \
             patch("torch.optim.AdamW.step", side_effect=forbidden):
            loss = model.backend.cross_entropy(model.sequence_logits(ids).reshape(-1, 259),
                                               torch.tensor([65, 66, 67, 258]))
            loss.backward()
            model.backend.sgd_step(model.parameters(), 0.01)

    def test_benchmark_fails_closed_before_inference(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            protocol = path / "protocol.json"
            protocol.write_text(json.dumps({"schema": 1, "frozen": False, "cases": []}))
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                benchmark(path / "missing.pt", protocol, "wrong", path / "out.json")
            with self.assertRaisesRegex(ValueError, "explicitly frozen"):
                benchmark(path / "missing.pt", protocol,
                          hashlib.sha256(protocol.read_bytes()).hexdigest(), path / "out.json")
            self.assertFalse((path / "out.json").exists())

    def test_attention_and_layernorm_gradients(self):
        from ai_model.gpu.hyper_backend import _FlashAttention
        backend = CandidateTrainingBackend()
        q, k, v = [torch.randn(2, 5, 4, requires_grad=True) for _ in range(3)]
        actual = _FlashAttention.apply(q, k, v, backend.gpu, True, 64)
        scores = q @ k.transpose(-1, -2) / 2
        mask = torch.ones(5, 5, dtype=torch.bool).triu(1)
        expected = torch.softmax(scores.masked_fill(mask, -float("inf")), -1) @ v
        torch.testing.assert_close(actual, expected, atol=2e-5, rtol=2e-5)
        actual_grads = torch.autograd.grad(actual.square().sum(), (q, k, v))
        expected_grads = torch.autograd.grad(expected.square().sum(), (q, k, v))
        for a, e in zip(actual_grads, expected_grads):
            torch.testing.assert_close(a, e, atol=3e-5, rtol=3e-5)
        norm = backend.layer_norm(4)
        x = torch.randn(2, 5, 4, requires_grad=True)
        upstream = torch.randn_like(x)
        a = norm(x)
        e = torch.nn.functional.layer_norm(x, (4,), norm.gamma, norm.beta)
        actual_grads = torch.autograd.grad(a, (x, norm.gamma, norm.beta), upstream)
        expected_grads = torch.autograd.grad(e, (x, norm.gamma, norm.beta), upstream)
        for a, e in zip(actual_grads, expected_grads):
            torch.testing.assert_close(a, e, atol=3e-5, rtol=3e-5)


if __name__ == "__main__":
    unittest.main()