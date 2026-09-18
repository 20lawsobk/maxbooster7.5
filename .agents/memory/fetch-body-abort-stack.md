---
name: Fetch body abort stack provenance
description: A native AbortSignal stack can obscure a later unhandled error in a streamed response body.
---

Do not infer that an uncaught timeout originated in the awaited fetch promise merely because its stack points to the internal abort controller. That stack can record creation of the timeout reason, not the consumer that later throws it.

**Why:** Fetch had already resolved its headers; a converted Node response-body stream then emitted an unhandled error during an upstream timeout. Catching fetch alone did not protect the process.

**How to apply:** Await full streaming pipelines, preserve deadlines through body consumption, and cancel upstream when the downstream disconnects. Regression tests must stall or fail the body after headers and assert both client-visible failure and absence of uncaught exceptions. Do not replace this with global exception suppression.