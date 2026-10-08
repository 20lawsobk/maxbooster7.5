---
name: Deployment toolchain preservation
description: Keep build tools usable across destructive workspace-cache cleanup.
---
Preserve and verify compatible Node/package managers outside cleanup targets
before deleting platform caches.

**Why:** A publishing log showed a later build invocation reaching dependency
installation with both Node and npm unavailable. Keeping a running Node process
alone does not preserve the executables its child tasks need.

**How to apply:** Respect the project's npm version and active pnpm version.
Reference immutable `/nix/store` installations directly through temporary
launchers; only copy tools outside that store. Workspace-cache cleanup does not
remove Nix store paths, and recursively dereferencing their dependency symlinks
adds unnecessary disk usage before the scheduler can report progress.
Nix package copies can inherit read-only directory permissions, preventing cleanup;
make temporary copies writable without modifying the store. Run pnpm version
checks outside this npm-managed workspace: project-manager enforcement can reject
even `pnpm --version` here. Runtime VM sizing is not proof of build CPU/RAM.

Avoid unbounded shell glob expansion over the lazy-mounted Nix store before
probing the known PATH executable. Resolve explicit immutable exec targets in
package-manager wrappers before treating them as package roots.

**Why:** Bootstrap hung before its first Node probe while expanding the store;
bounding that search then exposed a working npm hidden behind a shell wrapper.

**How to apply:** Probe known tools first, bound fallback discovery in a child
process with a kill deadline, and verify actual package versions before cleanup.

BoosterState is required in the publishing build; missing Rust tooling is not
permission to publish without the sidecar.

**Why:** The user approved replacing the historical warning-and-success behavior
after a publish skipped the sidecar because ambient Cargo was unavailable.

**How to apply:** Keep Rust build-only, using the existing pinned toolchain rather
than enlarging the runtime image with a Rust installation. Fail on build errors;
verify a freshly compiled binary, not a previously existing binary.
