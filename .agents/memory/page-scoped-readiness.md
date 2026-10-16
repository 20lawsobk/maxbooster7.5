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
