---
name: Publishing build authorization
description: Runtime deployment indicators cannot authorize the publishing build.
---

The user explicitly chose to activate the unmodified historical deployment
script set for the current app while retaining the newer versions for switch-back.
Do not automatically reintroduce the newer publishing architecture as a repair.

**Why:** The user requested testing the historical scripts against today's
Max Booster and then explicitly requested making those scripts active, accepting
that they could ask to switch back.

**How to apply:** Preserve that baseline until the user requests changes. Never
invoke its destructive build in the working checkout. Activation is not proof
that the historical environment was reconstructed or that publishing succeeded.

The remaining guidance applies to the preserved newer build implementation:
use explicit disposable-copy consent, not runtime platform variables.

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

The user clarified that “original successful start and build scripts” means
the shell scripts from the August 26, 2026 publishing checkpoint.
After restoring that baseline, the user explicitly authorized connecting the
newer deployment compression and added “Both,” including adaptive compression.

**Why:** The user wants the original pack/remove/restore design with the newer
compression systems actually wired into it, not another replacement architecture.

**How to apply:** Keep the historical shell structure; compression integration
and matching restore support are authorized. Do not roll back unrelated
application files or revive a mandatory prepared-release prerequisite.
Keep the historical archive intact and never run the destructive build in the
working checkout.
Preserve removal of successfully packed directories from the shipped image
and restoration of required runtimes at startup; the user explicitly reiterated
that this image-size reduction is part of the original design.
Do not reintroduce a mandatory prepared-release prerequisite. Do not confuse
historical publish markers or runtime import checks with proven live health.