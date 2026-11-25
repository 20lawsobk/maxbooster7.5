---
name: Embedded Vite configuration
description: Prevent middleware-mode development servers from losing the app's resolved Vite configuration.
---

Resolve the environment-specific Vite configuration before passing it to an embedded middleware server, then merge middleware-only overrides without replacing the shared root, plugins, aliases, or watcher boundaries.

**Why:** Spreading a `defineConfig` callback as though it were a plain object silently discards its settings. Vite can then default to the process working directory, creating an unexpectedly broad filesystem watch and losing the intended client transforms and aliases.

**How to apply:** When embedding Vite, verify the resolved root and plugin set, then measure watcher counts and load the preview after startup.
