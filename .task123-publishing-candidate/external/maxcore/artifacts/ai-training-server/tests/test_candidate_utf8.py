"""Encoding constraints are not language-quality claims or output repairs."""
from itertools import product
import unittest
import numpy as np

from ai_model.model.candidate_tokenizer import Utf8GenerationState
from ai_model.model.candidate_model import CandidateTransformer, PublicContentTransformer
from ai_model.gpu.candidate_training import CandidateTrainingBackend


class Utf8GenerationTests(unittest.TestCase):
    def test_allowed_bytes_match_independent_python_decoder(self):
        prefixes = [b"", b"\xc2", b"\xdf", b"\xe0", b"\xed", b"\xef",
                    b"\xe0\xa0", b"\xf0", b"\xf4", b"\xf0\x90",
                    b"\xf4\x8f", b"\xf0\x90\x80"]
        for prefix in prefixes:
            state = Utf8GenerationState()
            for byte in prefix:
                state.advance(byte)
            allowed = state.allowed_tokens(4)
            for byte in range(256):
                # Incremental Python decoding defers some surrogate failures.
                # Require a *completable* prefix, using the strict final decoder.
                # These continuation representatives cover all Unicode boundary
                # intervals without reproducing the state machine under test.
                valid = False
                for length in range(4):
                    for suffix in product((0x80, 0x90, 0xA0, 0xBF), repeat=length):
                        try:
                            (prefix + bytes([byte]) + bytes(suffix)).decode("utf-8")
                            valid = True
                            break
                        except UnicodeDecodeError:
                            pass
                    if valid:
                        break
                self.assertEqual(byte in allowed, valid, (prefix, byte))
            self.assertEqual(258 in allowed, state.pending == 0)

    def test_budget_cannot_start_an_incomplete_character(self):
        state = Utf8GenerationState()
        for budget in range(1, 5):
            for lead in state.allowed_tokens(budget):
                if lead == 258:
                    continue
                following = Utf8GenerationState()
                following.advance(lead)
                self.assertLessEqual(following.pending, budget - 1)
        state.advance(0xF0)
        with self.assertRaises(ValueError):
            state.allowed_tokens(2)

    def test_unicode_boundaries_roundtrip_without_replacement(self):
        for point in [0, 0x7F, 0x80, 0x7FF, 0x800, 0xD7FF, 0xE000,
                      0xFFFF, 0x10000, 0x10FFFF, 0x1F3B5]:
            raw = chr(point).encode("utf-8")
            state = Utf8GenerationState()
            for i, byte in enumerate(raw):
                self.assertIn(byte, state.allowed_tokens(len(raw) - i))
                state.advance(byte)
            self.assertEqual(state.pending, 0)
            self.assertEqual(raw.decode("utf-8"), chr(point))

    def test_backend_masks_before_argmax_and_nucleus_selection(self):
        backend = CandidateTrainingBackend(7)
        logits = np.zeros(259)
        logits[0x80] = 100
        logits[ord("A")] = 10
        for temperature in [0., .8]:
            chosen = backend.dispatch("sample", logits, [], 0,
                                      backend.dispatch("rng", 7),
                                      temperature, .9, 1, 1., 1, 258,
                                      Utf8GenerationState().allowed_tokens(1))
            self.assertEqual(chosen, ord("A"))
        with self.assertRaisesRegex(ValueError, "No admissible"):
            backend.dispatch("sample", logits, [], 0, backend.dispatch("rng", 7),
                             0., 1., 1, 1., 1, 258, (258,))

    def test_real_legacy_and_incremental_generation_return_strict_utf8(self):
        models = [CandidateTransformer(context=128),
                  PublicContentTransformer(context=128, width=128, layers=2)]
        for model in models:
            for budget in [1, 2, 3, 4, 17]:
                for temperature in [0., .8]:
                    result = model.generate("music", max_new_tokens=budget,
                                            min_length=budget, temperature=temperature,
                                            top_k=32, seed=41)
                    raw = bytes.fromhex(result["bytes_hex"])
                    self.assertEqual(raw.decode("utf-8", errors="strict"), result["text"])
                    self.assertEqual(list(raw), result["token_ids"])
                    self.assertEqual(len(raw), budget)


if __name__ == "__main__":
    unittest.main()
