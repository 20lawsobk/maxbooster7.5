---
name: vitest integration config requires the app server running
description: vitest.integration.config.ts's shared globalSetup polls the live app for up to 8 minutes before ANY test file runs, even one that itself needs no server
---

`vitest.integration.config.ts` declares a shared `globalSetup: ["tests/globalSetup.ts", ...]` for the WHOLE config. That setup silently polls `http://localhost:5000/api/auth/me` in a loop (no per-attempt log line — just a single thrown error at its own 8-minute deadline) until the real Express app is past its boot-phase stub.

This cost applies even when you filter to a single test file that has nothing to do with the running app (e.g. a subsystem-supervisor test that spawns its own child process and is commented as "no running app needed") — `vitest run --config vitest.integration.config.ts <file>` still pays the shared globalSetup first. Stopping the app's dev workflow to get a "clean, uncontended" isolated run of such a file backfires: instead of running faster in isolation, the process hangs with ZERO log output until an outer timeout kills it — which looks exactly like a code-level hang in the thing you're testing.

**Why:** globalSetup's polling loop only logs on a real HTTP response (boot-phase or ready); a connection-refused error is swallowed into a local variable that's never printed until/unless the full 8-minute deadline is reached. A short outer `timeout` (under ~8 min) masks this further by killing the process before that explanatory error ever surfaces.

**How to apply:** before diagnosing "my isolated test run hangs with no output at all" as a bug in the code under test, check whether the dev workflow (or whatever `TEST_BASE_URL`/`localhost:5000` points at) is actually running. Keep the dev workflow up while running anything through this config, even a file that individually doesn't need it.
