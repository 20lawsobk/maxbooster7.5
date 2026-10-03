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

**How to apply:** Read the deployment argument array from configuration. Publishing
now installs a prepared release without rebuilding; packing belongs only to the
isolated preparation step. Verify each real entrypoint against that role and
preserve rejection-before-mutation tests.

Prepare a fresh production release before deployment, then publish that exact
verified payload without rebuilding it.

**Why:** The user explicitly approved moving expensive build work before Publish
and enforcing freshness rather than relying on remembering a manual convention.

**How to apply:** Keep source/lock identity and payload integrity checks fail-closed.
Missing or stale releases require another preparation, never an automatic build
fallback. Do not confuse runtime import checks with full application readiness.