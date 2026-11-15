---
name: AutoPush restart-from-zero after crisis
description: Why AutoPush re-runs from chunk 0 on every new deployment after a production freeze, and the fix.
---

## The problem

`autoPushService.restart()` is called by the health monitor during a crisis. It sets `__autopush:progress = "0"` in the agent store via `execSync("SET", ...)`, which appends to the AOF immediately. If the event loop later freezes (e.g. blocked for 399s), no subsequent snapshot is persisted. On next boot the agent store replays: snapshot baseline (progress at some partial value) + AOF (SET progress "0") → progress = 0.

The original `start()` code only fell back to ZCARD when the progress key was **absent** (`!saved`). But `"0"` is truthy, so the ZCARD fallback was skipped. Result: AutoPush restarted from chunk 0 on every new deployment, re-ZADD-ing all 1.638M existing chunks, marking snapshotTorn on every 5s persist cycle, and writing an 11.1MB training-ZSet snapshot continuously.

**Why:**  The progress key can be corrupted/reset by health-monitor recovery; ZCARD cannot be faked.

## The fix

In `start()`: always call ZCARD regardless of whether the progress key exists. If `trainingCount >= TOTAL_CHUNKS`, restore the progress key and bail out. In `restart()`: guard with the same ZCARD check — don't reset progress if training is already complete.

## How to apply

Any time the server boots and AutoPush looks wrong (re-running from 0 while training store is full), check whether the progress key is "0" via `GET __autopush:progress` on the agent store. The ZCARD guard now prevents this from causing harm.
