---
name: MaxCore local subsystem
description: Durable constraints for running the imported MaxCore repo as a supervised child inside Max Booster
---

MaxCore runs locally by default as a supervised child on loopback; the imported Node layer owns the Python model server's lifecycle. `MAXCORE_LOCAL=0` restores remote mode.

Durable constraints:
- **Neon pooler rejects the `options` startup parameter.** Schema isolation via `search_path` requires the unpooled host (strip `-pooler.`). Without isolation, MaxCore's DDL collides with Max Booster's same-named tables and Python crash-loops.
- **`search_path` selects a schema but never creates it** — the schema must be bootstrapped with `CREATE SCHEMA IF NOT EXISTS` before the child first runs DDL, or a fresh database crash-loops.
- **Node-layer liveness ≠ subsystem readiness.** The Node `/healthz` answers while Python crash-loops; readiness must probe the Python-backed health endpoint and require `status: "healthy"`.
- **A SIGKILL'd cluster primary strands its worker (still holding the port) and Python.** Spawn the child in its own process group and sweep the group on exit.
- Contract tests that simulate remote MaxCore must disable local mode in env before importing config, or the loopback origin wins.

**Why:** user directive — MaxCore/PDIM are internal subsystems; their external servers and separate artifact apps are retired.
