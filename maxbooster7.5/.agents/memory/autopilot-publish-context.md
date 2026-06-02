---
name: Autopilot publish-context recovery
description: How publish context must be captured and retained so performance analysis sees real type/topic/posted-hour instead of synthetic fallbacks
---

The autopilot engine queues content, publishes it (popping the queue with `shift()`), then later runs a `performance_analysis` job that needs the published item's `type`, `topic`, and real posted timestamp.

**Rules:**

1. Capture publish context **before/at** the moment the item leaves the queue — never via `contentQueue.find()` after `shift()`, because the item is already gone and the lookup always misses (falling back to synthetic `social_post` / now-2h values that silently corrupt learning).
2. Set real `type`/`topic` on the queued content object at creation time so the captured context carries true values.
3. Store context in a durable `publishContext` Map keyed by content id, populated at publish.
4. Do **NOT** delete the map entry when the analysis job consumes it — `performance_analysis` jobs retry (maxRetries=2), and an early delete leaves retries with no context. Bound memory the same way `performanceData` is bounded: cap-based FIFO eviction at publish time, not delete-on-consume.
5. Timing insights (`learnFromPerformance`) must use the **posted** hour (`publishedAt`), not the analysis-time hour, with a now-2h fallback.

**Why:** These were three real defects that made the loop look like it was learning while actually feeding garbage. The retry-vs-delete interaction is the subtle one — it only bites on the retry path.

**How to apply:** Any consume-once pattern guarding a retryable job must not delete on first consume; bound by eviction instead.
