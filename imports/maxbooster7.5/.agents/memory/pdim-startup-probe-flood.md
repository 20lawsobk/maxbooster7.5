---
name: PDIM startup exec-chain probe flood
description: Three services called getPdimClient().ping() via the exec() chain at startup, flooding the log with exec error [PING]/[GET] when PDIM was cold. Pattern and fix documented here.
---

# PDIM startup exec-chain probe flood

## The rule
Never call `getPdimClient().ping()` (or any `exec()`-based probe) from startup paths. Use **native fetch()** directly to the PDIM HTTP endpoint instead. Also: `waitForPdimReady()` must require **2 consecutive** successful PINGs before declaring PDIM stable — a single PING means TCP accepted but PDIM may still be too slow for concurrent HSET writes.

**Why:** During PDIM cold-start, each exec()-based ping queues a 4s AbortSignal wait and emits an `exec error [PING/GET]` WARN when it times out. Three callers did this at startup, producing 7+ errors per restart. Native fetch bypasses the AIMD chain entirely so it neither pollutes the chain queue nor generates exec-error logs.

**How to apply:**
- `server/startup-probes.ts checkRedis()` — replaced `getRedisClient().ping()` with a direct fetch POST `{cmd:"PING"}` to `PDIM_HTTP_EXEC_URL`
- `server/services/maxcoreSync.ts probeConnectivity()` — same native-fetch replacement
- `server/middleware/sessionConfig.ts pingWithRetry()` — added `cbIsPdimUnhealthy()` guard at top; if PDIM is cold, throw immediately so session store falls back to PG without wasting 3×4s of timeouts
- `server/workers/index.ts waitForPdimReady()` — changed to require `consecutiveOk >= 2` (with `let consecutiveOk = 0` tracking streak); resets to 0 on any non-200; prevents BullMQ HSET burst on a just-woken PDIM

## Result
0 `exec error` lines in startup logs once PDIM is warm; `⚠️ PDIM probe: ... — operating in fallback mode` (single INFO line) when PDIM is cold.
