---
name: Publishing build authorization
description: Runtime deployment indicators cannot authorize the publishing build.
---

Use explicit disposable-copy consent for publishing builds, not runtime platform
variables. Never invoke the destructive publishing entry point in the checkout.

**Why:** Publishing failed before npm because neither runtime deployment
indicator was available. Changing just the CLI guard would leave cleanup and
recovery-directory selection inconsistent.

**How to apply:** Keep recovery, build expectations, cleanup and payload boundaries
aligned to the same canonical root declaration. Validate with dependency-free
entry-point fixtures; a passing fixture is not a full build or publication.
Large disposable builds require a successful allocation probe, not just `df`.