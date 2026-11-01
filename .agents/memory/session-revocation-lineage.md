---
name: Remote session revocation lineage
description: Why remote sign-out fences refresh ancestry and legacy bearer credentials
---
Remote sign-out must prevent both in-flight session resaves and in-flight refresh
rotation from restoring access. Preserve the original authentication time across
the entire refresh lineage and check a durable revocation boundary.

**Why:** Deleting current token/session rows misses requests that loaded them
before revocation and insert or save a successor afterward.

**How to apply:** Keep revocation tombstones authoritative. Historical bearer
tokens are not reliably bound to a device, so remote termination revokes those
account-wide while retaining other cookie sessions. Do not narrow this to a
guessed device mapping; introduce an explicit, verified binding first.