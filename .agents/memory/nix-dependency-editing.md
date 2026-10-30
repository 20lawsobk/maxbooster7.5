---
name: Nix dependency editing
description: Limits of managed dependency removal for custom Nix expressions.
---

Do not treat a successful managed package-removal response as evidence that a custom Nix function application was removed.

**Why:** Removing the `writeShellScriptBin` attribute reported success while its full function application remained in `replit.nix`. Passing the full expression was rejected because only package attribute paths are accepted. Direct configuration edits were also protected.

**How to apply:** Inspect the resulting dependency list. If the managed tool cannot represent the required edit, request the exact edit through the user's editor rather than bypassing the file protection or claiming the environment is fixed.
