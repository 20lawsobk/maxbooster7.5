---
name: Review after code changes
description: The user requests a code review after every code change in this project.
---

After each code change in this project, run the code-review skill before continuing.

**Why:** the user asked.

**How to apply:** Treat each project code edit as requiring a code-review pass, then address reported findings and verify the resulting changes.

If the independent review capability is unavailable, do a manual review and run the relevant checks, but state clearly that no independent review ran.

**Why:** the reviewer may be disabled in the current Replit execution mode; that is not evidence of an approved review.

**How to apply:** Do not retry a disabled reviewer repeatedly. Inspect changed paths and security boundaries yourself, then report the review limitation accurately.
