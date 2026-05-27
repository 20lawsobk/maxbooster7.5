---
name: PDIM script chain split
description: Why _enqueueScriptExec must use its own chain separate from _pdimGlobalChain, or LuaExecutor Workers time out.
---

## Rule
`_enqueueScriptExec` in `server/lib/pdimClient.ts` MUST use `_pdimScriptChain`, NOT `_pdimGlobalChain`.

## Why
At boot, 780+ direct callers (session stores, rate limiters, distributed cache, etc.) queue into `_pdimGlobalChain`. PermanentFixer restores `_pdimGapMs` to a high value (400–2000ms) to prevent thundering herd. With 780 callers at 400ms gap: 780 × 600ms ≈ 4 minutes to drain. At the old 2000ms cap it was 28 minutes.

LuaExecutor Workers make redis.call()s via `_enqueueScriptExec`. If scripts share `_pdimGlobalChain`, Workers queue at position 780+ and wait 4–28 minutes for their PDIM call. Workers have a 60s `Atomics.wait` timeout — they die with `[LuaExecutor] redis.call timed out after 60s — PDIM chain congested` long before their turn.

## How to apply
- `_pdimScriptChain` is declared immediately after `_pdimGlobalChain` in the module-level state block.
- `_enqueueScriptExec` appends to and advances `_pdimScriptChain` only.
- 429 protection is NOT broken: `_rateLimitedUntil` is checked inside `exec()` (inside `fn()`) before every HTTP request, so both chains independently honour the rate-limit deadline.
- Both chains can fire one PDIM request concurrently — PDIM handles concurrent connections.
- `_pdimQueueDepth` / `_scriptQueueDepth` counters still increment/decrement in `_enqueueScriptExec` for ChainFixer telemetry and `_enqueueExec` fast-fail estimation.
