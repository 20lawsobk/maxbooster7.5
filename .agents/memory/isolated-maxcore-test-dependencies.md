---
name: Isolated MaxCore test dependencies
description: Dependency-link requirements for running the MaxCore Vitest suites from fresh isolated repository copies.
---

Fresh isolated copies can fail MaxCore tests for reasons unrelated to application code when their dependency layout omits nested workspace package links. The test mocks may also target a nested `undici` module path that is absent from the clone; in that case, requests can escape to a local MaxCore listener.

**Why:** The root checkout and isolated Git copy can resolve workspace dependencies through different nested package-manager layouts. A missing link can look like an application authentication failure while making the test call a real service.

**How to apply:** Before diagnosing failures from a fresh clone, recreate its local workspace package links and the nested `undici` resolution path used by the tests. Confirm mocked requests are intercepted, then rerun the focused tests before trusting the full-suite result.
