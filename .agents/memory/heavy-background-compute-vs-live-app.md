---
name: Heavy sustained background compute can crash the live app workflow
description: Running a memory/CPU-heavy native background job (EDA place-and-route, ML training, video encode, etc.) at the same time as the project's own dev workflow can OOM-kill the app in a small container; the two need to be sequenced, not run concurrently.
---

## The app's own steady-state footprint can already be most of the container
One project's dev workflow (Node app + a locally-supervised multi-worker Python/ML subsystem) alone used several GB of a ~7.8GB container at startup. Running an unrelated ~1.5-2GB native compute job (an OpenROAD router) in the background at the same time pushed available memory down to double-digit MB, and the app workflow was OOM-killed with no stack trace anywhere in its own log — the only evidence was `free -h` showing available memory collapsing right before the crash.

**Why:** a crashed dev workflow shows no clear cause in its own logs when the real cause is container-wide memory exhaustion from a sibling process; you have to correlate timing against `free -h`/`ps aux` output from around the crash time, not just read the app's log in isolation. Direct OOM confirmation (dmesg/journalctl) is typically not accessible in-sandbox, so this stays circumstantial-but-strong evidence rather than a certainty.
**How to apply:** before starting any long (multi-minute+), memory-heavy background shell job in a container that also runs a live app workflow, check `free -h` first. If headroom is thin, use the `stopWorkflow`/`restartWorkflow` CodeExecution callbacks (workflows skill) to pause the app for the duration of the heavy job rather than risk an unexplained crash, then restart the app afterward. Treat "workflow crashed with no stack trace" occurring while a heavy background job was concurrently running as circumstantial evidence of OOM even without direct kernel-log access.

## Concrete numbers confirmed for one project's container
Direct cgroup inspection showed a hard ~8GiB memory ceiling (and a 4-CPU ceiling). With the app workflow running, its own baseline (an embedded local AI subsystem's Python process alone at ~2.2GB RSS, plus ~6 Node processes) used 6+GB at idle, leaving only ~1.5GB headroom before any extra heavy job starts. Stopping the app workflow was confirmed (via `ps aux` showing zero matching processes afterward) to fully kill every one of those processes, not just the main one.
**Why:** "headroom is thin" is otherwise a vague guess; a measured ceiling and idle baseline turn it into a checkable go/no-go before starting heavy compute.
**How to apply:** check the container's real memory ceiling and `free -h` for current headroom before trusting that stopping the workflow bought enough room for a specific job's expected peak RSS.
