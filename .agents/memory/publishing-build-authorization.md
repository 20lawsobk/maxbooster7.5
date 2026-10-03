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

Exercise the actual configured publishing command in disposable regression
fixtures, rather than maintaining a separate test-only command.

**Why:** The repaired helper and documentation agreed while the real publishing
configuration still invoked its obsolete entry point, causing another pre-npm
failure despite passing helper tests.

**How to apply:** Read the deployment argument array from configuration, verify
one npm invocation and its root context, and preserve rejection tests through
that same entry path.