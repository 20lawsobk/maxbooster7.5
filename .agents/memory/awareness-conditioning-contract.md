---
name: Awareness conditioning contract
description: AI model-backed endpoints must use the shared awareness cascade and include conditioning context in coalescing identities
---

Within MaxCore itself, every model-backed generation or analysis path must pass the shared awareness cascade (intent and URL signals, direction, caller awareness, and platform quality context) into its agent request. Application transport preserves supplied context without adding its own AI conditioning pass. Any request coalescer for generated media must include the effective awareness in its identity.

**Why:** Passing awareness only as an accepted request field leaves live model calls unconditioned, while omitting it from coalescing can return output generated for another caller's creative direction.

**How to apply:** When adding or auditing an AI endpoint, use `_merged_awareness_for()` followed by `_effective_awareness()` at the model seam; include the resulting context in any generation digest. Routes using `build_context()` directly must ensure `merge_awareness()` carries the same platform profile, rather than assuming the server wrapper ran.

Use canonical structured serialization for caller conditioning in cache identities; ordinary string coercion is not safe.

**Why:** Distinct awareness objects both became `[object Object]`, allowing cached output to cross creative directions even though the transport preserved the payloads.

**How to apply:** Include all effective caller fields, sort object keys recursively while preserving array order, and test both distinct-context separation and reordered-key equivalence.

Keep structured awareness control records separate from visible copy candidates.

**Why:** Generic signal extraction promoted serialized JSON keys and direction labels into generated hooks; transport and schema tests passed while actual live captions exposed the metadata.

**How to apply:** Decode controls at the native consumer, exclude envelope syntax from copy-signal pools, and test real generation with distinctive structured instructions rather than only inspecting agent request strings.