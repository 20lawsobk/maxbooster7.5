---
name: Honest-placeholder control checklist
description: What "fixed" actually means when replacing a fake/broken control endpoint (e.g. always-500 or fake-success placeholder) with a real one.
---

When a task asks you to stop a control from "failing through a placeholder endpoint," a working happy-path response is not sufficient. Verify all of these before considering it done:

1. **Route ordering.** If you add sibling static routes (e.g. `/thing/bulk/x`) next to an existing `/thing/:id/x`, Express matches registration order — the dynamic route will silently swallow the static one (`bulk` becomes `:id`). All static routes must be registered before the conflicting param route.
2. **No silent data loss.** If the endpoint accepts user input (e.g. reply text), it must be durably persisted somewhere the same user can retrieve it later — not just reflected in a one-time response. Add the DB column/migration if needed.
3. **No premature terminal status.** Don't flip a record to a "done" status (e.g. `replied`) unless the underlying action actually completed (e.g. real delivery to a third-party platform). A saved draft is a different state from a completed action; conflating them removes real work from a user's actionable queue.
4. **List/GET DTOs echo persisted state.** If you persist a new field on create/update, the corresponding GET/list endpoint must return it too, or a page reload silently discards what the user just saved.
5. **True "not implemented" beats fake success.** When a feature genuinely has no backing implementation (e.g. team assignment with no team schema), the write endpoint should explicitly refuse (e.g. 501, no mutation) rather than accept arbitrary input and report fabricated success.

**Why:** on task #136, a completion-review loop caught these one at a time across ~5 rounds (route ordering, missing migration, fabricated reply delivery, fabricated team assignment, reply status masking undelivered drafts) — checking all five up front avoids repeated rejection cycles.
