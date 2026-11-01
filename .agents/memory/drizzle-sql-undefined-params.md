---
name: Drizzle sql template — undefined interpolations
description: undefined values in drizzle `sql` tagged templates render as EMPTY SQL, producing syntax errors.
---

Interpolating `undefined` into a drizzle `sql\`...\`` tagged template emits **nothing** — not `NULL` — so `VALUES ($1, ${undefined}, $2)` becomes `VALUES ($1, , $2)` → `syntax error at or near ","`.

**Why:** the audit logger's WAL flush silently failed forever (entries re-buffered and retried every 5s, flooding logs) because optional fields (ipAddress, userAgent, errorMessage) were undefined for system-originated events.

**How to apply:** every optional value in a raw drizzle `sql` template must be `?? null` coalesced. If a log shows a Postgres syntax error with consecutive commas in VALUES, look for undefined template interpolations first.
