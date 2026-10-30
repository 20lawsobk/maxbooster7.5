---
name: Cleanup-on-throw bug class
description: A recurring pattern where temp-file/resource cleanup only runs on the success path, leaking the resource on every error path.
---

Rule: code that creates a temporary resource (a scratch file, a temp directory, a chunk-upload staging area) and cleans it up with an unlink/rm call placed AFTER the risky operation, as a separate later step rather than in a finally block (or explicit catch-cleanup-then-rethrow), leaks that resource every time the risky operation throws. Easy to miss because the success path looks completely correct and happy-path-only tests never catch it.

**Why:** found this exact shape at least four separate times in one session in this app (a ZIP-download route's temp output file, a chunked-upload assembly's temp chunk directory, and others) — evidently a repeating authorial habit in this codebase, not a one-off mistake.

**How to apply:** any time you review or write "create temp resource → do risky async work → delete temp resource" as three separate steps, rewrite it as create → try { risky work } finally { delete }, or verify it already is that shape. Treat "a cleanup call exists somewhere in the function" as insufficient; confirm it is reachable from every exit path, including thrown errors.

For durable jobs, distinguish cleanup completed, unrelated path, and owned cleanup blocked. Preserve the recovery record when owned cleanup is blocked, including when safety checks refuse a symlink.

**Why:** Refusing an unsafe unlink is correct, but treating that refusal as successful cleanup lets journal GC remove the only retry handle. A terminal job state does not prove resource cleanup succeeded.

**How to apply:** Exercise permission failure and unsafe-owned-path cases through both cleanup and journal GC; require the record to survive until safe cleanup can actually complete. Never delete unrelated resources to satisfy cleanup.
