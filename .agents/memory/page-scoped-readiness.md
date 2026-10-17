---
name: Page-scoped readiness reviews
description: User-requested review organization for the Max Booster hardening work
---
Review each page's frontend and backend together as a bounded unit.

**Why:** The user requested individual page reviews to make verification targeted
and manageable rather than repeatedly running whole-project scans.

**How to apply:** Trace UI actions through routes, permissions, services and
persistence; report unreviewed child panels explicitly. Distinguish source
contract tests from behavioral tests, and review shared cross-page services too.

Run independent page workstreams in parallel with exclusive file ownership.
Serialize shared authentication, billing, schema, middleware and common-service
changes through one coordinator. Keep heavy verification serialized.

**Why:** The user explicitly requested parallel page execution without
overwriting shared work; concurrent heavy checks previously exhausted memory.

Avoid workspace-wide LSP diagnostics in parallel page helpers while preview is
running; serialize final typechecks and memory-heavy tests instead.

**Why:** In the 8 GiB workspace, duplicate agent semantic TypeScript processes
grew to about 4 GiB, and browser recording added substantial memory. The app was
OOM-killed during otherwise valid auth checks. Check process/resource evidence
before classifying module-load failures as authentication defects.
