---
name: Stuck preview boot shell
description: Distinguish a stale preview URL or unhealthy Node/Vite process from a client-loader defect.
---

A stuck pre-hydration screen is not proof that the loader or reload button is broken. First compare the displayed hostname with the active workspace preview and check `/api/boot-status`. A stale preview hostname can return Replit's unavailable-project page while the active workflow serves the hydrated app. If the current host is unhealthy, inspect the Node process and workflow logs; an earlier successful readiness check does not rule out a later heap failure.

**Why:** stale preview hosts and a dead or stalled Vite process can look identical to a user, but need different fixes.

**How to apply:** verify the current host, boot endpoint, and fresh browser hydration first; only change loader behavior when the active server is healthy and evidence isolates a client-side failure.
