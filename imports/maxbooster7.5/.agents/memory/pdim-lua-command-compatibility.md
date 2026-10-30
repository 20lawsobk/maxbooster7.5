---
name: PDIM Lua command compatibility
description: Testing Lua scripts against the embedded Redis-compatible store
---

**Rule:** Exercise each production Lua script through the embedded PDIM RedisStore, not only against Redis semantics or a separate Redis server. Enumerate every `redis.call` command used by the script and verify the actual executor supports it.

**Why:** The live awareness snapshot publication script used Redis `TIME`, which the embedded store did not implement. Readiness could not become true until the command was supported and tested through the same EVAL path used in production.

**How to apply:** When adding or changing a Lua script, add an integration test that invokes it through `RedisStore.exec("EVAL", ...)` and covers the real publication/consumer path.