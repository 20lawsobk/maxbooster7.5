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
