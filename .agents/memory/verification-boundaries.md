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
