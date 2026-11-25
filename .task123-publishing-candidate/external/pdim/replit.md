# Max Booster — Pocket Dimension Storage

## Purpose

**PDIM** (`pocketdimensionstorage.replit.app`) is Max Booster's **primary storage model** — a tri-app storage backbone connecting the AI dataset agent, the storage server, and the AI training consumer.

```
max-booster-agent  →→→  PDIM Storage Server  →→→  max-booster-training
  (producer)             (this codebase)              (consumer)
```

Data flows via BullMQ queues backed by PDIM's Redis-compatible HTTP API. The storage server auto-starts a data push pipeline on every boot.

---

## System Instances

| Instance | ID | Role | Token hint |
|---|---|---|---|
| `max-booster-agent` | `22c8e6d237afe8ae41541f87` | Dataset ingestion producer | `18cf0648...7713` |
| `max-booster-training` | `f26378c8b4faf9f237a0f816` | Training data consumer | `4b1660b3...4d8f` |

### Connection URL Format

```
pdim://TOKEN@pocketdimensionstorage.replit.app/api/redis/instances/INSTANCE_ID
```

Example (agent):
```
pdim://18cf0648abdc75cd8b904ada4d1712b928156e6b489a36c6e6b6f9bfa2447713@pocketdimensionstorage.replit.app/api/redis/instances/22c8e6d237afe8ae41541f87
```

---

## Auto-Push Pipeline

On every server boot, `AutoPushService` (`artifacts/api-server/src/auto-push/service.ts`) starts automatically and resumes from a persisted checkpoint:

- Pushes **7 TB** of dataset chunk metadata (114,688 × 64 MB chunks)
- Rate: ~250 chunks/sec (batch 50 every 200 ms)
- **Agent instance** receives: `push:stream` (stream of push events), `push:stats` (progress hash)
- **Training instance** receives: `received:chunks` (sorted set ordered by byte offset), `received:stream` (event stream)
- Progress checkpoint: `__autopush:progress` key in agent instance
- Status endpoint: `GET /api/autopush/status` → `{ running, chunkIndex, totalChunks, pct }`

Dashboard home page shows a live progress banner polling every 2s.

---

## Redis-Compatible HTTP API

