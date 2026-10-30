---
name: Embedded worker shutdown ownership
description: Imported worker modules must not terminate the application during its shutdown.
---
Embedded worker drains must return or reject to the application lifecycle owner.
Only a standalone worker entry may exit its process after draining.

**Why:** An imported BullMQ module's signal handler and drain both exited the HTTP
process before its own persistence and MaxCore cleanup ran. Changing MaxCore's
group signalling alone did not solve the leak because cleanup was never reached.

**How to apply:** Verify two production start/stop cycles in the same isolated
network namespace and check model and native ports, not only the public port.
Audit imported modules for competing process exits when cleanup hooks appear
correct but descendants survive.
