---
name: .replit must pin the Nix channel
description: Why the whole Nix env (node, git status, checkpoints, workflows) failed to build, and how to tell it apart from a bad replit.nix.
---

`.replit` must contain `[nix]` with `channel = "stable-25_05"` (the project's original channel). The workspace `.replit` is untracked by Git, and once it lost that section, Replit fell back to a legacy nixpkgs that has no `postgresql_17`. Evaluation then failed, which left node/npm off PATH and broke checkpoints and workflows.

**Why:** It looked like an environment or quota outage. A "go" commit that rewrote replit.nix (adding pkgs.nix plus JUCE/X11 libraries) was a second suspect. The real error only appears at the very end of the long evaluation trace: `attribute 'postgresql_17' missing ... Did you mean postgresql_10..14`.

**How to apply:** When Nix env errors show `nixpkgs-legacy-src`, check `.replit` for `[nix] channel` before touching replit.nix. Put `[nix]` just before `[deployment]`: placing it right after `modules` would capture `run =` into the nix table. Edit `.replit` only through verifyAndReplaceDotReplit.
