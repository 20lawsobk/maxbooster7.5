---
name: Verification boundaries
description: Non-obvious constraints when verifying the imported application's deployment and release tooling.
---

Run deployment-bootstrap and publishing-context fixtures serially.

**Why:** Concurrent test files can observe each other's temporary tool-directory cleanup, producing misleading lifecycle assertion failures even though their application fixtures are separate.

**How to apply:** Use the canonical per-file runner or Node's `--test-concurrency=1`. Preserve the cleanup assertions rather than suppressing them.

Do not weaken the publishing image budget to accommodate a fully provisioned developer test host.

**Why:** Native compiler, browser, and other test tooling can make the developer's shared Nix store much larger than a deployable image. A refusal there does not measure the eventual published image, but it also does not establish successful publishing.

**How to apply:** Record the developer-host refusal honestly and require a measured, budget-compliant publishing environment before claiming release-installation acceptance.

Cold-start verification must inspect background-worker initialization as well as HTTP health.

**Why:** In this application, the listener and landing page stayed healthy while a separate storage/watchdog initialization thread had crashed. Successful health probes alone did not establish that those services were operating.

**How to apply:** Confirm worker-initialization milestones and inspect startup exceptions before treating a restart as operationally verified. Keep model-generation admission separate from infrastructure health.

Do not diagnose a current learning refusal from one health snapshot while a training run may be in flight.

**Why:** A historical observation error remained visible while the real learner progressed through training. The durable run result established progress that the earlier health snapshot had not yet reflected.

**How to apply:** Correlate public status with the latest bounded run receipt before asking for new prerequisites or changing admission policy. Distinguish successful training and artifact eligibility from successful serving-capability evaluation.

Version the generation contract when changing how a captured request and snapshot condition generation.

**Why:** Cache identity includes the generation plan. The same request and snapshot must not reuse results interpreted under older conditioning semantics.

**How to apply:** Change the prospective plan version with conditioning changes while leaving historical delivery receipts intact.

Bound aggregate media work before rendering, not only individual request fields.

**Why:** Individually valid duration, resolution, frame-rate and sample-rate limits can combine into excessive allocation or encoding work.

**How to apply:** Enforce combined pixel-frame, sample-frame and source-pixel budgets at renderer entrypoints. Reject oversized work explicitly rather than silently reducing output quality; do not mistake these ceilings for load-test results.

Verify media request limits across both proxy layers, not only the Python renderer.

**Why:** Valid scene-image inputs exceeded the ordinary JSON limits in both the public app and its private MaxCore proxy, despite passing native rendering tests.

**How to apply:** Keep larger parsers limited to the relevant routes, preserve authentication boundaries, and test transport admission separately from decoded-media validation.

Keep authored scene composition independent from automatic rolling-frame continuity.

**Why:** Reusing a preceding scene's terminal frame can carry its photo and burned-in text into the next authored scene, changing the user's specified composition.

**How to apply:** Disable inherited frames for exact authored projects while retaining intentional continuity for generative workflows. Verify scene boundaries as well as total frame counts.

Measure audio delivery thresholds after final encoding, and make test analysis channel-aware.

**Why:** A mastered intermediate does not prove a lossy video's final true peak. Reading interleaved stereo as mono also changes apparent frequencies and can falsely pass a narration-versus-music test.

**How to apply:** Recheck delivered encodings and decode channel layout before spectral assertions. Treat loudness acceptance as a technical measurement, not evidence of natural speech or perceptual quality.
