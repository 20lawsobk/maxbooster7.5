---
name: replit.nix feeds the deploy build's Nix closure too
description: replit.nix packages apply to BOTH the persistent dev workflow environment AND the deploy build container; a heavy dev-only toolchain in it silently inflates every publish's image size.
---

`replit.nix`'s deps list is not dev-only — it is exported into every
environment derived from this project, including the deploy build
container. A preflight that measures the Nix closure (walking every store
path reachable from the build env's own environment variables) counts
anything listed there, whether the production run path uses it or not.

**Why this matters:** a multi-GB toolchain added to `replit.nix` for
occasional manual work gets shipped — and measured — on every publish,
even though production never invokes it.

**How to apply:** keep occasional heavy tooling OUT of the persistent Nix
deps list. Fetch it on demand into a throwaway `nix-shell -p <pkgs> --run
"<cmd>"` subshell instead; `nix-shell` is always available independent of
`replit.nix`'s contents. Before adding a package to `replit.nix`, check
whether the production run path actually needs it — if not, it belongs
behind an on-demand wrapper, not the persistent list.

**Caveats for anyone measuring a Nix closure via the local sqlite
registration DB(s):**
- Some environment-referenced store paths (language runtime / package
  manager "module" installs) are real on-disk paths but are not registered
  in any standard registration DB — a plain row lookup will always miss
  them. Measure them directly (e.g. walk the directory) rather than
  treating the miss as an accounting failure.
- A store path can also appear in an env var without ever existing on disk
  (e.g. a stale `nix-shell` subshell variable inherited from an earlier,
  now-gone invocation). Such paths contribute nothing to the real image and
  can never be measured — drop them from the root set entirely rather than
  letting them permanently trip a "must cover every root" check. Only
  paths that exist on disk but still can't be measured should fail closed.
