---
name: MaxCoreLocal is one nested chain, not two independent subsystems
description: "external/maxcore workspace bootstrap" (Node) and "MaxCoreLocal" (Python ai-training-server) are the SAME supervised chain — an outer-layer bootstrap failure is fatal to the inner Python layer too, not an independent, unrelated fault.
---

CORRECTION of an earlier version of this note that called these "structurally distinct" and "independent" — verified wrong this session via full read of `server/services/maxcoreLocalSupervisor.ts` plus live deployment-log evidence. Do not re-derive the old conclusion from log text alone.

The real shape is a 3-level nested chain, all under one log prefix:

1. Main Node app (`server/index.ts`) calls `startMaxcoreLocal()` once at boot.
2. That function first runs `bootstrapMaxcoreWorkspace()` (installs `external/maxcore/artifacts/api-server`'s `node_modules` via `scripts/bootstrap-maxcore.sh` on a clean checkout). **If this step fails, the function returns early and `spawnChild()` is never called — nothing below this point ever starts.**
3. Only if bootstrap succeeds does `spawnChild()` run `tsx src/index.ts` in `external/maxcore/artifacts/api-server` (a Node/TS wrapper). This wrapper is what actually spawns and supervises the Python `ai-training-server/server.py` (port 8090) as ITS OWN child — the CPU/resource-tuning code (`SiliconSimtBackend`, `PocketAccelerator`, resource planning) lives here.
4. All stdout/stderr from steps 3 and its Python grandchild are piped up and logged with the SAME `[MaxCoreLocal]` prefix (the Python child's lines get an additional inner `[Python]` tag). The bootstrap-failure message in step 2 also uses `[MaxCoreLocal]`.

**Why this matters:** a `"external/maxcore workspace bootstrap failed"` message is not a separate, contained fault — it means the ENTIRE chain, Python included, never started. Confirmed live: a deployment stuck on this bootstrap failure showed zero `[Python]`-tagged lines anywhere in its logs, `/api/ready`'s `maxcore` probe cycling open/half-open, and a `[MaxCoreAI] Health ping failed (failure #NNN — climbing)` counter — i.e. total, sustained MaxCore outage, not a degraded-but-partially-working state. Meanwhile the same commit's dev workflow can show MaxCoreLocal fully healthy, because dev already has `api-server/node_modules` installed from a prior manual bootstrap and a clean-checkout-style environment (e.g. a fresh deploy) does not.

**How to apply:** Before doing ANY work that assumes MaxCore/its Python subsystem is reachable in a given environment (benchmarking, calling its endpoints, reading its stats), check for `[MaxCoreLocal] [Python]`-tagged lines (or a direct `curl 127.0.0.1:8090/api/health`) in THAT environment's own logs — do not infer health from "the dev workflow is fine" or from `/api/ready` alone (its `maxcore` entry reports the circuit-breaker's view, which can lag or be misread as "just degraded" when the underlying cause is a total, sustained outage). A single `bootstrap failed` line at boot means the whole chain is down until the next full app restart re-attempts bootstrap.
