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
