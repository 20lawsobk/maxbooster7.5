---
name: Live-awareness serving readiness
description: MaxCore can serve through its live-awareness mode before a certified trained checkpoint is loaded.
---

Treat live awareness as a first-class MaxCore serving mode, not as a fake or silent fallback. It may support awareness-conditioned generation while no certified checkpoint is loaded, provided the awareness snapshot and generation capability are actually ready. Report `model_loaded` only for a genuinely loaded trained checkpoint, and report serving mode separately. Only run checkpoint-specific warm-up when that checkpoint is loaded; do not hold live-aware requests behind a checkpoint-only startup gate. Keep modality claims precise: procedural image, audio, or video renderers are not evidence of trained model weights for those modalities.

**Why:** the owner specified that MaxCore awareness endpoints are the live model until a trained model matures. Earlier startup/readiness behavior tied availability to `model_loaded`, which can strand valid live-awareness serving while the trainer is still maturing.

**How to apply:** require explicit fresh-awareness and generation-ready evidence for live mode; require compatible loaded-checkpoint evidence for trained mode; keep ordinary liveness, generation readiness, checkpoint readiness, and modality-specific training status separate.
