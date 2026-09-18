---
name: Endpoint inventory versus behavior
description: A method/path match does not verify payload, response, authentication, or rendering contracts.
---

Treat a static frontend/backend route match as topology evidence only, never as proof that a component works.

**Why:** Real browser checks found several matched routes whose consumers expected obsolete response envelopes or sent fields the backend discarded. Some failed requests had previously hidden the rendering defects.

**How to apply:** When repairing API wiring, compare both the request payload and actual response shape with the consuming component. Test successful, empty, unavailable, and malformed responses explicitly; do not substitute fabricated metrics or silently label unknown data as healthy.

After extracting a response validator, verify the component's remaining call sites as well as the helper tests. Pure helper tests can pass while an obsolete JSX reference still crashes the page. A focused unresolved-name check can catch this without running the entire project's expensive typecheck.

Compile modified route entry points, not just the helpers covered by unit tests. Dynamic route imports can fail while overall startup probes stay healthy; cached UI data can conceal the missing route. Confirm a fresh request reaches the repaired handler before blaming response caches.