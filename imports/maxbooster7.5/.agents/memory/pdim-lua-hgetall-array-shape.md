---
name: PDIM Lua bridge HGETALL must return a flat array, not an object
description: Why BullMQ repeatable/scheduled jobs looked nameless and never rescheduled past their first run when backed by the local PDIM/Lua bridge.
---

Real Redis returns `HGETALL` over RESP as a **flat array** of alternating
field/value strings (`["name","x","data","{}",...]`), never a keyed object.
BullMQ's Lua scripts and JS layer both depend on this: the JS side rebuilds
job data with `array2obj()` (a `for (i=0;i<arr.length;i+=2)` loop — silently
produces `{}` on a non-array input), and some Lua scripts iterate the raw
`rcall("HGETALL", ...)` result with `ipairs()`/`#`.

Our PDIM local store's direct app-facing `hgetall()` helper correctly returns
a keyed JS object (`Record<string,string>`) — that shape is right for normal
app code. But when the SAME command result is passed back through the
Lua-script bridge (`redis.call()` inside the wasmoon Lua VM), a JS object
becomes a Lua table with **string keys**, not a 1..N sequence table, so
`#table`/`array2obj` see length 0 and every hash field (job `name`,
`repeatJobKey`/`rjk`, `opts`, ...) silently reads back as missing —
no error is thrown anywhere.

**Why this matters:** this exact bug made every BullMQ job (including
repeatable/scheduled ones) look like it had no name and no `repeatJobKey` at
fetch time, which skipped BOTH of BullMQ's reschedule branches
(`isJobScheduler` and legacy `job.opts.repeat`) inside `nextJobFromJobData`
with zero error/log output — repeatable jobs fired exactly once at boot and
then silently stopped forever, while completion-side hash writes (HSET,
HINCRBY) worked fine and looked healthy in isolation.

**How to apply:** any time a custom Redis-over-HTTP bridge sits between
BullMQ's Lua scripts and a store whose native multi-value command shape is a
JS object, flatten `HGETALL` (and any similarly keyed-shaped command) to a
flat `[k1, v1, k2, v2, ...]` array **only on the Lua-facing bridge path**,
never on the direct app-facing client method — changing the direct path's
return shape breaks all normal callers expecting an object. In this repo the
fix lives in `server/lib/luaExecutor.ts`'s `redis.call()` message handler,
right before the result is JSON-stringified back into the wasmoon Worker.

Debugging technique that found it: log every Lua-bridged redis.call
cmd+args+result filtered to the specific BullMQ keys of interest, restart,
and watch two consecutive scheduled-job cycles — a job that fires once then
never again (with no error) points straight at a reschedule-branch no-op,
not a missing/broken Redis command.