All routes are under `/api/redis/instances`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/` | None | Create instance — returns `id`, `token`, `connectionUrl` |
| `GET` | `/` | None | List all instances |
| `GET` | `/:id` | Bearer | Instance info + stats |
| `DELETE` | `/:id` | Bearer | Delete instance + data |
| `POST` | `/:id/exec` | Bearer | Run a single command `{ cmd, args }` |
| `POST` | `/:id/pipeline` | Bearer | Run up to 1000 commands in one request |
| `GET` | `/:id/keys` | Bearer | List keys with optional `?pattern=` |
| `POST` | `/:id/flush` | Bearer | Flush all keys |

### Supported Commands

**Strings:** GET, SET (EX/PX/NX/XX/KEEPTTL), GETSET, MGET, MSET, SETNX, SETEX, PSETEX, INCR, INCRBY, DECR, DECRBY, APPEND, STRLEN, GETRANGE

**Keys:** DEL, EXISTS, EXPIRE, EXPIREAT, PEXPIRE, TTL, PTTL, PERSIST, TYPE, RENAME, RENAMENX, KEYS, SCAN, RANDOMKEY, COPY, UNLINK

**Lists:** LPUSH, RPUSH, LPUSHX, RPUSHX, LPOP, RPOP, LRANGE, LLEN, LINDEX, LSET, LINSERT, LTRIM, LREM, LPOS, LMOVE, **RPOPLPUSH**

**Hashes:** HSET, HMSET, HGET, HMGET, HGETALL, HDEL, HEXISTS, HKEYS, HVALS, HLEN, HINCRBY, HINCRBYFLOAT, HSETNX, HSCAN

**Sets:** SADD, SREM, SMEMBERS, SCARD, SISMEMBER, SMISMEMBER, SUNION, SINTER, SDIFF, SUNIONSTORE, SINTERSTORE, SDIFFSTORE, SRANDMEMBER, SMOVE

**Sorted Sets:** ZADD, ZREM, ZSCORE, ZINCRBY, ZCARD, ZCOUNT, ZLEXCOUNT, ZRANGE, ZRANGEBYSCORE, ZREVRANGEBYSCORE, ZRANGEBYLEX, ZREVRANGEBYLEX, ZREVRANGE, ZRANK, ZREVRANK, ZPOPMIN, ZPOPMAX, ZMSCORE, ZRANDMEMBER, ZDIFFSTORE, ZUNIONSTORE, ZINTERSTORE

**Streams:** XADD (MAXLEN/MINID/NOMKSTREAM), XTRIM, XLEN, XRANGE, XREVRANGE, XREAD, XDEL, XACK, XGROUP (CREATE/SETID/DESTROY/CREATECONSUMER/DELCONSUMER), XCLAIM, XAUTOCLAIM, XPENDING, XINFO (STREAM/GROUPS/CONSUMERS)

**Scripting:** EVAL, EVALSHA, SCRIPT LOAD/EXISTS/FLUSH

**Server:** PING, FLUSHDB, DBSIZE, INFO, OBJECT (ENCODING/REFCOUNT/IDLETIME/FREQ), WAIT

### Lua Scripting Engine (EVAL/EVALSHA)

Powered by **wasmoon** (Lua 5.4 WASM). Full BullMQ-compatible scripting:

- `redis.call()` — synchronous, raises Lua error on Redis error replies
- `redis.pcall()` — synchronous, returns `{err = "..."}` on error
- `cmsgpack` — MessagePack pack/unpack via `@msgpack/msgpack` (hex-safe binary transport)
- `cjson` — JSON encode/decode
- `struct` — `>H` format (big-endian unsigned short) for BullMQ internal scripts
- KEYS / ARGV — proper 1-indexed Lua sequence tables
- Redis reply → Lua type mapping: nil → `false`, arrays → 1-indexed tables, HGETALL → flat `[k,v,...]`, HMGET nulls → `false`, integers → number

### Storage

Each instance is backed by a `RedisStore` that:
- Keeps all data in-memory for fast access
- Persists snapshots to **PocketDimension** storage (under `./redis-dimensions/`) every 5 seconds when dirty
- Loads prior state on startup (all instances are warmed up before the server begins accepting connections)
- Manages TTL expiry via in-memory timers

### Event-Loop Stall Prevention (fixes client `exec error [GET/SET]: aborted due to timeout`)

External clients (Max Booster) saw multi-second request timeouts because heavy
serialization work blocked the Node event loop. All of these paths now yield
to the event loop instead of running in one synchronous burst:

| Hot spot | File | Fix |
|---|---|---|
| Snapshot persist (every 5 s) | `redis/store.ts` `doPersist()` | Entries serialized incrementally, yielding every `SNAPSHOT_YIELD_EVERY` (500) entries. If a mutation lands mid-serialization (`recordAof()` or LRU eviction sets `snapshotTorn`), the incremental result is discarded and one atomic synchronous serialization runs instead — guaranteeing a consistent snapshot vs. the AOF `baselineSeq` (no double-apply of INCR/APPEND on replay). |
| AOF flush (every 1 s) | `redis/store.ts` `doFlushAof()` | Records serialized incrementally, yielding every `AOF_YIELD_EVERY` (2000) records. |
| Pocket index persist (after every chunk write) | `pocket-dimension/index.ts` `persistMetadata()` | `index.json` is now compact JSON (no pretty-print) serialized incrementally with yields every 1000 map entries. Torn state is self-healing: mutations during a persist set `flushDirty`, so the coalesced trailing flush re-writes the newest index. |
| Reed–Solomon erasure coding (4 MB shards) | `fabric/erasure/ReedSolomon.ts` | `encode()` / `reconstructData()` are now **async**, yielding between parity/output rows. All call sites (`PocketStorageService.ts`, `__rs_test.ts`) await them. |

Invariants to preserve when touching this code:
- Any new mutation path of `RedisStore.data` that bypasses `recordAof()` must set
  `snapshotTorn` when `snapshotInProgress` is true (eviction already does).
- `baselineSeq` must always reflect the exact AOF sequence folded into the
  persisted snapshot; otherwise boot replay double-applies or loses writes.
- RS test: `pnpm --filter @workspace/api-server exec tsx src/pocket-dimension/fabric/erasure/__rs_test.ts`.

---

## Scale Infrastructure (90M-User Target)

| Component | File | Detail |
|---|---|---|
| Rate limiter | `src/middlewares/rateLimit.ts` | Sliding-window per-token; default 100K req/min (`RATE_LIMIT_RPM`) |
| Backpressure | `src/middlewares/backpressure.ts` | 503 when >2000 concurrent in-flight (`MAX_CONCURRENT_REQUESTS`) |
| Lua worker pool | `src/workers/lua-pool.ts` + `lua-worker.ts` | 4 worker threads; EVAL without redis.call() runs off main thread |
| LRU eviction | `RedisStore.evictLRU()` / `maybeEvict()` | Auto-evicts coldest keys when store exceeds `MAX_KEYS_PER_STORE` (5M) |
| Debounced DB writes | `RedisManager.touchInstance()` | Instance last-used written to DB at most once per 30s (not per request) |

### Scale Monitor Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/monitor/scale` | Rate limiter, backpressure, Lua pool, per-store key counts |
| `POST` | `/api/monitor/evict` | Manual LRU eviction; body `{ count: N }` (default 10% per store) |
| `POST` | `/api/monitor/compact` | GC orphaned PDIM chunks |

