---
name: User-local Nix constraints
description: Why an independent user store is needed and what it cannot fix.
---

Keep local CLI usability separate from Replit environment-loader and checkpoint readiness.

**Why:** A working local Nix binary did not imply access to the platform's configured store. A relocated root store could evaluate expressions but failed to produce a smoke-build output at its physical location. A store whose logical and physical locations both reside under the user's home successfully built the same kind of derivation.

**How to apply:** Verify evaluation, actual build output, and shell execution separately. Disclose that the custom logical store loses compatibility with standard binary caches and that user builds lack privileged sandbox isolation. Do not describe these checks as fixing Replit's independent configuration parser.

Some tool-launched processes omit HOME entirely.

**Why:** Installation initially failed before doing any work because HOME was absent.

**How to apply:** Resolve the current user's home from the OS account database for local CLI installation rather than assuming tool processes inherit a login-shell environment.

The pinned Rust 1.93.1 compiler driver has a `PT_TLS` segment of `0x2e68`; the Replit build loader's default `glibc.rtld.optional_static_tls=0x2710` can be too small, causing `librustc_driver... cannot allocate memory in static TLS block`. A scoped `glibc.rtld.optional_static_tls=131072` lets the audited compiler start and build.

**Why:** A publishing build failed at the Rust toolchain probe with `LD_AUDIT` active. The failure reproduced in the workspace and was resolved by reserving 128 KiB of optional static TLS; the full isolated BoosterState compilation passed with auditing still enabled.

**How to apply:** Scope at least 131072 bytes of optional static TLS to the pinned Rust build process, preserve other tunables and any larger existing reserve, and never unset `LD_AUDIT` to make the compiler start.
