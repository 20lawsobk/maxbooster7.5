---
name: Nix dependency editing
description: Limits of managed dependency removal for custom Nix expressions.
---

Do not treat a successful managed package-removal response as evidence that a custom Nix function application was removed.

**Why:** Removing the `writeShellScriptBin` attribute reported success while its full function application remained in `replit.nix`. Passing the full expression was rejected because only package attribute paths are accepted. Direct configuration edits were also protected.

**How to apply:** Inspect the resulting dependency list. If the managed tool cannot represent the required edit, request the exact edit through the user's editor rather than bypassing the file protection or claiming the environment is fixed.

Do not attribute the platform's `«nix-internal»/derivation-internal.nix` error solely to a custom dependency expression.

**Why:** After the root configuration contained only plain package attributes and the custom alias was gone, a managed workflow start still failed with the identical dependency-parsing error before running the app command.

**How to apply:** Treat removing custom derivations as insufficient evidence of recovery. Require a successful managed environment startup; local Nix parsing or user-store builds do not exercise the same loader.

The same loader error also persisted with an empty system-dependency list while Node and Python modules remained enabled.

**Why:** Removing only the Nix package did not help; removing all system packages likewise failed before the workflow command ran. The original dependency set was restored and verified.

**How to apply:** Do not repeat system-package removal as a proposed fix without new evidence. Replit's documented next recovery step is “Restart compute” through the command palette; an application workflow restart is not a compute restart. Neither stale environment state nor module evaluation has yet been ruled out.

The reported `«nix-internal»/derivation-internal.nix` path is a virtual source label, not a missing repository file.

**Why:** A deliberately incomplete derivation evaluated with installed Nix 2.34.8 produced a normal missing-builder diagnostic referencing that exact internal source label and displaying its embedded source. Nix 2.28.4 reported the equivalent location as `<nix/derivation-internal.nix>`. This isolates a version-dependent internal source naming difference independently of the app.

**How to apply:** Do not generate a dummy file at that path or claim copying one repairs Nix. The managed loader's attempt to stat a virtual source requires loader compatibility investigation; switching the separate user-local CLI does not establish which Nix the managed loader uses.
