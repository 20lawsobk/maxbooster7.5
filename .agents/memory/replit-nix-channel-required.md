---
name: .replit must pin the Nix channel
description: Why the whole Nix env (node, git status, checkpoints, workflows) failed to build, and how to tell it apart from a bad replit.nix.
---

`.replit` must contain `[nix]` with `channel = "stable-25_05"` (the project's original channel). The workspace `.replit` is untracked by Git, and once it lost that section, Replit fell back to a legacy nixpkgs that has no `postgresql_17`. Evaluation then failed, which left node/npm off PATH and broke checkpoints and workflows.

**Why:** It looked like an environment or quota outage. A "go" commit that rewrote replit.nix (adding pkgs.nix plus JUCE/X11 libraries) was a second suspect. The real error only appears at the very end of the long evaluation trace: `attribute 'postgresql_17' missing ... Did you mean postgresql_10..14`.

**How to apply:** When Nix env errors show `nixpkgs-legacy-src`, check `.replit` for `[nix] channel` before touching replit.nix. Put `[nix]` just before `[deployment]`: placing it right after `modules` would capture `run =` into the nix table. Edit `.replit` only through verifyAndReplaceDotReplit.

**Upstream now tracks `.replit`:** a rebase or merge that takes upstream's `.replit` silently drops the channel again (and any agent-configured workflows). Recheck `[nix]` after every sync. A full workspace disk quota produces the same "toolchain missing" symptoms and also blocks git writes, so check free space when the env fails to rebuild.

**Rebasing with a deliberately dirty `.replit`:** `git rebase --continue` refuses any unstaged change ("You must edit all merge conflicts…"), even in an unrelated file. Use `git update-index --assume-unchanged .replit` for the duration and undo it before committing the file. Reverting the file would break the live env mid-rebase.
