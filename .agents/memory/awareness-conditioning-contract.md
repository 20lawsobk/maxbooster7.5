---
name: Awareness conditioning contract
description: AI model-backed endpoints must use the shared awareness cascade and include conditioning context in coalescing identities
---

Every model-backed generation or analysis path must pass the shared awareness cascade (intent and URL signals, direction, caller awareness, and platform quality context) into its agent request. Any request coalescer for generated media must include the effective awareness in its identity.

**Why:** Passing awareness only as an accepted request field leaves live model calls unconditioned, while omitting it from coalescing can return output generated for another caller's creative direction.

**How to apply:** When adding or auditing an AI endpoint, use `_merged_awareness_for()` followed by `_effective_awareness()` at the model seam; include the resulting context in any generation digest.