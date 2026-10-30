"""Batching metadata must not turn infrastructure startup into inference."""
import unittest

from ai_model.generation.batching import original_generate
from ai_model.generation.live_serving import LiveModelUnavailable, LiveServingModel


class BatchingBootstrapMetadata(unittest.TestCase):
    def test_unavailable_model_metadata_does_not_require_a_release(self):
        model = LiveServingModel()
        self.assertIsNone(original_generate(model))
        self.assertFalse(model.available)
        with self.assertRaises(LiveModelUnavailable):
            _ = model.generate

    def test_saved_instance_callable_is_preserved_without_delegating(self):
        model = LiveServingModel()
        saved = self.test_saved_instance_callable_is_preserved_without_delegating
        model._orig_generate = saved
        self.assertIs(original_generate(model), saved)
        self.assertFalse(model.available)
        del model._orig_generate
        self.assertIsNone(original_generate(model))


if __name__ == "__main__":
    unittest.main()
