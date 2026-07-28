# Beat Money Loop

## What It Is

The Beat Money Loop is an autonomous, admin-only AI revenue engine. It scans music industry trends, generates beats via MaxCore's AI, prices them competitively, lists them on the marketplace, and dispatches social ad campaigns — all without human intervention. It runs as a singleton under the admin account and self-optimizes its strategy over time based on cycle performance history.

**Admin API:** `/api/admin/beat-money-loop/`  
**Service:** `server/services/beatMoneyLoopService.ts`  
**Routes:** `server/routes/admin/beatMoneyLoop.ts`  
**DB table:** `beatMoneyLoopCycles`

---

## Full Cycle Lifecycle

`runCycle(trigger, overrides?)` executes these steps in order:

```
1. SCAN      → Pull industry context (genre, mood, tempo) via musicIndustryContextFilter
2. GENERATE  → Request beat WAV from MaxCore (Mode C: 8TB dataset → Mode B: HD DSP fallback)
3. UPLOAD    → Store audio file; record path in beatListings
4. LIST      → Create beatListing row: title (first line only), genre, BPM, key, status="listed"
5. PRICE     → _competitivePrice() sets the USD price
6. ROYALTY   → Insert royalty_splits row for the admin account
7. ADVERTISE → Dispatch social ad campaign via advertisingDispatchService
8. COMPLETE  → Update beatMoneyLoopCycles row, emit admin notification
```

If any step fails, the cycle is marked `status: "failed"` with the error stored in `meta`.

---

## Self-Optimization

The loop self-optimizes three parameters on each cycle using up to 60 days of history from `beatMoneyLoopCycles`:

### 1. Genre Selection (`_genrePerformance` + `_weightedGenrePick`)

Genres are scored by revenue performance from recent cycles:

```
base weight = 1 for all genres
+ up to +4 for genres with high earners (plays/downloads/revenueCents weighted)
+ 1.5 forced exploration bonus for genres not tried yet
```

Normalization: `_genreKey()` maps aliases to canonical form:  
`lo_fi → lofi`, `r&b → rnb`, `hip-hop → hiphop`, etc.

Result: well-performing genres are selected more often; untried genres get occasional forced exploration to avoid locking to a single style.

### 2. Competitive Pricing (`_competitivePrice`)

Adaptive pricing factor applied to median market price:

| Condition | Factor |
|---|---|
| Beat with 5+ downloads | up to 1.15× (high demand premium) |
| 3+ listings, zero downloads | 0.85× (undercut to gain traction) |
| Default (no strong signal) | 0.95× |

### 3. Batch Size (`_optimalBatchSize`)

Controls how many beats are generated per tick:

| Condition | Batch size |
|---|---|
| Rising demand (downloads trend) | up to 3 |
| Any consecutive failure | pins at 1 |
| Normal | 1–2 |

Extra beats beyond the first are queued through `queueOverrides` auto-chain in `tick()`.

---

## Scheduler

The scheduler calls `tick()` on a configured interval (default: every few hours). `tick()`:
1. Checks if the loop is enabled.
2. Calls `_optimalBatchSize()` to decide how many cycles to queue.
3. Calls `runCycle("scheduled")` for each.
4. Queues any additional cycles via `queueOverrides`.

---

## Orphan Recovery

`recoverOrphanedCycles()` is called ~75 seconds after server boot. It finds cycles stuck in `status: "running"` and marks them `"failed"`.

**Critical guard:** It excludes cycles whose `startedAt` is **after the current process start time**. This prevents it from killing a live cycle started moments before the recovery check ran (e.g. on a duplicate server boot).

```ts
// Correct recovery query
WHERE status = 'running'
  AND startedAt < :processStartTime   ← this guard is essential
  AND startedAt < NOW() - INTERVAL '10 minutes'
```

---

## Admin API

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/beat-money-loop/status` | Current state: enabled, running cycle, last result |
| POST | `/api/admin/beat-money-loop/enable` | Turn on scheduled automation |
| POST | `/api/admin/beat-money-loop/disable` | Turn off scheduled automation |
| POST | `/api/admin/beat-money-loop/run-now` | Trigger one cycle immediately (accepts overrides body) |
| GET | `/api/admin/beat-money-loop/cycles` | Paginated cycle history |

### run-now overrides

```json
{
  "genre": "trap",
  "bpm": 140,
  "key": "F# minor",
  "durationSeconds": 120
}
```

All fields optional. Unset fields use the self-optimization defaults.

---

## MaxCore Dependency

Beat generation is fully MaxCore-dependent:
- **Mode C** (primary): MaxCore 8TB dataset audio generation — async job (`job_id` → poll `/api/platform/audio-job/:id`).
- **Mode B** (fallback): MaxCore HD DSP synthesis.
- **No local fallback** — if MaxCore is down, the cycle fails explicitly with `AIUnavailableError`.

MaxCore behaviour to be aware of:
- Cold-starts take 1–5 minutes.
- Hard-crashes ~30s under render load (known instability on the MaxCore Repl).
- Bearer-only auth (`Authorization: Bearer <MAXCORE_API_KEY>`).
- 45s timeout on the proxy; 30s for audio jobs is common.

---

## Generated Content

Successful beats are stored at:
```
public/generated-content/audio/beat_<timestamp>_<hash>.wav
public/generated-content/videos/beat_ad_<timestamp>_<hash>.mp4
```

The `.wav` extension may contain MP3-encoded audio (MaxCore returns MP3-in-.wav). The beat title is always the **first line only** of MaxCore's response, with no mid-word truncation.

---

## DB Columns Reference

`beatMoneyLoopCycles`:
- `meta.scanContext` — the musicIndustryContextFilter output used for generation.
- `meta.optimizerResults` — `{ genreApplied, priceFactor, batchSize }` with `applied: boolean` per optimizer.
- `meta.maxcoreJobId` — the async job ID from MaxCore.
- `meta.quality` — MaxCore-reported quality score.

`beatListings` (created by the loop):
- `backend: "maxcore"` — marks this as a MaxCore-generated beat.
- `status: "listed"` — immediately live on marketplace.

`royaltySplits` — one row per listing; `role: "creator"`, `splitPercent: 100`.

---

## Cron Automation Note

If using the scheduled automation cron (`server/workers/` or BullMQ), the cron **type registration** must be present before the worker starts or jobs silently stop running. See task #12 in the project backlog.
