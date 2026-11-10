---
name: Publishing SIGTERM boundary
description: How to distinguish safe child-task retries from supervisor-level publishing cancellation.
---

Replit publishing output can report a build-executive `SIGTERM` while leaving
`signalOrigin` unknown. The application cannot establish or prevent a stop
issued by the publishing supervisor, operator, or another external process
unless that system supplies trustworthy attribution.

**Why:** Ignoring supervisor termination would defeat cancellation, risk leaving
partial work running, and falsely imply a build completed. Retained logs in this
project did not establish who sent the signal.

**How to apply:** Honor executive-level shutdown signals and drain owned child
processes. Retry only a specifically retryable child-task interruption after
verifying that its output is staged atomically and safe to resume. Never count
an interrupted task or build as successful; use the platform's retained build
logs to investigate external signal origin.
