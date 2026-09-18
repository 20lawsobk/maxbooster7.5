---
name: Endpoint inventory versus behavior
description: A method/path match does not verify payload, response, authentication, or rendering contracts.
---

Treat a static frontend/backend route match as topology evidence only, never as proof that a component works.

**Why:** Real browser checks found several matched routes whose consumers expected obsolete response envelopes or sent fields the backend discarded. Some failed requests had previously hidden the rendering defects.

**How to apply:** When repairing API wiring, compare both the request payload and actual response shape with the consuming component. Test successful, empty, unavailable, and malformed responses explicitly; do not substitute fabricated metrics or silently label unknown data as healthy.

After extracting a response validator, verify the component's remaining call sites as well as the helper tests. Pure helper tests can pass while an obsolete JSX reference still crashes the page. A focused unresolved-name check can catch this without running the entire project's expensive typecheck.

Compile modified route entry points, not just the helpers covered by unit tests. Dynamic route imports can fail while overall startup probes stay healthy; cached UI data can conceal the missing route. Confirm a fresh request reaches the repaired handler before blaming response caches.

When an upstream service gains ownership enforcement, verify the trusted actor through every stage: transfer, analysis, job creation, polling, and download. Use nonnumeric user IDs in contract tests.

**Why:** A successful upload does not establish ownership for later requests. Mocks that ignore identity headers can pass while subsequent analysis or downloads fail with authorization errors; numeric fixtures also hide UUID coercion bugs.

**How to apply:** Assert actor propagation at each transport boundary and send service credentials only to the intended service origin, never to an arbitrary returned media URL.

Optional predictions must not become a required step after successful generation.

**Why:** Removing a local scorer can expose a downstream call that rejects all genuine generated output merely because the upstream predictor is unavailable.

**How to apply:** Preserve upstream variant order and represent absent predictions explicitly. Keep separately requested prediction features unavailable rather than inventing scores.