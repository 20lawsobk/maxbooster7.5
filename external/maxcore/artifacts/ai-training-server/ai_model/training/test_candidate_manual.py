import unittest
from unittest.mock import patch
import numpy as np
import torch

from ai_model.gpu.candidate_training import array
from ai_model.model.candidate_model import CandidateTransformer
from ai_model.model.candidate_serving import CandidateServingAdapter


class CandidateManualTests(unittest.TestCase):
    def test_full_manual_backward_and_update_match_autograd(self):
        torch.set_num_threads(1)
        model = CandidateTransformer(seed=32)
        ids = np.array([[257, 65, 65, 66], [257, 68, 69, 69]], dtype=np.int64)
        targets = np.array([[65, 65, 66, 258], [68, 69, 69, 258]], dtype=np.int64)
        weights = {name: array(p).copy() for name, p in model.named_parameters()}
        reference_logits = model.sequence_logits(torch.from_numpy(ids))
        reference_loss = torch.nn.functional.cross_entropy(
            reference_logits.reshape(-1, 259), torch.from_numpy(targets.reshape(-1)))
        reference_loss.backward()
        manual_logits, tape = model.backend.dispatch("transformer_forward", weights, ids)
        np.testing.assert_allclose(manual_logits, array(reference_logits), atol=3e-5, rtol=3e-5)
        loss, gradient = model.backend.dispatch("cross_entropy", manual_logits.reshape(-1, 259),
                                                targets.reshape(-1))
        gradients = model.backend.dispatch("transformer_backward", weights, tape,
                                            gradient.reshape(manual_logits.shape))
        self.assertAlmostEqual(float(loss), float(reference_loss.detach()), places=5)
        for name, parameter in model.named_parameters():
            np.testing.assert_allclose(gradients[name], array(parameter.grad),
                                       atol=4e-5, rtol=8e-4, err_msg=name)
        forbidden = AssertionError("Torch autograd/numerical kernel called")
        with patch("torch.Tensor.backward", side_effect=forbidden), \
             patch("torch.autograd.backward", side_effect=forbidden), \
             patch("torch.nn.functional.linear", side_effect=forbidden), \
             patch("torch.nn.functional.layer_norm", side_effect=forbidden), \
             patch("torch.nn.functional.cross_entropy", side_effect=forbidden), \
             patch("torch.tanh", side_effect=forbidden):
            actual_loss, actual_gradients = model.backend.manual_train_step(model, ids, targets, 0.03)
        self.assertAlmostEqual(actual_loss, float(loss), places=5)
        for name, parameter in model.named_parameters():
            np.testing.assert_allclose(array(parameter), weights[name] - 0.03 * gradients[name],
                                       atol=2e-6, rtol=2e-5, err_msg=name)

    def test_sample_replay_controls_and_no_native_inference(self):
        forbidden = AssertionError("Native torch numerical execution called")
        with patch("torch.randn", side_effect=forbidden), \
             patch("torch.nn.init.normal_", side_effect=forbidden):
            model = CandidateTransformer(seed=90)
        adapter = CandidateServingAdapter(model, runtime_only=True, training_exclusive=True)
        kwargs = dict(max_new_tokens=16, temperature=0.8, top_p=0.92, top_k=50,
                      repetition_penalty=1.15, min_length=10, seed=123)
        with patch.object(model, "forward", side_effect=forbidden), \
             patch.object(model, "sequence_logits", side_effect=forbidden), \
             patch("torch.multinomial", side_effect=forbidden), \
             patch("torch.softmax", side_effect=forbidden):
            first = adapter.generate("A plum.", **kwargs)
            second = adapter.generate("A plum.", **kwargs)
            other = adapter.generate("A plum.", **{**kwargs, "seed": 124})
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertTrue(first.startswith("A plum."))
        count = model.backend.dispatch_counts["transformer_forward"]
        with self.assertRaisesRegex(ValueError, "no prompt truncation"):
            adapter.generate("x" * 120, **kwargs)
        self.assertEqual(count, model.backend.dispatch_counts["transformer_forward"])
        self.assertGreater(model.backend.dispatch_counts["sample"], 0)

    def test_sampling_kernel_constraints(self):
        backend = CandidateTransformer().backend
        logits = np.arange(259, dtype=np.float32)
        # EOS strongest but min_length forbids it; control tokens always blocked.
        for seed in range(8):
            sampled = backend.dispatch("sample", logits, [], 0,
                                       backend.dispatch("rng", seed), 0.8, 0.92, 1, 1.15, 10)
            self.assertEqual(sampled, 255)
        greedy = backend.dispatch("sample", logits, [], 10, backend.dispatch("rng", 1),
                                  0.0, 1.0, 0, 1.0, 10)
        self.assertEqual(greedy, 258)
        with self.assertRaises(ValueError):
            backend.dispatch("sample", logits, [], 0, backend.dispatch("rng", 1),
                             0.8, 0.0, 50, 1.15, 10)