---
name: PDIM restore — readiness dependencies versus liveness
description: Python is now a required boot dependency; early liveness must not imply that capsule restore or the application is ready.
---

Do not restore the old rule that only Node dependencies may block application
startup. The production-hardening decision makes the portable Python runtime a
required, validated dependency. An early liveness listener and application
readiness are separate obligations.

**Why:** earlier cold restores exceeded the initial port-opening budget. Moving
Python into background restore shortened that delay but allowed interpreter
resolution/imports to race extraction. Treating that failure as a fallback is
incompatible with the required-runtime contract.

**How to apply:** keep early liveness independent of heavy extraction, await
required runtimes before their consumers, and withhold readiness until those
consumers pass their checks. Background restoration is appropriate only where
the consumer explicitly waits and exposes incomplete readiness. Cold-image
timing still needs measurement; isolated capsule tests do not certify it.
