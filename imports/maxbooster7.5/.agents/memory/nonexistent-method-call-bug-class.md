---
name: Route calls a nonexistent queue/service method
description: A handler that calls something like queueService.addJob(...) can reference a method that was never implemented on that object — a more severe, more silent failure than a schema mismatch
---

## Rule
Before trusting that a route/service is "wired to a queue" or "wired to a service," verify the exact method it calls actually exists on that object (grep the class/module definition for the method name). A call to a nonexistent method throws a TypeError at the call site — if that's inside a try/catch that swallows and logs, the route can return a generic 500 (or worse, a swallowed error with a 200) with no indication that the real problem is "this was never implemented," not "the data was malformed."

**Why:** this is a more severe bug class than a schema mismatch (wrong column name, missing field) because a schema mismatch usually still executes real logic and fails on real data; a missing-method call means NONE of the intended logic ever ran, for any input, ever. Discovered while auditing studio/DAW audio time-stretch (warp) and multi-take comping features — both call queue methods that don't exist on the queue service, meaning the entire feature has never worked for any user, not just edge cases.

**How to apply:** when a feature is reported as broken/unreachable, before assuming "some inputs fail," grep the target object's class definition for the exact called method name. If it's absent, the fix is implementing the method (or replacing the call with an existing equivalent), not patching data validation.
