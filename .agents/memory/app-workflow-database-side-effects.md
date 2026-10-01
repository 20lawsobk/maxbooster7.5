---
name: App workflow database side effects
description: Starting the primary app and loading its preview can mutate the shared application database.
---

**Rule:** Treat the configured `Start application` workflow and browser preview as potentially database-writing operations. Startup can seed or synchronize admin resources, plugin catalog entries, DSP providers, and royalty rates; loading the page can send web-vitals events. For tasks that prohibit shared database writes, rely on isolated tests and do not restart or preview the app. Do not remove startup-created rows without authorization.

**Why:** Workflow and browser logs observed these initialization and metrics operations on 2026-10-01. A normal verification restart is therefore not read-only.

**How to apply:** Before restarting the primary workflow or capturing an app preview during a no-write task, check startup and page instrumentation side effects; otherwise keep verification isolated from the shared app database.