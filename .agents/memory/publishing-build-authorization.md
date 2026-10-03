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

Do not attribute a publishing cache survivor to a specific tool solely from
workspace cache names or a passing miniature build.

**Why:** A real publish failed after packing with a surviving `.cache`, but a
small Python startup trace did not reproduce its writer. Fixtures loading tsx
and imports from the repository retain dependencies absent from the packed tree.

**How to apply:** Distinguish verified cache-location and lifecycle fixes from
proof of the original writer. Check the payload after child shutdown, retain
failure for uncontrolled late writes, and reserve publication-success claims
for an observed real publish.

The publishing survivor was subsequently narrowed to `.cache/replit` despite
child-only cache redirection. Do not assume changing child XDG/npm/Python cache
locations controls a platform process started before that child.

**Why:** A real publishing attempt still failed after that redirection.

**How to apply:** Separate platform cache producers from application build
tools, and distinguish controlled invalidation fixtures from an observed
platform-writer trace.

Exercise the actual configured publishing command in disposable regression
fixtures, rather than maintaining a separate test-only command.

**Why:** The repaired helper and documentation agreed while the real publishing
configuration still invoked its obsolete entry point, causing another pre-npm
failure despite passing helper tests.

**How to apply:** Read the deployment argument array from configuration.
Verify each real entrypoint against its current role and preserve
rejection-before-mutation tests.

Use the historical publish-checkpoint build/start scripts as scaffolding,
updated for the current application and required runtimes.

**Why:** The user superseded the prepare-before-Publish approach by asking to
use the successful scripts as scaffolding and update them for what is being deployed.

**How to apply:** Keep the compile/pack → restore/start structure, current model,
dependency and image-budget gates, and explicit disposable-root authorization.
Do not reintroduce a mandatory prepared-release prerequisite. Do not confuse
historical publish markers or runtime import checks with proven live health.