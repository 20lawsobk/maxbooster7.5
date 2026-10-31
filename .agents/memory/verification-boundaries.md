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

Keep release-installation tests independent of the host's Nix closure measurement.

**Why:** The real image budget must remain enforced in production, but a developer host's shared compiler and browser store is not a stable fixture for testing payload installation.

**How to apply:** Inject a measured Nix profile only at the installer test boundary; retain real measurement as the production default and test oversized or uncovered-root refusal before mutation.

Do not invoke full-database backup actions from generic automation contract tests.

**Why:** A real backup action can read the configured database and insert a pending catalog record before a remote upload fails, leaving test-created state behind.

**How to apply:** Keep it out of broad empty-parameter action sweeps; exercise its failure path with database configuration removed and test success only against disposable database and storage fixtures.

Distinguish compressed-release verification from developer-host installation fixtures.

**Why:** The user corrected treating a host-size refusal as evidence against the existing PDIM capsule publishing approach. An oversized developer Nix store does not establish that the compressed release is oversized or that compression failed.

**How to apply:** Trace packing and boot restoration before diagnosing image size. Attribute a fixture failure to its measured inputs; certify the real shipped payload and deployment layers separately without bypassing the production gate.

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

Distinguish isolated-test prerequisites from application configuration.

**Why:** Isolated runners intentionally remove live credentials, and toolchain-installed Chromium can exist outside `/usr/bin`. A test's missing prerequisite does not prove an absent application secret or an uninstalled browser.

**How to apply:** Inspect the test's discovery and isolation boundary before asking for credentials or installing another runtime. Preserve real missing-prerequisite failures and never count them as passed.

Portable compiler verification can fail before compilation on this developer host.

**Why:** The pinned official Rust toolchain's compiler driver failed to load with `cannot allocate memory in static TLS block`; the alternative Nix build also encountered an unwritable cache. Neither result establishes an application compilation defect.

**How to apply:** Diagnose the loader/build environment separately. Preserve archive verification and the pinned compiler version; do not downgrade them or call a skipped compilation successful.
