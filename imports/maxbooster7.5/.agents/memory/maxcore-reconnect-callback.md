---
name: MaxCore reconnect callback for beat loop rescheduling
description: MaxCoreAIClient.onReconnect fires once when MaxCore transitions offline→online; beat loop uses it to reschedule promptly.
---

## Rule
`MaxCoreAIClient.onReconnect: (() => void) | null` (static, public) is called once inside `startMaxCoreLLMWarmth → pingWithTracking` when `_consecutiveFailures > 0` and the next ping succeeds. Single-slot — last registration wins.

`BeatMoneyLoopService.enable()` registers a callback that:
1. Reads current state from DB
2. If `nextRunAt` is > 3× `MIN_CADENCE_MS` away (meaning it was set due to a failure backoff), reschedules to `now + MIN_CADENCE_MS`
3. Logs the reschedule with how many minutes were remaining

**Why:** After MaxCore fails, adaptive backoff sets `nextRunAt` up to 12h away. Without this callback, the beat loop stays dormant for hours after MaxCore recovers.

**How to apply:** Only registers the callback inside `enable()`. If the loop is disabled when MaxCore reconnects, the callback is a no-op (checks `st.enabled`). The callback is async but fires in a detached `.catch(() => {})` context — never awaited by the pinger.
