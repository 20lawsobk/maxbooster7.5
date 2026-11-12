---
name: Neon session startup race
description: Keep a cold Neon connection's authoritative session-store handshake ahead of database-heavy startup probes.
---

The server's first authoritative PostgreSQL session-schema check should complete before starting database-backed security-state loads, readiness sweeps, or diagnostic loops. If the initial Neon connection is transiently unavailable, retry only connection failures with bounded backoff; do not create an in-memory session fallback or retry schema/authentication errors.

**Why:** Several startup probes and the security blocklist loader opened database connections alongside the session-store check. During a Neon cold start, the session WebSocket handshake timed out and terminated the whole server even though the database became reachable moments later.

**How to apply:** Preserve fail-closed readiness and session semantics. Sequence required auth storage first, defer optional/background DB probes until it succeeds, and verify the live app reaches an authoritative session store plus healthy database probe after a real restart.
