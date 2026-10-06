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
