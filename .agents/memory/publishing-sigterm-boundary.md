---
name: Publishing SIGTERM boundary
description: How to distinguish safe child-task retries from supervisor-level publishing cancellation.
---

Replit publishing output can report a build-executive `SIGTERM` while leaving
`signalOrigin` unknown. The application cannot establish or prevent a stop
issued by the publishing supervisor, operator, or another external process
unless that system supplies trustworthy attribution.

Replit's Publishing documentation says clicking Cancel sends `SIGTERM`. The
documentation does not describe a build-process API, environment variable, or
other supported signal metadata that lets the script distinguish that Cancel
from another executive-level `SIGTERM`.

**Why:** Ignoring supervisor termination would defeat cancellation, risk leaving
partial work running, and falsely imply a build completed. The documented Cancel
signal is indistinguishable to the current build handler; retained logs do not
establish who sent an executive-level signal.

**How to apply:** Honor executive-level shutdown signals and drain owned child
processes. Retry only a specifically retryable child-task interruption after
verifying that its output is staged atomically and safe to resume. Never count
an interrupted task or build as successful; use the platform's retained build
logs to investigate external signal origin. Do not add automatic executive-level
resume unless Replit provides a supported, trustworthy cancellation reason to
the build process.