---

## Startup Sequence

```
1. luaPool.start()             → spawn 4 Lua worker threads
2. redisManager.initialize()   → warm up all DB instances into memory + tokenIndex
3. autoPushService.start()     → resume/start the agent→training push pipeline
4. app.listen(port)            → begin accepting HTTP connections
```

---

## Replit Environment Setup

- **Dependencies**: Install with `pnpm install` from the project root before first run
- **Database**: Run `pnpm --filter @workspace/db exec drizzle-kit push --force` to create/migrate DB tables
- **Port routing**: Dashboard on port 5000 (main preview), API server on port 3000 (via Vite proxy) and port 8080 (artifact direct route)
- **Vite proxy**: `artifacts/dashboard/vite.config.ts` proxies `/api` → `localhost:3000` so the dashboard can reach the API
- **Run**: The "Start application" workflow runs both the API server (port 3000) and dashboard (port 5000, Vite) together; it auto-restarts each on crash. `DATABASE_URL` is already provided by Replit's managed Postgres.
- Status as of this import: dependencies installed, DB schema pushed, app verified running with the auto-push pipeline active.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24, TypeScript 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (instance registry)
- **Storage**: PocketDimension chunked object store (per-instance snapshots)
- **Validation**: Zod (`zod/v4`)
- **Lua engine**: wasmoon (Lua 5.4 WASM)
- **Dashboard**: React + Vite + Tailwind + wouter + TanStack Query

## Package Layout

```
artifacts/
  api-server/           Express API + RedisManager + RedisStore + AutoPushService
  dashboard/            React admin dashboard
  mockup-sandbox/       Vite component preview server
lib/
  db/                   Drizzle ORM schema + DB connection
  api-spec/             OpenAPI spec
  api-zod/              Generated Zod schemas
  api-client-react/     Generated React Query hooks
scripts/                Utility scripts
```

## Key Source Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/redis/store.ts` | `RedisStore` engine (~2300 lines) — all commands, Lua, streams |
| `artifacts/api-server/src/redis/manager.ts` | `RedisManager` — instance lifecycle, warmup, URL generation |
| `artifacts/api-server/src/redis/types.ts` | Shared types including `RedisStreamEntry`, `StreamGroup` |
| `artifacts/api-server/src/routes/redis.ts` | HTTP handlers for all instance routes |
| `artifacts/api-server/src/auto-push/service.ts` | `AutoPushService` — dataset pipeline background worker |
| `artifacts/api-server/src/index.ts` | Server entrypoint — init sequence |
| `artifacts/dashboard/src/pages/Home.tsx` | Instance list + live auto-push progress banner |
| `artifacts/dashboard/src/pages/InstanceDetail.tsx` | Per-instance dashboard (overview, key explorer, console) |
| `lib/db/src/schema/index.ts` | `redis_instances` table |
